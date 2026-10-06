import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import type { TaskDoc } from '../data/types';
import { compressImage, deleteFiles, docIcon, fmtSize, getFile, MAX_FILE_SIZE, openFile, saveFile } from '../data/files';
import { fmtDate, fullName, uid } from '../data/utils';

/** Suivi des fichiers ajoutés / retirés pendant l'édition, pour ranger le stockage à l'enregistrement ou à l'annulation. */
export interface DocTracking {
  added: string[];
  removed: string[];
}

export function Thumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    getFile(id).then((b) => {
      if (b) setUrl((u = URL.createObjectURL(b)));
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return url ? <img className="doc-thumb" src={url} alt="" /> : null;
}

export function DocsField({ docs, setDocs, disabled, compact, track, idPrefix }: {
  docs: TaskDoc[];
  setDocs: (fn: (d: TaskDoc[]) => TaskDoc[]) => void;
  disabled: boolean;
  compact?: boolean;
  track: DocTracking;
  /** Préfixe des fichiers ajoutés (dépôt à la caisse centrale) ; pas de liens dans ce cas. */
  idPrefix?: string;
}) {
  const { data, user, cloud } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState<{ url: string; nom: string } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const addFiles = async (files: FileList | null, photo = false) => {
    if (!files?.length || !user) return;
    setErr('');
    setBusy(true);
    const added: TaskDoc[] = [];
    for (const f of Array.from(files)) {
      const blob = await compressImage(f);
      if (blob.size > MAX_FILE_SIZE) {
        setErr(`« ${f.name} » dépasse 10 Mo.`);
        continue;
      }
      const id = `${idPrefix ?? ''}${uid('d')}`;
      try {
        await saveFile(id, blob);
      } catch (e) {
        setErr(`« ${f.name} » : ${(e as Error).message}.`);
        continue;
      }
      track.added.push(id);
      const stamp = new Date().toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[/:, ]+/g, '-');
      const ext = (blob.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
      // Photo prise au téléphone : nom daté ; image recompressée : extension .jpg.
      const nom = photo || !f.name ? `Photo-${stamp}.${ext}` : blob !== f ? f.name.replace(/\.\w+$/, '') + '.jpg' : f.name;
      added.push({ id, nom, kind: 'fichier', mime: blob.type || f.type, taille: blob.size, par: user.id, le: new Date().toISOString() });
    }
    setDocs((d) => [...d, ...added]);
    setBusy(false);
  };

  const addLink = () => {
    if (!link || !user) return;
    let url = link.url.trim();
    if (!url) return setErr('Colle l’adresse du document.');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let nom = link.nom.trim();
    if (!nom) {
      try {
        nom = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return setErr('Adresse invalide.');
      }
    }
    setDocs((d) => [...d, { id: uid('d'), nom, kind: 'lien', url, par: user.id, le: new Date().toISOString() }]);
    setLink(null);
    setErr('');
  };

  const remove = (doc: TaskDoc) => {
    if (doc.kind === 'fichier') {
      // Fichier ajouté pendant cette édition : on le supprime tout de suite ; sinon à l'enregistrement.
      if (track.added.includes(doc.id)) deleteFiles([doc.id]);
      else track.removed.push(doc.id);
    }
    setDocs((d) => d.filter((x) => x.id !== doc.id));
  };

  const open = async (doc: TaskDoc) => {
    if (doc.kind === 'lien') return window.open(doc.url, '_blank', 'noopener');
    if (!(await openFile(doc.id, doc.nom))) setErr(cloud ? 'Fichier introuvable sur le serveur (ou pas de connexion).' : 'Fichier introuvable dans ce navigateur (données de démonstration).');
  };

  return (
    <fieldset className={`full docs ${compact ? 'compact' : ''}`}>
      <legend>Documents {docs.length > 0 && `(${docs.length})`}</legend>
      {docs.length > 0 && (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              {d.kind === 'fichier' && d.mime?.startsWith('image/') ? <Thumb id={d.id} /> : <span className="doc-icon">{docIcon(d)}</span>}
              <button type="button" className="doc-name" onClick={() => open(d)} title={d.kind === 'lien' ? d.url : 'Ouvrir'}>
                {d.nom}
              </button>
              {!compact && (
                <small className="muted">
                  {d.kind === 'lien' ? 'lien' : fmtSize(d.taille)} · {fullName(data.people.find((p) => p.id === d.par))} · {fmtDate(d.le.slice(0, 10))}
                </small>
              )}
              {!disabled && <button type="button" className="icon-btn" onClick={() => remove(d)} aria-label={`Retirer ${d.nom}`}>✕</button>}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <>
          <div className="doc-actions">
            <button type="button" className="btn small" onClick={() => fileRef.current?.click()} disabled={busy}>📎 Fichier</button>
            <button type="button" className="btn small" onClick={() => photoRef.current?.click()} disabled={busy}>📷 Photo</button>
            {!idPrefix && <button type="button" className="btn small" onClick={() => setLink(link ? null : { url: '', nom: '' })}>🔗 Lien</button>}
            {busy && <small className="muted">Ajout…</small>}
          </div>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files, true); e.target.value = ''; }} />
          {link && (
            <div className="doc-link-form">
              <input autoFocus placeholder="Adresse (Google Drive, Dropbox, ClubDesk…)" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
              <input placeholder="Nom (facultatif)" value={link.nom} onChange={(e) => setLink({ ...link, nom: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())} />
              <button type="button" className="btn small primary" onClick={addLink}>Ajouter</button>
            </div>
          )}
        </>
      )}
      {docs.length === 0 && disabled && <small className="muted">Aucun document.</small>}
      {err && <small className="error">{err}</small>}
    </fieldset>
  );
}
