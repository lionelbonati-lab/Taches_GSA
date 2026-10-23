import { useState } from 'react';
import { useStore } from '../data/store';
import type { ClubEvent, RepetitionEvenement } from '../data/types';
import { addDays, diffDays, fmtDate, today, uid } from '../data/utils';
import { stable } from '../data/cloud';
import {
  JOURS_COURTS, aLaDate, jourDuMois, jourSemaine, libelleRegle, libelleRepetition, memeRegle, nomJour, normaliser, rangDansMois,
} from '../data/repetition';
import { PORTEES, modifierOccurrence, supprimerOccurrence, type Portee } from '../data/series';
import { IconePoubelle, Modal } from './ui';
import { ZoneTexte } from './ZoneTexte';

// Fiche d'un événement, comme dans un agenda : toute la journée ou de telle heure à telle heure, sur un ou plusieurs
// jours, une seule fois ou répété (tous les jours, semaines, mois, ans, ou personnalisé). Une occurrence d'un événement
// qui se répète se modifie ou se supprime seule, avec les suivantes, ou toute la série.

/** Enregistrement / suppression des événements (Agenda, Événements). */
export function useEventActions() {
  const { data, update } = useStore();
  const portee = (p: Portee) => ({ une: 'cette occurrence', suivantes: 'celle-ci et les suivantes', toutes: 'toute la série' })[p];
  return {
    saveEvent: (x: ClubEvent) => {
      const e = normaliser(sansFinVide(x));
      const isNew = !data.events.some((y) => y.id === e.id);
      update((d) => { d.events = isNew ? [...d.events, e] : d.events.map((y) => (y.id === e.id ? e : y)); }, `${isNew ? 'Ajout' : 'Modification'} de l'événement « ${e.nom} »`);
    },
    /** Occurrence du `jour` de la série `serie` modifiée (valeurs `v`). */
    saveOccurrence: (serie: ClubEvent, jour: string, v: ClubEvent, p: Portee) =>
      update((d) => modifierOccurrence(d, serie, jour, sansFinVide(v), p), `Modification de l'événement « ${v.nom} » (${portee(p)})`),
    removeEvent: (e: ClubEvent) => update((d) => {
      d.events = d.events.filter((x) => x.id !== e.id);
      d.tasks.forEach((t) => { if (t.eventId === e.id) t.eventId = undefined; });
    }, `Suppression de l'événement « ${e.nom} »`),
    removeOccurrence: (serie: ClubEvent, jour: string, p: Portee) =>
      update((d) => supprimerOccurrence(d, serie, jour, p), `Suppression de l'événement « ${serie.nom} » du ${fmtDate(jour)} (${portee(p)})`),
  };
}

/** Sur un seul jour : pas de date de fin. */
const sansFinVide = (e: ClubEvent): ClubEvent => ({ ...e, dateFin: e.dateFin && e.dateFin > e.date ? e.dateFin : undefined });

export const newEvent = (date = today()): ClubEvent => ({ id: uid('e'), nom: '', date, lieu: '', description: '' });

const minutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const heureDe = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Heure proposée quand on décoche « Toute la journée » : la prochaine demi-heure, pour une heure. */
function heuresParDefaut() {
  const d = new Date();
  const m = Math.ceil((d.getHours() * 60 + d.getMinutes() + 1) / 30) * 30;
  return m + 60 < 24 * 60 ? { heure: heureDe(m), heureFin: heureDe(m + 60) } : { heure: '09:00', heureFin: '10:00' };
}

/** Répétition simple (proposée telle quelle dans le menu) : une fois par jour, semaine (le jour de l'événement), mois, an. */
const estSimple = (r: RepetitionEvenement, date: string) =>
  (r.intervalle ?? 1) === 1 && !r.jusquau && !r.nombre && !r.mensuel &&
  (r.freq !== 'semaine' || !r.jours?.length || (r.jours.length === 1 && r.jours[0] === jourSemaine(date)));


/**
 * Fiche d'un événement. `jour` : l'occurrence ouverte d'un événement qui se répète (ses dates sont celles de cette
 * occurrence ; à l'enregistrement, on choisit : cet événement, les suivants, ou tous).
 */
