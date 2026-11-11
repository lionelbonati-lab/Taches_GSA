import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  AUTO_GESTE_MS, AUTO_PAS_MS, REGLAGES_DEFAUT, ajout, enMarche, entreeValide, jourDe, reglagesValides,
  type EntreeTemps, type ReglagesCompteur,
} from './compteur';

// Compteur de temps personnel : l'état (entrées, réglages), gardé sur l'appareil et, en version réelle, dans la table
// gsa_temps (migration 067), où chacun ne lit et n'écrit que ses lignes. Une ligne par entrée, plus « reglages » ;
// une entrée retirée part avec `supprime` et un contenu vide (les autres appareils l'apprennent), puis elle est effacée
// au bout de 60 jours. Les modifications attendent sur l'appareil (hors ligne) et partent dès que possible ; le même
// compteur sur tous ses appareils (relu à l'ouverture, au retour sur l'appli et chaque minute).

/** demo : rien sur le serveur ; absent : migration 067 pas encore appliquée (le compteur reste sur l'appareil). */
export type EtatServeur = 'demo' | 'chargement' | 'ok' | 'absent' | 'horsLigne';

interface Cache {
  v: 1;
  entrees: Record<string, EntreeTemps>;
  reglages: ReglagesCompteur;
  /** Lignes à envoyer (identifiant ; « reglages » pour les réglages). */
  attente: string[];
  /** Dernière date de modification vue sur le serveur. */
  vu?: string;
  /** Dernier ménage des lignes retirées (jour). */
  menage?: string;
  /** « Sur quoi ? » en cours (cet appareil). */
  libelle?: string;
}

export interface Instantane {
  entrees: EntreeTemps[];
  reglages: ReglagesCompteur;
  libelle: string;
  serveur: EtatServeur;
}

const TABLE = 'gsa_temps';
const REGLAGES = 'reglages';
const LOT = 500;
const MENAGE_JOURS = 60;

const nouvelId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const vide = (): Cache => ({ v: 1, entrees: {}, reglages: { ...REGLAGES_DEFAUT }, attente: [] });
/** Table absente (migration 067 pas encore appliquée). */
const tableAbsente = (e: { code?: string; message?: string }) =>
  ['42P01', 'PGRST205', 'PGRST204'].includes(e.code ?? '') || (/gsa_temps/.test(e.message ?? '') && /exist|find|schema cache/i.test(e.message ?? ''));

/** Clé de l'appareil : démo et version réelle séparées, une par personne. */
export const cleCompteur = (reel: boolean, personId: string) => `taches-gsa-${reel ? '' : 'demo-'}compteur-${personId}`;

export class MagasinCompteur {
  private cache: Cache;
  private instantane: Instantane;
  private ecouteurs = new Set<() => void>();
  private serveur: EtatServeur;
  private compte: string | null = null;
  private envoi: Promise<void> | null = null;
  private minuterie = 0;

  constructor(private cle: string, private reel: boolean) {
    this.cache = this.lire();
    this.serveur = reel ? 'chargement' : 'demo';
    this.instantane = this.faire();
  }

  // ---------- Lecture (React) ----------

  subscribe = (f: () => void) => {
    this.ecouteurs.add(f);
    return () => this.ecouteurs.delete(f);
  };
  get = () => this.instantane;

  private faire(): Instantane {
    return { entrees: Object.values(this.cache.entrees), reglages: this.cache.reglages, libelle: this.cache.libelle ?? '', serveur: this.serveur };
  }
  private signaler() {
    this.instantane = this.faire();
    this.ecouteurs.forEach((f) => f());
  }

  // ---------- Appareil ----------

