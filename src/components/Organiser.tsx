import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { useClub } from '../data/club';
import { norm } from '../data/csv';
import { emailKey } from '../data/membres';
import { groupesLies } from '../data/liens';
import { benevolesDe, et, fonctionsLibres, memeQui, nomDe, placesDu, zonesFiche, type Depuis, type LigneFiche, type OpOrga, type Qui, type Vers } from '../data/organigramme';
import { directory, UNIT_COLORS, UNIT_TYPES } from '../data/units';
import { fmtRange, posteBesideName } from '../data/utils';
import type { ClubMembre, OrgMember, OrgUnit, Poste } from '../data/types';
import { Initials, Modal, UnitMark } from './ui';
import { Icone } from './icones';
import { Deroulante } from './Deroulante';
import { PastilleEntite } from './IconesEntite';

// Ce que l'organigramme par postes (OrgLignes.tsx) partage : glisser une personne (souris ; au doigt : la toucher,
// elle est « en main », puis toucher où la poser), la recherche en haut à gauche (pilules), les fiches de poste et la
// fiche à trois zones (titre ★, responsables, bénévoles) des entités archivées. Les règles sont dans data/organigramme.ts.

type Point = [number, number];

/** Une personne du club qu'on peut placer : présente dans une entité, ou seulement au registre « Membres du club ». */
export interface Candidat {
  key: string;
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  couleur: string;
  membreId?: string;
  /** Où elle est déjà : « École de cyclisme (Moniteur), … » ; vide : dans aucune entité. */
  ou: string;
}

export const nomCandidat = (c: Pick<Candidat, 'prenom' | 'nom' | 'email'>) => `${c.prenom} ${c.nom}`.trim() || c.email || '?';

/** Toutes les personnes du club : celles des entités (organigramme), puis celles du registre qui ne sont dans aucune. */
export function useCandidats(units: OrgUnit[], actif: boolean) {
  const club = useClub();
  const [registre, setRegistre] = useState<ClubMembre[]>([]);
  useEffect(() => {
    if (!actif || !club.personnes.voir) return;
    let vivant = true;
    club
      .membres()
      .then((l) => vivant && setRegistre(l))
      .catch(() => {});
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, club.personnes.voir]);
  return useMemo(() => {
    const dir = directory(units.filter((u) => !u.archive));
    const liste: Candidat[] = dir.map((e) => {
      const membreId = e.postes.find((x) => x.member.membreId)?.member.membreId ?? registre.find((m) => emailKey(m.email) && emailKey(m.email) === emailKey(e.email))?.id;
      return {
        key: e.key,
        prenom: e.prenom,
        nom: e.nom,
        email: e.email,
        telephone: e.telephone,
        couleur: e.couleur,
        membreId,
        ou: e.postes.map((x) => `${x.unit.nom}${x.member.poste ? ` (${x.member.poste})` : ''}`).join(', '),
      };
    });
    const pris = new Set(liste.flatMap((c) => [c.membreId, emailKey(c.email)].filter(Boolean)));
    for (const m of registre) {
      if (pris.has(m.id) || (emailKey(m.email) && pris.has(emailKey(m.email)))) continue;
      liste.push({ key: `m:${m.id}`, prenom: m.prenom, nom: m.nom, email: m.email, telephone: m.telephone, couleur: m.couleur, membreId: m.id, ou: '' });
    }
    return liste.sort((a, b) => nomCandidat(a).localeCompare(nomCandidat(b), 'fr'));
  }, [units, registre]);
}

/** Les postes d'une ligne : celui que son nom dit déjà (« Vice-président » au poste de vice-président), et les autres, à la suite. */
function partsLigne(m: OrgMember, postes: Poste[]) {
  const nom = nomDe(m);
  const cache = postes.find((x) => !posteBesideName(nom, x.nom));
  return { nom, cache, autres: postes.filter((x) => x !== cache) };
}

// ---------- Glisser-déposer ----------

/** La personne qu'on place : d'où elle vient (une ligne d'une fiche), ou de la recherche. */
export interface Prise {
  qui: Qui;
  depuis?: Depuis;
  nom: string;
  couleur: string;
  /** Le poste qu'elle occupait (nom proposé pour un nouveau poste). */
  poste?: string;
  /** Pilule de la recherche (la reconnaître « en main »). */
  cle?: string;
  /** Glissée avec Ctrl / Alt : posée sans quitter sa fiche (copie). */
  copie?: boolean;
}

