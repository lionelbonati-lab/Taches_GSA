import { useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { daysUntil, endOf, fmtRange, today } from '../data/utils';
import type { OrgUnit } from '../data/types';
import { Modal } from './ui';

// Date de la prochaine édition d'une manifestation (sous-comité, équipe d'événement), sur un ou plusieurs jours.
// Affichée sur l'accueil et la page Événements de l'entité ; son comité la change (admins, droit « Gérer les
// événements », comité central) et peut déplacer du même coup l'événement de l'agenda (les délais liés suivent).

export const hasEdition = (u?: OrgUnit | null) => u?.type === 'sous-comite' || u?.type === 'equipe';

export function EditionCard() {
  const club = useClubOptional();
  const { can, guest } = useStore();
  const [open, setOpen] = useState(false);
  if (!club || !hasEdition(club.current)) return null;
  const u = club.current;
  const allowed = club.canManage || (!guest && (u.moiAdmin || can('events.manage')));
  if (!u.date && !allowed) return null;
  const fin = u.date ? endOf({ date: u.date, dateFin: u.dateFin }) : '';
  const passee = !!u.date && fin < today();
  const etat = !u.date
    ? 'date à fixer'
    : passee
      ? 'passée : indique la date de la prochaine édition'
      : u.date <= today()
        ? 'en cours'
        : `dans ${daysUntil(u.date)} j`;
  return (
    <div className={`panel edition ${passee || !u.date ? 'todo' : ''}`}>
      <span className="grow">
        📅 <strong>{passee ? 'Dernière édition' : 'Prochaine édition'}</strong>
        {u.date && ` : ${fmtRange(u.date, u.dateFin)}`} <em className="muted">({etat})</em>
      </span>
      {allowed && <button className="btn small" onClick={() => setOpen(true)}>{u.date ? 'Changer la date' : 'Fixer la date'}</button>}
      {open && <EditionModal unit={u} onClose={() => setOpen(false)} />}
    </div>
  );
}

function EditionModal({ unit, onClose }: { unit: OrgUnit; onClose: () => void }) {
  const club = useClubOptional()!;
  const { data, can, update, guest } = useStore();
  const [debut, setDebut] = useState(unit.date ?? '');
  const [fin, setFin] = useState(unit.dateFin ?? '');
  // Événement de l'agenda à déplacer aussi : celui de l'édition actuelle si elle est encore à venir (report).
  const events = [...data.events].sort((a, b) => a.date.localeCompare(b.date));
  const moveable = can('events.manage') && (!guest || guest.niveau === 'ecriture');
  const auto = unit.date && endOf({ date: unit.date, dateFin: unit.dateFin }) >= today() ? events.find((e) => e.date === unit.date) : undefined;
  const [ev, setEv] = useState(auto?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const liees = ev ? data.tasks.filter((t) => t.eventId === ev && t.delaiRef?.type === 'event').length : 0;

  const submit = async () => {
    setErr('');
    if (!debut) return setErr('Indique la date (le premier jour).');
    if (fin && fin < debut) return setErr('Le dernier jour ne peut pas précéder le premier.');
    const dateFin = fin && fin > debut ? fin : undefined;
    setBusy(true);
    try {
      await club.setEditionDate(debut, dateFin);
      const e = data.events.find((x) => x.id === ev);
      const quand = fmtRange(debut, dateFin);
      if (e && moveable) update((d) => { d.events = d.events.map((x) => (x.id === e.id ? { ...x, date: debut, dateFin } : x)); }, `Prochaine édition le ${quand} (événement « ${e.nom} » déplacé)`);
      else if (!guest) update(() => {}, `Prochaine édition le ${quand}`);
      onClose();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Prochaine édition · ${unit.nom}`} onClose={onClose}>
      <div className="form">
        <label>
          Premier jour
          <input type="date" autoFocus value={debut} onChange={(e) => setDebut(e.target.value)} />
        </label>
        <label>
          Dernier jour <small className="muted">(si plusieurs jours)</small>
          <input type="date" value={fin} min={debut || undefined} onChange={(e) => setFin(e.target.value)} />
        </label>
        {moveable && events.length > 0 && (
          <label className="full">
            Déplacer aussi dans l’agenda
            <select value={ev} onChange={(e) => setEv(e.target.value)}>
              <option value="">Non, ne pas toucher aux événements</option>
              {events.map((e) => <option key={e.id} value={e.id}>🎉 {e.nom} ({fmtRange(e.date, e.dateFin)})</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="muted small-note">
        La date est visible de tout le club (organigramme).
        {liees > 0 && ` 🔗 ${liees} tâche(s) ont un délai lié à cet événement : leurs délais suivront.`}
      </p>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy} onClick={submit}>Enregistrer</button>
      </div>
    </Modal>
  );
}
