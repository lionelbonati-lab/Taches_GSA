import type { SceauPose } from './types';

// Sceau « OK pour paiement » : dessiné dans un canvas (image PNG), affiché sur le ticket et
// incrusté dans une copie de la photo du justificatif (« ticket visé »).

export interface SceauContenu {
  entete: string;
  texte: string;
  couleur: string;
  montant?: string;
  date: string;
  nom: string;
  /** Signature (PNG) ; sans elle, un emplacement vide. */
  signature?: string;
  /** Opacité du fond blanc, en % (0 : transparent ; 85 par défaut). */
  fond?: number;
  /** Opacité du cadre, du texte et de la signature, en % (100 par défaut). */
  encre?: number;
  /** N° de visa (043), imprimé en bas du sceau ; absent des visas plus anciens. */
  code?: string;
}

// N° de visa : 8 caractères sans 0/O ni 1/I (lisibles sur un document imprimé), tirés au hasard, ex. « K7PM-2XQD ».
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_VISA = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function nouveauCodeVisa(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  const c = Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** N° saisi (minuscules, espaces, sans tiret) remis en forme ; undefined s'il ne peut pas être un n° de visa. */
export function lireCodeVisa(s: string): string | undefined {
  const k = s.toUpperCase().replace(/[\s-]/g, '');
  const c = `${k.slice(0, 4)}-${k.slice(4)}`;
  return CODE_VISA.test(c) ? c : undefined;
}

const pct = (v: number | undefined, def: number) => Math.min(100, Math.max(0, v ?? def)) / 100;

const W = 480;
const H = 300;
/** Rapport hauteur / largeur du sceau. */
export const SCEAU_RATIO = H / W;

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error('Image illisible'));
    i.src = src;
  });

function fit(ctx: CanvasRenderingContext2D, text: string, size: number, weight: string, max: number) {
  let s = size;
  do ctx.font = `${weight} ${s}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  while (ctx.measureText(text).width > max && --s > 10);
}

/** Image PNG du sceau (fond blanc plus ou moins transparent, double cadre, texte de la couleur du timbre). */
export async function renderSceau(c: SceauContenu, scale = 2): Promise<string> {
  const cv = document.createElement('canvas');
  cv.width = W * scale;
  cv.height = H * scale;
  const ctx = cv.getContext('2d')!;
  ctx.scale(scale, scale);
  const box = (inset: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(inset, inset, W - 2 * inset, H - 2 * inset, r);
  };
  box(4, 20);
  ctx.fillStyle = `rgba(255,255,255,${pct(c.fond, 85)})`;
  ctx.fill();
  const encre = pct(c.encre, 100);
  ctx.globalAlpha = encre;
  ctx.strokeStyle = c.couleur;
  ctx.lineWidth = 5;
  ctx.stroke();
  box(13, 12);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = c.couleur;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let y = 30;
  if (c.entete.trim()) {
    fit(ctx, c.entete.trim(), 17, '600', 420);
    ctx.fillText(c.entete.trim(), W / 2, (y += 18));
  }
  const texte = (c.texte.trim() || 'OK pour paiement').toUpperCase();
  fit(ctx, texte, 31, '800', 430);
  ctx.fillText(texte, W / 2, (y += c.entete.trim() ? 36 : 40));
  const ligne = [c.montant, c.date].filter(Boolean).join('  ·  ');
  fit(ctx, ligne, 21, '600', 420);
  ctx.fillText(ligne, W / 2, (y += 30));

  // Signature dans son cadre, au-dessus de la ligne « Visa : … » (et du n° de visa).
  const top = y + 10;
  const bottom = H - (c.code ? 66 : 50);
  if (c.signature) {
    const img = await loadImg(c.signature);
    const k = Math.min(300 / img.width, (bottom - top) / img.height, 1.5);
    ctx.drawImage(img, W / 2 - (img.width * k) / 2, bottom - img.height * k, img.width * k, img.height * k);
  } else {
    ctx.save();
    ctx.globalAlpha = 0.45 * encre;
    ctx.font = 'italic 18px system-ui, sans-serif';
    ctx.fillText('signature', W / 2, (top + bottom) / 2 + 6);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(110, bottom + 4);
  ctx.lineTo(W - 110, bottom + 4);
  ctx.lineWidth = 1;
  ctx.stroke();
  fit(ctx, `Visa : ${c.nom}`, 17, '500', 420);
  ctx.fillText(`Visa : ${c.nom}`, W / 2, H - (c.code ? 40 : 24));
  if (c.code) {
    ctx.font = `700 16px ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace`;
    ctx.fillText(`N° de visa ${c.code}`, W / 2, H - 21);
  }
  return cv.toDataURL('image/png');
}

/**
 * Signature marquée en filigrane (n° de visa et date, en biais, de la couleur du sceau) : c'est elle qui est
 * enregistrée et posée sur le document. Copiée, elle reste liée à ce visa et ne se réutilise pas telle quelle.
 */
export async function marquerSignature(png: string, texte: string, couleur: string): Promise<string> {
  const img = await loadImg(png);
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const taille = Math.max(10, Math.round(Math.min(img.height / 7, img.width / 16)));
  ctx.font = `700 ${taille}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.fillStyle = couleur;
  ctx.globalAlpha = 0.3;
  ctx.textBaseline = 'middle';
  const pas = ctx.measureText(texte).width + taille * 2;
  const r = Math.hypot(cv.width, cv.height) / 2;
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate(-0.22);
  for (let y = -r, i = 0; y <= r; y += taille * 1.9, i++)
    for (let x = -r - (i % 2 ? pas / 2 : 0); x <= r; x += pas) ctx.fillText(texte, x, y);
  return cv.toDataURL('image/png');
}

/** Copie du justificatif avec le sceau incrusté (JPEG, 1600 px au plus). */
export async function apposerSceau(doc: Blob, sceauPng: string, pose: Pick<SceauPose, 'x' | 'y' | 'largeur'>): Promise<Blob> {
  const url = URL.createObjectURL(doc);
  try {
    const [img, sceau] = await Promise.all([loadImg(url), loadImg(sceauPng)]);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k);
    cv.height = Math.round(img.height * k);
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const w = pose.largeur * cv.width;
    ctx.drawImage(sceau, pose.x * cv.width, pose.y * cv.height, w, w * SCEAU_RATIO);
    return await new Promise<Blob>((ok, ko) => cv.toBlob((b) => (b ? ok(b) : ko(new Error('Image impossible à créer'))), 'image/jpeg', 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}
