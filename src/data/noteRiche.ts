// Notes du PV mises en forme (gras, italique, souligné, barré, couleur : 2e ligne de la pilule de la prise de notes).
// Une note sans mise en forme reste du texte simple, comme avant. Sinon : RICHE, puis un HTML réduit écrit par l'appli
// (noteDe) et relu ici sans navigateur (morceauxDe) : il n'est jamais mis tel quel dans une page.

/** Bout de texte et sa mise en forme. Couleur : #rrggbb. */
export interface Morceau {
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  c?: string;
}
type Forme = Omit<Morceau, 't'>;

export const RICHE = '<!--mef-->';

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const desechapper = (t: string) => t.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ENTITES[e]);

const meme = (a: Forme, b: Forme) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && !!a.s === !!b.s && a.c === b.c;
const enForme = (m: Forme) => !!(m.b || m.i || m.u || m.s || m.c);

/** HTML d'un bout de texte (échappé) dans ses balises de mise en forme. */
function envelopper(m: Forme, h: string) {
  if (m.s) h = `<s>${h}</s>`;
  if (m.u) h = `<u>${h}</u>`;
  if (m.i) h = `<i>${h}</i>`;
  if (m.b) h = `<b>${h}</b>`;
  if (m.c) h = `<span style="color:${m.c}">${h}</span>`;
  return h;
}

/** Note à enregistrer : texte simple sans mise en forme, sinon RICHE + HTML réduit ; '' si rien n'est écrit. */
export function noteDe(morceaux: Morceau[]): string {
  const ms: Morceau[] = [];
  for (const m of morceaux) {
    if (!m.t) continue;
    const prec = ms[ms.length - 1];
    if (prec && meme(prec, m)) prec.t += m.t;
    else ms.push({ ...m });
  }
  if (!ms.some((m) => m.t.trim())) return '';
  if (!ms.some(enForme)) return ms.map((m) => m.t).join('');
  return RICHE + ms.map((m) => envelopper(m, echapper(m.t))).join('');
}

const BALISE = /<(\/?)(b|i|u|s|span)(?: style="color:(#[0-9a-f]{6})")?>/g;

/** Bouts de texte d'une note (texte simple : un seul, sans mise en forme). */
export function morceauxDe(note: string): Morceau[] {
  if (!note.startsWith(RICHE)) return note ? [{ t: note }] : [];
  const html = note.slice(RICHE.length);
  const out: Morceau[] = [];
  const pile: { tag: string; c?: string }[] = [];
  const texte = (t: string) => {
    if (!t) return;
    const m: Morceau = { t: desechapper(t) };
    for (const p of pile) {
      if (p.tag === 'span') m.c = p.c;
      else m[p.tag as 'b' | 'i' | 'u' | 's'] = true;
    }
    out.push(m);
  };
  let i = 0;
  for (const x of html.matchAll(BALISE)) {
    texte(html.slice(i, x.index));
    i = (x.index ?? 0) + x[0].length;
    if (!x[1]) pile.push({ tag: x[2], c: x[3] });
    else {
      const k = pile.map((p) => p.tag).lastIndexOf(x[2]);
      if (k >= 0) pile.splice(k, 1);
    }
  }
  texte(html.slice(i));
  return out;
}

/** Bouts de texte sans les blancs du début et de la fin de la note (affichage, document). */
export function morceauxAffiches(note: string): Morceau[] {
  const ms = morceauxDe(note).map((m) => ({ ...m }));
  while (ms.length && !ms[0].t.trimStart()) ms.shift();
  while (ms.length && !ms[ms.length - 1].t.trimEnd()) ms.pop();
  if (ms.length) {
    ms[0].t = ms[0].t.trimStart();
    ms[ms.length - 1].t = ms[ms.length - 1].t.trimEnd();
  }
  return ms;
}

/** Texte de la note, sans mise en forme (copie, email). */
export const texteDe = (note: string) => (note.startsWith(RICHE) ? morceauxDe(note).map((m) => m.t).join('') : note);

// ---------- Zone de saisie (contentEditable) ----------