/** Une zone où poser (attribut data-cible) : « entité|titre », « entité|etoile|fiche », « entité|poste|poste », « entité|nouveau », « entité|benevoles », « corbeille ». */
export type Cible = Vers | { zone: 'nouveau'; uniteId: string };
export function lireCible(c: string): Cible {
  const [uniteId, zone, id] = c.split('|');
  if (uniteId === 'corbeille') return { zone: 'corbeille' };
  if (zone === 'etoile') return { zone, uniteId, personId: id };
  if (zone === 'poste') return { zone, uniteId, posteId: id };
  if (zone === 'nouveau') return { zone, uniteId };
  return { zone: zone === 'benevoles' ? 'benevoles' : 'titre', uniteId };
}

export const quiDeMembre = (m: OrgMember): Qui => ({ prenom: m.prenom, nom: m.nom, email: m.email, telephone: m.telephone, couleur: m.couleur, membreId: m.membreId });

export interface Glisser {
  /** Personne en train d'être glissée, ou touchée (en main, à poser d'un toucher). */
  glisse: Prise | null;
  enMain: Prise | null;
  /** Zone sous le pointeur où on peut la poser. */
  survol: string | null;
  /** Souris : n'importe où sur la ligne ; doigt : par la poignée (data-prise), ou partout si `partout`. */
  commencer: (e: ReactPointerEvent<HTMLElement>, prise: () => Prise, partout?: boolean) => void;
  prendre: (p: Prise) => void;
  lacher: () => void;
  /** Vrai juste après un glisser : le clic qui suit est ignoré. */
  justeGlisse: () => boolean;
  volant: ReactNode;
}

/**
 * Glisser une personne : elle suit le pointeur (la page défile près des bords) ; lâchée sur une zone (data-cible) où
 * `peut`, `deposer` est appelé. Échap annule. « En main » (après un toucher) : un toucher sur une zone la pose.
 * Ctrl (ou Alt, ⌘) enfoncé pendant le glisser : copie, elle reste aussi dans sa fiche (la prise n'a plus de `depuis`).
 */
export function useGlisser(opts: { peut: (p: Prise, cible: string) => boolean; deposer: (p: Prise, cible: string) => void; libelle: (p: Prise, cible: string) => string }): Glisser {
  const [glisse, setGlisse] = useState<Prise | null>(null);
  const [enMain, setEnMain] = useState<Prise | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const copieRef = useRef(false);
  const pointeur = useRef<Point>([0, 0]);
  const juste = useRef(false);
  const viser = useRef(() => {});
  const fns = useRef(opts);
  fns.current = opts;

  /** Ce qu'on posera : copiée, elle ne quitte pas sa fiche. */
  const posee = (p: Prise): Prise => (copieRef.current && p.depuis ? { ...p, depuis: undefined, copie: true } : p);
  const zone = (p: Prise, x: number, y: number) => {
    const c = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cible]')?.dataset.cible ?? null;
    return c && fns.current.peut(posee(p), c) ? c : null;
  };

  const commencer: Glisser['commencer'] = (e, prise, partout = false) => {
    if (e.button !== 0 || (!partout && e.pointerType !== 'mouse' && !(e.target as Element).closest('[data-prise]'))) return;
    e.stopPropagation();
    const id = e.pointerId;
    const [x0, y0] = [e.clientX, e.clientY];
    let p: Prise | null = null;
    let cible: string | null = null;
    const vise = () => {
      if (!p) return;
      cible = zone(p, pointeur.current[0], pointeur.current[1]);
      setSurvol(cible);
    };
    const arreter = () => {
      window.removeEventListener('pointermove', bouge);
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', annule);
      window.removeEventListener('keydown', echap);
      window.removeEventListener('keyup', touche);
      document.body.classList.remove('glisse-en-cours');
      copieRef.current = false;
      setCopie(false);
      setGlisse(null);
      setSurvol(null);
    };
    const copier = (k: boolean) => {
      if (k === copieRef.current) return;
      copieRef.current = k;
      setCopie(k);
      vise();
    };
    const bouge = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      pointeur.current = [ev.clientX, ev.clientY];
      copieRef.current = ev.ctrlKey || ev.altKey || ev.metaKey;
      setCopie(copieRef.current);
      if (!p) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        p = prise();
        viser.current = vise;
        document.body.classList.add('glisse-en-cours');
        setEnMain(null);
        setGlisse(p);
      }
      vise();
    };
    const fin = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const [c, q] = [cible, p && posee(p)];
      arreter();
      if (!q) return;
      juste.current = true;
      setTimeout(() => (juste.current = false), 0);
      if (c) fns.current.deposer(q, c);
    };
    const annule = (ev: PointerEvent) => ev.pointerId === id && arreter();
    const MODIF = ['Control', 'Alt', 'Meta'];
    const echap = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') return arreter();
      if (!p || !MODIF.includes(ev.key)) return;
      ev.preventDefault();
      copier(true);
    };
    const touche = (ev: KeyboardEvent) => {
      if (!p || !MODIF.includes(ev.key)) return;
      ev.preventDefault();
      copier(ev.ctrlKey || ev.altKey || ev.metaKey);
    };
    window.addEventListener('pointermove', bouge);
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', annule);
    window.addEventListener('keydown', echap);
    window.addEventListener('keyup', touche);
  };

  // En main : un toucher sur une zone de l'organigramme la pose ; ailleurs dans l'arbre, rien ne s'ouvre. Échap : lâcher.
  useEffect(() => {
    if (!enMain) return;
    const clic = (e: MouseEvent) => {
      const t = e.target as Element;
      if (t.closest('[data-garder]')) return;
      const el = t.closest<HTMLElement>('[data-cible]');
      if (!el && !t.closest('.orgl-vue')) return;
      e.preventDefault();
      e.stopPropagation();
      const c = el?.dataset.cible;
      if (!c || !fns.current.peut(enMain, c)) return;
      setEnMain(null);
      fns.current.deposer(enMain, c);
    };
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && setEnMain(null);
    document.addEventListener('click', clic, true);
    window.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('click', clic, true);
      window.removeEventListener('keydown', echap);
    };
  }, [enMain]);

  return {
    glisse,
    enMain,
    survol,
    commencer,
    prendre: setEnMain,
    lacher: () => setEnMain(null),
    justeGlisse: () => juste.current,
    volant: glisse && (
      <>
        <Volant
          prise={glisse}
          copie={copie && !!glisse.depuis}
          action={survol ? fns.current.libelle(posee(glisse), survol) : ''}
          pointeur={pointeur}
          onDefile={() => viser.current()}
        />
        {glisse.depuis && !copie && (
          <div className={`glisse-corbeille ${survol === 'corbeille' ? 'survol' : ''}`} data-cible="corbeille">
            <Icone n="supprimer" /> Retirer de la fiche
          </div>
        )}
      </>
    ),
  };
}

