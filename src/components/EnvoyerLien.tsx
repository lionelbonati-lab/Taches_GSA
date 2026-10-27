import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useClubOptional } from '../data/club';
import { getMode } from '../data/mode';
import { lienEmail, lienWhatsApp } from '../data/lienPartage';
import { Modal } from './ui';
import { Icone } from './icones';

// Envoyer une tâche ou un sondage par WhatsApp, email ou une autre appli : un court message suivi du lien qui l'ouvre
// dans l'appli. Le message se modifie avant l'envoi ; le lien ne donne aucun accès par lui-même.

const partageSysteme = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Copie dans le presse-papiers (sinon : la zone sélectionnée, copiée à l'ancienne). */
export async function copier(texte: string, zone: HTMLTextAreaElement | HTMLInputElement | null) {
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

/** Bouton « Envoyer un lien » : l'icône de partage seule (à ne pas confondre avec « 🤝 Partager » avec d'autres entités). */
export function EnvoyerLien({ titre, texte, lien, acces }: { titre: string; texte: string; lien: string; acces: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn envoyer-lien" onClick={() => setOuvert(true)} title="Envoyer un lien (WhatsApp, email, autre appli…)" aria-label="Envoyer un lien">
        <Icone n="partager" />
      </button>
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
          <a className="btn primary" href={lienWhatsApp(complet)} target="_blank" rel="noopener noreferrer"><Icone n="message" /> WhatsApp</a>
          {partageSysteme() && <button type="button" className="btn" onClick={autreAppli}><Icone n="partager" /> Autre appli…</button>}
          <a className="btn" href={lienEmail(titre, complet)}><Icone n="email" /> Email</a>
          <button type="button" className="btn" onClick={() => copierVers('message')}>{copie === 'message' ? '✓ Message copié' : <><Icone n="copier" /> Copier le message</>}</button>
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
export function AvisLien({ trouve, nom, introuvable }: { trouve: boolean; nom: string; introuvable: string }) {
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
  // D'une autre de mes entités : ses tâches et ses sondages sont réunis ici (vue « moi »), le temps qu'elle se charge.
  const autre = club && u && u !== club.current.id ? club.units.find((x) => x.id === u && !club.mine.some((m) => m.id === x.id)) : undefined;
  if (!autre && attente) return null;
  return (
    <p className="partage-banner avis-lien" role="status">
      {autre ? <>Ce lien mène à {nom} de « {autre.nom} », une entité dont tu ne fais pas partie.</> : <>{introuvable}</>}
      <button type="button" className="icon-btn" aria-label="Masquer" onClick={() => setFerme(true)}>✕</button>
    </p>
  );
}
