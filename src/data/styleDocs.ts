import type { CSSProperties } from 'react';
import type { ElementDoc, StyleDocs, StyleElement } from './types';

// Mise en forme de l'ordre du jour et du PV, commune à l'entité : posée en variables CSS sur la feuille (.pv-sheet),
// dont les règles (styles.css) gardent la mise en forme par défaut pour ce qui n'est pas réglé. Les variables restent
// dans le HTML des archives : un document archivé garde la mise en forme du moment.

export const POLICES: { id: NonNullable<StyleDocs['police']> | ''; label: string; css?: string }[] = [
  { id: '', label: 'Par défaut' },
  { id: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { id: 'calibri', label: 'Calibri', css: 'Calibri, Carlito, Arial, sans-serif' },
  { id: 'verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { id: 'georgia', label: 'Georgia', css: 'Georgia, serif' },
  { id: 'times', label: 'Times New Roman', css: "'Times New Roman', Times, serif" },
];

export const INTERLIGNES: { id: NonNullable<StyleDocs['interligne']> | ''; label: string; valeur: string }[] = [
  { id: 'serre', label: 'Serré', valeur: '1.15' },
  { id: '', label: 'Normal', valeur: '1.35' },
  { id: 'aere', label: 'Aéré', valeur: '1.6' },
];

export const MARGES: { id: NonNullable<StyleDocs['marges']> | ''; label: string; mm: number }[] = [
  { id: 'etroites', label: 'Étroites', mm: 8 },
  { id: '', label: 'Normales', mm: 12 },
  { id: 'larges', label: 'Larges', mm: 20 },
];

/** Tailles proposées, en % de la taille par défaut de l'élément. */
export const TAILLES = [70, 80, 90, 100, 115, 130, 150, 175, 200];

/** Éléments réglables et leur mise en forme par défaut (la même que dans styles.css). */
export const ELEMENTS: { id: ElementDoc; label: string; gras: boolean; italique: boolean; majuscules: boolean; couleur: string; centrable?: boolean; fond?: string }[] = [
  { id: 'titre', label: 'Titre (nom du comité)', gras: true, italique: false, majuscules: false, couleur: '#111111', centrable: true },
  { id: 'date', label: 'Date de la séance', gras: false, italique: false, majuscules: false, couleur: '#333333', centrable: true },
  { id: 'infos', label: 'Heure, lieu, convoqués, présents', gras: false, italique: false, majuscules: false, couleur: '#111111' },
  { id: 'partie', label: 'Titres des parties (Ordre du jour, Points traités…)', gras: true, italique: false, majuscules: false, couleur: '#111111', centrable: true },
  { id: 'section', label: 'Sections (1., 2.…)', gras: true, italique: false, majuscules: false, couleur: '#111111' },
  { id: 'niveau2', label: 'Sous-sections et points (a., b.…)', gras: false, italique: false, majuscules: false, couleur: '#111111' },
  { id: 'niveau3', label: 'Points (■)', gras: false, italique: false, majuscules: false, couleur: '#111111' },
  { id: 'niveau4', label: 'Détails (◦ checklist, documents)', gras: false, italique: false, majuscules: false, couleur: '#475569' },
  { id: 'meta', label: 'Responsables, délais, échéances', gras: false, italique: false, majuscules: false, couleur: '#64748b' },
  { id: 'remarque', label: 'Remarques des tâches', gras: false, italique: true, majuscules: false, couleur: '#334155' },
  { id: 'note', label: 'Notes et décisions (PV)', gras: false, italique: false, majuscules: false, couleur: '#111111' },
  { id: 'prochaine', label: 'Prochaine séance', gras: false, italique: false, majuscules: false, couleur: '#111111', fond: '#eff6ff' },
  { id: 'pied', label: 'Pied de page', gras: false, italique: false, majuscules: false, couleur: '#64748b' },
];

const COULEUR = /^#[0-9a-f]{6}$/i;

/** Réglages d'un élément sans ce qui revient à la mise en forme par défaut ; rien s'il n'en reste pas. */
function epure(id: ElementDoc, e: StyleElement): StyleElement | undefined {
  const def = ELEMENTS.find((x) => x.id === id);
  if (!def) return undefined;
  const x: StyleElement = {};
  if (e.taille && e.taille !== 100 && TAILLES.includes(e.taille)) x.taille = e.taille;
  if (e.gras !== undefined && e.gras !== def.gras) x.gras = e.gras;
  if (e.italique !== undefined && e.italique !== def.italique) x.italique = e.italique;
  if (e.majuscules !== undefined && e.majuscules !== def.majuscules) x.majuscules = e.majuscules;
  if (e.centre && def.centrable) x.centre = true;
  if (e.couleur && COULEUR.test(e.couleur) && e.couleur.toLowerCase() !== def.couleur) x.couleur = e.couleur.toLowerCase();
  if (e.fond && def.fond && COULEUR.test(e.fond) && e.fond.toLowerCase() !== def.fond) x.fond = e.fond.toLowerCase();
  return Object.keys(x).length ? x : undefined;
}

/** Mise en forme sans les valeurs par défaut ; rien si tout est par défaut. */
export function epurer(st: StyleDocs): StyleDocs | undefined {
  const x: StyleDocs = {};
  if (st.police && POLICES.some((p) => p.id === st.police)) x.police = st.police;
  if (st.interligne && INTERLIGNES.some((p) => p.id === st.interligne)) x.interligne = st.interligne;
  if (st.marges && MARGES.some((p) => p.id === st.marges)) x.marges = st.marges;
  const elements = Object.fromEntries(
    Object.entries(st.elements ?? {}).flatMap(([id, e]) => {
      const y = e && epure(id as ElementDoc, e);
      return y ? [[id, y]] : [];
    }),
  );
  if (Object.keys(elements).length) x.elements = elements;
  return Object.keys(x).length ? x : undefined;
}

/** Mise en forme d'un élément, réglée ou par défaut. */
export function styleDe(st: StyleDocs | undefined, id: ElementDoc) {
  const def = ELEMENTS.find((x) => x.id === id)!;
  const e = st?.elements?.[id] ?? {};
  return {
    taille: e.taille ?? 100,
    gras: e.gras ?? def.gras,
    italique: e.italique ?? def.italique,
    majuscules: e.majuscules ?? def.majuscules,
    centre: !!e.centre,
    couleur: e.couleur ?? def.couleur,
    fond: e.fond ?? def.fond,
  };
}

/** Marges de la page imprimée (mm). */
export const margesMm = (st?: StyleDocs) => MARGES.find((m) => m.id === (st?.marges ?? ''))?.mm ?? 12;

/** Marges d'un document archivé (gardées dans son HTML), pour l'imprimer comme il était. */
export const margesArchive = (html: string) => Number(/--doc-marge:\s*(\d+)mm/.exec(html)?.[1] ?? 12);

/** Police d'un document archivé (gardée dans son HTML). */
export function policeArchive(html: string): StyleDocs['police'] {
  const css = /--doc-police:\s*([^;"]+)/.exec(html)?.[1]?.replace(/&quot;/g, '"').trim();
  return (POLICES.find((p) => p.css && p.css === css)?.id || undefined) as StyleDocs['police'];
}

/** Variables CSS à poser sur la feuille du document. */
/** Trait d'un encadré, accordé à son fond : même teinte, foncée (gris pour un fond blanc ou gris). */
export function traitDuFond(fond: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fond.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.08) return '#64748b';
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  // Jaune foncé = olive : tiré vers l'ambre.
  if (h > 45 && h < 70) h = 42;
  return `hsl(${Math.round(h)}, ${Math.round(Math.min(s, 0.8) * 100)}%, 40%)`;
}

export function styleVars(st?: StyleDocs): CSSProperties {
  const v: Record<string, string> = {};
  const x = st && epurer(st);
  if (!x) return v;
  const police = POLICES.find((p) => p.id === x.police)?.css;
  if (police) v['--doc-police'] = police;
  if (x.interligne) v['--doc-interligne'] = INTERLIGNES.find((p) => p.id === x.interligne)!.valeur;
  if (x.marges) v['--doc-marge'] = `${margesMm(x)}mm`;
  for (const [id, e] of Object.entries(x.elements ?? {})) {
    if (!e) continue;
    if (e.taille) v[`--e-${id}-t`] = String(e.taille / 100);
    if (e.gras !== undefined) v[`--e-${id}-g`] = e.gras ? '700' : '400';
    if (e.italique !== undefined) v[`--e-${id}-i`] = e.italique ? 'italic' : 'normal';
    if (e.majuscules !== undefined) v[`--e-${id}-m`] = e.majuscules ? 'uppercase' : 'none';
    if (e.centre) v[`--e-${id}-a`] = 'center';
    if (e.couleur) v[`--e-${id}-c`] = e.couleur;
    if (e.fond) {
      v[`--e-${id}-f`] = e.fond;
      v[`--e-${id}-b`] = traitDuFond(e.fond);
    }
  }
  return v as CSSProperties;
}
