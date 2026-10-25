import { useEffect, useState, type RefObject } from 'react';
import { useStore } from '../data/store';
import { fullName } from '../data/utils';
import { nomAppli } from '../data/nomAppli';
import type { StyleDocs } from '../data/types';
import { Icone } from './icones';
import { MESSAGE_MISE_A_JOUR, moduleIntrouvable } from '../pwa';

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
 * Bouton « PDF » d'un document (ordre du jour, PV, archive) : le PDF est créé dans l'appli, liens cliquables, puis
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
      if (moduleIntrouvable(e)) return setToast(`⚠️ ${MESSAGE_MISE_A_JOUR}`);
      setToast(`⚠️ Le PDF n’a pas pu être créé : utilise « Imprimer », puis « Enregistrer en PDF ».${detail ? ` (Détail : ${detail.slice(0, 160)})` : ''}`);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <button className={className} onClick={creer} disabled={disabled || enCours} title="PDF créé par l’appli : liens cliquables, prêt à envoyer">
      {enCours ? <><Icone n="attente" /> Création du PDF…</> : <><Icone n="pdf" /> PDF</>}
    </button>
  );
}

/** Marges de page à l'impression (@bottom-left…) : Chromium 131 et plus (Chrome, Edge, navigateur d'Android). */
function margesDePage() {
  const nav = navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[] } };
  const b = nav.userAgentData?.brands.find((x) => x.brand === 'Chromium');
  return !!b && Number(b.version) >= 131;
}

/**
 * Impression d'un document : le pied de page (« Document généré le… ») va dans la marge du bas de chaque page, à
 * gauche du numéro, comme dans le PDF de l'appli : il ne fait jamais une page à lui seul. Ailleurs que dans Chromium
 * (marges de page non gérées), il reste à la fin du document. `feuille` : la feuille, ou un élément qui la contient.
 */
export function usePiedImprime(feuille: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!margesDePage()) return;
    let style: HTMLStyleElement | null = null;
    const apres = () => {
      style?.remove();
      style = null;
      document.body.classList.remove('pied-en-marge');
    };
    const avant = () => {
      apres();
      const pied = feuille.current?.querySelector<HTMLElement>('.pv-foot');
      const texte = pied?.textContent?.replace(/\s+/g, ' ').trim();
      if (!pied || !texte) return;
      const cs = getComputedStyle(pied);
      style = document.createElement('style');
      style.textContent = `@page { @bottom-left { content: "${texte.replace(/[\\"]/g, '\\$&')}"; font-family: ${cs.fontFamily}; font-size: ${cs.fontSize}; font-weight: ${cs.fontWeight}; font-style: ${cs.fontStyle}; text-transform: ${cs.textTransform}; color: ${cs.color}; } @bottom-right { content: counter(page) " / " counter(pages); font-family: ${cs.fontFamily}; font-size: 9pt; color: #666; } }`;
      document.head.appendChild(style);
      document.body.classList.add('pied-en-marge');
    };
    window.addEventListener('beforeprint', avant);
    window.addEventListener('afterprint', apres);
    return () => {
      window.removeEventListener('beforeprint', avant);
      window.removeEventListener('afterprint', apres);
      apres();
    };
  }, [feuille]);
}
