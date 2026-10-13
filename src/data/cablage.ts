import type { Person } from './types';

// La fiche d'une personne dans une entité, d'une entité à l'autre : même fiche du registre « Membres du club », sinon
// même adresse (moteur de l'organigramme, data/organigramme.ts, aussi dans la fonction « gsa-acces »).

const cle = (s?: string) => (s ?? '').trim().toLowerCase();

/** Fiche de la personne dans l'entité (active d'abord), par fiche du registre puis par adresse. */
export function ficheDe(people: Person[], r: { membreId?: string; email: string }) {
  const email = cle(r.email);
  const meme = (p: Person) => (!!r.membreId && p.membreId === r.membreId) || (!!email && cle(p.email) === email);
  return people.find((p) => meme(p) && p.actif) ?? people.find(meme);
}
