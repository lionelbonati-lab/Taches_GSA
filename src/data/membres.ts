import type { AppData, ClubMembre, OrgUnit, Person } from './types';
import { norm } from './csv';
import { uid } from './utils';

// Registre « Membres du club » : une fiche par personne pour tout le club (avec ou sans accès à l'appli).
// Les fiches des entités (Person) y sont liées par membreId ; prénom, nom, email et téléphone sont communs.
// Version réelle : le serveur fait le lien et recopie les coordonnées (016) ; démo : demoClub.ts fait de même.

export type Coordonnees = Pick<ClubMembre, 'prenom' | 'nom' | 'email' | 'telephone'>;

export const coordonnees = (p: Coordonnees): Coordonnees => ({
  prenom: (p.prenom ?? '').trim(),
  nom: (p.nom ?? '').trim(),
  email: (p.email ?? '').trim(),
  telephone: (p.telephone ?? '').trim(),
});

export const memesCoordonnees = (a: Coordonnees, b: Coordonnees) => {
  const x = coordonnees(a);
  const y = coordonnees(b);
  return x.prenom === y.prenom && x.nom === y.nom && x.email === y.email && x.telephone === y.telephone;
};

export const emailKey = (e?: string) => (e ?? '').trim().toLowerCase();
export const nomMembre = (m: { prenom: string; nom: string }) => `${m.prenom} ${m.nom}`.trim();

export const nouveauMembre = (m: Partial<ClubMembre>): ClubMembre => ({
  id: m.id ?? uid('m'),
  prenom: m.prenom?.trim() ?? '',
  nom: m.nom?.trim() ?? '',
  email: m.email?.trim() ?? '',
  telephone: m.telephone?.trim() ?? '',
  iban: compactIban(m.iban ?? ''),
  couleur: m.couleur ?? '#0f766e',
  groupes: m.groupes ?? [],
});

/** Même personne : même email ; sans email d'un côté, même prénom et nom. */
export function trouverMembre<T extends Coordonnees>(list: T[], q: Partial<Coordonnees>): T | undefined {
  const e = emailKey(q.email);
  if (e) {
    const m = list.find((x) => emailKey(x.email) === e);
    if (m) return m;
  }
  const n = norm(`${q.prenom ?? ''} ${q.nom ?? ''}`);
  if (!n) return undefined;
  return list.find((x) => norm(`${x.prenom} ${x.nom}`) === n && (!e || !emailKey(x.email)));
}

/** Postes du membre dans les entités du club (fiches actives liées, ou de même email). */
export function postesDe(m: ClubMembre, units: OrgUnit[]) {
  const e = emailKey(m.email);
  return units.flatMap((unit) =>
    unit.membres.filter((x) => x.membreId === m.id || (!x.membreId && e && emailKey(x.email) === e)).map((member) => ({ unit, member })),
  );
}

/** Recopie les coordonnées du registre dans les fiches liées ; vrai si une fiche a changé. */
export function appliquerMembres(d: AppData, list: ClubMembre[]): boolean {
  const byId = new Map(list.map((m) => [m.id, m]));
  let changed = false;
  d.people.forEach((p: Person) => {
    const m = p.membreId ? byId.get(p.membreId) : undefined;
    if (m && !memesCoordonnees(p, m)) {
      Object.assign(p, coordonnees(m));
      changed = true;
    }
  });
  return changed;
}

/** IBAN sans espaces, en majuscules. */
export const compactIban = (s: string) => s.replace(/\s+/g, '').toUpperCase();
/** IBAN par groupes de 4 (CH93 0076 2011 6238 5295 7). */
export const formatIban = (s: string) => compactIban(s).replace(/(.{4})(?=.)/g, '$1 ');

/** Contrôle de l'IBAN (longueur et clé modulo 97) ; vide = valide. */
export function ibanValide(s: string): boolean {
  const v = compactIban(s);
  if (!v) return true;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  const digits = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let r = 0;
  for (const c of digits) r = (r * 10 + +c) % 97;
  return r === 1;
}

/** Groupes de l'organigramme (entités de type « groupe », hors archivées). */
export const groupesClub = (units: OrgUnit[]) => units.filter((u) => u.type === 'groupe' && !u.archive);
