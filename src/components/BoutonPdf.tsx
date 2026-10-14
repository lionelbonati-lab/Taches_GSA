import { useState, type RefObject } from 'react';
import { useStore } from '../data/store';
import { fullName } from '../data/utils';
import { nomAppli } from '../data/nomAppli';
import type { StyleDocs } from '../data/types';

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
    const el = feuille.current;
    const sheet = el?.classList.contains('pv-sheet') ? el : el?.querySelector<HTMLElement>('.pv-sheet');
    if (!sheet) return;
    setEnCours(true);
    try {
      const { creerPdf, enregistrerPdf } = await import('../data/pdfDoc');
      const blob = await creerPdf(sheet, { titre, paysage, margesMm, police, auteur: user ? fullName(user) : undefined, createur: nomAppli() });
      await enregistrerPdf(blob, titre);
    } catch (e) {
      console.error(e);
      setToast('⚠️ Le PDF n’a pas pu être créé : utilise « Imprimer », puis « Enregistrer en PDF ».');
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
