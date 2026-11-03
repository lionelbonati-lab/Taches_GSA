import { aPrendreOuverte } from './aPrendre';
import { getMode } from './mode';
import type { Person, Poll, Task } from './types';
import { fmtDate, shortName } from './utils';
import { echeance } from './polls';

// Liens à envoyer (WhatsApp, email…) vers une tâche ou un sondage : …/?reel#/taches?tache=…. Ils gardent la version
// (?reel / ?demo) : ouverts sur un appareil où l'appli n'a jamais servi, ils n'arrêtent pas sur l'écran de choix.
// Aucun « & » : des messageries (sur téléphone) coupent le texte d'un mail au premier « & », même dans une adresse.
// Les liens envoyés avant, avec une entité (?reel=<entité>, …&u=<entité>), restent valables : l'entité est oubliée.
// Le lien ne donne aucun accès : il faut un compte, et voir la tâche ou le sondage.

/** Adresse complète de l'appli ouverte sur `chemin` (« /taches?tache=… »). */
export function lienAppli(chemin: string, mode = getMode()): string {
  return `${location.origin}${location.pathname}${mode ? `?${mode}` : ''}#${chemin}`;
}

/**
 * Lien reçu d'avant l'espace unique : l'entité de « ?reel=<entité> » (ou « ?u=<entité> », « …&u=<entité> » dans la page)
 * est oubliée ; la version (?reel / ?demo) reste pour modeFromUrl. À appeler au lancement, avant modeFromUrl.
 */
export function oublierEntiteDuLien() {
  const params = new URLSearchParams(location.search);
  const avant = params.toString();
  for (const k of ['reel', 'demo']) if (params.get(k)) params.set(k, '');
  params.delete('u');
  const [chemin, q = ''] = location.hash.replace(/^#/, '').split('?');
  const h = new URLSearchParams(q);
  const hashAvant = h.toString();
  h.delete('u');
  if (params.toString() === avant && h.toString() === hashAvant) return;
  const s = params.toString().replace(/=(?=&|$)/g, '');
  const qh = h.toString();
  history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}#${chemin || '/'}${qh ? `?${qh}` : ''}`);
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
  t: Pick<Task, 'titre' | 'delai' | 'responsables' | 'aPrendre' | 'paiement'>,
  people: Pick<Person, 'id' | 'prenom' | 'nom'>[],
  terminee = false,
): string {
  const noms = t.responsables.map((id) => people.find((p) => p.id === id)).filter((p) => !!p).map((p) => shortName(p));
  const qui = aPrendreOuverte(t) ? '🙋 À prendre : qui s’en charge ?' : noms.length ? `👤 ${noms.join(', ')}` : '';
  return [
    `📋 Point « ${t.titre.trim() || 'Sans titre'} »`,
    [t.delai && `📅 Pour le ${fmtDate(t.delai)}`, qui, terminee && '✅ Terminé'].filter(Boolean).join(' · '),
    'Détails dans l’appli :',
  ].filter(Boolean).join('\n');
}

/** Message qui accompagne le lien d'un sondage. */
export function texteSondage(p: Pick<Poll, 'question' | 'dateLimite' | 'heureLimite'>, ouvert: boolean): string {
  return [
    `📊 Sondage « ${p.question.trim()} »`,
    !ouvert ? 'Clôturé, résultats dans l’appli :' : p.dateLimite ? `Réponds d’ici le ${echeance(p)} dans l’appli :` : 'Réponds dans l’appli :',
  ].join('\n');
}
