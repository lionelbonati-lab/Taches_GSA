import type { AppData, OrgMember, OrgUnit, Person } from './types';
import { emailKey } from './membres';
import { ADMIN_ROLE_ID } from './permissions';
import { defaultRoleId } from './units';
import { uid } from './utils';

// Une entité entière parmi les membres d'une autre (organigramme : « Membres de « A » » dans B).
// B reçoit une fiche par membre de A (fiche liée : viaEntite), tenue à jour automatiquement : qui rejoint A rejoint B
// (avec le rôle choisi pour le lien, jamais Admin), qui quitte A quitte B (fiche désactivée, ses tâches restent).
// B garde ses propres membres en plus ; une personne déjà membre de B elle-même n'est pas doublée.
// Seuls les membres propres de A passent (pas ceux que A reçoit elle-même d'une autre entité) : pas de boucle.
// Version réelle : le serveur fait la mise à jour (migration 020) ; démo : synchroLiens, à chaque enregistrement.

/** Membres propres d'une entité : actifs, hors fiches reçues par le lien d'une autre entité. */
export const membresPropres = <T extends Pick<Person, 'actif' | 'viaEntite'>>(people: T[]) => people.filter((p) => p.actif && !p.viaEntite);

/** Ce qui reconnaît une même personne d'une entité à l'autre : sa fiche du registre, son adresse email. */
const cles = (p: Pick<Person, 'membreId' | 'email'>) => [p.membreId, emailKey(p.email) && `e:${emailKey(p.email)}`].filter((x): x is string => !!x);

/** Rôle donné par le lien : celui choisi s'il existe dans l'entité (jamais Admin), sinon le rôle par défaut. */
export function roleDuLien(d: Pick<AppData, 'roles'>, role?: string): string | undefined {
  if (role && role !== ADMIN_ROLE_ID && d.roles.some((r) => r.id === role)) return role;
  const autres = d.roles.filter((r) => r.id !== ADMIN_ROLE_ID);
  return autres.length ? defaultRoleId(autres) : undefined;
}

/**
 * Fiches liées de l'entité `id` remises en accord avec les membres des entités liées (`sources` : leurs fiches) ;
 * null si rien ne change. Même règle que le serveur (gsa_liens_synchro, 020).
 */
export function synchroLiens(id: string, d: AppData, sources: (uniteId: string) => Person[] | null): AppData | null {
  const liens = (d.membresDe ?? []).filter((l) => l.uniteId && l.uniteId !== id);
  if (!liens.length && !d.people.some((p) => p.viaEntite && p.actif)) return null;
  const people = d.people.map((p) => ({ ...p }));
  const vus = new Set(membresPropres(people).flatMap(cles));
  const pris = new Set<string>();
  let change = false;
  for (const l of liens) {
    const role = roleDuLien(d, l.role);
    for (const s of membresPropres(sources(l.uniteId) ?? [])) {
      const k = cles(s);
      if (k.some((x) => vus.has(x))) continue;
      k.forEach((x) => vus.add(x));
      // Fiche liée existante : même fiche d'origine, sinon même membre du club (revenu, ou venu d'une autre entité liée).
      const libre = people.filter((p) => p.viaEntite && !pris.has(p.id));
      const f = libre.find((p) => p.viaEntite === l.uniteId && p.viaFiche === s.id) ?? (s.membreId ? libre.find((p) => p.membreId === s.membreId) : undefined);
      const co = { prenom: s.prenom, nom: s.nom, email: s.email, telephone: s.telephone, couleur: s.couleur, ...(s.membreId ? { membreId: s.membreId } : {}) };
      if (f) {
        pris.add(f.id);
        // Retirée de l'entité à la main : elle n'y revient pas.
        if (f.exclu) continue;
        const next = { ...f, ...co, actif: true, viaEntite: l.uniteId, viaFiche: s.id };
        if (JSON.stringify(next) !== JSON.stringify(f)) {
          Object.assign(f, next);
          change = true;
        }
      } else {
        const p: Person = { id: uid('v'), poste: '', ...co, roles: role ? [role] : [], actif: true, viaEntite: l.uniteId, viaFiche: s.id };
        people.push(p);
        pris.add(p.id);
        change = true;
      }
    }
  }
  // Plus membre de l'entité liée (ou lien retiré) : fiche désactivée, gardée pour ses tâches.
  for (const p of people)
    if (p.viaEntite && p.actif && !pris.has(p.id)) {
      p.actif = false;
      change = true;
    }
  return change ? { ...d, people } : null;
}

/** Membres d'une entité reçus par lien, groupés par entité liée (organigramme), liens sans membre compris. */
export function groupesLies(u: Pick<OrgUnit, 'membres' | 'liens'>, units: OrgUnit[]): { unite: OrgUnit | undefined; id: string; membres: OrgMember[] }[] {
  const ids = [...new Set([...(u.liens ?? []), ...u.membres.map((m) => m.viaEntite).filter((x): x is string => !!x)])];
  return ids.map((id) => ({ id, unite: units.find((x) => x.id === id), membres: u.membres.filter((m) => m.viaEntite === id) }));
}
