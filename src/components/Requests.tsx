import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { useClub } from '../data/club';
import type { MyRequest, Task } from '../data/types';
import { fmtDate, fullName, isDone } from '../data/utils';
import { Empty, Modal } from './ui';
import { TaskCard } from '../pages/Tasks';

// Demandes au comité central : une entité (sous-comité, groupe, équipe) lui envoie une tâche,
// puis en suit l'avancement ; le comité central la reçoit dans ses tâches, sans responsable.

/** Accueil d'une entité : ses demandes au comité central et leur suivi. */
export function OutgoingRequests() {
  const club = useClub();
  const { setToast } = useStore();
  const [list, setList] = useState<MyRequest[] | null>(null);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState(false);
  const [all, setAll] = useState(false);
  const { myRequests } = club;
  const load = useCallback(() => {
    myRequests()
      .then((r) => {
        setList(r);
        setErr('');
      })
      .catch((e: Error) => setErr(e.message));
  }, [myRequests]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [club.current.id]);
  if (!club.central) return null;
  const open = (list ?? []).filter((r) => !r.termine && !r.supprimee);
  const shown = all ? list ?? [] : open.slice(0, 5);
  return (
    <>
      <h2 className="with-action">
        📨 Demandes au comité central
        <button className="btn small primary" onClick={() => setAsking(true)}>+ Demande</button>
      </h2>
      {err && <p className="error">{err}</p>}
      {list === null && !err ? (
        <p className="muted">Chargement…</p>
      ) : shown.length ? (
        shown.map((r) => (
          <div key={r.id} className={`panel request ${r.termine || r.supprimee ? 'done' : ''}`}>
            <span className="request-top">
              <strong>{r.titre}</strong>
              {r.supprimee ? <span className="badge" style={{ background: '#64748b' }}>Retirée</span> : <span className="badge" style={{ background: r.couleur }}>{r.statut}</span>}
            </span>
            <small className="muted">
              Envoyée le {fmtDate(r.le.slice(0, 10))} par {r.par}
              {r.delai && ` · délai ${fmtDate(r.delai)}`}
              {` · ${r.responsables.length ? `pris en charge par ${r.responsables.join(', ')}` : 'pas encore attribuée'}`}
            </small>
          </div>
        ))
      ) : (
        <Empty>{list?.length ? 'Toutes vos demandes sont traitées.' : 'Besoin du comité central ? Envoie-lui une demande : elle arrive dans ses tâches.'}</Empty>
      )}
      {!!list?.length && list.length !== open.length && (
        <button className="btn link small" onClick={() => setAll(!all)}>{all ? 'Seulement les demandes en cours' : `Voir aussi les ${list.length - open.length} traitées`}</button>
      )}
      {asking && (
        <RequestModal
          onClose={() => setAsking(false)}
          onSent={(titre) => {
            setAsking(false);
            setToast(`📨 Demande « ${titre} » envoyée au comité central`);
            load();
          }}
        />
      )}
    </>
  );
}

function RequestModal({ onClose, onSent }: { onClose: () => void; onSent: (titre: string) => void }) {
  const club = useClub();
  const { user } = useStore();
  const sections = club.central?.sections ?? [];
  const [titre, setTitre] = useState('');
  const [remarque, setRemarque] = useState('');
  const [delai, setDelai] = useState('');
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    if (!titre.trim()) return setErr('Indique ce que le comité central doit faire.');
    setBusy(true);
    setErr('');
    try {
      await club.proposeTask({ titre: titre.trim(), remarque: remarque.trim(), delai, sectionId, par: fullName(user ?? undefined) });
      onSent(titre.trim());
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Demande au comité central" onClose={onClose}>
      <div className="form">
        <label className="full">
          Demande
          <input autoFocus value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Valider le budget, réserver la salle, commander des maillots…" />
        </label>
        <label className="full">
          Détails
          <textarea rows={3} value={remarque} onChange={(e) => setRemarque(e.target.value)} placeholder="Contexte, montants, contacts… (facultatif)" />
        </label>
        <label>
          Pour quand ?
          <input type="date" value={delai} onChange={(e) => setDelai(e.target.value)} />
        </label>
        {sections.length > 0 && (
          <label>
            Section du comité central
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="muted small-note">
        La demande arrive dans les tâches du comité central, au nom de « {club.current.nom} ». Tu en suis l’avancement ici ; le reste de vos tâches reste invisible pour lui.
      </p>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy} onClick={send}>{busy ? 'Envoi…' : 'Envoyer'}</button>
      </div>
    </Modal>
  );
}

/** Demandes reçues des autres entités, pas encore attribuées. */
export const pendingRequests = (tasks: Task[], done: (t: Task) => boolean) => tasks.filter((t) => t.proposee && !t.responsables.length && !done(t));

/** Accueil du comité central : demandes reçues à attribuer. */
export function IncomingRequests({ onOpen }: { onOpen: (t: Task) => void }) {
  const { data, saveTask, can } = useStore();
  const list = pendingRequests(data.tasks, (t) => isDone(data, t)).filter((t) => can('tasks.createAny', t.sectionId)).sort((a, b) => b.proposee!.le.localeCompare(a.proposee!.le));
  if (!list.length) return null;
  return (
    <>
      <h2>📨 Demandes reçues <span className="count">{list.length}</span></h2>
      <p className="muted small-note">Envoyées par les sous-comités, groupes et équipes : à attribuer à un responsable.</p>
      <div className="cards">{list.map((t) => <TaskCard key={t.id} t={t} onOpen={() => onOpen(t)} onStatus={(x, s) => saveTask({ ...x, statusId: s }, false)} />)}</div>
    </>
  );
}
