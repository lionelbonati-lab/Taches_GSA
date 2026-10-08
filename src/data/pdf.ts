import { getFile } from './files';
import { SCEAU_RATIO } from './sceau';
import type { SceauPose } from './types';

// Justificatifs en PDF (la plupart des factures) : image des pages pour les afficher (pdf.js) et sceau posé sur une
// page du PDF lui-même (pdf-lib : le PDF garde sa qualité et ses autres pages). Bibliothèques chargées au premier PDF.

export const estPdf = (d: { mime?: string; nom?: string }) => d.mime === 'application/pdf' || /\.pdf$/i.test(d.nom ?? '');

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjs: Promise<PdfJs> | null = null;
function chargerPdfjs() {
  // Version « legacy » : aussi pour les navigateurs un peu anciens (téléphones).
  pdfjs ??= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(([m, w]) => {
    m.GlobalWorkerOptions.workerSrc = w.default;
    return m;
  });
  return pdfjs;
}

export interface PagePdf {
  /** Image de la page (adresse locale, valable pendant la session). */
  url: string;
  /** Nombre de pages du PDF. */
  pages: number;
  /** Hauteur / largeur de la page. */
  ratio: number;
}

/** Image (JPEG, `largeur` px) d'une page d'un PDF et nombre de pages. */
export async function rendrePagePdf(doc: Blob, page = 1, largeur = 1400): Promise<PagePdf> {
  const m = await chargerPdfjs();
  const pdf = await m.getDocument({ data: new Uint8Array(await doc.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const p = await pdf.getPage(Math.min(Math.max(1, page), pdf.numPages));
    const base = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: largeur / base.width });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width);
    cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    await p.render({ canvasContext: ctx, viewport: vp }).promise;
    const image = await new Promise<Blob>((ok, ko) => cv.toBlob((b) => (b ? ok(b) : ko(new Error('Page illisible'))), 'image/jpeg', 0.9));
    return { url: URL.createObjectURL(image), pages: pdf.numPages, ratio: base.height / base.width };
  } finally {
    void pdf.destroy();
  }
}

const apercus = new Map<string, Promise<PagePdf | null>>();
/** Page d'un PDF joint (fichier `id`), gardée pour la session ; null s'il est introuvable ou illisible. */
export function apercuPdf(id: string, page = 1): Promise<PagePdf | null> {
  const k = `${id}#${page}`;
  let r = apercus.get(k);
  if (!r) {
    r = getFile(id)
      .then((b) => (b ? rendrePagePdf(b, page) : null))
      .catch(() => null);
    r.then((x) => !x && apercus.delete(k)); // réessayé plus tard (connexion revenue…)
    apercus.set(k, r);
  }
  return r;
}

/**
 * Copie du PDF avec le sceau posé sur la page `page` (position et taille relatives à la page affichée, comme pour une
 * photo). Les pages tournées (/Rotate) sont prises en compte : le sceau apparaît droit, là où il a été placé.
 */
export async function apposerSceauPdf(doc: Blob, sceauPng: string, page: number, pose: Pick<SceauPose, 'x' | 'y' | 'largeur'>): Promise<Blob> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.load(await doc.arrayBuffer(), { ignoreEncryption: true });
  const p = pdf.getPage(Math.min(Math.max(1, page), pdf.getPageCount()) - 1);
  const img = await pdf.embedPng(sceauPng);
  const { x: x0, y: y0, width: w, height: h } = p.getCropBox();
  const r = ((p.getRotation().angle % 360) + 360) % 360;
  // Page affichée (après rotation) : largeur W, hauteur H ; (u, v) depuis son coin en haut à gauche.
  const [W, H] = r % 180 ? [h, w] : [w, h];
  const sw = pose.largeur * W;
  const sh = sw * SCEAU_RATIO;
  const u = pose.x * W;
  const v = pose.y * H + sh; // coin en bas à gauche du sceau
  const [X, Y] = r === 90 ? [v, u] : r === 180 ? [w - u, v] : r === 270 ? [w - v, h - u] : [u, h - v];
  p.drawImage(img, { x: x0 + X, y: y0 + Y, width: sw, height: sh, rotate: degrees(r) });
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' });
}
