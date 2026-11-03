import { useEffect, useState } from 'react';
import { apercuPdf, type PagePdf } from '../data/pdf';

// PDF joints affichés dans l'appli (miniature, pages dans la visionneuse, bon de paiement) : sur téléphone, surtout
// dans l'appli installée, un PDF ouvert « à part » ne s'affiche pas toujours.

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
