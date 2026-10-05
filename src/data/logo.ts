import { getMode } from './mode';

// Logo du club et des entités, et images des en-têtes de documents.
// Les images sont réduites dans le navigateur et gardées en data URL (fiche de l'entité, réglages des en-têtes) :
// pas de fichier à héberger, elles s'impriment telles quelles.
// Le logo affiché devient aussi l'icône de l'appli : onglet du navigateur, écran d'accueil (iPhone), appli installée.

/** Logo : 256 px au plus (côté le plus long). */
export const LOGO_SIZE = 256;
/** Image d'en-tête (papier à lettres) : 1400 px de large au plus. */
export const BANNER_WIDTH = 1400;
/** Taille maximale de la data URL (le serveur refuse un logo plus lourd : migration 007). */
const LOGO_MAX = 200_000;
const BANNER_MAX = 350_000;

export const isImage = (s?: string | null): s is string => !!s && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible : choisis un fichier PNG, JPEG, WebP, GIF ou SVG.'));
    img.src = src;
  });
}

/** Encode le dessin : PNG (garde la transparence), sinon WebP, sinon JPEG sur fond blanc, sous la limite. */
function encode(canvas: HTMLCanvasElement, draw: (ctx: CanvasRenderingContext2D) => void, max: number): string {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  draw(ctx);
  const png = canvas.toDataURL('image/png');
  if (png.length <= max) return png;
  for (const q of [0.92, 0.85, 0.75]) {
    const webp = canvas.toDataURL('image/webp', q);
    if (webp.startsWith('data:image/webp') && webp.length <= max) return webp;
  }
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  for (const q of [0.9, 0.82, 0.7, 0.6]) {
    const jpeg = canvas.toDataURL('image/jpeg', q);
    if (jpeg.length <= max) return jpeg;
  }
  throw new Error('Image trop détaillée : essaie une version plus simple ou plus petite.');
}

/** Réduit une image choisie par l'utilisateur : logo (carré de 256 px au plus) ou image d'en-tête (1400 px de large au plus). */
export async function prepareImage(file: File, kind: 'logo' | 'banniere'): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error('Choisis une image (PNG, JPEG, WebP, GIF ou SVG).');
  if (file.size > 15e6) throw new Error('Image trop lourde (15 Mo au plus).');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const svg = file.type === 'image/svg+xml';
    const w0 = img.naturalWidth || 512;
    const h0 = img.naturalHeight || 512;
    // Un SVG se redessine à la taille voulue ; une image n'est jamais agrandie.
    const k = kind === 'logo' ? LOGO_SIZE / Math.max(w0, h0) : BANNER_WIDTH / w0;
    const scale = svg ? k : Math.min(1, k);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    return encode(canvas, (ctx) => ctx.drawImage(img, 0, 0, canvas.width, canvas.height), kind === 'logo' ? LOGO_MAX : BANNER_MAX);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Icône carrée (PNG) : le logo centré, sur fond blanc (iPhone et Android n'aiment pas la transparence) ou transparent. */
async function squareIcon(logo: string, size: number, pad: number, bg: string | null): Promise<string> {
  const img = await loadImage(logo);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const box = size * (1 - 2 * pad);
  const k = box / Math.max(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/png');
}

// ---------- Icône de l'appli ----------

interface Original {
  el: HTMLLinkElement;
  href: string;
  type: string | null;
}
let originals: Original[] | null = null;
let applied = '';
let manifestBase: Record<string, unknown> | null = null;
let manifestUrl = '';

const links = () => [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')];

function restore() {
  originals?.forEach((o) => {
    o.el.href = o.href;
    if (o.type) o.el.type = o.type;
    else o.el.removeAttribute('type');
  });
}

/**
 * Le logo devient l'icône de l'appli (sans logo : l'icône d'origine).
 * - onglet du navigateur (favicon) ;
 * - iPhone / iPad : icône proposée par « Sur l'écran d'accueil » ;
 * - Chrome / Edge : manifeste de l'appli recréé avec le logo (installation).
 * Une appli déjà installée garde son icône : la réinstaller pour prendre le nouveau logo.
 */
export async function applyAppIcon(logo?: string) {
  const key = isImage(logo) ? logo : '';
  if (key === applied) return;
  applied = key;
  originals ??= links().map((el) => ({ el, href: el.getAttribute('href') ?? '', type: el.getAttribute('type') }));
  if (!key) return restore();
  try {
    const [fav, apple, i192, i512, mask] = await Promise.all([
      squareIcon(key, 64, 0, null),
      squareIcon(key, 180, 0.08, '#ffffff'),
      squareIcon(key, 192, 0.06, '#ffffff'),
      squareIcon(key, 512, 0.06, '#ffffff'),
      squareIcon(key, 512, 0.18, '#ffffff'),
    ]);
    if (applied !== key) return;
    for (const o of originals) {
      const rel = o.el.rel;
      if (rel === 'manifest') continue;
      o.el.href = rel === 'apple-touch-icon' ? apple : fav;
      if (rel !== 'apple-touch-icon') o.el.type = 'image/png';
    }
    const manifest = originals.find((o) => o.el.rel === 'manifest');
    if (manifest) {
      const base = new URL('./', window.location.href).href;
      if (!manifestBase) {
        try {
          manifestBase = (await (await fetch(new URL(manifest.href, base).href)).json()) as Record<string, unknown>;
        } catch {
          manifestBase = {};
        }
      }
      if (applied !== key) return;
      const icon = (src: string, sizes: string, purpose = 'any') => ({ src, sizes, type: 'image/png', purpose });
      const shortcuts = (manifestBase.shortcuts as { url: string }[] | undefined)?.map((s) => ({ ...s, url: new URL(s.url, base).href, icons: [icon(i192, '192x192')] }));
      // Adresses absolues : le manifeste recréé n'a pas d'adresse propre sur le site.
      const json = { ...manifestBase, id: base, start_url: base, scope: base, icons: [icon(i192, '192x192'), icon(i512, '512x512'), icon(mask, '512x512', 'maskable')], ...(shortcuts ? { shortcuts } : {}) };
      if (manifestUrl) URL.revokeObjectURL(manifestUrl);
      manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: 'application/manifest+json' }));
      manifest.el.href = manifestUrl;
    }
  } catch {
    restore();
  }
}

// Dernier logo affiché, repris dès le lancement (écran de connexion, icône) avant le chargement des données.
const cacheKey = () => `taches-gsa-logo-${getMode() ?? 'accueil'}`;

export function cachedLogo(): string | undefined {
  try {
    const v = localStorage.getItem(cacheKey());
    return isImage(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function cacheLogo(logo?: string) {
  try {
    if (isImage(logo)) localStorage.setItem(cacheKey(), logo);
    else localStorage.removeItem(cacheKey());
  } catch {
    /* ignore */
  }
}
