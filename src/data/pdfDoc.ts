import type { PDFDocument, PDFEmbeddedPage, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import type { Font as FontkitFont } from '@pdf-lib/fontkit';
import { getFile } from './files';
import type { StyleDocs } from './types';

// PDF de l'ordre du jour et du PV créé dans l'appli, sans passer par l'impression du navigateur : liens cliquables, texte
// sélectionnable, nom de fichier du document. La feuille affichée est recopiée hors de l'écran à la largeur de la page,
// mise en page par le navigateur avec les polices du PDF (mêmes mesures), puis chaque élément (texte, puces, traits,
// fonds, images, liens) est reporté à sa place, page par page. Coupures comme à l'impression : jamais au milieu d'une
// ligne ou d'une image, pas dans un encadré ni une section qui tiennent sur une page, pas juste après un titre.
// Les PDF joints en annexe sont repris tels quels (pages vectorielles), les photos en pleine qualité.

/** Fichiers de polices (src/polices, voir LICENCES.md), chargés à la première création d'un PDF. */
const FICHIERS = import.meta.glob('../polices/*.ttf', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>;

type Famille = 'doc-sans' | 'doc-serif' | 'carlito' | 'gelasio' | 'dejavu-sans';
/** Police du document (réglage de mise en forme) → police du PDF aux mêmes mesures. */
const FAMILLE: Record<string, Famille> = { '': 'doc-sans', arial: 'doc-sans', calibri: 'carlito', verdana: 'dejavu-sans', georgia: 'gelasio', times: 'doc-serif' };
/** Symboles absents de la police du document (■, ◦, →, ✓, ⚠…). */
const REPLI: Famille = 'dejavu-sans';
const STYLES = ['r', 'b', 'i', 'bi'] as const;
type Style = (typeof STYLES)[number];
const styleDe = (gras: boolean, italique: boolean): Style => (gras ? (italique ? 'bi' : 'b') : italique ? 'i' : 'r');

const MM = 96 / 25.4; // px par mm
const PT = 0.75; // pt par px

export interface OptionsPdf {
  /** Titre du document (et nom du fichier). */
  titre: string;
  paysage?: boolean;
  margesMm: number;
  police?: StyleDocs['police'];
  auteur?: string;
  createur?: string;
}

const octets = new Map<string, Promise<ArrayBuffer>>();
function fichierPolice(nom: string) {
  let p = octets.get(nom);
  if (!p) {
    const url = FICHIERS[`../polices/${nom}.ttf`];
    if (!url) return Promise.reject(new Error(`Police ${nom} absente`));
    p = url()
      .then((u) => fetch(u))
      .then((r) => {
        if (!r.ok) throw new Error(`Police ${nom} : ${r.status}`);
        return r.arrayBuffer();
      });
    p.catch(() => octets.delete(nom));
    octets.set(nom, p);
  }
  return p;
}

/** Polices d'une famille connues du navigateur (FontFace) : la copie de la feuille est mise en page avec elles. */
const inscrites = new Set<string>();
async function inscrire(famille: Famille) {
  await Promise.all(
    STYLES.map(async (s) => {
      const k = `${famille}-${s}`;
      if (inscrites.has(k)) return;
      const f = new FontFace(`PdfDoc-${famille}`, (await fichierPolice(k)).slice(0), {
        weight: s.includes('b') ? '700' : '400',
        style: s.includes('i') ? 'italic' : 'normal',
      });
      await f.load();
      document.fonts.add(f);
      inscrites.add(k);
    }),
  );
}

/** Attend que les images de la feuille (photos et pages de PDF joints) soient chargées, 20 s au plus. */
async function imagesPretes(feuille: HTMLElement) {
  const fin = Date.now() + 20000;
  const enAttente = () =>
    [...feuille.querySelectorAll<HTMLImageElement>('img[data-annexe]')].some((i) => !i.getAttribute('src')) ||
    [...feuille.querySelectorAll('.pv-empty')].some((p) => /Chargement/.test(p.textContent ?? ''));
  while (enAttente() && Date.now() < fin) await new Promise((r) => setTimeout(r, 200));
  await Promise.all([...feuille.querySelectorAll('img')].map((i) => (i.getAttribute('src') ? i.decode().catch(() => {}) : null)));
}

type Couleur = [number, number, number];
/** Couleur calculée (rgb / rgba) ; null si transparente. */
function couleur(css: string): Couleur | null {
  const n = css.match(/[\d.]+/g)?.map(Number);
  if (!n || n.length < 3) return null;
  if (css.startsWith('color(')) return n.length > 3 && n[3] === 0 ? null : [n[0], n[1], n[2]];
  if (n.length > 3 && n[3] === 0) return null;
  return [n[0] / 255, n[1] / 255, n[2] / 255];
}

interface Bloc {
  haut: number;
  bas: number;
}
interface Fond extends Bloc {
  x: number;
  l: number;
  c: Couleur;
}
interface Trait {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ep: number;
  c: Couleur;
  tirets?: boolean;
}
interface Morceau extends Bloc {
  x: number;
  /** Ligne de base (px). */
  base: number;
  texte: string;
  taille: number;
  style: Style;
  repli: boolean;
  c: Couleur;
  espacement: number;
  souligne: boolean;
  /** Avance attendue dans le PDF pour le caractère suivant. */
  suite: number;
}
interface Image extends Bloc {
  x: number;
  l: number;
  el: HTMLImageElement;
}
interface Emoji extends Bloc {
  x: number;
  l: number;
  texte: string;
  police: string;
  c: string;
  base: number;
}
interface Lien extends Bloc {
  x: number;
  l: number;
  url: string;
}

const LETTRES = (n: number) => {
  let s = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
  return s;
};
const ROMAIN = (n: number) =>
  [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']].reduce<[string, number]>(
    ([s, r], [v, l]) => {
      while (r >= (v as number)) {
        s += l;
        r -= v as number;
      }
      return [s, r];
    },
    ['', n],
  )[0];

/**
 * Puces et numéros des listes écrits en vrai texte dans la copie (les ::marker ne se mesurent pas) : même place (avant
 * le point, hors de la marge), même couleur et graisse que la puce affichée.
 */
function puces(racine: HTMLElement) {
  racine.querySelectorAll('li').forEach((li) => {
    const cs = getComputedStyle(li);
    if (cs.display !== 'list-item' || cs.listStyleType === 'none' || cs.listStylePosition !== 'outside') return;
    const liste = li.parentElement;
    const freres = liste ? [...liste.children].filter((x) => x.tagName === 'LI') : [li];
    const n = freres.indexOf(li) + (liste instanceof HTMLOListElement ? liste.start : 1);
    const t = cs.listStyleType;
    const texte =
      t === 'decimal' ? `${n}.` : t === 'lower-alpha' || t === 'lower-latin' ? `${LETTRES(n)}.` : t === 'upper-alpha' || t === 'upper-latin' ? `${LETTRES(n).toUpperCase()}.`
        : t === 'lower-roman' ? `${ROMAIN(n)}.` : t === 'upper-roman' ? `${ROMAIN(n).toUpperCase()}.` : t === 'square' ? '■' : t === 'circle' ? '◦' : '•';
    const m = getComputedStyle(li, '::marker');
    const puce = document.createElement('span');
    puce.className = 'pdf-puce';
    Object.assign(puce.style, { color: m.color || cs.color, fontWeight: m.fontWeight || cs.fontWeight, fontStyle: 'normal', textTransform: 'none', textDecoration: 'none' });
    if (/[■◦•]/.test(texte)) {
      // Symbole plus petit, sur la ligne de base du texte, un peu plus écarté.
      puce.classList.add('sym');
      const s = document.createElement('span');
      s.textContent = texte;
      Object.assign(s.style, { fontSize: texte === '◦' ? '1em' : '0.62em', verticalAlign: texte === '◦' ? '0' : '0.12em' });
      puce.appendChild(s);
    } else puce.textContent = texte;
    li.style.listStyleType = 'none';
    li.style.position = 'relative';
    li.prepend(puce);
  });
}

/** Coupures de page (px depuis le haut du document) : début de chaque page. */
function coupes(total: number, H: number, atomes: Bloc[], evites: Bloc[], titres: Bloc[], forcees: number[]): number[] {
  const debuts = [0];
  let y = 0;
  for (let garde = 0; garde < 1000; garde++) {
    const limite = y + H;
    const f = forcees.filter((v) => v > y + 1 && v < limite).sort((a, b) => a - b)[0];
    if (f === undefined && limite >= total - 0.5) break;
    let c = f ?? limite;
    if (f === undefined) {
      for (let tour = 0; tour < 8; tour++) {
        const avant = c;
        for (const a of atomes) if (a.haut < c - 0.5 && a.bas > c + 0.5 && a.haut > y + 1) c = Math.min(c, a.haut);
        for (const b of evites) if (b.haut < c - 0.5 && b.bas > c + 0.5 && b.haut > y + 1 && b.bas - b.haut <= H) c = Math.min(c, b.haut);
        for (const t of titres) if (t.haut > y + 1 && t.haut < c && t.bas <= c + 0.5 && !atomes.some((a) => a.haut >= t.bas - 0.5 && a.haut < c - 0.5)) c = Math.min(c, t.haut);
        if (c === avant) break;
      }
      if (c <= y + 1) c = limite; // rien ne tient : coupe franche
    }
    debuts.push(c);
    y = c;
  }
  return debuts;
}

/** Crée le PDF de la feuille (ordre du jour, PV, archive). */
export async function creerPdf(feuille: HTMLElement, o: OptionsPdf): Promise<Blob> {
  const famille = FAMILLE[o.police ?? ''] ?? 'doc-sans';
  const [lib, fkMod] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')]);
  const fontkit = ((fkMod as unknown as { default?: typeof fkMod }).default ?? fkMod) as typeof fkMod;
  await Promise.all([inscrire(famille), inscrire(REPLI), imagesPretes(feuille)]);
  // Mesures des polices (couverture des caractères, avances) : les mêmes fichiers que ceux du PDF.
  const mesures = new Map<string, FontkitFont>();
  for (const f of [famille, REPLI])
    for (const s of STYLES) mesures.set(`${f}-${s}`, fontkit.create(new Uint8Array(await fichierPolice(`${f}-${s}`))));
  const mesure = (repli: boolean, s: Style) => mesures.get(`${repli ? REPLI : famille}-${s}`)!;

  const pageL = (o.paysage ? 297 : 210) * MM;
  const pageH = (o.paysage ? 210 : 297) * MM;
  const marge = o.margesMm * MM;
  const L = pageL - 2 * marge;
  const H = pageH - 2 * marge;

  const boite = document.createElement('div');
  boite.className = 'pdf-boite';
  boite.setAttribute('aria-hidden', 'true');
  // Avances de glyphes non arrondies (comme dans le PDF) : sinon le gras paraît espacé.
  Object.assign(boite.style, { position: 'absolute', left: '-40000px', top: '0', width: `${L}px`, textRendering: 'geometricPrecision' });
  const copie = feuille.cloneNode(true) as HTMLElement;
  copie.classList.add('pdf-rendu');
  copie.classList.remove('editing');
  copie.removeAttribute('contenteditable');
  copie.style.setProperty('--doc-police', `'PdfDoc-${famille}', 'PdfDoc-${REPLI}', sans-serif`);
  boite.appendChild(copie);
  document.body.appendChild(boite);
  try {
    await Promise.all([...copie.querySelectorAll('img')].map((i) => (i.getAttribute('src') ? i.decode().catch(() => {}) : null)));
    puces(copie);
    const origine = copie.getBoundingClientRect();
    const X = (x: number) => x - origine.left;
    const Y = (y: number) => y - origine.top;

    // Ligne de base de chaque style : sonde (bloc vide aligné sur la ligne de base) dans une ligne de 100 px.
    const bases = new Map<string, number>();
    const baseDe = (s: Style) => {
      let b = bases.get(s);
      if (b === undefined) {
        const l = document.createElement('div');
        Object.assign(l.style, { fontFamily: `'PdfDoc-${famille}'`, fontSize: '100px', lineHeight: 'normal', fontWeight: s.includes('b') ? '700' : '400', fontStyle: s.includes('i') ? 'italic' : 'normal', whiteSpace: 'nowrap' });
        l.textContent = 'Hxg';
        const sonde = document.createElement('span');
        Object.assign(sonde.style, { display: 'inline-block', width: '0', height: '0' });
        l.appendChild(sonde);
        boite.appendChild(l);
        const r = document.createRange();
        r.selectNodeContents(l.firstChild!);
        b = (sonde.getBoundingClientRect().top - r.getBoundingClientRect().top) / 100;
        l.remove();
        bases.set(s, b);
      }
      return b;
    };

    const fonds: Fond[] = [];
    const traits: Trait[] = [];
    const images: Image[] = [];
    const liens: Lien[] = [];
    const evites: Bloc[] = [];
    const titres: Bloc[] = [];
    const forcees: number[] = [];

    // Éléments : fonds, bordures, images, liens, règles de coupure.
    const tous = [copie, ...copie.querySelectorAll<HTMLElement>('*')];
    for (const el of tous) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rects = [...el.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
      if (!rects.length) continue;
      const b = el.getBoundingClientRect();
      const bloc = { haut: Y(b.top), bas: Y(b.bottom) };
      if (/avoid/.test(cs.breakInside)) evites.push(bloc);
      if (/avoid/.test(cs.breakAfter) || /^H[1-6]$/.test(el.tagName)) titres.push(bloc);
      if (/page|always|left|right/.test(cs.breakBefore) && bloc.haut > 1) forcees.push(bloc.haut);
      const fond = el === copie ? null : couleur(cs.backgroundColor);
      for (const r of rects) {
        if (fond) fonds.push({ x: X(r.left), l: r.width, haut: Y(r.top), bas: Y(r.bottom), c: fond });
        const cotes = [
          ['Top', r.left, r.top, r.right, r.top],
          ['Bottom', r.left, r.bottom, r.right, r.bottom],
          ['Left', r.left, r.top, r.left, r.bottom],
          ['Right', r.right, r.top, r.right, r.bottom],
        ] as const;
        for (const [cote, x1, y1, x2, y2] of cotes) {
          const ep = parseFloat(cs.getPropertyValue(`border-${cote.toLowerCase()}-width`));
          const st = cs.getPropertyValue(`border-${cote.toLowerCase()}-style`);
          const c = couleur(cs.getPropertyValue(`border-${cote.toLowerCase()}-color`));
          if (!ep || !c || st === 'none' || st === 'hidden') continue;
          // Trait au milieu de la bordure.
          const d = ep / 2;
          const [dx, dy] = cote === 'Top' ? [0, d] : cote === 'Bottom' ? [0, -d] : cote === 'Left' ? [d, 0] : [-d, 0];
          traits.push({ x1: X(x1) + dx, y1: Y(y1) + dy, x2: X(x2) + dx, y2: Y(y2) + dy, ep, c, tirets: st === 'dotted' || st === 'dashed' });
        }
      }
      // Lignes à remplir (fond rayé) : une ligne tous les 7,5 mm.
      if (el.classList.contains('pv-lines'))
        for (let y = b.top + 7.5 * MM; y < b.bottom - 1; y += 7.5 * MM) traits.push({ x1: X(b.left), y1: Y(y), x2: X(b.right), y2: Y(y), ep: 1, c: [0.8, 0.84, 0.88] });
      if (el instanceof HTMLImageElement && el.getAttribute('src') && el.naturalWidth) {
        // object-fit: contain → la place réelle de l'image dans sa boîte.
        let { left: x, top: y, width: l, height: h } = b;
        if (cs.objectFit === 'contain' || cs.objectFit === 'scale-down') {
          const k = Math.min(l / el.naturalWidth, h / el.naturalHeight, cs.objectFit === 'scale-down' ? 1 : Infinity);
          const [l2, h2] = [el.naturalWidth * k, el.naturalHeight * k];
          x += (l - l2) / 2;
          y += (h - h2) / 2;
          [l, h] = [l2, h2];
        }
        images.push({ x: X(x), l, haut: Y(y), bas: Y(y + h), el });
      }
      if (el instanceof HTMLAnchorElement && /^(https?:|mailto:|tel:)/i.test(el.getAttribute('href') ?? ''))
        for (const r of rects) liens.push({ x: X(r.left), l: r.width, haut: Y(r.top), bas: Y(r.bottom), url: el.href });
    }

    // Texte : chaque caractère est mesuré ; les caractères qui se suivent sur une ligne, avec la même police, forment
    // un morceau écrit d'un coup (repris à la position mesurée dès que l'écart dépasse 0,4 px).
    const morceaux: Morceau[] = [];
    const emojis: Emoji[] = [];
    // Découpage en caractères visibles (émojis composés d'un seul tenant), si le navigateur le permet.
    type Segmenteur = { segment(s: string): Iterable<{ segment: string; index: number }> };
    const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => Segmenteur }).Segmenter;
    const seg = Seg ? new Seg('fr', { granularity: 'grapheme' }) : null;
    const graphemes = (s: string) => {
      if (seg) return [...seg.segment(s)].map((x) => ({ g: x.segment, i: x.index }));
      const out: { g: string; i: number }[] = [];
      let i = 0;
      for (const g of s) {
        out.push({ g, i });
        i += g.length;
      }
      return out;
    };
    const range = document.createRange();
    const marcheur = document.createTreeWalker(copie, NodeFilter.SHOW_TEXT);
    for (let n = marcheur.nextNode() as Text | null; n; n = marcheur.nextNode() as Text | null) {
      const el = n.parentElement;
      if (!el || !n.data.trim()) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const c = couleur(cs.color) ?? [0, 0, 0];
      const taille = parseFloat(cs.fontSize);
      const style = styleDe(Number(cs.fontWeight) >= 600, cs.fontStyle !== 'normal');
      const espacement = parseFloat(cs.letterSpacing) || 0;
      const souligne = /underline/.test(cs.textDecorationLine) || !!el.closest('a[href], u');
      const casse = cs.textTransform;
      let m: Morceau | null = null;
      let debutMot = true;
      for (const { g, i } of graphemes(n.data)) {
        const blanc = /^\s+$/.test(g);
        range.setStart(n, i);
        range.setEnd(n, i + g.length);
        const r = [...range.getClientRects()].find((x) => x.width > 0);
        if (!r || g === '\n' || g === '\t') {
          m = null;
          debutMot = true;
          continue;
        }
        let t = g.normalize('NFC');
        if (casse === 'uppercase') t = t.toLocaleUpperCase('fr');
        else if (casse === 'lowercase') t = t.toLocaleLowerCase('fr');
        else if (casse === 'capitalize' && debutMot) t = t.toLocaleUpperCase('fr');
        debutMot = blanc;
        const cps = [...t].map((x) => x.codePointAt(0)!);
        // Séquences (émojis composés, variante émoji) : dessinées par le navigateur.
        const image = cps.length > 1;
        const glyphe = (f: FontkitFont) => cps.every((cp) => f.hasGlyphForCodePoint(cp));
        const repli = !image && !glyphe(mesure(false, style)) ? (glyphe(mesure(true, style)) ? true : null) : false;
        const haut = Y(r.top);
        if (image || repli === null) {
          m = null;
          if (!blanc) emojis.push({ x: X(r.left), l: r.width, haut, bas: Y(r.bottom), texte: t, police: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, c: cs.color, base: baseDe(style) * taille });
          continue;
        }
        const x = X(r.left);
        if (!m || m.repli !== repli || Math.abs(m.haut - haut) > 1 || Math.abs(m.suite - x) > 0.4) {
          m = { x, haut, bas: Y(r.bottom), base: haut + baseDe(style) * taille, texte: '', taille, style, repli, c, espacement, souligne, suite: x };
          morceaux.push(m);
        }
        const f = mesure(repli, style);
        m.texte += t;
        m.suite += cps.reduce((s, cp) => s + (f.glyphForCodePoint(cp).advanceWidth / f.unitsPerEm) * taille + espacement, 0);
      }
    }

    const total = copie.getBoundingClientRect().height;
    const atomes: Bloc[] = [...morceaux, ...emojis, ...images];
    const debuts = coupes(total, H, atomes, evites, titres, forcees);
    const pageDe = (y: number) => {
      let k = 0;
      while (k + 1 < debuts.length && debuts[k + 1] <= y + 0.5) k++;
      return k;
    };

    // Écriture du PDF.
    const { PDFDocument, rgb, PDFString, PDFArray, PDFDict, PDFName, pushGraphicsState, popGraphicsState, setCharacterSpacing } = lib;
    const pdf: PDFDocument = await PDFDocument.create();
    pdf.registerFontkit(fontkit as unknown as Parameters<PDFDocument['registerFontkit']>[0]);
    pdf.setTitle(o.titre, { showInWindowTitleBar: true });
    if (o.auteur) pdf.setAuthor(o.auteur);
    if (o.createur) pdf.setCreator(o.createur);
    pdf.setProducer(o.createur ?? 'Tâches GSA');
    pdf.setLanguage('fr-CH');
    const polices = new Map<string, Promise<PDFFont>>();
    const police = (repli: boolean, s: Style) => {
      const k = `${repli ? REPLI : famille}-${s}`;
      let p = polices.get(k);
      if (!p) {
        p = fichierPolice(k).then((b) => pdf.embedFont(b, { subset: true, features: { liga: false, kern: false } }));
        polices.set(k, p);
      }
      return p;
    };
    const pages: PDFPage[] = debuts.map(() => pdf.addPage([pageL * PT, pageH * PT]));
    const fin = (k: number) => debuts[k + 1] ?? Infinity;
    const px = (x: number) => (marge + x) * PT;
    const py = (k: number, y: number) => (pageH - marge - (y - debuts[k])) * PT;
    const coul = (c: Couleur) => rgb(Math.min(1, c[0]), Math.min(1, c[1]), Math.min(1, c[2]));

    // Fonds, coupés aux limites des pages.
    for (const f of fonds)
      for (let k = pageDe(f.haut); k < pages.length && debuts[k] < f.bas; k++) {
        const h = Math.max(f.haut, debuts[k]);
        const b = Math.min(f.bas, fin(k));
        if (b - h > 0.2) pages[k].drawRectangle({ x: px(f.x), y: py(k, b), width: f.l * PT, height: (b - h) * PT, color: coul(f.c) });
      }
    for (const t of traits) {
      if (Math.abs(t.y1 - t.y2) < 0.5) {
        const k = pageDe(t.y1);
        if (t.y1 - debuts[k] < -0.5 || t.y1 > fin(k)) continue;
        pages[k].drawLine({ start: { x: px(t.x1), y: py(k, t.y1) }, end: { x: px(t.x2), y: py(k, t.y2) }, thickness: t.ep * PT, color: coul(t.c), dashArray: t.tirets ? [t.ep * PT, t.ep * 2 * PT] : undefined });
      } else
        for (let k = pageDe(t.y1); k < pages.length && debuts[k] < t.y2; k++) {
          const h = Math.max(t.y1, debuts[k]);
          const b = Math.min(t.y2, fin(k));
          if (b - h > 0.2) pages[k].drawLine({ start: { x: px(t.x1), y: py(k, h) }, end: { x: px(t.x2), y: py(k, b) }, thickness: t.ep * PT, color: coul(t.c), dashArray: t.tirets ? [t.ep * PT, t.ep * 2 * PT] : undefined });
        }
    }

    // Images : PDF joints repris tels quels (page vectorielle), photos et logos en image.
    const sources = new Map<string, Promise<PDFDocument | null>>();
    const sourcePdf = (id: string) => {
      let p = sources.get(id);
      if (!p) {
        p = getFile(id)
          .then(async (b) => (b ? PDFDocument.load(await b.arrayBuffer(), { ignoreEncryption: false }) : null))
          .catch(() => null);
        sources.set(id, p);
      }
      return p;
    };
    const liensPdf: { k: number; rect: number[]; url: string }[] = [];
    for (const im of images) {
      const k = pageDe(im.haut);
      // Plus haute que la place restante (page en paysage…) : réduite pour tenir.
      const place = fin(k) - im.haut;
      const r = Math.min(1, place / (im.bas - im.haut));
      const [l, h] = [im.l * r, (im.bas - im.haut) * r];
      const x = im.x + (im.l - l) / 2;
      const dessin = { x: px(x), y: py(k, im.haut + h), width: l * PT, height: h * PT };
      const page = Number(im.el.dataset.page);
      let fait = false;
      if (im.el.dataset.annexe && page) {
        try {
          const src = await sourcePdf(im.el.dataset.annexe);
          if (src && page <= src.getPageCount()) {
            const sp = src.getPage(page - 1);
            const e: PDFEmbeddedPage = await pdf.embedPage(sp);
            try {
              // Recopiée tout de suite : sinon seulement à l'enregistrement, où une page illisible (page blanche sans
              // contenu, codage inconnu…) ferait échouer tout le document.
              await e.embed();
            } catch (err) {
              oublier(pdf, e);
              throw err;
            }
            pages[k].drawPage(e, dessin);
            fait = true;
            // Liens du PDF joint : gardés, à la même place sur la page réduite.
            const mb = sp.getMediaBox();
            const [sx, sy] = [dessin.width / mb.width, dessin.height / mb.height];
            const annots = sp.node.Annots();
            for (let j = 0; j < (annots?.size() ?? 0); j++) {
              const a = annots!.lookup(j);
              if (!(a instanceof PDFDict) || a.get(PDFName.of('Subtype')) !== PDFName.of('Link')) continue;
              const act = a.lookup(PDFName.of('A'));
              const uri = act instanceof PDFDict && act.get(PDFName.of('S')) === PDFName.of('URI') ? act.lookup(PDFName.of('URI')) : undefined;
              const rect = a.lookup(PDFName.of('Rect'));
              const url = uri && 'decodeText' in uri ? (uri as { decodeText(): string }).decodeText() : '';
              if (!(rect instanceof PDFArray) || !/^(https?:|mailto:)/i.test(url)) continue;
              const r = rect.asRectangle();
              const [x1, y1] = [dessin.x + (Math.min(r.x, r.x + r.width) - mb.x) * sx, dessin.y + (Math.min(r.y, r.y + r.height) - mb.y) * sy];
              liensPdf.push({ k, rect: [x1, y1, x1 + Math.abs(r.width) * sx, y1 + Math.abs(r.height) * sy], url });
            }
          }
        } catch {
          // Repli : l'image de la page.
        }
      }
      if (!fait) {
        const img = await imagePdf(pdf, im.el, Math.max(l, 1), Math.max(h, 1)).catch(() => null);
        if (img) pages[k].drawImage(img, dessin);
      }
    }

    // Texte.
    for (const m of morceaux) {
      const k = pageDe(m.haut);
      const f = await police(m.repli, m.style);
      const p = pages[k];
      if (m.espacement) p.pushOperators(pushGraphicsState(), setCharacterSpacing(m.espacement * PT));
      p.drawText(m.texte, { x: px(m.x), y: py(k, m.base), size: m.taille * PT, font: f, color: coul(m.c) });
      if (m.espacement) p.pushOperators(popGraphicsState());
      if (m.souligne && m.texte.trim()) {
        const y = py(k, m.base + m.taille * 0.11);
        p.drawLine({ start: { x: px(m.x), y }, end: { x: px(m.suite - m.espacement), y }, thickness: Math.max(0.5, m.taille * 0.06 * PT), color: coul(m.c) });
      }
    }
    // Symboles et émojis absents des polices : dessinés par le navigateur.
    const dessins = new Map<string, Promise<PDFImage | null>>();
    for (const e of emojis) {
      const k = pageDe(e.haut);
      const cle = `${e.texte}|${e.police}|${e.c}|${e.l}|${e.bas - e.haut}`;
      let p = dessins.get(cle);
      if (!p) {
        p = emojiPng(e).then((b) => (b ? pdf.embedPng(b) : null)).catch(() => null);
        dessins.set(cle, p);
      }
      const img = await p;
      if (img) pages[k].drawImage(img, { x: px(e.x), y: py(k, e.bas), width: e.l * PT, height: (e.bas - e.haut) * PT });
    }

    // Liens cliquables.
    const lien = (k: number, rect: number[], url: string) =>
      pages[k].node.addAnnot(pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } })));
    liensPdf.forEach((a) => lien(a.k, a.rect, a.url));
    for (const a of liens) {
      const k = pageDe(a.haut);
      lien(k, [px(a.x), py(k, a.bas), px(a.x + a.l), py(k, a.haut)], a.url);
    }

    // Numéros de page, en bas à droite (comme à l'impression).
    const numero = await police(false, 'r');
    pages.forEach((p, k) => {
      const t = `${k + 1} / ${pages.length}`;
      const taille = 9;
      p.drawText(t, { x: (pageL - marge) * PT - numero.widthOfTextAtSize(t, taille), y: Math.max(8, (marge * PT) / 2 - 3), size: taille, font: numero, color: rgb(0.4, 0.4, 0.4) });
    });

    const bytes = await pdf.save();
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  } finally {
    boite.remove();
  }
}

