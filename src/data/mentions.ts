import type { ActivityNotif, Person, Role, Task } from './types';
import { userRoles, voitTache } from './permissions';
import { normaliser } from './recherche';
import { apercu } from './commentaires';
import { fullName, uid } from './utils';

// Mentions « @Prénom Nom » dans la discussion d'une tâche : la personne mentionnée est prévenue (📣), même si elle n'est
// ni responsable ni autrice de la tâche. Seulement les personnes actives de l'entité de la tâche qui la voient.

const LETTRE = /[\p{L}\p{N}]/u;
const lettre = (c: string) => !!c && LETTRE.test(c);

/** Personnes qu'on peut mentionner dans la discussion de la tâche `t` (de l'entité ouverte) : actives, qui la voient, sauf soi. */
export const mentionnables = (t: Task, people: Person[], roles: Role[], moi: string) =>
  people
    .filter((p) => p.actif && p.id !== moi && fullName(p) && voitTache(t, p.id, userRoles(roles, p)))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'));

/** Morceaux du texte : texte simple, ou mention d'une personne (`id`) ; le nom le plus long l'emporte. */
export function decouper(texte: string, people: Pick<Person, 'id' | 'prenom' | 'nom'>[]): { texte: string; id?: string }[] {
  const noms = people.map((p) => ({ id: p.id, m: `@${fullName(p)}` })).filter((x) => x.m.length > 1).sort((a, b) => b.m.length - a.m.length);
  const out: { texte: string; id?: string }[] = [];
  let i = 0;
  for (let at = texte.indexOf('@'); at >= 0; at = texte.indexOf('@', at + 1)) {
    if (at < i || lettre(texte.charAt(at - 1))) continue;
    const n = noms.find((x) => texte.startsWith(x.m, at) && !lettre(texte.charAt(at + x.m.length)));
    if (!n) continue;
    if (at > i) out.push({ texte: texte.slice(i, at) });
    out.push({ texte: n.m, id: n.id });
    i = at + n.m.length;
  }
  if (i < texte.length) out.push({ texte: texte.slice(i) });
  return out;
}

/** Personnes mentionnées dans le texte, parmi `people`. */
export const mentionnes = (texte: string, people: Person[]) => [...new Set(decouper(texte, people).flatMap((x) => (x.id ? [x.id] : [])))];

/** Mention en train d'être tapée juste avant le curseur : position du « @ » et ce qui suit (deux mots au plus). */
export function mentionEnCours(texte: string, curseur: number): { debut: number; cherche: string } | null {
  const m = /(?:^|[^\p{L}\p{N}])@([\p{L}\p{M}'’-]*(?: [\p{L}\p{M}'’-]*)?)$/u.exec(texte.slice(0, curseur));
  return m ? { debut: curseur - m[1].length - 1, cherche: m[1] } : null;
}

/** Personnes dont le nom correspond à ce qui est tapé : chaque mot tapé commence un mot du nom (sans accents). */
export function proposer(people: Person[], cherche: string, max = 6) {
  const mots = normaliser(cherche).n.split(/\s+/).filter(Boolean);
  return people
    .filter((p) => {
      const nom = normaliser(fullName(p)).n.split(/[\s'’-]+/);
      return mots.every((w) => nom.some((x) => x.startsWith(w)));
    })
    .slice(0, max);
}

/** Notifications 📣 des personnes mentionnées dans un nouveau commentaire sur la tâche `t` (vue d'ici). */
export const notifsMention = (ids: string[], t: Pick<Task, 'id' | 'titre'>, moi: string, texte: string, le: string): ActivityNotif[] =>
  ids.map((userId) => ({ id: uid('n'), userId, type: 'mention', taskId: t.id, by: moi, at: le, titre: t.titre, detail: apercu(texte.trim()) }));

