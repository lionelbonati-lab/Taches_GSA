import { useEffect, useRef, type ReactNode } from 'react';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { delaiTarget, fmtDate, fullName, initials, isDone, isLate, offsetLabel, recurrenceLabel } from '../data/utils';
import { cachedLogo, isImage } from '../data/logo';
import { ETATS, chf, genre, genreDe, peutOuvrirTicket } from '../data/paiements';
import { bilanVu, ciblesPourInfo, nbPourInfo, pourMoi, texteVu, vuAvantModif } from '../data/pourInfo';
import { attendusLus } from '../data/suiviPourInfo';
import { nonLus } from '../data/commentaires';
import { Icone, type IconeNom } from './icones';
import { aPrendreOuverte, aPrendrePourMoi, nombreAPrendre, plusPersonne, volontaires } from '../data/aPrendre';

export function Avatar({ id, size = 28 }: { id: string; size?: number }) {
  const { data } = useStore();
  const p = data.people.find((x) => x.id === id);
  return (
    <span className="avatar" title={fullName(p)} style={{ background: p?.couleur ?? '#999', width: size, height: size, fontSize: size * (initials(p).length > 2 ? 0.31 : 0.4) }}>
      {initials(p)}
    </span>
  );
}

/** Pastille d'une personne qui n'est pas dans les données ouvertes (personnes du club). */
export function Initials({ prenom, nom, couleur, size = 28 }: { prenom: string; nom: string; couleur: string; size?: number }) {
  const p = { prenom, nom } as Parameters<typeof initials>[0];
  const txt = initials(p);
  return (
    <span className="avatar" title={`${prenom} ${nom}`.trim()} style={{ background: couleur || '#999', width: size, height: size, fontSize: size * (txt.length > 2 ? 0.31 : 0.4) }}>
      {txt}
    </span>
  );
}

/** Logo du club, sinon l'icône de l'appli ; logo pas encore connu (`src` absent) : le dernier affiché sur cet appareil. */
export function AppLogo({ src, size }: { src?: string | null; size: number }) {
  const logo = isImage(src) ? src : src === undefined ? cachedLogo() : undefined;
  return logo ? (
    <img className="app-logo" src={logo} alt="" style={{ height: size, maxWidth: size * 2.5 }} />
  ) : (
    <img src="./icon.svg" alt="" width={size} height={size} />
  );
}

export function StatusBadge({ task }: { task: Task }) {
  const { data } = useStore();
  const s = data.statuses.find((x) => x.id === task.statusId);
  return (
    <span className="badges">
      <span className="badge" style={{ background: s?.couleur ?? '#999' }}>{s?.label ?? '?'}</span>
      {isLate(data, task) && <span className="badge late">En retard</span>}
    </span>
  );
}

