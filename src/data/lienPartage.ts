import { aPrendreOuverte } from './aPrendre';
import { getMode } from './mode';
import type { Person, Poll, Task } from './types';
import { fmtDate, shortName } from './utils';
import { echeance } from './polls';

// Liens à envoyer (WhatsApp, email…) vers une tâche ou un sondage. Ils gardent :
//   - la version (?reel / ?demo) : ouverts sur un appareil où l'appli n'a jamais servi, ils n'arrêtent pas sur l'écran de choix ;
//   - l'entité (&u=<entité>) : l'appli s'ouvre dans cette entité si la personne en fait partie.
// Le lien ne donne aucun accès : il faut un compte, et voir la tâche ou le sondage dans l'entité.

const PARAM = 'u';

/** Adresse complète de l'appli ouverte sur `chemin` (« /taches?tache=… »), dans l'entité `unite`. */
export function lienAppli(chemin: string, unite?: string, mode = getMode()): string {
  const base = `${location.origin}${location.pathname}${mode ? `?${mode}` : ''}`;
  const u = unite ? `${chemin.includes('?') ? '&' : '?'}${PARAM}=${encodeURIComponent(unite)}` : '';
  return `${base}#${chemin}${u}`;
}

/** Entité demandée par le lien qui a ouvert l'appli (null sans lien). */
export function uniteDuLien(hash = typeof location === 'undefined' ? '' : location.hash): string | null {
  const i = hash.indexOf('?');
  return i < 0 ? null : new URLSearchParams(hash.slice(i + 1)).get(PARAM);
}

export const lienWhatsApp = (texte: string) => `https://wa.me/?text=${encodeURIComponent(texte)}`;

export const lienEmail = (objet: string, texte: string) => `mailto:?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(texte)}`;

/** Message qui accompagne le lien d'une tâche (modifiable avant l'envoi). */
export function texteTache(
  t: Pick<Task, 'titre' | 'delai' | 'responsables' | 'aPrendre' | 'respPartage' | 'source' | 'paiement'>,
  people: Pick<Person, 'id' | 'prenom' | 'nom'>[],
  entite?: string,
  terminee = false,
): string {
  const noms = t.responsables.map((id) => people.find((p) => p.id === id)).filter((p) => !!p).map((p) => shortName(p));
  const qui = aPrendreOuverte(t) ? '🙋 À prendre : qui s’en charge ?' : noms.length ? `👤 ${noms.join(', ')}` : '';
  return [
    `📋 Tâche « ${t.titre.trim() || 'Sans titre'} »${entite ? ` (${entite})` : ''}`,
    [t.delai && `📅 Pour le ${fmtDate(t.delai)}`, qui, terminee && '✅ Terminée'].filter(Boolean).join(' · '),
    'Détails dans l’appli :',
  ].filter(Boolean).join('\n');
}

/** Message qui accompagne le lien d'un sondage. */
export function texteSondage(p: Pick<Poll, 'question' | 'dateLimite' | 'heureLimite'>, ouvert: boolean, entite?: string): string {
  return [
    `📊 Sondage « ${p.question.trim()} »${entite ? ` (${entite})` : ''}`,
    !ouvert ? 'Clôturé, résultats dans l’appli :' : p.dateLimite ? `Réponds d’ici le ${echeance(p)} dans l’appli :` : 'Réponds dans l’appli :',
  ].join('\n');
}
