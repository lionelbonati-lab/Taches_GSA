import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { titreAvecEtiquettes, useDiscussions, type DiscussionVue } from '../data/discussions';
import { PageIntro } from '../components/Nav';
import { Discussion, quandMessage } from '../components/tache/Discussion';
import { Empty, Modal } from '../components/ui';
import { Icone } from '../components/icones';
import { BadgeEtiquette, IconeEtiquette } from '../components/IconesEtiquette';

// Onglet « Messages » : les discussions des tâches comme une messagerie. Chaque discussion reste celle de sa tâche (même
// fenêtre que la bulle 💬 de la fiche) ; « Nouvelle discussion » en ouvre une sur une tâche qui n'en a pas encore.

type Filtre = 'toutes' | 'nonlues';

const norme = (s: string) => s.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '');
const cherche = (q: string, ...textes: (string | undefined)[]) => {
  const m = norme(q.trim());
  return !m || textes.some((t) => !!t && norme(t).includes(m));
};

/** La discussion d'une clé : la tâche (ancien lien : « x:<entité>:<tâche> »). */
const trouver = (toutes: DiscussionVue[], cle: string) => toutes.find((d) => d.cle === cle) ?? toutes.find((d) => cle.endsWith(`:${d.cle}`));

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
  const chat = ouverte ? trouver(toutes, ouverte) : undefined;

  const avecMessages = toutes.filter((d) => d.liste.length).sort((a, b) => b.dernier.localeCompare(a.dernier));
  const liste = avecMessages.filter((d) => (filtre === 'toutes' || d.nonLus > 0) && cherche(q, d.titre, ...d.etiquettes.map((e) => e.nom), ...d.liste.map((c) => c.texte), ...d.liste.map((c) => c.nom)));

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Messages {nonLus > 0 && <span className="count nonlus" title="Messages non lus">{nonLus}</span>}</h1>
        <button className="btn primary toujours" onClick={() => setNouvelle(true)}><Icone n="message" /> Nouvelle discussion</button>
      </div>
      <PageIntro />
      <div className="messages-outils">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Rechercher un point, un message…" aria-label="Rechercher dans les messages" />
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
          {q.trim() ? 'Aucune discussion ne correspond.' : filtre === 'nonlues' ? 'Tout est lu.' : 'Aucune discussion pour l’instant. « Nouvelle discussion », ou la bulle 💬 d’un point, en lance une.'}
        </Empty>
      )}
      {chat && (
        <Discussion
          titre={titreAvecEtiquettes(chat)}
          liste={chat.liste}
          tacheId={chat.cle}
          etiquette={chat.etiquette}
          onClose={() => ouvrir(null)}
          actions={
            <button type="button" className="icon-btn" title={chat.etiquette ? 'Les points de l’étiquette' : 'Ouvrir le point'} aria-label={chat.etiquette ? 'Les points de l’étiquette' : 'Ouvrir le point'} onClick={() => navigate(chat.lien)}>
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
        {d.etiquette ? (
          <span className="messages-avatar" style={{ background: d.etiquette.couleur, color: '#fff' }} aria-hidden="true"><IconeEtiquette e={d.etiquette} /></span>
        ) : (
          <span className="messages-avatar" aria-hidden="true">{d.titre.trim().charAt(0).toUpperCase() || '?'}</span>
        )}
        <span className="messages-corps">
          <span className="messages-haut">
            <span className="messages-titre">
              {d.titre}
              {d.etiquettes.length > 0 && <span className="messages-etiquettes">{d.etiquettes.map((e) => <BadgeEtiquette key={e.id} e={e} />)}</span>}
            </span>
            <small className="messages-quand">{quandMessage(der.le)}</small>
          </span>
          <span className="messages-bas">
            <span className="messages-apercu">
              <b>{der.nom.split(' ')[0]}</b> : {der.texte}
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
  const liste = taches.filter((d) => cherche(q, d.titre, ...d.etiquettes.map((e) => e.nom))).sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  return (
    <Modal title="Nouvelle discussion" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Sur quel point, ou avec quelle étiquette (toute la manifestation, tout le groupe) ? Les personnes concernées seront prévenues de ton message.
      </p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Titre du point, étiquette…" aria-label="Chercher un point" autoFocus />
      <ul className="messages-choix">
        {liste.filter((d) => d.etiquette).map((d) => (
          <li key={d.cle}>
            <button type="button" onClick={() => onChoix(d.cle)}>
              <span><span className="badge etiquette" style={{ background: d.etiquette!.couleur }}><IconeEtiquette e={d.etiquette!} /> {d.titre}</span></span>
              {d.liste.length > 0 && <small className="muted"><Icone n="message" /> {d.liste.length}</small>}
            </button>
          </li>
        ))}
        {liste.filter((d) => !d.etiquette).slice(0, 60).map((d) => (
          <li key={d.cle}>
            <button type="button" onClick={() => onChoix(d.cle)}>
              <span>
                {d.titre}
                {d.etiquettes.length > 0 && <span className="messages-etiquettes">{d.etiquettes.map((e) => <BadgeEtiquette key={e.id} e={e} />)}</span>}
              </span>
              {d.liste.length > 0 && <small className="muted"><Icone n="message" /> {d.liste.length}</small>}
            </button>
          </li>
        ))}
        {!liste.length && <li className="muted">Aucun point en cours ne correspond.</li>}
      </ul>
    </Modal>
  );
}
