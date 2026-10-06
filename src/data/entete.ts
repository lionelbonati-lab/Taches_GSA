import type { AppData, Entete, Unit } from './types';
import { isImage } from './logo';

// En-tête des documents imprimés (ordre du jour, PV, bon de paiement) : un seul pour toute l'entité,
// réglé dans la console admin (données partagées « entete »).

/** Texte par défaut : nom du club, et de l'entité hors comité central. */
export const defaultTexte = (unit?: Pick<Unit, 'nom' | 'type'>) => (!unit || unit.type === 'central' ? 'G.S. Ajoie – Comité' : `G.S. Ajoie – ${unit.nom}`);

export const defaultEntete = (texte: string): Entete => ({ image: 'logo', taille: 'petite', texte, disposition: 'gauche', couleur: '#1d4ed8', trait: false });

/** Ancien réglage par document (avant l'en-tête unique) : celui de l'ordre du jour d'abord. */
const ancien = (data: AppData) => data.entetes?.odj ?? data.entetes?.pv ?? data.entetes?.bon;

/** En-tête de l'entité, le même pour tous ses documents ; sans réglage : logo et nom de l'entité. */
export const enteteDe = (data: AppData, texte: string): Entete => ({ ...defaultEntete(texte), ...(data.entete ?? ancien(data)) });

/** En-tête réglé par un admin (sinon : celui par défaut). */
export const enteteRegle = (data: AppData) => !!(data.entete ?? ancien(data));

/** Image de l'en-tête et sa référence dans les archives (« logo », « perso »). */
export function enteteImage(e: Entete, logo?: string): { key: string; src: string } | null {
  if (e.image === 'logo') return { key: 'logo', src: isImage(logo) ? logo : './icon.svg' };
  if (e.image === 'perso' && isImage(e.imagePerso)) return { key: 'perso', src: e.imagePerso };
  return null;
}

/**
 * Archive d'un document : les images de l'en-tête n'y sont pas copiées (elles alourdiraient chaque archive,
 * renvoyée au serveur à chaque modification de la séance). Elles sont remises à l'affichage (`hydrateArchive`).
 */
export const archiveHtml = (html: string) => html.replace(/(<img[^>]*\sdata-img="[^"]*")\s+src="data:[^"]*"/g, '$1');

/** Remet les images actuelles de l'en-tête dans une archive (« perso-odj », « perso-pv » : archives d'avant l'en-tête unique). */
export function hydrateArchive(html: string, data: AppData, logo?: string) {
  const perso = (data.entete ?? ancien(data))?.imagePerso;
  const imgs: Record<string, string | undefined> = {
    logo: isImage(logo) ? logo : './icon.svg',
    perso,
    'perso-odj': data.entetes?.odj?.imagePerso ?? perso,
    'perso-pv': data.entetes?.pv?.imagePerso ?? perso,
  };
  return html.replace(/(<img[^>]*\sdata-img="([^"]+)")(?![^>]*\ssrc=)/g, (all, start: string, key: string) =>
    isImage(imgs[key]) || imgs[key] === './icon.svg' ? `${start} src="${imgs[key]}"` : all,
  );
}