/** La personne glissée, sous le pointeur, avec ce qui se passera si on la lâche ici. */
function Volant({ prise, copie, action, pointeur, onDefile }: { prise: Prise; copie: boolean; action: string; pointeur: RefObject<Point>; onDefile: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const defile = useRef(onDefile);
  defile.current = onDefile;
  useEffect(() => {
    let raf = 0;
    const tour = () => {
      const [x, y] = pointeur.current ?? [0, 0];
      // Près du haut ou du bas de l'écran, la page défile pour atteindre une fiche plus loin.
      const bord = 64;
      const h = window.innerHeight;
      const v = y < bord ? -Math.ceil((bord - y) / 5) : y > h - bord ? Math.ceil((y - (h - bord)) / 5) : 0;
      if (v) {
        window.scrollBy(0, v);
        defile.current();
      }
      if (ref.current) ref.current.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 12)}px)`;
      raf = requestAnimationFrame(tour);
    };
    raf = requestAnimationFrame(tour);
    return () => cancelAnimationFrame(raf);
  }, [pointeur]);
  return (
    <div ref={ref} className="glisse-volant" aria-hidden="true">
      <span className="orga-pilule on">
        <Initials prenom={prise.qui.prenom} nom={prise.qui.nom} couleur={prise.couleur} size={20} />
        <b>{prise.nom}</b>
        {copie && <span className="glisse-copie" title="Copie : elle reste aussi dans sa fiche">＋</span>}
      </span>
      {action && <span className="glisse-action">{copie ? `Copie · ${action}` : action}</span>}
    </div>
  );
}

// ---------- Recherche (en haut à gauche) ----------

const couleurDe = (s: string) => UNIT_COLORS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % UNIT_COLORS.length];

/** Taper un nom : les personnes du club en pilules empilées, à glisser sur une fiche (ou toucher, puis toucher la zone). */
export function Recherche({ q, setQ, candidats, glisser }: { q: string; setQ: (q: string) => void; candidats: Candidat[]; glisser: Glisser }) {
  const g = glisser;
  const t = q.trim();
  const liste = t ? candidats.filter((c) => norm(`${nomCandidat(c)} ${c.email} ${c.ou}`).includes(norm(t))).slice(0, 8) : [];
  const pilule = (cle: string, prise: () => Prise, contenu: ReactNode, titre: string) => {
    const on = g.enMain?.cle === cle;
    return (
      <button
        key={cle}
        type="button"
        className={`orga-pilule ${on ? 'on' : ''}`}
        data-prise
        title={titre}
        aria-pressed={on}
        onPointerDown={(e) => g.commencer(e, () => ({ ...prise(), cle }), true)}
        onClick={() => !g.justeGlisse() && (on ? g.lacher() : g.prendre({ ...prise(), cle }))}
      >
        {contenu}
      </button>
    );
  };
  const neuve = (): Prise => {
    const [prenom, ...reste] = t.split(/\s+/);
    const couleur = couleurDe(t);
    return { qui: { prenom, nom: reste.join(' '), email: '', couleur }, nom: t, couleur };
  };
  return (
    <div className="orga-recherche" data-garder>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        placeholder="🔍 Placer quelqu’un…"
        aria-label="Chercher une personne du club à placer dans l’organigramme"
      />
      {t && (
        <div className="orga-pilules">
          {liste.map((c) =>
            pilule(
              c.key,
              () => ({ qui: { prenom: c.prenom, nom: c.nom, email: c.email, telephone: c.telephone, couleur: c.couleur, membreId: c.membreId }, nom: nomCandidat(c), couleur: c.couleur }),
              <>
                <Initials prenom={c.prenom} nom={c.nom} couleur={c.couleur} size={22} />
                <span>
                  <b>{nomCandidat(c)}</b>
                  <small>{c.ou || 'dans aucune entité'}</small>
                </span>
              </>,
              'Glisse-la sur une fiche (ou touche-la, puis touche la zone)',
            ),
          )}
          {!liste.some((c) => norm(nomCandidat(c)) === norm(t)) && pilule(
            `nouvelle:${t}`,
            neuve,
            <>
              <span className="orga-plus" aria-hidden="true">＋</span>
              <span>
                <b>Nouvelle personne</b>
                <small>« {t} » (pas encore au club)</small>
              </span>
            </>,
            'Pas encore au club : son adresse s’ajoute ensuite dans sa fiche',
          )}
        </div>
      )}
    </div>
  );
}

/** Ce qui est en main (après un toucher) : la poser d'un toucher, la retirer, ou la lâcher. */
export function EnMain({ glisser, onRetirer }: { glisser: Glisser; onRetirer: (p: Prise) => void }) {
  const p = glisser.enMain;
  if (!p) return null;
  return (
    <div className="orga-enmain" data-garder role="status">
      <span>
        ✋ <b>{p.nom}</b> : touche le titre d’une fiche (★), un poste, ou ses bénévoles.
      </span>
      {p.depuis && (
        <button
          type="button"
          className="btn small danger"
          onClick={() => {
            glisser.lacher();
            onRetirer(p);
          }}
        >
          <Icone n="supprimer" /> Retirer
        </button>
      )}
      <button type="button" className="btn small" onClick={glisser.lacher}>Lâcher</button>
    </div>
  );
}

// ---------- La fiche d'une entité ----------

/** Ce dont les fiches ont besoin (page Organigramme). */
export interface OrgaVue {
  /** Mode « Modifier ». */
  edition: boolean;
  /** On peut modifier cette fiche (admins de l'entité ou du comité central). */
  peut: (u: OrgUnit) => boolean;
  glisser: Glisser;
  /** Réglages d'un poste : nom, lien, suppression. */
  onPoste: (u: OrgUnit, p: Poste) => void;
  onNouveauPoste: (u: OrgUnit) => void;
  deplies: Set<string>;
  deplier: (id: string) => void;
  /** Organigramme d'une année passée : ses entités au lieu de celles d'aujourd'hui (rien d'ouvert ni de modifiable). */
  units?: OrgUnit[];
}

export interface ActionsFiche {
  onPersonne: (m: OrgMember) => void;
  onLien: (id: string) => void;
  /** « + Ajouter une personne » : sa fiche complète. */
  onAjouter?: () => void;
  onModifier?: () => void;
}

/**
 * Une entité : titre (nom, ★ avec leurs postes), responsables (une ligne par personne avec tous ses postes ; un poste à
 * pourvoir, en rouge, sur sa ligne ; ⛓ lié au ★ d'une autre entité), bénévoles (repliés). Chaque personne n'y figure
 * qu'une fois. En mode « Modifier » : poignées ⠿, zones où poser (chaque poste en est une), « ＋ Poste », ⚙️.
 */
export function Fiche({ u, o, a }: { u: OrgUnit; o: OrgaVue; a: ActionsFiche }) {
  const club = useClub();
  const t = UNIT_TYPES[u.type];
  const ben = benevolesDe(u.type);
  const z = zonesFiche(u);
  const tous = o.units ?? club.units;
  const groupes = groupesLies(u, tous);
  const g = o.glisser;
  const peut = !o.units && o.edition && o.peut(u);
  const pose = !!(g.glisse || g.enMain) && peut;
  const k = (s: string) => `${u.id}|${s}`;
  const cible = (s: string) => (pose ? k(s) : undefined);
  const sur = (s: string) => (pose && g.survol === k(s) ? 'survol' : '');
  const deplie = o.deplies.has(u.id);
  const prise = (m: OrgMember, depuis: Depuis, poste?: string): Prise => ({ qui: quiDeMembre(m), depuis, nom: nomDe(m), couleur: m.couleur, poste });
  // Une ligne qu'on peut glisser : à la souris partout, au doigt par la poignée ⠿ (un toucher la met en main).
  const tirer = (m: OrgMember, depuis: Depuis, poste?: string) =>
    peut
      ? {
          onPointerDown: (e: ReactPointerEvent<HTMLElement>) => g.commencer(e, () => prise(m, depuis, poste)),
          poignee: (
            <span
              className="fiche-prise"
              data-prise
              title="Glisser (ou toucher, puis toucher la zone où la poser)"
              onClick={(e) => {
                e.stopPropagation();
                if (!g.justeGlisse()) g.prendre(prise(m, depuis, poste));
              }}
            />
          ),
        }
      : { onPointerDown: undefined, poignee: null };
  /** ⛓ d'un poste lié au ★ d'une autre entité (le câble part d'ici). */
  const lieA = (poste: Poste) => (poste.lien ? tous.find((x) => x.id === poste.lien && !x.archive) : undefined);
  const chaine = (poste: Poste) => {
    const c = lieA(poste);
    return c && <span className="ligne-lie" style={{ color: c.couleur }} title={`Lié au ★ de « ${c.nom} » : changer l’un change l’autre`} aria-label={`lié à ${c.nom}`}>⛓</span>;
  };
  // Un clic sur un poste : ses réglages en mode « Modifier » (nom, lien, suppression), sinon la fiche de la personne.
  const clicPoste = (m: OrgMember | undefined, poste: Poste) => (peut ? () => o.onPoste(u, poste) : m ? () => a.onPersonne(m) : undefined);
  /** Un poste à la suite d'un nom : zone où poser (on prend sa place), à glisser (la personne quitte ce poste). */
  const segment = (m: OrgMember, poste: Poste) => {
    const { onPointerDown } = tirer(m, { uniteId: u.id, personId: m.id, zone: 'poste', posteId: poste.id }, poste.nom);
    const cache = !posteBesideName(nomDe(m), poste.nom);
    const clic = clicPoste(m, poste);
    return (
      <span
        key={poste.id}
        className={`ligne-poste ${cache ? 'cache' : ''} ${sur(`poste|${poste.id}`)}`}
        data-ligne={k(`poste:${poste.id}`)}
        data-cible={cible(`poste|${poste.id}`)}
        title={peut ? `${poste.nom} : glisser quelqu’un ici pour qu’il prenne ce poste ; clic : ses réglages` : undefined}
        onPointerDown={
          onPointerDown &&
          ((e) => {
            e.stopPropagation();
            onPointerDown(e);
          })
        }
        onClick={(e) => {
          e.stopPropagation();
          if (!g.justeGlisse()) clic?.();
        }}
      >
        {/* Le poste que le nom dit déjà (« Vice-président ») : seulement son ⛓ (ou ✎ pour le régler). */}
        {cache ? (
          lieA(poste) ? chaine(poste) : peut && <span className="ligne-regler" aria-label={`Réglages du poste « ${poste.nom} »`}>✎</span>
        ) : (
          <>
            {' · '}
            {poste.nom}
            {chaine(poste)}
          </>
        )}
      </span>
    );
  };
  /** Une ligne des responsables : la personne et tous ses postes, ou un poste à pourvoir. */
  const ligne = ({ m, postes }: LigneFiche) => {
    if (!m) {
      const poste = postes[0];
      const clic = clicPoste(undefined, poste);
      return (
        <button
          key={poste.id}
          type="button"
          data-ligne={k(`poste:${poste.id}`)}
          data-cible={cible(`poste|${poste.id}`)}
          className={`poste vacant ${clic ? '' : 'inerte'} ${sur(`poste|${poste.id}`)}`}
          onClick={() => !g.justeGlisse() && clic?.()}
        >
          {poste.nom}
          {chaine(poste)}
          <span className="autres"> · à pourvoir</span>
        </button>
      );
    }
    // Le nom porte le poste qu'il dit déjà, sinon le premier : on le glisse, on pose dessus.
    const { nom, cache } = partsLigne(m, postes);
    const base = cache ?? postes[0];
    const { onPointerDown, poignee } = tirer(m, { uniteId: u.id, personId: m.id, zone: 'poste', posteId: base.id }, base.nom);
    return (
      <button
        key={m.id}
        type="button"
        data-ligne={k(`resp:${m.id}`)}
        data-cible={cible(`poste|${base.id}`)}
        className={`poste ${peut ? 'tirable' : ''} ${sur(`poste|${base.id}`)}`}
        onPointerDown={onPointerDown}
        onClick={() => !g.justeGlisse() && a.onPersonne(m)}
      >
        {poignee}
        {nom}
        {postes.map((x) => segment(m, x))}
      </button>
    );
  };
  const n = z.benevoles.length;
  const texte = (
    <>
      <span className="arbre-titre">
        <UnitMark className="org-icon" logo={u.logo} couleur={u.couleur} icone={t.trait} perso={u.icone} />
        <span className="arbre-texte">
          <strong>{u.nom}</strong>
          <small>{t.label}{u.date && ` · ${fmtRange(u.date, u.dateFin)}`}</small>
        </span>
      </span>
      <span className="arbre-meta">
        <span>{u.membres.length} membre{u.membres.length > 1 ? 's' : ''}</span>
      </span>
    </>
  );
  return (
    <div
      className={`arbre-noeud fiche ${u.archive ? 'archived' : ''} ${pose ? 'fiche-pose' : ''}`}
      style={{ borderTopColor: u.couleur }}
      data-noeud={u.id}
    >
      {/* Titre : poser une personne ici en fait un ★ (en plus des autres) ; sur un ★, à sa place. */}
      <div className={`fiche-titre ${sur('titre')}`} data-cible={cible('titre')}>
        <div className="arbre-tete">{texte}</div>
        <div className="fiche-etoiles">
          {z.etoiles.map(({ m, postes }) => {
            const { onPointerDown, poignee } = tirer(m, { uniteId: u.id, personId: m.id, zone: 'titre' });
            const titre = m.poste || t.chef;
            const nom = nomDe(m);
            // ★ lié : il tient un poste d'une autre entité lié à celle-ci (co-responsables : un poste chacun).
            const lie = tous
              .filter((v) => !v.archive && v.id !== u.id)
              .flatMap((v) => (v.postes ?? []).filter((x) => x.lien === u.id && v.membres.some((y) => y.id === x.titulaire && memeQui(y, m))).map((x) => ({ v, x })))[0];
            return (
              <button
                key={m.id}
                type="button"
                data-ligne={k(`etoile:${m.id}`)}
                data-cible={cible(`etoile|${m.id}`)}
                className={`poste chef ${peut ? 'tirable' : ''} ${sur(`etoile|${m.id}`)}`}
                title={lie ? `Lié au poste « ${lie.x.nom} » de « ${lie.v.nom} » : changer l’un change l’autre` : undefined}
                onPointerDown={onPointerDown}
                onClick={() => !g.justeGlisse() && a.onPersonne(m)}
              >
                {poignee}
                {lie && <span className="fiche-lie" style={{ color: lie.v.couleur }} aria-label={`lié à ${lie.v.nom}`}>⛓</span>}
                <span className="org-star">★ </span>
                {nom}
                {posteBesideName(nom, titre) && <span className="autres"> · {titre}</span>}
                {postes.map((x) => segment(m, x))}
              </button>
            );
          })}
          {!z.etoiles.length && <span className="poste vacant">★ {t.chef} : à désigner</span>}
        </div>
      </div>
      {/* Responsables : un poste par ligne ; poser une personne sur un poste le lui donne, à côté : un nouveau poste. */}
      {(z.lignes.length > 0 || peut) && (
        <div className={`fiche-zone fiche-resp ${sur('nouveau')}`} data-cible={cible('nouveau')}>
          {peut && <span className="fiche-zone-titre">Responsables</span>}
          <div className="arbre-postes">{z.lignes.map((l) => ligne(l))}</div>
          {peut && (
            <button type="button" className="fiche-ajout" title="Ajouter un poste, à pourvoir" onClick={() => o.onNouveauPoste(u)}>
              ＋ Poste
            </button>
          )}
        </div>
      )}
      {/* Bénévoles : repliés ; poser une personne ici en fait un simple bénévole. */}
      {(n > 0 || groupes.length > 0 || peut) && (
        <div className={`fiche-zone fiche-benevoles ${sur('benevoles')}`} data-cible={cible('benevoles')}>
          <button type="button" className="fiche-plier" aria-expanded={deplie} onClick={() => o.deplier(u.id)}>
            <span aria-hidden="true">{deplie ? '▾' : '▸'}</span> {n ? `${n} ${n > 1 ? ben.plusieurs : ben.un}` : `${ben.titre} : aucun`}
            {groupes.length > 0 && <span className="autres"> · 👥 {groupes.map((x) => x.unite?.nom ?? '?').join(', ')}</span>}
          </button>
          {deplie && (
            <div className="arbre-postes fiche-liste">
              {z.benevoles.map((m) => {
                // Ses autres fonctions (pas « Bénévole », déjà dit par la zone) : la première, nom proposé pour un nouveau poste.
                const libres = fonctionsLibres(m, u.postes ?? []).filter((f) => norm(f) !== norm(ben.un) && posteBesideName(nomDe(m), f));
                const { onPointerDown, poignee } = tirer(m, { uniteId: u.id, personId: m.id, zone: 'benevoles' }, libres[0]);
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-ligne={k(`ben:${m.id}`)}
                    className={`poste ${peut ? 'tirable' : ''}`}
                    onPointerDown={onPointerDown}
                    onClick={() => !g.justeGlisse() && a.onPersonne(m)}
                  >
                    {poignee}
                    {nomDe(m)}
                    {libres.length > 0 && <span className="autres"> · {libres.join(', ')}</span>}
                  </button>
                );
              })}
              {groupes.map((x) => (
                <button key={x.id} type="button" data-ligne={k(`lien:${x.id}`)} className="poste lien" title={`Tous les membres de « ${x.unite?.nom ?? '?'} » font partie de « ${u.nom} »`} onClick={() => a.onLien(x.id)}>
                  👥 {x.unite?.nom ?? 'Entité supprimée'}
                  <span className="autres"> · {x.membres.length} membre{x.membres.length > 1 ? 's' : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {(a.onAjouter || a.onModifier) && (
        <div className="arbre-pied">
          {a.onAjouter && (
            <button type="button" className="arbre-ajout" title={`Ajouter une personne (sa fiche complète) à « ${u.nom} »`} onClick={a.onAjouter}>
              + Ajouter une personne
            </button>
          )}
          {a.onModifier && <button type="button" className="arbre-regler" title={`Modifier l’entité « ${u.nom} »`} aria-label={`Modifier l’entité ${u.nom}`} onClick={a.onModifier}><Icone n="reglages" /></button>}
        </div>
      )}
    </div>
  );
}

// ---------- Fenêtres ----------

/** Nom d'un nouveau poste (vide, ou pour la personne qu'on vient d'y poser). */
export function NomPosteModal({ u, qui, defaut, onOk, onClose }: { u: OrgUnit; qui?: string; defaut?: string; onOk: (nom: string) => Promise<boolean>; onClose: () => void }) {
  const [nom, setNom] = useState(defaut ?? '');
  const [busy, setBusy] = useState(false);
  const ok = async () => {
    if (!nom.trim() || busy) return;
    setBusy(true);
    if (await onOk(nom.trim())) onClose();
    else setBusy(false);
  };
  return (
    <Modal title={`Nouveau poste dans « ${u.nom} »`} onClose={onClose}>
      <label className="full">
        {qui ? `Poste de ${qui}` : 'Nom du poste'}
        <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} placeholder="Ex. Secrétaire, Caissier, Sponsoring…" />
      </label>
      {!qui && <p className="muted small-note">Il s’affiche en rouge tant que personne ne l’occupe : glisse ensuite quelqu’un dessus.</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={!nom.trim() || busy} onClick={ok}>Créer le poste</button>
      </div>
    </Modal>
  );
}

/** Les titulaires d'un poste (à plusieurs : tous, chacun avec sa place), dans l'ordre de la fiche. */
export function titulairesDu(u: OrgUnit, po: Poste): { m: OrgMember; posteId: string }[] {
  return placesDu(u.postes ?? [], po).flatMap((x) => {
    const m = x.titulaire ? u.membres.find((y) => y.id === x.titulaire) : undefined;
    return m ? [{ m, posteId: x.id }] : [];
  });
}

/** Une personne lâchée sur un poste déjà occupé : avec ses titulaires (un poste à plusieurs), ou à la place de l'un d'eux. */
export function AvecModal({ u, poste, nom, onAvec, onPlace, onClose }: {
  u: OrgUnit;
  poste: Poste;
  /** La personne qu'on place. */
  nom: string;
  onAvec: () => void;
  onPlace: (posteId: string) => void;
  onClose: () => void;
}) {
  const tit = titulairesDu(u, poste);
  const noms = tit.map((t) => nomDe(t.m));
  return (
    <Modal title={`${nom} : « ${poste.nom} »`} onClose={onClose}>
      <p>
        « {poste.nom} » de « {u.nom} » est déjà occupé par <b>{et(noms)}</b>.
      </p>
      <div className="avec-choix">
        <button type="button" className="btn primary" autoFocus onClick={onAvec}>
          ＋ Avec {et(noms)}
          <small>{nom} occupe aussi le poste ({tit.length + 1} personnes)</small>
        </button>
        {tit.map((t) => (
          <button key={t.posteId} type="button" className="btn" onClick={() => onPlace(t.posteId)}>
            <Icone n="echanger" /> À la place de {nomDe(t.m)}
            <small>{nomDe(t.m)} quitte le poste</small>
          </button>
        ))}
      </div>
      {poste.lien && <p className="muted small-note">⛓ Poste lié : chaque titulaire est ★ (co-responsable) de l’entité liée.</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
      </div>
    </Modal>
  );
}

/**
 * Un poste : son nom, son lien au ★ d'une autre entité, sa suppression ; ses titulaires (un poste à plusieurs : tous ;
 * le nom, le lien et la suppression valent pour toutes ses places).
 */
export function PosteModal({ u, poste, units, faire, onPersonne, onClose }: {
  u: OrgUnit;
  poste: Poste;
  units: OrgUnit[];
  faire: (op: OpOrga[]) => Promise<boolean>;
  onPersonne: (m: OrgMember) => void;
  onClose: () => void;
}) {
  const [nom, setNom] = useState(poste.nom);
  const [lien, setLien] = useState(poste.lien ?? '');
  const [busy, setBusy] = useState(false);
  const places = placesDu(u.postes ?? [], poste);
  const tit = titulairesDu(u, poste);
  const vacantes = tit.length ? places.filter((x) => !tit.some((t) => t.posteId === x.id)) : [];
  const autres = units.filter((x) => !x.archive && x.id !== u.id);
  const go = async (ops: OpOrga[]) => {
    setBusy(true);
    if (await faire(ops)) onClose();
    else setBusy(false);
  };
  const enregistrer = () => {
    const ops: OpOrga[] = [];
    for (const x of places) if (nom.trim() && nom.trim() !== x.nom) ops.push({ type: 'renommer', uniteId: u.id, posteId: x.id, nom: nom.trim() });
    for (const x of places) if ((lien || null) !== (x.lien ?? null)) ops.push({ type: 'lier', uniteId: u.id, posteId: x.id, lien: lien || null });
    if (!ops.length) return onClose();
    void go(ops);
  };
  return (
    <Modal title={`Poste « ${poste.nom} » · ${u.nom}`} onClose={onClose}>
      <div className="form">
        <label className="full">
          Nom du poste
          <input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enregistrer()} />
        </label>
        {tit.map(({ m, posteId }) => (
          <div key={posteId} className="full poste-titulaire">
            <Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={32} />
            <span className="grow">
              <b>{nomDe(m)}</b>
              <small className="muted">{tit.length > 1 ? 'Titulaire, avec les autres' : 'Titulaire du poste'}</small>
            </span>
            <button type="button" className="btn small" onClick={() => onPersonne(m)}>Sa fiche</button>
            <button
              type="button"
              className="btn small"
              disabled={busy}
              title={tit.length > 1 ? 'Il quitte le poste, les autres le gardent' : 'Le poste reste, à pourvoir'}
              onClick={() => void go([{ type: 'placer', qui: quiDeMembre(m), depuis: { uniteId: u.id, personId: m.id, zone: 'poste', posteId }, vers: { zone: 'corbeille' } }])}
            >
              Libérer
            </button>
          </div>
        ))}
        {vacantes.map((x) => (
          <div key={x.id} className="full poste-titulaire">
            <span className="error grow">Une place à pourvoir</span>
            <button type="button" className="btn small" disabled={busy} title="Le poste garde ses titulaires" onClick={() => void go([{ type: 'supprimerPoste', uniteId: u.id, posteId: x.id }])}>
              Retirer cette place
            </button>
          </div>
        ))}
        <div className="full poste-titulaire">
          {tit.length ? (
            <small className="muted">Plusieurs personnes à ce poste : glisse quelqu’un d’autre dessus, puis « ＋ Avec … ».</small>
          ) : (
            <span className="error">À pourvoir : glisse une personne sur la ligne du poste.</span>
          )}
        </div>
        <label className="full">
          ⛓ Lié au ★ de
          <Deroulante value={lien} onChange={setLien} options={[{ value: '', label: '— Aucune entité —' }, ...autres.map((x) => ({ value: x.id, label: x.nom, icone: <PastilleEntite u={x} /> }))]} />
          <small className="muted">Le titulaire de ce poste est ★ de cette entité : changer l’un change l’autre, automatiquement. Fait tout seul quand le poste porte le nom d’une entité.</small>
        </label>
      </div>
      <div className="modal-foot">
        <button
          className="btn danger"
          disabled={busy}
          onClick={() =>
            confirm(`Supprimer le poste « ${poste.nom} » de « ${u.nom} » ?${tit.length ? ` ${et(tit.map((t) => nomDe(t.m)))} ${tit.length > 1 ? 'restent' : 'reste'} dans l’entité.` : ''}`) &&
            void go(places.map((x): OpOrga => ({ type: 'supprimerPoste', uniteId: u.id, posteId: x.id })))
          }
        >
          Supprimer le poste
        </button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy || !nom.trim()} onClick={enregistrer}>Enregistrer</button>
      </div>
    </Modal>
  );
}
