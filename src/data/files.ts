// Contenu des fichiers joints aux tâches. Dans la démo, gardé dans le navigateur (IndexedDB),
// à part des autres données (le localStorage est limité à quelques Mo).
// Dans la version réelle : stockage de fichiers du serveur.

const DB_NAME = 'taches-gsa-fichiers';
const STORE = 'fichiers';
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

const memory = new Map<string, Blob>(); // repli si IndexedDB est indisponible (navigation privée…)
let dbPromise: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (!dbPromise)
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise((resolve) => {
        if (!d) return resolve(undefined);
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        tx.onerror = () => resolve(undefined);
      }),
  );
}

export async function saveFile(id: string, blob: Blob) {
  memory.set(id, blob);
  await run('readwrite', (s) => s.put(blob, id));
}

export async function getFile(id: string): Promise<Blob | undefined> {
  return memory.get(id) ?? (await run<Blob>('readonly', (s) => s.get(id)));
}

export async function deleteFiles(ids: string[]) {
  ids.forEach((id) => memory.delete(id));
  if (ids.length) await run('readwrite', (s) => void ids.forEach((id) => s.delete(id)));
}

export async function clearFiles() {
  memory.clear();
  await run('readwrite', (s) => s.clear());
}

/** Réduit les photos lourdes (appareil photo du téléphone) : max 1800 px, JPEG. */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function openFile(id: string, nom: string) {
  const blob = await getFile(id);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const viewable = blob.type.startsWith('image/') || blob.type === 'application/pdf' || blob.type.startsWith('text/');
  if (viewable) window.open(url, '_blank', 'noopener');
  else {
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export const fmtSize = (n?: number) =>
  n == null ? '' : n < 1024 ? `${n} o` : n < 1024 * 1024 ? `${Math.round(n / 1024)} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`;

export function docIcon(d: { kind: string; mime?: string; nom: string }) {
  if (d.kind === 'lien') return '🔗';
  const m = d.mime ?? '';
  const ext = d.nom.split('.').pop()?.toLowerCase() ?? '';
  if (m.startsWith('image/')) return '🖼️';
  if (m === 'application/pdf' || ext === 'pdf') return '📕';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return '📊';
  if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) return '📝';
  return '📄';
}
