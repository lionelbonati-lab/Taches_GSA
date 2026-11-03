import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { docIcon, fmtSize, getFile, openFile, ouvrirBlob } from '../data/files';
import { apercuPdf, estPdf } from '../data/pdf';
import { PdfPage } from './PdfViewer';
import { Modal } from './ui';
import { Icone } from './icones';

// Fichiers joints ouverts dans l'appli (fiche d'un point, ordre du jour, PV, documents archivés, justificatifs) : la
// photo ou les pages du PDF dans une fenêtre, avec « Télécharger » et « Ouvrir à part ». Sur téléphone, surtout dans
// l'appli installée, un fichier ouvert dans un nouvel onglet après son téléchargement est souvent bloqué ou reste vide,
// sans aucun message : ici, il s'affiche toujours, et les deux boutons agissent pendant le clic (fichier déjà chargé).

type Fichier = { id: string; nom: string };
let afficher: ((f: Fichier) => void) | null = null;

/** Ouvre un fichier joint dans la visionneuse de l'appli (à part si elle n'est pas montée). */
export function voirFichier(id: string, nom: string) {
  if (afficher) afficher({ id, nom });
  else void openFile(id, nom);
}

/** La visionneuse, montée une fois pour toute l'appli (Layout). */
export function Visionneuse() {
  const [f, setF] = useState<Fichier | null>(null);
  useEffect(() => {
    afficher = setF;
    return () => {
      if (afficher === setF) afficher = null;
    };
  }, []);
  return f ? <ApercuFichier key={f.id} id={f.id} nom={f.nom} onClose={() => setF(null)} /> : null;
}

const IMAGE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
/** Ce que la visionneuse sait afficher : PDF (ses pages), photo, sinon rien (à télécharger). */
const genreDe = (b: Blob, nom: string) =>
  estPdf({ mime: b.type, nom }) ? 'pdf' : (b.type.startsWith('image/') && !/svg|hei[cf]/.test(b.type)) || (!b.type.startsWith('image/') && IMAGE.test(nom)) ? 'image' : 'autre';

function ApercuFichier({ id, nom, onClose }: Fichier & { onClose: () => void }) {
  // undefined : en chargement ; null : introuvable.
  const [f, setF] = useState<{ blob: Blob; url: string } | null>();
  const [pages, setPages] = useState<number>();
  useEffect(() => {
    let actif = true;
    let url: string | undefined;
    getFile(id).then(
      (blob) => {
        if (!actif) return;
        if (!blob) return setF(null);
        url = URL.createObjectURL(blob);
        setF({ blob, url });
        if (genreDe(blob, nom) === 'pdf') apercuPdf(id).then((p) => actif && setPages(p?.pages ?? 0));
      },
      () => actif && setF(null),
    );
    return () => {
      actif = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, nom]);
  const genre = f && genreDe(f.blob, nom);

  return createPortal(
    <Modal title={`${docIcon({ kind: 'fichier', mime: f?.blob.type, nom })} ${nom}`} onClose={onClose} wide className="visionneuse">
      {f === undefined ? (
        <p className="muted" role="status">Chargement du fichier…</p>
      ) : f === null ? (
        <p className="error">Fichier introuvable : retiré depuis, pas de connexion, ou pas accessible avec tes droits.</p>
      ) : genre === 'image' ? (
        <div className="visionneuse-image"><img src={f.url} alt={nom} /></div>
      ) : genre === 'pdf' ? (
        pages === undefined ? (
          <p className="muted" role="status">Chargement du PDF…</p>
        ) : pages === 0 ? (
          <p className="error">PDF illisible dans l’appli : télécharge-le pour l’ouvrir.</p>
        ) : (
          <div className="pdf-pages">
            {Array.from({ length: pages }, (_, i) => (
              <PdfPage key={i} id={id} page={i + 1} className="pdf-page" />
            ))}
          </div>
        )
      ) : (
        <p className="muted">Pas d’aperçu dans l’appli pour ce type de fichier ({fmtSize(f.blob.size)}) : « Télécharger » pour l’ouvrir.</p>
      )}
      <div className="modal-foot">
        <button className="btn" disabled={!f} onClick={() => f && ouvrirBlob(f.blob, nom, true)}><Icone n="telecharger" /> Télécharger</button>
        {genre !== 'autre' && <button className="btn" disabled={!f} onClick={() => f && ouvrirBlob(f.blob, nom)}>Ouvrir à part</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>,
    document.body,
  );
}
