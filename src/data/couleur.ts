import { getMode } from './mode';

// Couleur de l'appli (boutons, onglet actif, liens…) : choix du club (console admin › Apparence), sinon le bleu
// d'origine. Les teintes du mode sombre et les fonds clairs en sont tirés, lisibles dans les deux thèmes.

export const COULEUR_DEFAUT = '#1d4ed8';
export const COULEURS_APPLI: { c: string; nom: string }[] = [
  { c: '#1d4ed8', nom: 'Bleu' },
  { c: '#24866d', nom: 'Vert GSA' },
  { c: '#0e7490', nom: 'Turquoise' },
  { c: '#7c3aed', nom: 'Violet' },
  { c: '#be185d', nom: 'Framboise' },
  { c: '#b91c1c', nom: 'Rouge' },
  { c: '#c2410c', nom: 'Orange' },
  { c: '#334155', nom: 'Ardoise' },
];

export const isCouleur = (s?: string | null): s is string => !!s && /^#[0-9a-f]{6}$/i.test(s);

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Teinte (0–360), saturation et luminosité (0–100) d'une couleur #rrggbb (noir si elle n'en est pas une). */
export function versTsl(couleur: string): [number, number, number] {
  const [r, g, b] = (isCouleur(couleur) ? rgb(couleur) : NOIR).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60) % 360, Math.round(s * 100), Math.round(l * 100)];
}

/** Couleur #rrggbb d'une teinte (0–360), d'une saturation et d'une luminosité (0–100). */
export function deTsl(h: number, s: number, l: number): string {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return hex([f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as Rgb);
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;
const lum = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: Rgb, b: Rgb) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** Rapproche la couleur de `vers` (noir ou blanc) jusqu'à un contraste suffisant avec `fond`. */
function lisible(c: Rgb, fond: Rgb, vers: Rgb, min: number): Rgb {
  for (let i = 0; i <= 50; i++) {
    const m = mix(c, vers, i / 50);
    if (contraste(m, fond) >= min) return m;
  }
  return vers;
}

const BLANC: Rgb = [255, 255, 255];
const NOIR: Rgb = [0, 0, 0];
const SURFACE_SOMBRE: Rgb = rgb('#131c2e');

/**
 * Teintes dérivées. Thème clair : texte blanc lisible dessus (boutons) et lisible sur fond blanc (liens).
 * Thème sombre : lisible sur le fond sombre, en gardant un texte blanc lisible sur les boutons.
 */
export function teintes(couleur: string) {
  const c = rgb(couleur);
  const clair = lisible(c, BLANC, NOIR, 4.5);
  const sombre = lisible(lisible(c, BLANC, NOIR, 3), SURFACE_SOMBRE, BLANC, 4.5);
  return { clair: hex(clair), clairDoux: hex(mix(clair, BLANC, 0.86)), sombre: hex(sombre), sombreDoux: hex(mix(sombre, SURFACE_SOMBRE, 0.72)) };
}

/** Applique la couleur (sans couleur ou bleu d'origine : les valeurs de la feuille de style). */
export function applyAppColor(couleur?: string) {
  const root = document.documentElement.style;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const props = ['--app', '--app-soft', '--app-dark', '--app-dark-soft'];
  if (!isCouleur(couleur) || couleur.toLowerCase() === COULEUR_DEFAUT) {
    props.forEach((p) => root.removeProperty(p));
    meta?.setAttribute('content', COULEUR_DEFAUT);
    return;
  }
  const t = teintes(couleur);
  [t.clair, t.clairDoux, t.sombre, t.sombreDoux].forEach((v, i) => root.setProperty(props[i], v));
  meta?.setAttribute('content', t.clair);
}

// Dernière couleur affichée, reprise dès le lancement (écran de connexion) avant le chargement des données.
const cacheKey = () => `taches-gsa-couleur-${getMode() ?? 'accueil'}`;

export function cachedColor(): string | undefined {
  try {
    const v = localStorage.getItem(cacheKey());
    return isCouleur(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function cacheColor(couleur?: string) {
  try {
    if (isCouleur(couleur)) localStorage.setItem(cacheKey(), couleur);
    else localStorage.removeItem(cacheKey());
  } catch {
    /* ignore */
  }
}
