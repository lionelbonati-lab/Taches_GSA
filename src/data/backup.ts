import type { AppData, ClubMembre, UnitType } from './types';
import { clearFiles, getFile, saveFile } from './files';
import { nomAppli } from './nomAppli';

// Sauvegarde complète des données (un fichier .json) : tâches, séances, PV, sondages, emails, personnes, rôles, réglages…
// et le contenu des fichiers joints. Celle de tout le club (console admin, super-admins) réunit toutes ses entités et
// « Personnes du club » ; on en restaure une entité à la fois (ses admins). L'ancien fichier d'une seule entité se
// restaure toujours. Sert aussi à passer d'un appareil à l'autre et à reprendre les données de la démo dans la version réelle.

export interface Backup {
  app: 'taches-gsa';
  /** Format du fichier de sauvegarde. */
  version: 1;
  exportedAt: string;
  exportedBy?: string;
  /** Version du format des données (voir SCHEMA dans store.tsx). */
  schema: number;
  data: AppData;
  /** Fichiers joints : identifiant → type MIME + contenu en base64. */
  files: Record<string, { type: string; base64: string }>;
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Fichiers joints aux tâches de l'entité (visas signés compris). */
export const fileIds = (data: AppData) => data.tasks.flatMap((t) => (t.documents ?? []).filter((d) => d.kind === 'fichier').map((d) => d.id));

export async function makeBackup(data: AppData, by?: string): Promise<Backup> {
  const files: Backup['files'] = {};
  for (const id of fileIds(data)) {
    const blob = await getFile(id);
    if (blob) files[id] = { type: blob.type, base64: await toBase64(blob) };
  }
  return { app: 'taches-gsa', version: 1, exportedAt: new Date().toISOString(), exportedBy: by, schema: data.schema ?? 0, data, files };
}

/** `entite` : son nom dans celui du fichier (membre de plusieurs entités). */
export function downloadBackup(b: Backup, entite?: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }));
  const nom = entite?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.download = `taches-gsa-sauvegarde-${nom ? `${nom}-` : ''}${b.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function readBackup(file: File): Promise<Backup> {
  let json: Backup;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('Ce fichier n’est pas lisible (JSON attendu).');
  }
  if (json?.app !== 'taches-gsa' || !Array.isArray(json.data?.tasks) || !Array.isArray(json.data?.people))
    throw new Error(`Ce fichier n’est pas une sauvegarde de ${nomAppli()}.`);
  return { ...json, files: json.files ?? {} };
}

/** Une entité dans la sauvegarde du club. */
export interface EntiteSauvegardee {
  id: string;
  nom: string;
  type: UnitType;
  parentId?: string;
  archive?: boolean;
  schema: number;
  data: AppData;
  files: Backup['files'];
}

/** Sauvegarde de tout le club : chacune de ses entités (données et fichiers joints) et « Personnes du club » (sans IBAN). */
export interface SauvegardeClub {
  app: 'taches-gsa';
  version: 2;
  exportedAt: string;
  exportedBy?: string;
  club: { id: string; nom: string };
  entites: EntiteSauvegardee[];
  personnes: ClubMembre[];
}

/** Contenu des fichiers joints aux tâches de `data`, lus par `lire` (ceux qui manquent sont laissés de côté). */
export async function fichiersDe(data: AppData, lire: (id: string) => Promise<Blob | undefined>): Promise<Backup['files']> {
  const files: Backup['files'] = {};
  for (const id of fileIds(data)) {
    const blob = await lire(id).catch(() => undefined);
    if (blob) files[id] = { type: blob.type, base64: await toBase64(blob) };
  }
  return files;
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function downloadSauvegardeClub(s: SauvegardeClub) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(s)], { type: 'application/json' }));
  const nom = sansAccents(s.club.nom);
  a.download = `taches-gsa-sauvegarde-club-${nom ? `${nom}-` : ''}${s.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Résumé lisible de la sauvegarde du club. */
export function resumeClub(s: SauvegardeClub) {
  const n = (f: (e: EntiteSauvegardee) => number) => s.entites.reduce((t, e) => t + f(e), 0);
  return [
    `${s.entites.length} entité(s)`,
    `${n((e) => e.data.tasks.length)} tâches`,
    `${n((e) => e.data.meetings.length)} séances`,
    `${s.personnes.length} personnes du club`,
    `${n((e) => Object.keys(e.files).length)} fichier(s) joint(s)`,
  ].join(' · ');
}

/** Fichier choisi pour restaurer : sauvegarde du club, ou d'une seule entité (ancien format). */
export async function lireSauvegarde(file: File): Promise<Backup | SauvegardeClub> {
  let json: Backup | SauvegardeClub;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('Ce fichier n’est pas lisible (JSON attendu).');
  }
  if (json?.app === 'taches-gsa' && json.version === 2 && Array.isArray((json as SauvegardeClub).entites)) return json as SauvegardeClub;
  return readBackup(file);
}

/**
 * Ce qu'on restaure dans l'entité `id` (nom `nom`) : sa partie de la sauvegarde du club (même entité, sinon même nom), ou
 * la sauvegarde d'une seule entité telle quelle. null : elle n'est pas dans la sauvegarde du club.
 */
export function partieDe(s: Backup | SauvegardeClub, id: string, nom: string): Backup | null {
  if (s.version !== 2) return s;
  const cle = (x: string) => sansAccents(x);
  const e = s.entites.find((x) => x.id === id) ?? s.entites.find((x) => cle(x.nom) === cle(nom));
  return e ? { app: 'taches-gsa', version: 1, exportedAt: s.exportedAt, exportedBy: s.exportedBy, schema: e.schema, data: e.data, files: e.files } : null;
}

/**
 * Remet les fichiers joints de la sauvegarde (sans toucher aux autres) ; `dossier` : l'entité restaurée (version réelle).
 * Renvoie le nombre de fichiers qui n'ont pas pu être remis (ex. déjà là, dans le dossier d'une autre entité).
 */
export async function restaurerFichiers(files: Backup['files'], dossier?: string) {
  let echecs = 0;
  for (const [id, f] of Object.entries(files)) {
    const bin = atob(f.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    await saveFile(id, new Blob([bytes], { type: f.type }), id.includes('/') ? undefined : dossier).catch(() => echecs++);
  }
  return echecs;
}

/** Remplace les fichiers joints de ce navigateur par ceux de la sauvegarde. */
export async function restoreFiles(files: Backup['files']) {
  await clearFiles();
  for (const [id, f] of Object.entries(files)) {
    const bin = atob(f.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    await saveFile(id, new Blob([bytes], { type: f.type }));
  }
}

/** Résumé lisible du contenu d'une sauvegarde. */
export function backupSummary(b: Backup) {
  const d = b.data;
  const parts = [
    `${d.tasks.length} tâches`,
    `${d.people.length} personnes`,
    `${d.meetings.length} séances`,
    `${d.events.length} événements`,
    `${d.polls?.length ?? 0} sondages`,
    `${Object.keys(b.files).length} fichier(s) joint(s)`,
  ];
  return parts.join(' · ');
}

const LAST_KEY = 'taches-gsa-derniere-sauvegarde';
export function lastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
export function setLastBackupAt(iso: string) {
  try {
    localStorage.setItem(LAST_KEY, iso);
  } catch {
    /* stockage indisponible */
  }
}
