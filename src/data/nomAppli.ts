// Nom de l'appli : celui publié avec le site (Console admin du comité central › Apparence),
// repris de la page (meta « application-name », écrite à la publication : scripts/icones-club.mjs), sinon « Tâches GSA ».

export const NOM_ORIGINE = 'Tâches GSA';
/** Longueur maximale (sous l'icône, au-delà d'une douzaine de caractères le nom est coupé). */
export const NOM_MAX = 30;

export const nomAppli = () => document.querySelector<HTMLMetaElement>('meta[name="application-name"]')?.content.trim() || NOM_ORIGINE;

/** Nom propre (espaces réduits) ; vide si refusé (trop long, caractères de contrôle). */
export function nomPropre(s?: string): string {
  const n = (s ?? '').replace(/\s+/g, ' ').trim();
  return n.length <= NOM_MAX && !/[\u0000-\u001f\u007f<>]/.test(n) ? n : '';
}
