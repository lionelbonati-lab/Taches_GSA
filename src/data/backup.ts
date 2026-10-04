import type { AppData } from './types';
import { clearFiles, getFile, saveFile } from './files';

// Sauvegarde complète des données de la démo (un fichier .json) : tâches, séances, PV, sondages,
// emails, responsables, rôles, réglages… et le contenu des fichiers joints.
// Sert à passer d'un appareil à l'autre et à reprendre les données dans la version définitive (Supabase).

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

const fileIds = (data: AppData) => data.tasks.flatMap((t) => (t.documents ?? []).filter((d) => d.kind === 'fichier').map((d) => d.id));

export async function makeBackup(data: AppData, by?: string): Promise<Backup> {
  const files: Backup['files'] = {};
  for (const id of fileIds(data)) {
    const blob = await getFile(id);
    if (blob) files[id] = { type: blob.type, base64: await toBase64(blob) };
  }
  return { app: 'taches-gsa', version: 1, exportedAt: new Date().toISOString(), exportedBy: by, schema: data.schema ?? 0, data, files };
}

export function downloadBackup(b: Backup) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }));
  a.download = `taches-gsa-sauvegarde-${b.exportedAt.slice(0, 10)}.json`;
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
    throw new Error('Ce fichier n’est pas une sauvegarde de Tâches GSA.');
  return { ...json, files: json.files ?? {} };
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
