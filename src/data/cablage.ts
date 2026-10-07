import type { AppData, Person } from './types';
import { ADMIN_ROLE_ID } from './permissions';
import { defaultRoleId } from './units';
import { uid } from './utils';

// Organigramme câblé : une personne tirée sur une entité en devient le responsable (★, rôle Admin).
// Sa fiche dans l'entité est reprise (même fiche du registre « Membres du club », ou même adresse) ou créée :
// la personne peut ne faire partie d'aucune entité (ex. responsable de groupe hors comité, pris dans le registre).
// Même règle que le serveur (supabase/functions/gsa-acces, action « responsable »).

/** Personne à désigner responsable, et ce que deviennent les responsables actuels. */
export interface NouveauResponsable {
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  couleur: string;
  /** Fiche du registre « Membres du club ». */
  membreId?: string;
  /** Sa fonction dans l'entité (« Responsable », « Président »…). */
  poste: string;
  /** Les responsables actuels le restent aussi ; sinon ils restent membres, sans ★. */
  garder: boolean;
}

const cle = (s?: string) => (s ?? '').trim().toLowerCase();
const fonctions = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

/** Fiche de la personne dans l'entité (active d'abord), par fiche du registre puis par adresse. */
export function ficheDe(people: Person[], r: Pick<NouveauResponsable, 'membreId' | 'email'>) {
  const email = cle(r.email);
  const meme = (p: Person) => (!!r.membreId && p.membreId === r.membreId) || (!!email && cle(p.email) === email);
  return people.find((p) => meme(p) && p.actif) ?? people.find(meme);
}

/** Responsables actuels (fiches actives avec le rôle Admin). */
export const responsables = (people: Person[]) => people.filter((p) => p.actif && p.roles.includes(ADMIN_ROLE_ID));

/**
 * Désigne le responsable dans les données de l'entité (modifiées sur place).
 * Renvoie sa fiche et les fiches qui perdent la ★.
 */
export function poserResponsable(d: AppData, r: NouveauResponsable, chef: string): { personId: string; retires: string[] } {
  const poste = r.poste.trim() || chef;
  let p = ficheDe(d.people, r);
  if (p) {
    const ancien = p.poste.trim();
    const autres = [...new Set([...(ancien && cle(ancien) !== cle(poste) ? [ancien] : []), ...fonctions(p.autresPostes)])].filter((x) => cle(x) !== cle(poste));
    const maj: Person = {
      ...p,
      actif: true,
      roles: [ADMIN_ROLE_ID, ...p.roles.filter((x) => x !== ADMIN_ROLE_ID)],
      poste,
      autresPostes: autres.length ? autres.join(', ') : undefined,
      membreId: p.membreId || r.membreId,
      telephone: p.telephone || r.telephone || '',
      // Fiche venue d'une autre entité (lien « Membres de ») : elle devient la sienne, un lien n'est jamais admin.
      viaEntite: undefined,
      viaFiche: undefined,
      exclu: undefined,
    };
    d.people = d.people.map((x) => (x.id === maj.id ? maj : x));
    p = maj;
  } else {
    p = {
      id: uid('p'),
      prenom: r.prenom.trim(),
      nom: r.nom.trim(),
      email: r.email.trim(),
      telephone: r.telephone?.trim() ?? '',
      couleur: r.couleur,
      poste,
      roles: [ADMIN_ROLE_ID],
      actif: true,
      membreId: r.membreId,
    };
    d.people = [...d.people, p];
  }
  const retires: string[] = [];
  if (!r.garder) {
    const defaut = defaultRoleId(d.roles);
    d.people = d.people.map((x) => {
      if (x.id === p!.id || !x.roles.includes(ADMIN_ROLE_ID)) return x;
      retires.push(x.id);
      const roles = x.roles.filter((y) => y !== ADMIN_ROLE_ID);
      // Son poste de responsable n'est plus le sien ; ses autres fonctions restent.
      const etaitChef = !!x.poste.trim() && (cle(x.poste) === cle(chef) || cle(x.poste) === cle(poste));
      return { ...x, roles: roles.length ? roles : [defaut], poste: etaitChef ? '' : x.poste };
    });
  }
  return { personId: p.id, retires };
}