  private lire(): Cache {
    try {
      const x = JSON.parse(localStorage.getItem(this.cle) ?? 'null') as Partial<Cache> | null;
      if (!x || x.v !== 1) return vide();
      const entrees: Record<string, EntreeTemps> = {};
      for (const e of Object.values(x.entrees ?? {})) {
        const ok = entreeValide(e);
        if (ok) entrees[ok.id] = ok;
      }
      return {
        v: 1,
        entrees,
        reglages: reglagesValides(x.reglages),
        attente: Array.isArray(x.attente) ? x.attente.filter((i) => typeof i === 'string') : [],
        ...(typeof x.vu === 'string' ? { vu: x.vu } : {}),
        ...(typeof x.menage === 'string' ? { menage: x.menage } : {}),
        ...(typeof x.libelle === 'string' ? { libelle: x.libelle } : {}),
      };
    } catch {
      return vide();
    }
  }
  private ecrire() {
    try {
      localStorage.setItem(this.cle, JSON.stringify(this.cache));
    } catch {
      /* stockage plein ou indisponible : gardé en mémoire */
    }
  }
  /** Un autre onglet a écrit : relu. */
  relireAppareil = (e: StorageEvent) => {
    if (e.key !== this.cle) return;
    this.cache = this.lire();
    this.signaler();
  };

  /** Applique un changement, le garde sur l'appareil et l'envoie (version réelle). */
  private changer(f: (c: Cache) => string[]) {
    const ids = f(this.cache);
    if (this.reel && ids.length) this.cache.attente = [...new Set([...this.cache.attente, ...ids])];
    this.ecrire();
    this.signaler();
    if (this.reel && ids.length) this.planifierEnvoi();
  }

  // ---------- Actions ----------

  regler(patch: Partial<ReglagesCompteur>) {
    this.changer((c) => {
      c.reglages = reglagesValides({ ...c.reglages, ...patch });
      return [REGLAGES];
    });
  }
  setLibelle(l: string) {
    this.changer((c) => {
      c.libelle = l;
      return [];
    });
  }
  ecrireEntree(e: EntreeTemps) {
    const ok = entreeValide(e);
    if (!ok) return;
    this.changer((c) => {
      c.entrees = { ...c.entrees, [ok.id]: ok };
      return [ok.id];
    });
  }
  retirer(ids: string[]) {
    this.changer((c) => {
      const reste = { ...c.entrees };
      ids.forEach((i) => delete reste[i]);
      c.entrees = reste;
      return ids;
    });
  }
  demarrer(now = Date.now()) {
    if (enMarche(this.instantane.entrees)) return;
    const l = this.cache.libelle?.trim();
    this.ecrireEntree({ id: nouvelId(), sorte: 'compteur', debut: new Date(now).toISOString(), ...(l ? { libelle: l } : {}) });
  }
  /** Arrête le compteur en marche (tous, si deux appareils l'ont lancé), à `fin` (ISO) ou maintenant. */
  arreter(fin?: string) {
    const now = new Date().toISOString();
    const enCours = this.instantane.entrees.filter((e) => e.sorte === 'compteur' && !e.fin);
    if (!enCours.length) return;
    this.changer((c) => {
      c.entrees = { ...c.entrees };
      for (const e of enCours) {
        const f = fin && fin > e.debut! && fin <= now ? fin : now;
        const x: EntreeTemps = { ...e, fin: f };
        delete x.rappele;
        c.entrees[e.id] = x;
      }
      return enCours.map((e) => e.id);
    });
  }
  /** Compteur oublié : « Continuer » (le rappel repart de maintenant). */
  continuer() {
    const e = enMarche(this.instantane.entrees);
    if (e) this.ecrireEntree({ ...e, rappele: new Date().toISOString() });
  }
  ajouter(minutes: number, jour = jourDe(Date.now()), libelle = this.cache.libelle) {
    const r = ajout(this.instantane.entrees, minutes, jour, libelle, Date.now(), nouvelId);
    if (r.retirer) this.retirer([r.retirer]);
    if (r.ecrire) this.ecrireEntree(r.ecrire);
  }
  toutEffacer() {
    this.retirer(Object.keys(this.cache.entrees));
  }

  /**
   * Mode automatique, à chaque pas : prolonge la plage `id` jusqu'à `now`, ou en ouvre une depuis `debut` (le geste) ;
   * renvoie son identifiant (rien tant qu'elle serait vide).
   */
  prolongerAuto(id: string | null, debut: number, now: number): string | null {
    const e = id ? this.cache.entrees[id] : undefined;
    if (e) {
      this.ecrireEntree({ ...e, fin: new Date(now).toISOString() });
      return e.id;
    }
    if (now - debut < 1000) return null;
    const n: EntreeTemps = { id: nouvelId(), sorte: 'auto', debut: new Date(debut).toISOString(), fin: new Date(now).toISOString() };
    this.ecrireEntree(n);
    return n.id;
  }
  /** Fin de la plage automatique `id` (ms), si elle existe encore. */
  finAuto(id: string | null) {
    const e = id ? this.cache.entrees[id] : undefined;
    return e?.fin ? Date.parse(e.fin) : null;
  }