export function EventModal({ event, jour, onClose }: { event: ClubEvent; jour?: string; onClose: () => void }) {
  const { data } = useStore();
  const { saveEvent, saveOccurrence, removeEvent, removeOccurrence } = useEventActions();
  const serie = jour && event.repetition ? event : undefined;
  const depart = serie ? aLaDate(serie, jour!) : event;
  const [v, setV] = useState<ClubEvent>(depart);
  const [perso, setPerso] = useState(false);
  const [err, setErr] = useState('');
  const [demande, setDemande] = useState<'modifier' | 'supprimer' | null>(null);
  const isNew = !data.events.some((x) => x.id === event.id);
  const set = (p: Partial<ClubEvent>) => setV((x) => ({ ...x, ...p }));
  const r = v.repetition;
  const setR = (p: Partial<RepetitionEvenement>) => setV((x) => ({ ...x, repetition: { ...(x.repetition ?? { freq: 'semaine' }), ...p } }));
  const journee = !v.heure && v.heureFin === undefined;
  const fin = v.dateFin || v.date;

  // Début déplacé : la fin suit (même durée), comme dans un agenda.
  const setDebut = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return set({ date });
    const n = diffDays(v.date, date);
    set({ date, dateFin: v.dateFin ? addDays(v.dateFin, n) : undefined });
  };
  const setHeure = (heure: string) => {
    if (!heure || !v.heure || !v.heureFin || (v.dateFin && v.dateFin > v.date)) return set({ heure });
    const t = minutes(heure) + minutes(v.heureFin) - minutes(v.heure);
    // Passé minuit : se termine le lendemain.
    set({ heure, heureFin: heureDe(((t % 1440) + 1440) % 1440), dateFin: t >= 1440 ? addDays(v.date, 1) : v.dateFin });
  };
  const setJournee = (oui: boolean) => set(oui ? { heure: undefined, heureFin: undefined } : heuresParDefaut());

  const choix = !r ? 'une' : perso ? 'perso' : estSimple(r, v.date) ? r.freq : 'actuelle';
  const onChoix = (c: string) => {
    if (c === 'une') return setPerso(false), set({ repetition: undefined });
    if (c === 'perso') return setPerso(true), set({ repetition: r ?? { freq: 'semaine', jours: [jourSemaine(v.date)] } });
    if (c === 'actuelle') return;
    setPerso(false);
    set({ repetition: { freq: c as RepetitionEvenement['freq'] } });
  };
  const jours = r?.freq === 'semaine' ? (r.jours?.length ? r.jours : [jourSemaine(v.date)]) : [];
  const basculerJour = (j: number) => {
    const next = jours.includes(j) ? jours.filter((x) => x !== j) : [...jours, j].sort();
    if (next.length) setR({ jours: next });
  };
  const { rang, dernier } = /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? rangDansMois(v.date) : { rang: 1, dernier: false };
  const finRep = r?.jusquau !== undefined ? 'date' : r?.nombre !== undefined ? 'nombre' : 'jamais';

  const verifier = (): string | undefined => {
    if (!v.nom.trim()) return '« Événement » est obligatoire.';
    if (!v.date) return '« Début » est obligatoire.';
    if (fin < v.date) return 'La fin ne peut pas précéder le début.';
    if (!journee && !v.heure) return 'Indique l’heure de début, ou coche « Toute la journée ».';
    if (!journee && v.heure && v.heureFin && fin === v.date && v.heureFin < v.heure) return 'L’heure de fin doit suivre l’heure de début.';
    if (r?.jusquau !== undefined && (!r.jusquau || r.jusquau < v.date)) return 'La répétition doit se terminer après le premier jour.';
    if (r?.nombre !== undefined && !(r.nombre >= 1 && r.nombre <= 999)) return 'Nombre d’occurrences : de 1 à 999.';
    return undefined;
  };
  const pret = (): ClubEvent => ({
    ...v,
    nom: v.nom.trim(),
    heure: journee ? undefined : v.heure,
    heureFin: journee || !v.heureFin ? undefined : v.heureFin,
  });
  const submit = () => {
    const bad = verifier();
    if (bad) return setErr(bad);
    setErr('');
    if (!serie) {
      saveEvent(pret());
      return onClose();
    }
    // Rien de changé : rien à demander.
    if (stable(normaliser(sansFinVide(pret()))) === stable(normaliser(sansFinVide(depart)))) return onClose();
    setDemande('modifier');
  };
  const supprimer = () => {
    if (serie) return setDemande('supprimer');
    if (!confirm('Supprimer définitivement ?')) return;
    removeEvent(event);
    onClose();
  };

  if (demande && serie) {
    // Règle de répétition changée : elle ne s'applique pas à une seule occurrence.
    const regleChangee = demande === 'modifier' && !memeRegle(normaliser(pret()).repetition, normaliser(depart).repetition);
    return (
      <ChoixPortee
        action={demande}
        sans={regleChangee ? ['une'] : []}
        onChoisir={(p) => {
          if (demande === 'modifier') saveOccurrence(serie, jour!, pret(), p);
          else removeOccurrence(serie, jour!, p);
          onClose();
        }}
        onClose={() => setDemande(null)}
      />
    );
  }

  const liees = data.tasks.filter((t) => t.eventId === event.id && t.delaiRef?.type === 'event');
  const note = !liees.length
    ? undefined
    : serie
      ? `📌 ${liees.length} tâche(s) ont un délai calé sur une occurrence de cette série : si sa date change, leurs délais suivent automatiquement.`
      : `📌 ${liees.length} tâche(s) ont un délai calé sur cette date : si tu la changes, leurs délais suivront automatiquement.`;
  const origine = event.serie && data.events.find((x) => x.id === event.serie!.id);

  return (
    <Modal title={isNew ? 'Nouvel événement' : 'Événement'} onClose={onClose}>
      <div className="form event-form">
        <label className="full">
          Événement
          <input value={v.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="Ajouter un titre" />
        </label>
        <label className="inline full">
          <input type="checkbox" checked={journee} onChange={(e) => setJournee(e.target.checked)} /> Toute la journée
        </label>
        <label>
          {journee ? 'Premier jour' : 'Début'}
          <input type="date" value={v.date} onChange={(e) => setDebut(e.target.value)} />
        </label>
        {journee ? (
          <label>
            Dernier jour
            <input type="date" value={fin} min={v.date} onChange={(e) => set({ dateFin: e.target.value })} />
          </label>
        ) : (
          <label>
            Heure de début
            <input type="time" value={v.heure ?? ''} onChange={(e) => setHeure(e.target.value)} />
          </label>
        )}
        {!journee && (
          <>
            <label>
              Fin
              <input type="date" value={fin} min={v.date} onChange={(e) => set({ dateFin: e.target.value })} />
            </label>
            <label>
              Heure de fin
              <input type="time" value={v.heureFin ?? ''} onChange={(e) => set({ heureFin: e.target.value })} />
            </label>
          </>
        )}
        <label className="full">
          Répétition
          <select value={choix} onChange={(e) => onChoix(e.target.value)}>
            <option value="une">Une seule fois</option>
            <option value="jour">Tous les jours</option>
            <option value="semaine">{libelleRegle({ freq: 'semaine' }, v.date || '2026-01-01')}</option>
            <option value="mois">{libelleRegle({ freq: 'mois' }, v.date || '2026-01-01')}</option>
            <option value="an">{libelleRegle({ freq: 'an' }, v.date || '2026-01-01')}</option>
            {choix === 'actuelle' && <option value="actuelle">{libelleRepetition(v)}</option>}
            <option value="perso">Personnalisé…</option>
          </select>
        </label>
        {r && perso && (
          <fieldset className="full repetition-perso">
            <legend>Récurrence personnalisée</legend>
            <div className="rep-ligne">
              <span>Répéter tous les</span>
              <input
                type="number"
                min={1}
                max={99}
                aria-label="Intervalle"
                value={r.intervalle ?? 1}
                onChange={(e) => setR({ intervalle: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
              />
              <select
                aria-label="Fréquence"
                value={r.freq}
                onChange={(e) => {
                  const freq = e.target.value as RepetitionEvenement['freq'];
                  setR({ freq, jours: freq === 'semaine' ? [jourSemaine(v.date)] : undefined, mensuel: undefined });
                }}
              >
                {(['jour', 'semaine', 'mois', 'an'] as const).map((f) => {
                  const n = (r.intervalle ?? 1) > 1;
                  return <option key={f} value={f}>{{ jour: n ? 'jours' : 'jour', semaine: n ? 'semaines' : 'semaine', mois: 'mois', an: n ? 'ans' : 'an' }[f]}</option>;
                })}
              </select>
            </div>
            {r.freq === 'semaine' && (
              <div className="rep-ligne">
                <span>Le</span>
                <div className="jours-semaine" role="group" aria-label="Jours de la semaine">
                  {JOURS_COURTS.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      className={jours.includes(i + 1) ? 'on' : ''}
                      aria-pressed={jours.includes(i + 1)}
                      aria-label={nomJour(i + 1)}
                      title={nomJour(i + 1)}
                      onClick={() => basculerJour(i + 1)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {r.freq === 'mois' && (
              <div className="rep-ligne">
                <select aria-label="Jour du mois" value={r.mensuel ?? ''} onChange={(e) => setR({ mensuel: (e.target.value || undefined) as RepetitionEvenement['mensuel'] })}>
                  <option value="">{jourDuMois(v.date)} de chaque mois</option>
                  {rang <= 4 && <option value="rang">{jourDuMois(v.date, 'rang')} de chaque mois</option>}
                  {dernier && <option value="dernier">{jourDuMois(v.date, 'dernier')} de chaque mois</option>}
                </select>
              </div>
            )}
            <div className="rep-fin" role="radiogroup" aria-label="Se termine">
              <span>Se termine</span>
              <label className="inline">
                <input type="radio" name="rep-fin" checked={finRep === 'jamais'} onChange={() => setR({ jusquau: undefined, nombre: undefined })} /> Jamais
              </label>
              <label className="inline">
                <input type="radio" name="rep-fin" checked={finRep === 'date'} onChange={() => setR({ jusquau: r.jusquau || addDays(v.date, 30), nombre: undefined })} /> Le
                <input type="date" aria-label="Se termine le" value={r.jusquau ?? ''} min={v.date} disabled={finRep !== 'date'} onChange={(e) => setR({ jusquau: e.target.value })} />
              </label>
              <label className="inline">
                <input type="radio" name="rep-fin" checked={finRep === 'nombre'} onChange={() => setR({ nombre: r.nombre ?? 10, jusquau: undefined })} /> Après
                <input
                  type="number"
                  min={1}
                  max={999}
                  aria-label="Nombre d’occurrences"
                  value={r.nombre ?? 10}
                  disabled={finRep !== 'nombre'}
                  onChange={(e) => setR({ nombre: Number(e.target.value) })}
                />
                occurrence{(r.nombre ?? 10) > 1 ? 's' : ''}
              </label>
            </div>
            <small className="muted">{libelleRepetition(normaliser({ ...v, repetition: r }))}</small>
          </fieldset>
        )}
        <label className="full">
          Lieu
          <input value={v.lieu} onChange={(e) => set({ lieu: e.target.value })} />
        </label>
        <label className="full">
          Description
          <ZoneTexte rows={4} value={v.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
      </div>
      {origine && <p className="muted">🔁 Occurrence de « {origine.nom} » modifiée seule (prévue le {fmtDate(event.serie!.date)}).</p>}
      {note && <p className="muted">{note}</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && <button className="btn danger" onClick={supprimer} title="Supprimer l’événement" aria-label="Supprimer l’événement"><IconePoubelle /></button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>Enregistrer</button>
      </div>
    </Modal>
  );
}

/** « Modifier / Supprimer / Déplacer l'événement périodique » : cet événement, celui-ci et les suivants, ou tous. */
export function ChoixPortee({ action, sans = [], onChoisir, onClose }: {
  action: 'modifier' | 'supprimer' | 'deplacer';
  sans?: Portee[];
  onChoisir: (p: Portee) => void;
  onClose: () => void;
}) {
  const choix = PORTEES.filter((p) => !sans.includes(p.id));
  const [p, setP] = useState<Portee>(choix[0].id);
  const titre = { modifier: 'Modifier', supprimer: 'Supprimer', deplacer: 'Déplacer' }[action];
  return (
    <Modal title={`${titre} l’événement périodique`} onClose={onClose}>
      <div className="choix-portee" role="radiogroup" aria-label="Événements concernés">
        {choix.map((c) => (
          <label key={c.id} className="inline">
            <input type="radio" name="portee" checked={p === c.id} onChange={() => setP(c.id)} /> {c.label}
          </label>
        ))}
      </div>
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className={`btn ${action === 'supprimer' ? 'danger' : 'primary'}`} onClick={() => onChoisir(p)}>
          {action === 'supprimer' ? 'Supprimer' : 'OK'}
        </button>
      </div>
    </Modal>
  );
}
