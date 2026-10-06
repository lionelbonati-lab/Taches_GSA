// Fichiers CSV : lecture (Excel, LibreOffice, Google Sheets, copier-coller) et écriture (ouvrable dans Excel).

/** Texte d'un fichier : UTF-8, sinon Windows-1252 (CSV enregistré par Excel sous Windows). */
export function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Séparateur le plus présent dans la première ligne (hors guillemets) : point-virgule, virgule ou tabulation. */
function separateur(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const n: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  for (const c of first) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c in n) n[c]++;
  }
  return n['\t'] >= n[';'] && n['\t'] >= n[','] && n['\t'] > 0 ? '\t' : n[';'] >= n[','] ? ';' : ',';
}

/** Lignes et cellules d'un CSV (guillemets, retours à la ligne dans une cellule) ; les lignes vides sont ignorées. */
export function parseCsv(text: string): string[][] {
  const sep = separateur(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x));
}

/** CSV pour Excel : point-virgule, UTF-8 avec BOM (accents lisibles), guillemets si nécessaire. */
export function toCsv(rows: (string | number | undefined)[][]): string {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}

/** Propose le fichier à l'enregistrement. */
export function downloadCsv(nom: string, rows: (string | number | undefined)[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Texte comparable : minuscules, sans accents ni ponctuation. */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Colonne attendue d'un import : nom affiché (en-tête du modèle) et autres intitulés reconnus. */
export interface Colonne<K extends string = string> {
  key: K;
  label: string;
  aliases?: string[];
  required?: boolean;
  /** Exemple, ligne 2 du modèle. */
  exemple?: string;
  aide?: string;
}

/**
 * Lignes d'un CSV avec en-tête → objets (clé de colonne → valeur). La première ligne doit contenir au moins une
 * colonne obligatoire ; les colonnes inconnues sont signalées et ignorées.
 */
export function lireTableau<K extends string>(rows: string[][], cols: Colonne<K>[]): { lignes: Record<K, string>[]; inconnues: string[]; erreur?: string } {
  const head = rows[0] ?? [];
  const index = new Map<K, number>();
  const inconnues: string[] = [];
  head.forEach((h, i) => {
    const k = norm(h);
    const col = cols.find((c) => !index.has(c.key) && [c.label, ...(c.aliases ?? [])].some((a) => norm(a) === k));
    if (col) index.set(col.key, i);
    else if (h) inconnues.push(h);
  });
  const manquantes = cols.filter((c) => c.required && !index.has(c.key));
  if (!index.size || manquantes.length)
    return {
      lignes: [],
      inconnues,
      erreur: `La première ligne doit donner les colonnes ; colonne${manquantes.length > 1 ? 's' : ''} manquante${manquantes.length > 1 ? 's' : ''} : ${(manquantes.length ? manquantes : cols.filter((c) => c.required)).map((c) => `« ${c.label} »`).join(', ')}. Pars du modèle.`,
    };
  const lignes = rows.slice(1).map((r) => Object.fromEntries(cols.map((c) => [c.key, index.has(c.key) ? (r[index.get(c.key)!] ?? '').trim() : ''])) as Record<K, string>);
  return { lignes, inconnues };
}

/** Date saisie (31.12.2026, 31/12/26, 2026-12-31) → AAAA-MM-JJ ; null si illisible, '' si vide. */
export function lireDate(s: string): string | null {
  const v = s.trim();
  if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  if (!m) {
    m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (!m) return null;
    [d, mo, y] = [+m[1], +m[2], +m[3] < 100 ? 2000 + +m[3] : +m[3]];
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Liste dans une cellule : « a, b » ou « a / b » ou « a | b ». */
export const liste = (s: string) => s.split(/[,/|\n]+/).map((x) => x.trim()).filter(Boolean);