  // ---------- Serveur (version réelle) ----------

  private etat(s: EtatServeur) {
    if (s === this.serveur) return;
    this.serveur = s;
    this.signaler();
  }

  private planifierEnvoi() {
    clearTimeout(this.minuterie);
    this.minuterie = window.setTimeout(() => void this.envoyer(), 400);
  }

  private async moi() {
    if (this.compte || !supabase) return this.compte;
    const { data } = await supabase.auth.getSession();
    this.compte = data.session?.user.id ?? null;
    return this.compte;
  }

  /** Envoie les lignes en attente (un envoi à la fois ; ce qui arrive pendant l'envoi part au tour suivant). */
  envoyer(): Promise<void> {
    if (!this.reel || !supabase || this.serveur === 'absent') return Promise.resolve();
    if (this.envoi) return this.envoi;
    this.envoi = (async () => {
      try {
        // Par lots ; ce qui a changé pendant un envoi repart au tour suivant (quelques tours au plus, puis plus tard).
        for (let tour = 0; tour < 20; tour++) {
          const compte = await this.moi();
          const ids = this.cache.attente.slice(0, LOT);
          if (!compte) return this.etat('horsLigne');
          if (!ids.length) break;
          const lignes = ids.map((id) => {
            const data = id === REGLAGES ? this.cache.reglages : this.cache.entrees[id];
            return { compte, id, data: data ?? {}, supprime: !data };
          });
          const envoye = new Map(lignes.map((l) => [l.id, JSON.stringify(l.data)]));
          const { error } = await supabase!.from(TABLE).upsert(lignes, { onConflict: 'compte,id' });
          if (error) {
            this.etat(tableAbsente(error) ? 'absent' : 'horsLigne');
            return;
          }
          // Retirées de l'attente, sauf celles changées pendant l'envoi.
          this.cache.attente = this.cache.attente.filter((id) => {
            if (!envoye.has(id)) return true;
            const data = id === REGLAGES ? this.cache.reglages : this.cache.entrees[id];
            return JSON.stringify(data ?? {}) !== envoye.get(id);
          });
          this.ecrire();
          this.etat('ok');
        }
        if (this.cache.attente.length) this.planifierEnvoi();
      } catch {
        this.etat('horsLigne');
      } finally {
        this.envoi = null;
      }
    })();
    return this.envoi;
  }

  /** Relit les lignes changées sur le serveur depuis la dernière fois (toutes la première fois). */
  async relire() {
    if (!this.reel || !supabase || this.serveur === 'absent') return;
    try {
      const compte = await this.moi();
      if (!compte) return this.etat('horsLigne');
      const depuis = this.cache.vu ? new Date(Date.parse(this.cache.vu) - 5000).toISOString() : null;
      let vu = this.cache.vu;
      let change = false;
      for (let de = 0; ; de += 1000) {
        let q = supabase.from(TABLE).select('id, data, supprime, modifie').eq('compte', compte);
        if (depuis) q = q.gt('modifie', depuis);
        const { data, error } = await q.order('modifie').order('id').range(de, de + 999);
        if (error) return this.etat(tableAbsente(error) ? 'absent' : 'horsLigne');
        const lignes = (data ?? []) as { id: string; data: unknown; supprime: boolean; modifie: string }[];
        for (const l of lignes) {
          if (!vu || l.modifie > vu) vu = l.modifie;
          // Changée ici et pas encore envoyée : la version de l'appareil part ensuite.
          if (this.cache.attente.includes(l.id)) continue;
          change = true;
          if (l.id === REGLAGES) {
            if (!l.supprime) this.cache.reglages = reglagesValides(l.data);
            continue;
          }
          const e = l.supprime ? null : entreeValide(l.data);
          const reste = { ...this.cache.entrees };
          if (e && e.id === l.id) reste[e.id] = e;
          else delete reste[l.id];
          this.cache.entrees = reste;
        }
        if (lignes.length < 1000) break;
      }
      if (vu) this.cache.vu = vu;
      this.ecrire();
      if (change) this.signaler();
      this.etat('ok');
      void this.menage(compte);
    } catch {
      this.etat('horsLigne');
    }
  }

