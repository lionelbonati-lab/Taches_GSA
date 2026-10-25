import { aPrendreOuverte } from './aPrendre';
import { getMode } from './mode';
import type { Person, Poll, Task } from './types';
import { fmtDate, shortName } from './utils';
import { echeance } from './polls';

// Liens à envoyer (WhatsApp, email…) vers une tâche ou un sondage : …/?reel=<entité>#/taches?tache=…. Ils gardent :
//   - la version (?reel / ?demo) : ouverts sur un appareil où l'appli n'a jamais servi, ils n'arrêtent pas sur l'écran de choix ;
//   - l'entité (valeur de ?reel / ?demo) : l'appli s'ouvre dans cette entité si la personne en fait partie.
// Aucun « & » : des messageries (sur téléphone) coupent le texte d'un mail au premier « & », même dans une adresse.
// Les liens envoyés avant (#/taches?tache=…&u=<entité>) restent valables.
// Le lien ne donne aucun accès : il faut un compte, et voir la tâche ou le sondage dans l'entité.

const PARAM = 'u';

/** Adresse complète de l'appli ouverte sur `chemin` (« /taches?tache=… »), dans l'entité `unite`. */
export function lienAppli(chemin: string, unite?: string, mode = getMode()): string {
  const cle = mode ?? (unite ? PARAM : '');
  const q = cle ? `?${cle}${unite ? `=${encodeURIComponent(unite)}` : ''}` : '';
  return `${location.origin}${location.pathname}${q}#${chemin}`;
}

/**
 * Lien reçu : l'entité de « ?reel=<entité> » passe dans l'adresse de la page (#/taches?tache=…&u=<entité>), où
 * uniteDuLien la lit. La version (?reel / ?demo) reste pour modeFromUrl. À appeler au lancement, avant modeFromUrl.
 */
export function entiteDuLienRecu() {
  const params = new URLSearchParams(location.search);
  const cle = ['reel', 'demo', PARAM].find((k) => params.get(k));
  if (!cle) return;
  const unite = params.get(cle)!;
  if (cle === PARAM) params.delete(cle);
  else params.set(cle, '');
  const q = params.toString();
  const h = location.hash.replace(/^#/, '') || '/';
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}#${h}${h.includes('?') ? '&' : '?'}${PARAM}=${encodeURIComponent(unite)}`);
}

/** Entité demandée par le lien qui a ouvert l'appli (null sans lien). */
export function uniteDuLien(hash = typeof location === 'undefined' ? '' : location.hash): string | null {
  const i = hash.indexOf('?');
  return i < 0 ? null : new URLSearchParams(hash.slice(i + 1)).get(PARAM);
}

export const lienWhatsApp = (texte: string) => `https://wa.me/?text=${encodeURIComponent(texte)}`;

/**
 * Objet ou texte d'un lien « mailto ». Des messageries (sur téléphone surtout) décodent le lien avant de le découper
 * aux « & » : le mail s'arrêtait au premier « & » du texte. Hors des adresses web (laissées telles quelles), « & » devient
 * « ＆ » (même aspect). Les liens de l'appli (lienAppli) et du lieu des séances (lieux.ts) sont écrits sans « & ».
 */
export const pourMailto = (texte: string) => texte.replace(/(https?:\/\/\S+)|&/g, (_, url?: string) => url ?? '＆');

/** Lien « mailto » : adresses, objet et texte (voir pourMailto). */
export const lienMailto = (a: string, objet: string, texte: string) =>
  `mailto:${a}?subject=${encodeURIComponent(pourMailto(objet))}&body=${encodeURIComponent(pourMailto(texte))}`;

export const lienEmail = (objet: string, texte: string) => lienMailto('', objet, texte);

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
