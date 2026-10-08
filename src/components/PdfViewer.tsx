import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { openFile } from '../data/files';
import { apercuPdf, type PagePdf } from '../data/pdf';
import { Modal } from './ui';

// PDF joints affichés dans l'appli (miniature, aperçu des pages, bon de paiement) : sur téléphone, surtout dans
// l'appli installée, un PDF ouvert « à part » ne s'affiche pas toujours.

/** Une page d'un PDF joint, en image ; 📕 tant qu'elle se charge ou s'il est illisible. */
export function PdfPage({ id, page = 1, className = 'doc-thumb pdf', onLoad }: { id: string; page?: number; className?: string; onLoad?: (img: HTMLImageElement, p: PagePdf) => void }) {
  const [p, setP] = useState<PagePdf | null>();
  useEffect(() => {
    let actif = true;
    setP(undefined);
    apercuPdf(id, page).then((x) => actif && setP(x));
    return () => {
      actif = false;
    };
  }, [id, page]);
  if (!p) return <span className={`doc-icon ${p === undefined ? 'chargement' : ''}`} title={p === null ? 'PDF illisible ou introuvable' : 'Chargement…'}>📕</span>;
  return <img className={className} src={p.url} alt={`Page ${page}`} draggable={false} onLoad={(e) => onLoad?.(e.currentTarget, p)} />;
}

/** Aperçu d'un PDF joint : toutes ses pages, l'une sous l'autre. */
export function PdfApercu({ id, nom, onClose }: { id: string; nom: string; onClose: () => void }) {
  const [pages, setPages] = useState<number>();
  const [err, setErr] = useState('');
  useEffect(() => {
    apercuPdf(id).then((p) => setPages(p?.pages ?? 0));
  }, [id]);
  const ouvrir = async (telecharger: boolean) => setErr((await openFile(id, nom, telecharger)) ? '' : 'Fichier introuvable (vérifie la connexion).');
  return createPortal(
    <Modal title={`📕 ${nom}`} onClose={onClose} wide>
      {pages === undefined ? (
        <p className="muted">Chargement du PDF…</p>
      ) : pages === 0 ? (
        <p className="error">PDF illisible ou introuvable : télécharge-le pour l’ouvrir.</p>
      ) : (
        <div className="pdf-pages">
          {Array.from({ length: pages }, (_, i) => (
            <PdfPage key={i} id={id} page={i + 1} className="pdf-page" />
          ))}
        </div>
      )}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <button className="btn" onClick={() => ouvrir(true)}>⬇️ Télécharger</button>
        <button className="btn" onClick={() => ouvrir(false)}>Ouvrir à part</button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>,
    document.body,
  );
}