/** Page jointe qui n'a pas pu être recopiée : retirée des pages à recopier à l'enregistrement (remplacée par son image). */
function oublier(pdf: PDFDocument, e: PDFEmbeddedPage) {
  const liste = (pdf as unknown as { embeddedPages?: PDFEmbeddedPage[] }).embeddedPages;
  const i = liste?.indexOf(e) ?? -1;
  if (i >= 0) liste!.splice(i, 1);
  else (e as unknown as { alreadyEmbedded: boolean }).alreadyEmbedded = true;
}

/** Image pour le PDF : JPEG ou PNG d'origine si possible, sinon redessinée (SVG, WebP…) ; très grandes photos réduites. */
async function imagePdf(pdf: PDFDocument, el: HTMLImageElement, l: number, h: number): Promise<PDFImage | null> {
  const src = el.currentSrc || el.src;
  const b = new Uint8Array(await (await fetch(src)).arrayBuffer());
  const jpeg = b[0] === 0xff && b[1] === 0xd8;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if ((jpeg || png) && b.length < 3_000_000) return jpeg ? pdf.embedJpg(b) : pdf.embedPng(b);
  // Redessinée : 3 fois la taille affichée (netteté à l'impression), 2400 px au plus.
  const k = Math.min(3, 2400 / Math.max(l, h));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(l * k));
  cv.height = Math.max(1, Math.round(h * k));
  const ctx = cv.getContext('2d')!;
  if (jpeg) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  ctx.drawImage(el, 0, 0, cv.width, cv.height);
  const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, jpeg ? 'image/jpeg' : 'image/png', 0.88));
  if (!blob) return null;
  const out = new Uint8Array(await blob.arrayBuffer());
  return jpeg ? pdf.embedJpg(out) : pdf.embedPng(out);
}

/** Émoji ou symbole dessiné par le navigateur (PNG transparent, 4 fois sa taille). */
async function emojiPng(e: Emoji): Promise<Uint8Array | null> {
  const k = 4;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(e.l * k));
  cv.height = Math.max(1, Math.ceil((e.bas - e.haut) * k));
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.scale(k, k);
  ctx.font = e.police;
  ctx.fillStyle = e.c;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(e.texte, 0, e.base);
  const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/** Nom de fichier sûr. */
export const nomFichierPdf = (titre: string) => `${titre.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'document'}.pdf`;

/** Enregistre le PDF : partage sur téléphone (mail, WhatsApp…) quand c'est possible, sinon téléchargement. */
export async function enregistrerPdf(blob: Blob, titre: string) {
  const nom = nomFichierPdf(titre);
  const fichier = new File([blob], nom, { type: 'application/pdf' });
  if (window.matchMedia?.('(pointer: coarse)').matches && navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: titre });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // Partage refusé (délai dépassé…) : téléchargement.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