  /** Une fois par jour : les lignes retirées depuis plus de 60 jours sont effacées du serveur. */
  private async menage(compte: string) {
    const auj = jourDe(Date.now());
    if (this.cache.menage === auj || !supabase) return;
    const avant = new Date(Date.now() - MENAGE_JOURS * 86_400_000).toISOString();
    const { error } = await supabase.from(TABLE).delete().eq('compte', compte).eq('supprime', true).lt('modifie', avant);
    if (!error) {
      this.cache.menage = auj;
      this.ecrire();
    }
  }

  /** Version réelle : relu à l'ouverture, au retour sur l'appli, au retour du réseau et chaque minute ; envoi en attente. */
  brancher() {
    window.addEventListener('storage', this.relireAppareil);
    if (!this.reel) return () => window.removeEventListener('storage', this.relireAppareil);
    const tout = () => void this.envoyer().then(() => this.relire());
    tout();
    const visible = () => document.visibilityState === 'visible' && tout();
    const t = window.setInterval(() => document.visibilityState === 'visible' && tout(), 60_000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', tout);
    return () => {
      window.removeEventListener('storage', this.relireAppareil);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', tout);
      clearInterval(t);
      clearTimeout(this.minuterie);
    };
  }
}

const Ctx = createContext<MagasinCompteur | null>(null);

/** Compteur de la personne connectée (`personId`), en démo ou en version réelle (`reel`). */
export function CompteurProvider({ personId, reel, children }: { personId: string; reel: boolean; children: ReactNode }) {
  const magasin = useMemo(() => new MagasinCompteur(cleCompteur(reel, personId), reel), [personId, reel]);
  useEffect(() => magasin.brancher(), [magasin]);
  const { reglages, entrees } = useSyncExternalStore(magasin.subscribe, magasin.get);
  const auto = reglages.actif && reglages.auto;
  const compteurEnMarche = !!enMarche(entrees);
  useModeAuto(magasin, auto && !compteurEnMarche);
  return <Ctx.Provider value={magasin}>{children}</Ctx.Provider>;
}

/**
 * Mode automatique : l'appli à l'écran, avec un geste (clic, touche, défilement) dans les 2 dernières minutes. Chaque
 * pas (30 s) prolonge la plage en cours, ou en ouvre une depuis le geste ; rien pendant que le compteur tourne (il compte
 * déjà). Ouvrir l'appli, ou y revenir, compte comme un geste.
 */
function useModeAuto(magasin: MagasinCompteur, actif: boolean) {
  useEffect(() => {
    if (!actif) return;
    let geste = Date.now();
    let plage: string | null = null;
    const pas = (fermer = false) => {
      const now = Date.now();
      const utilise = now - geste <= AUTO_GESTE_MS && (fermer || document.visibilityState === 'visible');
      if (utilise) {
        const fin = magasin.finAuto(plage);
        // Interruption (appli cachée, appareil en veille) : une nouvelle plage.
        if (fin === null || now - fin > AUTO_PAS_MS + 15_000) plage = null;
        plage = magasin.prolongerAuto(plage, geste, now);
      }
      if (fermer || !utilise) plage = null;
    };
    const marquer = () => {
      geste = Date.now();
    };
    const vue = () => {
      if (document.visibilityState === 'visible') {
        geste = Date.now();
        pas();
      } else pas(true);
    };
    const evenements = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    evenements.forEach((n) => window.addEventListener(n, marquer, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', vue);
    const t = window.setInterval(() => pas(), AUTO_PAS_MS);
    pas();
    return () => {
      pas(true);
      clearInterval(t);
      evenements.forEach((n) => window.removeEventListener(n, marquer, { capture: true }));
      document.removeEventListener('visibilitychange', vue);
    };
  }, [magasin, actif]);
}

/** Le compteur de la personne connectée : son état et ses actions. */
export function useCompteur() {
  const magasin = useContext(Ctx);
  if (!magasin) throw new Error('useCompteur hors de CompteurProvider');
  const etat = useSyncExternalStore(magasin.subscribe, magasin.get);
  return { ...etat, enCours: enMarche(etat.entrees), magasin };
}
