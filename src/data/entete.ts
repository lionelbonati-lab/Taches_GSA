import type { AppData, Entete, Unit } from './types';
import { isImage } from './logo';

// En-têtes des documents imprimés (ordre du jour, PV, bon de paiement) : réglage commun à l'entité (données partagées « entetes »).

export type DocKind = 'odj' | 'pv' | 'bon';
export const DOC_LABEL: Record<DocKind, string> = { odj: 'l’ordre du jour', pv: 'le PV', bon: 'le bon de paiement' };
export const DOC_DE: Record<DocKind, string> = { odj: 'de l’ordre du jour', pv: 'du PV', bon: 'du bon de paiement' };

/** Texte par défaut : nom du club, et de l'entité hors comité central. */
export const defaultTexte = (unit?: Pick<Unit, 'nom' | 'type'>) => (!unit || unit.type === 'central' ? 'G.S. Ajoie – Comité' : `G.S. Ajoie – ${unit.nom}`);

export const defaultEntete = (texte: string): Entete => ({ image: 'logo', taille: 'petite', texte, disposition: 'gauche', couleur: '#1d4ed8', trait: false });

/** En-tête réglé pour ce document ; PV ou bon de paiement sans réglage : celui de l'ordre du jour ; sinon l'en-tête par défaut. */
export function enteteOf(data: AppData, doc: DocKind, texte: string): { e: Entete; source: DocKind | null } {
  const own = data.entetes?.[doc];
  const odj = doc !== 'odj' && !own ? data.entetes?.odj : undefined;
  const set = own ?? odj;
  return { e: { ...defaultEntete(texte), ...set }, source: own ? doc : odj ? 'odj' : null };
}

/** Image de l'en-tête et sa référence dans les archives (« logo », « perso-odj », « perso-pv »). */
export function enteteImage(e: Entete, source: DocKind | null, logo?: string): { key: string; src: string } | null {
  if (e.image === 'logo') return { key: 'logo', src: isImage(logo) ? logo : './icon.svg' };
  if (e.image === 'perso' && isImage(e.imagePerso)) return { key: `perso-${source ?? 'odj'}`, src: e.imagePerso };
  return null;
}

/**
 * Archive d'un document : les images de l'en-tête n'y sont pas copiées (elles alourdiraient chaque archive,
 * renvoyée au serveur à chaque modification de la séance). Elles sont remises à l'affichage (`hydrateArchive`).
 */
export const archiveHtml = (html: string) => html.replace(/(<img[^>]*\sdata-img="[^"]*")\s+src="data:[^"]*"/g, '$1');

/** Remet les images actuelles de l'en-tête dans une archive. */
export function hydrateArchive(html: string, data: AppData, logo?: string) {
  const imgs: Record<string, string | undefined> = {
    logo: isImage(logo) ? logo : './icon.svg',
    'perso-odj': data.entetes?.odj?.imagePerso,
    'perso-pv': data.entetes?.pv?.imagePerso,
  };
  return html.replace(/(<img[^>]*\sdata-img="([^"]+)")(?![^>]*\ssrc=)/g, (all, start: string, key: string) =>
    isImage(imgs[key]) || imgs[key] === './icon.svg' ? `${start} src="${imgs[key]}"` : all,
  );
}
