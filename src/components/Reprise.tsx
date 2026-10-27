import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent } from '../data/types';
import { addDays, diffDays, fmtDate, fmtRange, offsetLabel, shortName } from '../data/utils';
import { candidats, dateReprise, delaiRepris, nomReprise, reprendre, type Candidat } from '../data/reprise';
import { Modal } from './ui';
import { Icone } from './icones';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reprendre un événement passé pour une nouvelle édition (reprise.ts) : son nom (années décalées), ses dates (un an plus
 * tard, le même jour de la semaine, ou celles de la prochaine édition), les tâches à recopier (liées à l'événement :
 * cochées ; `edition`, entité d'un événement : ses autres tâches de l'édition, décochées) et leurs responsables.
 */
export function RepriseModal({ event: e, date: dateDonnee, dateFin: finDonnee, edition, onClose }: { event: ClubEvent; date?: string; dateFin?: string; edition: boolean; onClose: () => void }) {
  const { data, user, can, update, setToast } = useStore();
  const navigate = useNavigate();
  const [date, setDate] = useState(dateDonnee ?? dateReprise(e));
  const [fin, setFin] = useState(finDonnee ?? (e.dateFin && e.dateFin > e.date ? addDays(date, diffDays(e.date, e.dateFin)) : ''));
  const ans = (d: string) => Number(d.slice(0, 4)) - Number(e.date.slice(0, 4));
  const [nom, setNom] = useState(() => nomReprise(e.nom, ans(date)));
  const [nomChoisi, setNomChoisi] = useState(false);
  const [liste] = useState(() => candidats(data, e, edition, (s) => can('tasks.createAny', s)));
  const [choix, setChoix] = useState(() => new Set(liste.filter((x) => x.coche).map((x) => x.t.id)));
  const [memes, setMemes] = useState(true);
  const [err, setErr] = useState('');
  if (!user) return null;
  const deja = data.events.find((x) => x.repriseDe === e.id);
  // Tâches liées dans des sections où la personne ne crée pas de tâches pour d'autres : pas proposées.
  const horsDroits = data.tasks.filter((t) => t.eventId === e.id && !t.source && !t.paiement).length - liste.filter((x) => x.liee).length;
  const liees = liste.filter((x) => x.liee);
  const autres = liste.filter((x) => !x.liee);
  const actifs = new Set(data.people.filter((p) => p.actif).map((p) => p.id));

  // Début déplacé : la fin suit (même durée) et le nom suit l'année, tant qu'on ne l'a pas changé.
  const changerDate = (d: string) => {
    if (JOUR.test(d) && JOUR.test(date) && fin) setFin(addDays(fin, diffDays(date, d)));
    setDate(d);
    if (JOUR.test(d) && !nomChoisi) setNom(nomReprise(e.nom, ans(d)));
  };
  const basculer = (ids: string[], oui: boolean) =>
    setChoix((s) => {
      const n = new Set(s);
      ids.forEach((id) => (oui ? n.add(id) : n.delete(id)));
      return n;
    });

  const submit = () => {
    if (!nom.trim()) return setErr('« Nom » est obligatoire.');
    if (!JOUR.test(date)) return setErr('Indique le premier jour.');
    if (fin && fin < date) return setErr('Le dernier jour ne peut pas précéder le premier.');
    const r = reprendre(data, e, { nom, date, dateFin: fin || undefined, taches: [...choix], responsables: memes }, user.id);
    const n = r.tasks.length;
    update((d) => {
      d.events = [...d.events, r.event];
      d.tasks = [...r.tasks, ...d.tasks];
      if (r.notifs.length) d.notifications = [...r.notifs, ...(d.notifications ?? [])].slice(0, 300);
    }, `Reprise de l’événement « ${e.nom} » : « ${r.event.nom} » le ${fmtRange(r.event.date, r.event.dateFin)}${n ? `, ${n} tâche${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''}` : ''}`);
    setToast(`✅ « ${r.event.nom} » ajouté${n ? ` avec ${n} tâche${n > 1 ? 's' : ''} à faire` : ''}.`);
    onClose();
    if (n) navigate(`/taches?event=${r.event.id}`);
  };

  const groupe = (titre: string, l: Candidat[]) => {
    const coches = l.filter((x) => choix.has(x.t.id)).length;
    return (
      <section className="reprise-groupe">
        <div className="row wrap">
          <strong className="grow">{titre} <small className="muted">({coches}/{l.length})</small></strong>
          <button type="button" className="btn link small" onClick={() => basculer(l.map((x) => x.t.id), coches < l.length)}>
            {coches < l.length ? 'Tout cocher' : 'Tout décocher'}
          </button>
        </div>
        <ul className="anciennes-liste">
          {l.map(({ t }) => {
            const delai = JOUR.test(date) ? delaiRepris(t, e, date) : '';
            const resp = memes ? t.responsables.filter((id) => actifs.has(id)).map((id) => shortName(data.people.find((p) => p.id === id))) : [];
            return (
              <li key={t.id}>
                <label className="check">
                  <input type="checkbox" checked={choix.has(t.id)} onChange={() => basculer([t.id], !choix.has(t.id))} />
                  <span>
                    <strong>{t.titre || '(sans titre)'}</strong>
                    <small className="muted">
                      {' '}· {delai ? `délai ${fmtDate(delai)}` : 'sans délai'}
                      {t.eventId === e.id && t.delaiRef?.type === 'event' && ` (${offsetLabel(t.delaiRef).toLowerCase()})`}
                      {resp.length > 0 && ` · ${resp.join(', ')}`}
                      {t.checklist.length > 0 && ` · ☑ ${t.checklist.length}`}
                      {t.recurrence && ' · 🔁 se reconduit déjà toute seule'}
                    </small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <Modal title={`Reprendre « ${e.nom} »`} icone="dupliquer" onClose={onClose} wide>
      <p className="muted">
        Une nouvelle édition, avec les tâches qui préparaient celle du {fmtRange(e.date, e.dateFin)}. Chaque tâche repart « à faire », au même écart de
        l’événement (« 30 jours avant », « la veille ») ; checklist décochée, sans discussion ni séance. Les fichiers joints restent ; emails et sondages ne
        suivent pas.
      </p>
      {deja && (
        <p className="reprise-deja">
          <Icone n="alerte" /> Déjà reprise dans « {deja.nom} » ({fmtRange(deja.date, deja.dateFin)}) : reprendre de nouveau recopie ses tâches une seconde fois.
        </p>
      )}
      <div className="form">
        <label className="full">
          Nom
          <input value={nom} maxLength={120} onChange={(x) => { setNom(x.target.value); setNomChoisi(true); }} />
        </label>
        <label>
          Premier jour
          <input type="date" value={date} onChange={(x) => changerDate(x.target.value)} />
        </label>
        <label>
          Dernier jour <small className="muted">(si plusieurs jours)</small>
          <input type="date" value={fin} min={date || undefined} onChange={(x) => setFin(x.target.value)} />
        </label>
        <fieldset className="full reprise-resp">
          <legend>Responsables des tâches</legend>
          <label className="inline"><input type="radio" name="reprise-resp" checked={memes} onChange={() => setMemes(true)} /> Les mêmes (personnes encore actives), prévenues 🔔</label>
          <label className="inline"><input type="radio" name="reprise-resp" checked={!memes} onChange={() => setMemes(false)} /> À attribuer ensuite</label>
        </fieldset>
      </div>
      {liees.length > 0 && groupe(`Tâches liées à « ${e.nom} »`, liees)}
      {autres.length > 0 && groupe('Autres tâches de cette édition', autres)}
      {!liste.length && <p className="muted">Aucune tâche liée à cet événement : seul l’événement sera repris.</p>}
      {horsDroits > 0 && <p className="muted small-note">{horsDroits} tâche(s) liée(s) dans des sections où tu ne crées pas de tâches pour d’autres : pas proposée(s).</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>{choix.size ? `Reprendre avec ${choix.size} tâche${choix.size > 1 ? 's' : ''}` : 'Reprendre l’événement seul'}</button>
      </div>
    </Modal>
  );
}
