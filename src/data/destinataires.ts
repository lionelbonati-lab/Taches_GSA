import type { AppData, OrgUnit, Person, ScheduledEmail } from './types';
import { UNIT_TYPES } from './units';
import { fullName, shortName } from './utils';

// Destinataires d'un email programmé : des personnes de l'entité, des entités du club entières (toutes leurs
// personnes, lues à l'envoi : elles suivent les arrivées et les départs), des personnes d'autres entités et des
// adresses libres. Les adresses des autres entités viennent de l'organigramme du club.

type Unite = Pick<OrgUnit, 'id' | 'nom' | 'type' | 'membres' | 'archive'>;

export const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const plain = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'-]/g, ' ');

/** Personnes de l'entité ouverte à qui écrire (actives, pas retirées). */
const actives = (people: Person[]) => people.filter((p) => p.actif && !p.exclu);

/** Adresses libres de l'email, une par entrée. */
export const adressesLibres = (autres?: string) => (autres ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

/** Adresses des personnes d'une entité (l'entité ouverte : ses fiches ici). */
function adressesUnite(data: AppData, id: string, units: Unite[], courante?: string) {
  if (id === courante) return actives(data.people).map((p) => p.email || '');
  return (units.find((u) => u.id === id)?.membres ?? []).map((m) => m.email || '');
}

/** Toutes les adresses de l'email, sans doublons (la même adresse dans deux entités ne compte qu'une fois). */
export function recipients(data: AppData, e: ScheduledEmail, units: Unite[] = [], courante?: string) {
  const unite = (id: string) => units.find((u) => u.id === id);
  const liste = [
    ...e.destinataires.map((id) => data.people.find((p) => p.id === id)?.email),
    ...(e.unites ?? []).flatMap((id) => adressesUnite(data, id, units, courante)),
    ...Object.entries(e.externes ?? {}).flatMap(([u, ids]) => ids.map((id) => unite(u)?.membres.find((m) => m.id === id)?.email)),
    ...adressesLibres(e.autres),
  ];
  const vues = new Set<string>();
  return liste
    .map((x) => (x ?? '').trim())
    .filter((x) => {
      const k = x.toLowerCase();
      if (!x || vues.has(k)) return false;
      vues.add(k);
      return true;
    });
}

export type GenreDestinataire = 'personne' | 'unite' | 'externe' | 'adresse';

export interface Destinataire {
  cle: string;
  genre: GenreDestinataire;
  id: string;
  /** Entité d'une personne d'une autre entité. */
  unite?: string;
  /** Texte de la puce. */
  texte: string;
  /** Précision : poste, entité, nombre de personnes. */
  detail: string;
  /** Avertissement : pas d'adresse, plus dans l'entité… (l'email ne lui parviendra pas). */
  alerte?: string;
  email?: string;
}

/** Destinataires choisis, dans l'ordre : personnes d'ici, entités, personnes d'autres entités, adresses. */
export function choisis(data: AppData, e: ScheduledEmail, units: Unite[], courante?: string): Destinataire[] {
  const unite = (id: string) => units.find((u) => u.id === id);
  return [
    ...e.destinataires.map((id): Destinataire => {
      const p = data.people.find((x) => x.id === id);
      return {
        cle: `p:${id}`, genre: 'personne', id, texte: p ? shortName(p) : '?', detail: p ? fullName(p) : 'Personne retirée', email: p?.email,
        alerte: !p || !p.actif || p.exclu ? 'ne fait plus partie de l’entité' : !p.email ? 'pas d’adresse email' : undefined,
      };
    }),
    ...(e.unites ?? []).map((id): Destinataire => {
      const u = unite(id);
      const n = new Set(adressesUnite(data, id, units, courante).filter(Boolean).map((x) => x.toLowerCase())).size;
      return {
        cle: `u:${id}`, genre: 'unite', id, texte: `${u ? `${UNIT_TYPES[u.type]?.icon ?? ''} ${u.nom}`.trim() : 'Entité supprimée'}`,
        detail: `toutes ses personnes (${n})`, alerte: !u && id !== courante ? 'n’existe plus' : n ? undefined : 'aucune adresse email',
      };
    }),
    ...Object.entries(e.externes ?? {}).flatMap(([uid, ids]) =>
      ids.map((id): Destinataire => {
        const u = unite(uid);
        const m = u?.membres.find((x) => x.id === id);
        return {
          cle: `a:${uid}:${id}`, genre: 'externe', id, unite: uid, texte: `${m ? shortName(m) : '?'} (${u?.nom ?? '?'})`,
          detail: m ? `${fullName(m)} · ${u?.nom}` : 'Personne retirée', email: m?.email,
          alerte: !m ? `ne fait plus partie de ${u?.nom ?? 'son entité'}` : !m.email ? 'pas d’adresse email' : undefined,
        };
      }),
    ),
    ...adressesLibres(e.autres).map((a): Destinataire => ({
      cle: `m:${a}`, genre: 'adresse', id: a, texte: a, detail: 'adresse email', email: a, alerte: EMAIL_RE.test(a) ? undefined : 'adresse incomplète',
    })),
  ];
}

/** Destinataires en clair, pour la liste des emails et les notifications. */
export const nomsDestinataires = (data: AppData, e: ScheduledEmail, units: Unite[], courante?: string) =>
  choisis(data, e, units, courante).map((d) => (d.genre === 'unite' ? `${d.texte} (toute l’entité)` : d.texte) + (d.alerte ? ' ⚠' : ''));

/** Choix proposés par la recherche. */
export interface Candidat extends Destinataire {
  /** Nom dans la liste des résultats (nom complet). */
  etiquette: string;
  /** Texte où chercher (nom, poste, entité), sans accents. */
  recherche: string;
  /** Mots du nom, pour classer en premier ceux qui commencent par la recherche. */
  mots: string[];
}

/**
 * Tout ce qu'on peut chercher : les personnes de l'entité ouverte, les entités du club (pas les archivées) et les
 * personnes des autres entités (une seule fois chacune : pas celles déjà ici, ni deux fois la même adresse).
 */
export function candidats(people: Person[], units: Unite[], courante?: string): Candidat[] {
  const out: Candidat[] = [];
  const adresses = new Set<string>();
  for (const p of actives(people)) {
    if (p.email) adresses.add(p.email.toLowerCase());
    const n = fullName(p);
    out.push({
      cle: `p:${p.id}`, genre: 'personne', id: p.id, texte: shortName(p), etiquette: n, detail: p.poste,
      email: p.email, alerte: p.email ? undefined : 'pas d’adresse email', recherche: plain(`${n} ${p.poste} ${p.autresPostes ?? ''}`), mots: plain(n).split(/\s+/),
    });
  }
  const ouvertes = units.filter((u) => !u.archive || u.id === courante);
  for (const u of ouvertes) {
    const n = new Set((u.id === courante ? actives(people) : u.membres).map((x) => (x.email || '').toLowerCase()).filter(Boolean)).size;
    const genre = UNIT_TYPES[u.type]?.label ?? '';
    out.push({
      cle: `u:${u.id}`, genre: 'unite', id: u.id, texte: `${UNIT_TYPES[u.type]?.icon ?? ''} ${u.nom}`.trim(),
      etiquette: `${UNIT_TYPES[u.type]?.icon ?? ''} ${u.nom}`.trim(), detail: `${genre ? `${genre} · ` : ''}toutes ses personnes (${n})`, alerte: n ? undefined : 'aucune adresse email',
      recherche: plain(`${u.nom} ${genre}`), mots: plain(u.nom).split(/\s+/),
    });
  }
  // Personnes des autres entités : regroupées par adresse (« Comité central, CO Bruntrutaine »).
  const autres = new Map<string, Candidat>();
  for (const u of ouvertes) {
    if (u.id === courante) continue;
    for (const m of u.membres) {
      const k = m.email ? m.email.toLowerCase() : `${u.id}:${m.id}`;
      // Déjà ici (même adresse, ou membre là-bas par le lien avec l'entité ouverte).
      if (adresses.has(k) || m.viaEntite === courante) continue;
      const deja = autres.get(k);
      if (deja) {
        deja.detail += `, ${u.nom}`;
        deja.recherche += ` ${plain(u.nom)}`;
        continue;
      }
      const n = fullName(m);
      autres.set(k, {
        cle: `a:${u.id}:${m.id}`, genre: 'externe', id: m.id, unite: u.id, texte: `${shortName(m)} (${u.nom})`, etiquette: n,
        detail: `${m.poste ? `${m.poste} · ` : ''}${u.nom}`, email: m.email, alerte: m.email ? undefined : 'pas d’adresse email',
        recherche: plain(`${n} ${m.poste} ${m.autresPostes ?? ''} ${u.nom}`), mots: plain(n).split(/\s+/),
      });
    }
  }
  return [...out, ...autres.values()];
}

const RANG: Record<GenreDestinataire, number> = { personne: 0, unite: 1, externe: 2, adresse: 3 };

/** Résultats d'une recherche : tous les mots tapés trouvés ; d'abord les noms qui commencent par eux, puis les personnes d'ici. */
export function chercher(liste: Candidat[], q: string, exclus: Set<string>, max = 8): Candidat[] {
  const mots = plain(q).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const debut = (c: Candidat) => (mots.every((m) => c.mots.some((w) => w.startsWith(m))) ? 0 : 1);
  return liste
    .filter((c) => !exclus.has(c.cle) && mots.every((m) => c.recherche.includes(m)))
    .sort((a, b) => debut(a) - debut(b) || RANG[a.genre] - RANG[b.genre] || a.texte.localeCompare(b.texte, 'fr'))
    .slice(0, max);
}

/** Ajoute un choix à l'email (une personne d'ailleurs déjà choisie par son entité reste aussi : l'adresse ne part qu'une fois). */
export function ajouter(e: ScheduledEmail, c: Pick<Destinataire, 'genre' | 'id' | 'unite'>): ScheduledEmail {
  if (c.genre === 'personne') return e.destinataires.includes(c.id) ? e : { ...e, destinataires: [...e.destinataires, c.id] };
  if (c.genre === 'unite') return e.unites?.includes(c.id) ? e : { ...e, unites: [...(e.unites ?? []), c.id] };
  if (c.genre === 'externe' && c.unite) {
    const l = e.externes?.[c.unite] ?? [];
    return l.includes(c.id) ? e : { ...e, externes: { ...e.externes, [c.unite]: [...l, c.id] } };
  }
  const l = adressesLibres(e.autres);
  return l.some((x) => x.toLowerCase() === c.id.toLowerCase()) ? e : { ...e, autres: [...l, c.id].join(', ') };
}

/** Retire un choix ; les listes vides disparaissent. */
export function retirer(e: ScheduledEmail, d: Pick<Destinataire, 'genre' | 'id' | 'unite'>): ScheduledEmail {
  if (d.genre === 'personne') return { ...e, destinataires: e.destinataires.filter((x) => x !== d.id) };
  if (d.genre === 'unite') {
    const unites = (e.unites ?? []).filter((x) => x !== d.id);
    return { ...e, unites: unites.length ? unites : undefined };
  }
  if (d.genre === 'externe' && d.unite) {
    const externes = { ...e.externes };
    const l = (externes[d.unite] ?? []).filter((x) => x !== d.id);
    if (l.length) externes[d.unite] = l;
    else delete externes[d.unite];
    return { ...e, externes: Object.keys(externes).length ? externes : undefined };
  }
  const l = adressesLibres(e.autres).filter((x) => x !== d.id);
  return { ...e, autres: l.length ? l.join(', ') : undefined };
}
