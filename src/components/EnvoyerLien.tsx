import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useClubOptional } from '../data/club';
import { getMode } from '../data/mode';
import { lienEmail, lienWhatsApp } from '../data/lienPartage';
import { Modal } from './ui';

// Envoyer une tâche ou un sondage par WhatsApp, email ou une autre appli : un court message suivi du lien qui l'ouvre
// dans l'appli. Le message se modifie avant l'envoi ; le lien ne donne aucun accès par lui-même.

const partageSysteme = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

async function copier(texte: string, zone: HTMLTextAreaElement | HTMLInputElement | null) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    // Navigateur sans presse-papiers (ancienne version, page non sécurisée) : copie de la zone sélectionnée.
    if (!zone) return false;
    zone.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

/** Icône « partager » (trois points reliés), de la couleur du texte. */
export function IconePartage() {
  return (
    <svg className="icone-partage" viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" focusable="false">
      <path d="M17.2 6.4 6.8 12l10.4 5.6" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="18" cy="5" r="3.4" fill="currentColor" />
      <circle cx="6" cy="12" r="3.4" fill="currentColor" />
      <circle cx="18" cy="19" r="3.4" fill="currentColor" />
    </svg>
  );
}

/** Bouton « Envoyer un lien » (icône de partage ; à ne pas confondre avec « 🤝 Partager » avec d'autres entités) ; `icone` : l'icône seule (en-tête d'une fenêtre). */
export function EnvoyerLien({ titre, texte, lien, acces, icone }: { titre: string; texte: string; lien: string; acces: string; icone?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const aide = 'Envoyer un lien (WhatsApp, email, autre appli…)';
  return (
    <>
      {icone ? (
        <button type="button" className="icon-btn envoyer-lien" onClick={() => setOuvert(true)} title={aide} aria-label="Envoyer un lien">
          <IconePartage />
        </button>
      ) : (
        <button type="button" className="btn small envoyer-lien" onClick={() => setOuvert(true)} title={aide}>
          <IconePartage /> Envoyer un lien
        </button>
      )}
      {ouvert && <FenetreLien titre={titre} texte={texte} lien={lien} acces={acces} onClose={() => setOuvert(false)} />}
    </>
  );
}

function FenetreLien({ titre, texte, lien, acces, onClose }: { titre: string; texte: string; lien: string; acces: string; onClose: () => void }) {
  const [msg, setMsg] = useState(texte);
  const [copie, setCopie] = useState<'' | 'message' | 'lien' | 'erreur'>('');
  const zone = useRef<HTMLTextAreaElement>(null);
  const champLien = useRef<HTMLInputElement>(null);
  // Le lien suit toujours le message (s'il a été effacé du texte, il est remis à la fin).
  const complet = `${msg.trim()}\n${lien}`.trim();
  const demo = getMode() === 'demo';

  const copierVers = async (quoi: 'message' | 'lien') => {
    const ok = await copier(quoi === 'lien' ? lien : complet, quoi === 'lien' ? champLien.current : zone.current);
    setCopie(ok ? quoi : 'erreur');
  };
  const autreAppli = async () => {
    try {
      await navigator.share({ title: titre, text: complet });
    } catch {
      /* fenêtre de partage fermée */
    }
  };

  return (
    <Modal title="Envoyer un lien" onClose={onClose}>
      <div className="form envoyer">
        <label className="full">
          Message
          <textarea ref={zone} rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </label>
        <p className="full lien-apercu">
          <span>🔗</span>
          <input ref={champLien} readOnly value={lien} aria-label="Lien" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn small" onClick={() => copierVers('lien')}>{copie === 'lien' ? '✓ Copié' : 'Copier le lien'}</button>
        </p>
        <div className="full envoyer-choix">
          <a className="btn primary" href={lienWhatsApp(complet)} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
          {partageSysteme() && <button type="button" className="btn" onClick={autreAppli}><IconePartage /> Autre appli…</button>}
          <a className="btn" href={lienEmail(titre, complet)}>✉ Email</a>
          <button type="button" className="btn" onClick={() => copierVers('message')}>{copie === 'message' ? '✓ Message copié' : '📋 Copier le message'}</button>
        </div>
        {copie === 'erreur' && <p className="full small-note" role="status">Copie impossible ici : sélectionne le texte et copie-le à la main.</p>}
        <p className="full small-note">
          🔒 {acces}
          {demo && ' Démo : les données restent dans ce navigateur, le lien n’ouvre donc l’élément que sur cet appareil.'}
        </p>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

/**
 * Lien reçu (WhatsApp…) qui ne mène à rien ici : élément d'une autre entité, supprimé, ou que le rôle ne permet pas
 * de voir. Les éléments partagés par d'autres entités arrivent après l'ouverture : on attend un peu avant de le dire.
 */
export function AvisLien({ trouve, nom, introuvable, chemin }: { trouve: boolean; nom: string; introuvable: string; chemin: string }) {
  const club = useClubOptional();
  const [params] = useSearchParams();
  const u = params.get('u');
  const [attente, setAttente] = useState(true);
  const [ferme, setFerme] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setAttente(false), 5000);
    return () => clearTimeout(id);
  }, []);
  if (trouve || ferme) return null;
  const autre = club && u && u !== club.current.id ? club.units.find((x) => x.id === u) : undefined;
  if (!autre && attente) return null;
  const membre = !!autre && !!club?.mine.some((x) => x.id === autre.id);
  return (
    <p className="partage-banner avis-lien" role="status">
      {autre ? (
        membre ? (
          <>Ce lien mène à {nom} de « {autre.nom} ». <button type="button" className="btn small" onClick={() => club?.switchUnit(autre.id, `#${chemin}`)}>Ouvrir « {autre.nom} »</button></>
        ) : (
          <>Ce lien mène à {nom} de « {autre.nom} », une entité dont tu ne fais pas partie.</>
        )
      ) : (
        <>{introuvable}</>
      )}
      <button type="button" className="icon-btn" aria-label="Masquer" onClick={() => setFerme(true)}>✕</button>
    </p>
  );
}
