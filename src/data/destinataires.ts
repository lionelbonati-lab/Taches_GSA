import type { AppData, Etiquette, Person, ScheduledEmail } from './types';
import { fullName, shortName } from './utils';

// Destinataires d'un email programmé : des personnes, des étiquettes entières (tous leurs membres, lus à l'envoi : ils
// suivent les arrivées et les départs) et des adresses libres.

export const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const plain = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’'-]/g, ' ');

/** Personnes à qui écrire (actives). */
const actives = (people: Person[]) => people.filter((p) => p.actif);

/** Adresses libres de l'email, une par entrée. */
export const adressesLibres = (autres?: string) => (autres ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

/** Membres actifs d'une étiquette. */
const membresDe = (data: AppData, e?: Etiquette) => (e ? actives(data.people).filter((p) => e.membres.includes(p.id)) : []);

/** Toutes les adresses de l'email, sans doublons. */
export function recipients(data: AppData, e: ScheduledEmail) {
  const etiquette = (id: string) => data.etiquettes?.find((x) => x.id === id);
  const liste = [
    ...e.destinataires.map((id) => data.people.find((p) => p.id === id)?.email),
    ...(e.etiquettes ?? []).flatMap((id) => membresDe(data, etiquette(id)).map((p) => p.email)),
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

export type GenreDestinataire = 'personne' | 'etiquette' | 'adresse';

export interface Destinataire {
  cle: string;
  genre: GenreDestinataire;
  id: string;
  /** Texte de la puce. */
  texte: string;
  /** Précision : poste, nombre de personnes. */
  detail: string;
  /** Avertissement : pas d'adresse, plus au club… (l'email ne lui parviendra pas). */
  alerte?: string;
  email?: string;
}

/** Destinataires choisis, dans l'ordre : personnes, étiquettes, adresses. */
export function choisis(data: AppData, e: ScheduledEmail): Destinataire[] {
  return [
    ...e.destinataires.map((id): Destinataire => {
      const p = data.people.find((x) => x.id === id);
      return {
        cle: `p:${id}`, genre: 'personne', id, texte: p ? shortName(p) : '?', detail: p ? fullName(p) : 'Personne retirée', email: p?.email,
        alerte: !p || !p.actif ? 'ne fait plus partie du club' : !p.email ? 'pas d’adresse email' : undefined,
      };
    }),
    ...(e.etiquettes ?? []).map((id): Destinataire => {
      const et = data.etiquettes?.find((x) => x.id === id);
      const n = new Set(membresDe(data, et).map((p) => (p.email || '').toLowerCase()).filter(Boolean)).size;
      return {
        cle: `e:${id}`, genre: 'etiquette', id, texte: et ? `🏷 ${et.nom}` : 'Étiquette retirée',
        detail: `tous ses membres (${n})`, alerte: !et ? 'n’existe plus' : n ? undefined : 'aucune adresse email',
      };
    }),
    ...adressesLibres(e.autres).map((a): Destinataire => ({
      cle: `m:${a}`, genre: 'adresse', id: a, texte: a, detail: 'adresse email', email: a, alerte: EMAIL_RE.test(a) ? undefined : 'adresse incomplète',
    })),
  ];
}

/** Destinataires en clair, pour la liste des emails et les notifications. */
export const nomsDestinataires = (data: AppData, e: ScheduledEmail) =>
  choisis(data, e).map((d) => (d.genre === 'etiquette' ? `${d.texte} (tous ses membres)` : d.texte) + (d.alerte ? ' ⚠' : ''));

/** Choix proposés par la recherche. */
export interface Candidat extends Destinataire {
  /** Nom dans la liste des résultats (nom complet). */
  etiquette: string;
  /** Texte où chercher (nom, poste, entité), sans accents. */
  recherche: string;
  /** Mots du nom, pour classer en premier ceux qui commencent par la recherche. */
  mots: string[];
}

/** Tout ce qu'on peut chercher : les personnes actives et les étiquettes. */
export function candidats(people: Person[], etiquettes: Etiquette[] = []): Candidat[] {
  const out: Candidat[] = [];
  for (const p of actives(people)) {
    const n = fullName(p);
    out.push({
      cle: `p:${p.id}`, genre: 'personne', id: p.id, texte: shortName(p), etiquette: n, detail: p.poste,
      email: p.email, alerte: p.email ? undefined : 'pas d’adresse email', recherche: plain(`${n} ${p.poste} ${p.autresPostes ?? ''}`), mots: plain(n).split(/\s+/),
    });
  }
  for (const e of etiquettes) {
    const n = new Set(actives(people).filter((p) => e.membres.includes(p.id)).map((p) => (p.email || '').toLowerCase()).filter(Boolean)).size;
    const genre = e.type === 'evenement' ? 'Événement' : 'Groupe';
    out.push({
      cle: `e:${e.id}`, genre: 'etiquette', id: e.id, texte: `🏷 ${e.nom}`, etiquette: `🏷 ${e.nom}`, detail: `${genre} · tous ses membres (${n})`,
      alerte: n ? undefined : 'aucune adresse email', recherche: plain(`${e.nom} ${genre}`), mots: plain(e.nom).split(/\s+/),
    });
  }
  return out;
}

const RANG: Record<GenreDestinataire, number> = { personne: 0, etiquette: 1, adresse: 2 };

/** Résultats d'une recherche : tous les mots tapés trouvés ; d'abord les noms qui commencent par eux, puis les personnes. */
export function chercher(liste: Candidat[], q: string, exclus: Set<string>, max = 8): Candidat[] {
  const mots = plain(q).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const debut = (c: Candidat) => (mots.every((m) => c.mots.some((w) => w.startsWith(m))) ? 0 : 1);
  return liste
    .filter((c) => !exclus.has(c.cle) && mots.every((m) => c.recherche.includes(m)))
    .sort((a, b) => debut(a) - debut(b) || RANG[a.genre] - RANG[b.genre] || a.texte.localeCompare(b.texte, 'fr'))
    .slice(0, max);
}

/** Ajoute un choix à l'email (une personne déjà choisie par son étiquette reste aussi : l'adresse ne part qu'une fois). */
export function ajouter(e: ScheduledEmail, c: Pick<Destinataire, 'genre' | 'id'>): ScheduledEmail {
  if (c.genre === 'personne') return e.destinataires.includes(c.id) ? e : { ...e, destinataires: [...e.destinataires, c.id] };
  if (c.genre === 'etiquette') return e.etiquettes?.includes(c.id) ? e : { ...e, etiquettes: [...(e.etiquettes ?? []), c.id] };
  const l = adressesLibres(e.autres);
  return l.some((x) => x.toLowerCase() === c.id.toLowerCase()) ? e : { ...e, autres: [...l, c.id].join(', ') };
}

/** Retire un choix ; les listes vides disparaissent. */
export function retirer(e: ScheduledEmail, d: Pick<Destinataire, 'genre' | 'id'>): ScheduledEmail {
  if (d.genre === 'personne') return { ...e, destinataires: e.destinataires.filter((x) => x !== d.id) };
  if (d.genre === 'etiquette') {
    const etiquettes = (e.etiquettes ?? []).filter((x) => x !== d.id);
    return { ...e, etiquettes: etiquettes.length ? etiquettes : undefined };
  }
  const l = adressesLibres(e.autres).filter((x) => x !== d.id);
  return { ...e, autres: l.length ? l.join(', ') : undefined };
}
