import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDiscussions, type DiscussionVue } from '../data/discussions';
import { PageIntro } from '../components/Nav';
import { Discussion, quandMessage } from '../components/tache/Discussion';
import { Empty, Modal } from '../components/ui';
import { Icone } from '../components/icones';

// Onglet « Messages » : les discussions des tâches comme une messagerie. Chaque discussion reste celle de sa tâche (même
// fenêtre que la bulle 💬 de la fiche) ; « Nouvelle discussion » en ouvre une sur une tâche qui n'en a pas encore.

type Filtre = 'toutes' | 'nonlues';

const norme = (s: string) => s.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '');
const cherche = (q: string, ...textes: (string | undefined)[]) => {
  const m = norme(q.trim());
  return !m || textes.some((t) => !!t && norme(t).includes(m));
};

export function Messages() {
  const { toutes, nonLus } = useDiscussions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [q, setQ] = useState('');
  const [nouvelle, setNouvelle] = useState(false);
  // Discussion ouverte : dans l'adresse (?d=…), pour que « retour » du téléphone la ferme.
  const ouverte = params.get('d');
  const ouvrir = (cle: string | null) => setParams(cle ? { d: cle } : {}, { replace: !cle });
  const chat = ouverte ? toutes.find((d) => d.cle === ouverte) : undefined;

  const avecMessages = toutes.filter((d) => d.liste.length).sort((a, b) => b.dernier.localeCompare(a.dernier));
  const liste = avecMessages.filter((d) => (filtre === 'toutes' || d.nonLus > 0) && cherche(q, d.titre, d.entite, ...d.liste.map((c) => c.texte), ...d.liste.map((c) => c.nom)));

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Messages {nonLus > 0 && <span className="count nonlus" title="Messages non lus">{nonLus}</span>}</h1>
        <button className="btn primary toujours" onClick={() => setNouvelle(true)}><Icone n="message" /> Nouvelle discussion</button>
      </div>
      <PageIntro />
      <div className="messages-outils">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Rechercher une tâche, un message…" aria-label="Rechercher dans les messages" />
        <div className="seg">
          <button className={filtre === 'toutes' ? 'on' : ''} onClick={() => setFiltre('toutes')}>Toutes</button>
          <button className={filtre === 'nonlues' ? 'on' : ''} onClick={() => setFiltre('nonlues')}>Non lues{nonLus ? ` (${avecMessages.filter((d) => d.nonLus).length})` : ''}</button>
        </div>
      </div>
      {liste.length ? (
        <ul className="messages-liste">
          {liste.map((d) => <LigneDiscussion key={d.cle} d={d} onOpen={() => ouvrir(d.cle)} />)}
        </ul>
      ) : (
        <Empty>
          {q.trim() ? 'Aucune discussion ne correspond.' : filtre === 'nonlues' ? 'Tout est lu.' : 'Aucune discussion pour l’instant. « Nouvelle discussion », ou la bulle 💬 d’une tâche, en lance une.'}
        </Empty>
      )}
      {chat && (
        <Discussion
          titre={chat.titre}
          liste={chat.liste}
          cle={chat.cle}
          tacheId={chat.tacheId}
          uniteId={chat.uniteId}
          onClose={() => ouvrir(null)}
          actions={
            <button type="button" className="icon-btn" title="Ouvrir la tâche" aria-label="Ouvrir la tâche" onClick={() => navigate(chat.lien)}>
              <Icone n="taches" />
            </button>
          }
        />
      )}
      {nouvelle && (
        <ChoixTache
          taches={toutes.filter((d) => !d.terminee)}
          onClose={() => setNouvelle(false)}
          onChoix={(cle) => {
            setNouvelle(false);
            ouvrir(cle);
          }}
        />
      )}
    </div>
  );
}

/** Une discussion de la liste : initiale de la tâche, titre, dernier message, moment et non lus. */
function LigneDiscussion({ d, onOpen }: { d: DiscussionVue; onOpen: () => void }) {
  const der = d.liste.reduce((m, c) => (c.le > m.le ? c : m), d.liste[0]);
  return (
    <li>
      <button type="button" className={`messages-ligne${d.nonLus ? ' nonlu' : ''}`} onClick={onOpen}>
        <span className="messages-avatar" aria-hidden="true">{d.titre.trim().charAt(0).toUpperCase() || '?'}</span>
        <span className="messages-corps">
          <span className="messages-haut">
            <span className="messages-titre">{d.titre}</span>
            <small className="messages-quand">{quandMessage(der.le)}</small>
          </span>
          <span className="messages-bas">
            <span className="messages-apercu">
              {d.entite && <span className="tsource">{d.entite}</span>} <b>{der.nom.split(' ')[0]}</b> : {der.texte}
            </span>
            {d.nonLus > 0 && <span className="messages-nb" aria-label={`${d.nonLus} non lu${d.nonLus > 1 ? 's' : ''}`}>{d.nonLus}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Nouvelle discussion : choisir la tâche (en cours) dont on ouvre la discussion. */
function ChoixTache({ taches, onChoix, onClose }: { taches: DiscussionVue[]; onChoix: (cle: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const liste = taches.filter((d) => cherche(q, d.titre, d.entite)).sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  return (
    <Modal title="Nouvelle discussion" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>Sur quelle tâche ? Les personnes concernées par la tâche seront prévenues de ton message.</p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Titre de la tâche…" aria-label="Chercher une tâche" autoFocus />
      <ul className="messages-choix">
        {liste.slice(0, 60).map((d) => (
          <li key={d.cle}>
            <button type="button" onClick={() => onChoix(d.cle)}>
              <span>{d.titre}</span>
              {d.entite && <span className="tsource">{d.entite}</span>}
              {d.liste.length > 0 && <small className="muted"><Icone n="message" /> {d.liste.length}</small>}
            </button>
          </li>
        ))}
        {!liste.length && <li className="muted">Aucune tâche en cours ne correspond.</li>}
      </ul>
    </Modal>
  );
}