/** HTML de la zone de saisie : retours à la ligne en <br> (et un de plus après une dernière ligne vide). */
export function htmlEditeur(note: string): string {
  const ms = morceauxDe(note);
  const html = ms.map((m) => envelopper(m, echapper(m.t).replace(/\n/g, '<br>'))).join('');
  return ms.length && ms[ms.length - 1].t.endsWith('\n') ? `${html}<br>` : html;
}

/** Couleur CSS en #rrggbb (sinon null : transparente, nommée…). */
export function hex(v?: string | null): string | null {
  const s = v?.trim().toLowerCase() ?? '';
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((x) => x + x).join('')}`;
  const m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/);
  if (!m || (m[4] !== undefined && !(parseFloat(m[4]) > 0))) return null;
  return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`;
}

const BLOCS = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|TABLE|TR)$/;

type Jeton = { k: 't'; t: string; f: Forme } | { k: 'br' } | { k: 'debut' } | { k: 'fin' };

/** Mise en forme apportée par un élément (balise ou style) ; `sansCouleur` : celle du texte normal (= pas de couleur). */
function formeDe(el: HTMLElement, f: Forme, sansCouleur: string | null): Forme {
  const g = { ...f };
  const t = el.tagName;
  if (t === 'B' || t === 'STRONG') g.b = true;
  if (t === 'I' || t === 'EM') g.i = true;
  if (t === 'U' || t === 'INS') g.u = true;
  if (t === 'S' || t === 'STRIKE' || t === 'DEL') g.s = true;
  const st = el.style;
  if (st.fontWeight) g.b = st.fontWeight === 'bold' || st.fontWeight === 'bolder' || Number(st.fontWeight) >= 600;
  if (st.fontStyle) g.i = st.fontStyle !== 'normal';
  const deco = st.textDecorationLine || st.textDecoration;
  if (/underline/.test(deco)) g.u = true;
  if (/line-through/.test(deco)) g.s = true;
  const c = hex(st.color) ?? (t === 'FONT' ? hex(el.getAttribute('color')) : null);
  if (c) g.c = c === sansCouleur ? undefined : c;
  return g;
}

function aplatir(n: Node, f: Forme, sansCouleur: string | null, out: Jeton[]) {
  n.childNodes.forEach((x) => {
    if (x.nodeType === Node.TEXT_NODE) {
      const t = (x as Text).data.replace(/ /g, ' ');
      if (t) out.push({ k: 't', t, f });
      return;
    }
    if (!(x instanceof HTMLElement)) return;
    if (x.tagName === 'BR') return void out.push({ k: 'br' });
    const bloc = BLOCS.test(x.tagName);
    if (bloc) out.push({ k: 'debut' });
    aplatir(x, formeDe(x, f, sansCouleur), sansCouleur, out);
    if (bloc) out.push({ k: 'fin' });
  });
}

/**
 * Note écrite dans la zone de saisie : texte, retours à la ligne (<br>, ou blocs <div> selon le navigateur) et mise en
 * forme. Comme à l'écran, un <br> en fin de ligne (rien après lui dans son bloc) ne fait pas de ligne de plus.
 */
export function lireEditeur(racine: HTMLElement): string {
  const sansCouleur = hex(getComputedStyle(racine).color);
  const jetons: Jeton[] = [];
  aplatir(racine, {}, sansCouleur, jetons);
  const lignes: Morceau[][] = [[]];
  let coupure = false;
  const nouvelle = () => {
    lignes.push([]);
    coupure = false;
  };
  const ligne = () => lignes[lignes.length - 1];
  const finale = (i: number) => {
    for (const j of jetons.slice(i + 1)) {
      if (j.k === 'br' || (j.k === 't' && j.t)) return false;
      if (j.k === 'debut' || j.k === 'fin') return true;
    }
    return true;
  };
  jetons.forEach((j, i) => {
    if (j.k === 't') {
      if (coupure) nouvelle();
      ligne().push({ t: j.t, ...j.f });
    } else if (j.k === 'br') {
      if (coupure) nouvelle();
      if (!finale(i)) nouvelle();
    } else if (j.k === 'debut') {
      if (ligne().length || coupure) nouvelle();
    } else coupure = true;
  });
  const ms: Morceau[] = [];
  lignes.forEach((l, k) => {
    if (k) ms.push({ t: '\n' });
    ms.push(...l);
  });
  return noteDe(ms);
}
