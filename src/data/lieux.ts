import type { LienLieu, Meeting, PointGeo } from './types';

// Lieu des séances placé sur une carte : lien « voir sur la carte » (documents, page Séances) et lien d'itinéraire
// (email de l'ordre du jour), qui ouvre l'application de navigation sur téléphone.
// Liens sans « & » : des messageries coupent le texte d'un lien « mailto » au premier « & » (voir pourMailto).

/** Coordonnées arrondies (6 décimales, environ 10 cm). */
export const arrondir = (p: PointGeo): PointGeo => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 });
const coords = (p: PointGeo) => `${arrondir(p).lat},${arrondir(p).lng}`;

/** Voir le lieu sur la carte (Google Maps : l'application sur téléphone, le site ailleurs). */
export const lienCarte = (p: PointGeo) => `https://www.google.com/maps/search/${coords(p)}`;

/** Lieu d'une séance en texte simple : son nom, sinon l'adresse de la carte. */
export const texteLieu = (m: Pick<Meeting, 'lieu' | 'lieuGeo'>) => m.lieu?.trim() || (m.lieuGeo ? lienCarte(m.lieuGeo) : 'à définir');

export const LIENS_LIEU: { v: LienLieu; label: string }[] = [
  { v: 'google', label: 'Itinéraire avec Google Maps' },
  { v: 'waze', label: 'Itinéraire avec Waze' },
  { v: 'apple', label: 'Itinéraire avec Plans (Apple)' },
  { v: 'carte', label: 'Voir sur la carte, sans itinéraire' },
  { v: 'aucun', label: 'Pas de lien' },
];

/** Lien du lieu pour l'email : itinéraire jusqu'au lieu (application de navigation sur téléphone) ou carte. */
export function lienLieu(p: PointGeo, choix: LienLieu): string | undefined {
  const c = coords(p);
  // Point de départ vide : la position actuelle.
  if (choix === 'google') return `https://www.google.com/maps/dir//${c}`;
  // Waze montre le lieu, avec « Y aller ».
  if (choix === 'waze') return `https://waze.com/ul?ll=${c}`;
  if (choix === 'apple') return `https://maps.apple.com/?daddr=${c}`;
  if (choix === 'carte') return lienCarte(p);
  return undefined;
}

/** Texte du mail : le lien du lieu sous la ligne « Lieu : … » (à la fin s'il n'y en a pas). */
export function avecLienLieu(texte: string, url: string, choix: LienLieu): string {
  const ligne = `${choix === 'carte' ? 'Carte' : 'Itinéraire'} : ${url}`;
  const lignes = texte.split('\n');
  const i = lignes.findIndex((l) => /^\s*Lieu\s*:/.test(l));
  if (i < 0) return `${texte}\n\n${ligne}`;
  lignes.splice(i + 1, 0, ligne);
  return lignes.join('\n');
}

/** Lieux déjà utilisés par les séances (nom, et point le plus récent placé sur la carte), proposés dans la fiche. */
export function lieuxConnus(meetings: Meeting[]): { nom: string; geo?: PointGeo }[] {
  const par = new Map<string, { nom: string; geo?: PointGeo; date: string }>();
  for (const m of meetings) {
    const nom = m.lieu?.trim();
    if (!nom || /^à définir$/i.test(nom)) continue;
    const k = nom.toLocaleLowerCase('fr');
    const x = par.get(k);
    if (!x || (m.lieuGeo && (!x.geo || m.date > x.date))) par.set(k, { nom: x?.nom ?? nom, geo: m.lieuGeo ?? x?.geo, date: m.lieuGeo ? m.date : x?.date ?? '' });
  }
  return [...par.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(({ nom, geo }) => ({ nom, geo }));
}

/** Dernier lieu placé sur la carte : centre de la carte pour une nouvelle épingle. */
export const dernierPoint = (meetings: Meeting[]) => [...meetings].filter((m) => m.lieuGeo).sort((a, b) => b.date.localeCompare(a.date))[0]?.lieuGeo;