export function Modal({ title, icone, onClose, children, wide, actions, className }: { title: string; icone?: IconeNom; onClose: () => void; children: ReactNode; wide?: boolean; actions?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const all = document.querySelectorAll('.modal-back');
      if (all[all.length - 1] === ref.current) onClose(); // seulement la fenêtre du dessus
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    // Un appui à côté de la fenêtre ne la ferme pas (on perdrait la saisie) : ✕, Annuler / Fermer ou Échap.
    <div ref={ref} className="modal-back">
      <div className={`modal ${wide ? 'wide' : ''} ${className ?? ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{icone && <><Icone n={icone} /> </>}{title}</h2>
          {actions && <span className="modal-actions">{actions}</span>}
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Petit repère (icône dessinée) : tâche récurrente. */
export function RecurIcon({ task }: { task: Task }) {
  return task.recurrence ? <span className="ticon" title={`Tâche récurrente : ${recurrenceLabel(task.recurrence).toLowerCase()}`}><Icone n="repetition" /></span> : null;
}

export function LinkIcon({ task }: { task: Task }) {
  const { data } = useStore();
  const target = delaiTarget(data, task);
  if (!target || !task.delaiRef) return null;
  return <span className="ticon" title={`${offsetLabel(task.delaiRef)} « ${target.nom} » (${fmtDate(target.date)})`}><Icone n="epingle" /></span>;
}

export function DocPollIcons({ task }: { task: Task }) {
  const { data, user, discussionLueLe } = useStore();
  const n = task.documents?.length ?? 0;
  const polls = (data.polls ?? []).filter((p) => p.taskId === task.id).length;
  const emails = (data.emails ?? []).filter((e) => e.taskId === task.id && e.statut === 'programme').length;
  // Discussion : bulle s'il y a des messages, avec le nombre de ceux pas encore lus.
  const msgs = task.commentaires?.length ?? 0;
  const nl = user && msgs ? nonLus(task.commentaires, discussionLueLe(task.id), user.id) : 0;
  return (
    <>
      {msgs > 0 && (
        <span className={`ticon discussion-tag${nl ? ' nonlu' : ''}`} title={`Discussion : ${msgs} message${msgs > 1 ? 's' : ''}${nl ? `, ${nl} non lu${nl > 1 ? 's' : ''}` : ''}`}>
          <Icone n="message" />
          {nl > 0 && <span className="pastille-nonlu">{nl}</span>}
        </span>
      )}
      {task.paiement && <span className="ticon" title={genre(task.paiement).nom}><Icone n={genreDe(task.paiement)} /></span>}
      {n > 0 && <span className="ticon" title={`${n} document(s)`}><Icone n="fichier" />{n > 1 ? n : ''}</span>}
      {polls > 0 && <span className="ticon" title="Sondage rattaché"><Icone n="sondage" /></span>}
      {emails > 0 && <span className="ticon" title={`${emails} email(s) programmé(s)`}><Icone n="email" /></span>}
    </>
  );
}

/** Remboursement / paiement : montant et étape du circuit, dans les listes de tâches. */
/** Étiquettes de la tâche (événement, groupe…), à leur couleur. */
export function EtiquettesTag({ task }: { task: Task }) {
  const { data } = useStore();
  const liste = (task.etiquettes ?? []).map((id) => data.etiquettes?.find((e) => e.id === id)).filter((e) => !!e);
  if (!liste.length) return null;
  return (
    <span className="etiquettes-tag">
      {liste.map((e) => (
        <span key={e.id} className="badge etiquette" style={{ background: e.couleur }} title={`Étiquette « ${e.nom} »`}>
          {e.nom}
        </span>
      ))}
    </span>
  );
}

export function TicketTag({ task }: { task: Task }) {
  const { data, user } = useStore();
  const p = task.paiement;
  if (!p) return null;
  const ferme = !peutOuvrirTicket(data, task, user?.id);
  return (
    <small className={`ticket-tag ticket-etat ${p.etat}`} title={`${genre(p).nom} · ${ETATS[p.etat].label}${ferme ? ' · réservé à la caisse, au demandeur et à la personne qui vise' : ''}`}>
      {ferme && <><Icone n="verrou" /> </>}{chf(p.montant)} · {ETATS[p.etat].icon} {ETATS[p.etat].court}
    </small>
  );
}

/**
 * « Pour info » : la tâche est montrée à la personne connectée (✏️ À revoir : modifiée depuis son « ✓ Vu »), ou à des
 * personnes : combien l'ont vue sur combien (noms au survol ; personnes attendues, 052, si la page les a lues).
 */
export function PourInfoTag({ task }: { task: Task }) {
  const { data, user } = useStore();
  const n = nbPourInfo(task.pourInfo);
  if (!n || task.paiement) return null;
  const noms = ciblesPourInfo(task.pourInfo, data.people).map((c) => c.texte).join(', ');
  if (pourMoi(task, user?.id)) {
    if (user && vuAvantModif(task.pourInfoVus?.[`p:${user.id}`], task))
      return <span className="badge pour-info revoir" title={`Elle a changé depuis ton « ✓ Vu » · pour info : ${noms}`}>✏️ À revoir</span>;
    return <span className="badge pour-info" title={`On te tient au courant, sans que tu t'en occupes · pour info : ${noms}`}><Icone n="voir" /> Pour info</span>;
  }
  const b = bilanVu(task, attendusLus(task));
  const vu = texteVu(b);
  return (
    <span className="badge pour-info" title={`Pour info : ${noms}${vu ? ` · ${vu}` : ''}`}>
      <Icone n="voir" /> {b.total ? `${b.n}/${b.total}` : n}
    </span>
  );
}

/** Tâche à prendre, encore ouverte : « À prendre » (avec les places prises s'il faut plusieurs personnes). */
export function APrendreTag({ task }: { task: Task }) {
  const { data, user } = useStore();
  if (!aPrendreOuverte(task) || isDone(data, task)) return null;
  const n = nombreAPrendre(task.aPrendre);
  const nom = (id: string) => fullName(data.people.find((p) => p.id === id));
  const noms = task.aPrendre!.personnes.map(nom).join(', ');
  const refus = task.aPrendre!.refus ?? [];
  const titre = aPrendrePourMoi(task, user?.id)
    ? 'On te la propose : ouvre-la et clique « Je m’en charge »'
    : `Proposée à ${noms} : la première qui clique « Je m’en charge » s’en occupe${refus.length ? `. Pas dispo : ${refus.map(nom).join(', ')}` : ''}`;
  // Toutes les personnes proposées ont répondu « Pas dispo » (ou pris les places) : à proposer à d'autres.
  const personne = plusPersonne(task);
  return (
    <span className={`badge a-prendre${personne ? ' personne' : ''}`} title={personne ? `${titre}. Plus personne n’a à répondre : propose-la à d’autres.` : titre}>
      <Icone n={personne ? 'refuser' : 'main'} /> {personne ? 'Personne de dispo' : 'À prendre'}{n > 1 ? ` ${volontaires(task).length}/${n}` : ''}
    </span>
  );
}

export function Toast() {
  const { toast, setToast } = useStore();
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast, setToast]);
  return toast ? <div className="toast" role="status" onClick={() => setToast(null)}>{toast}</div> : null;
}
