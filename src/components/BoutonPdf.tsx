import { useState, type RefObject } from 'react';
import { useStore } from '../data/store';
import { fullName } from '../data/utils';
import { nomAppli } from '../data/nomAppli';
import type { StyleDocs } from '../data/types';

export interface OptionsPdf {
  titre: string;
  paysage?: boolean;
  margesMm: number;
  police?: StyleDocs['police'];
  auteur?: string;
}

/**
 * Crée le PDF d'un document, puis le télécharge (ou le partage sur téléphone). `el` : la feuille du document (.pv-sheet),
 * ou un élément qui la contient. Faux si la feuille est introuvable ; une erreur de création remonte.
 */
export async function pdfDeFeuille(el: HTMLElement | null, o: OptionsPdf): Promise<boolean> {
  const sheet = el?.classList.contains('pv-sheet') ? el : el?.querySelector<HTMLElement>('.pv-sheet');
  if (!sheet) return false;
  const { creerPdf, enregistrerPdf } = await import('../data/pdfDoc');
  const blob = await creerPdf(sheet, { ...o, createur: nomAppli() });
  await enregistrerPdf(blob, o.titre);
  return true;
}

/**
 * Bouton « 📄 PDF » d'un document (ordre du jour, PV, archive) : le PDF est créé dans l'appli, liens cliquables, puis
 * téléchargé (ou partagé sur téléphone). `feuille` : la feuille du document (.pv-sheet), ou un élément qui la contient.
 */
export function BoutonPdf({ feuille, titre, paysage, margesMm, police, className = 'btn', disabled }: {
  feuille: RefObject<HTMLElement | null>;
  titre: string;
  paysage?: boolean;
  margesMm: number;
  police?: StyleDocs['police'];
  className?: string;
  disabled?: boolean;
}) {
  const { user, setToast } = useStore();
  const [enCours, setEnCours] = useState(false);
  const creer = async () => {
    setEnCours(true);
    try {
      await pdfDeFeuille(feuille.current, { titre, paysage, margesMm, police, auteur: user ? fullName(user) : undefined });
    } catch (e) {
      console.error(e);
      // Détail technique en fin de message : à transmettre pour trouver la cause.
      const detail = e instanceof Error ? e.message : String(e);
      setToast(`⚠️ Le PDF n’a pas pu être créé : utilise « Imprimer », puis « Enregistrer en PDF ».${detail ? ` (Détail : ${detail.slice(0, 160)})` : ''}`);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <button className={className} onClick={creer} disabled={disabled || enCours} title="PDF créé par l’appli : liens cliquables, prêt à envoyer">
      {enCours ? '⏳ Création du PDF…' : '📄 PDF'}
    </button>
  );
}
