import { useState } from 'react';
import { useStore } from '../../data/store';
import type { AppData, DelaiUnite, Etiquette, Task } from '../../data/types';
import { aLaDate, derniereOccurrence, horaire, libelleRegle, occurrenceDu, occurrencesEntre } from '../../data/repetition';
import { DELAI_MAX, addDays, applyDelaiRef, endOf, fmtRange, fmtDate, makeDelai, offsetLabel, splitDelai, today } from '../../data/utils';
import { Icone } from '../icones';
import { Deroulante } from '../Deroulante';
import { etiquettesAuto, recaler } from '../../data/etiquettes';

// Fiche d'une tâche : « Pour quand ? » (délai, séance, événement, occurrence) et rattachement à une séance ou un événement.

export type SetT = (fn: (x: Task) => Task) => void;

/** Sans l'occurrence suivie (autre événement : sa prochaine occurrence, s'il se répète). */
const sansOccurrence = (t: Task): Task => {
  if (!t.delaiRef?.occurrence) return t;
  const { occurrence: _, ...ref } = t.delaiRef;
  return { ...t, delaiRef: ref };
};

/**
 * Étiquettes « événement » datées, à venir ou en cours (plus celle déjà choisie), par date ; pas celles d'un événement de
 * l'agenda (l'événement lui-même est proposé).
 */
const etiquettesDatees = (data: AppData, current?: string) =>
  (data.etiquettes ?? [])
    .filter((e): e is Etiquette & { date: string } => e.type === 'evenement' && !!e.date && (!e.eventId || e.id === current) && (endOf({ date: e.date, dateFin: e.dateFin }) >= today() || e.id === current))
    .sort((a, b) => a.date.localeCompare(b.date));

/** « Événement lié » : un événement de l'agenda. */
export function EvenementLie({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  // L'étiquette de l'événement suit (celle de l'ancien événement retirée, celle du nouveau mise).
  const choisir = (v: string) =>
    setT((x) => {
      const y = { ...x, eventId: v || undefined };
      return applyDelaiRef(data, sansOccurrence({ ...y, etiquettes: recaler(x.etiquettes, etiquettesAuto(data, x), etiquettesAuto(data, y)) }));
    });
  return (
    <label>
      Événement
      <select value={t.eventId ?? ''} disabled={disabled} onChange={(e) => choisir(e.target.value)}>
        <option value="">—</option>
        {data.events.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.repetition ? ' 🔁' : ''}</option>)}
      </select>
    </label>
  );
}

/** « Séance de comité liée » : la tâche figure à l'ordre du jour et au PV de cette séance. */
export function SeanceLiee({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  return (
    <label>
      Séance de comité
      <select value={t.meetingId ?? ''} disabled={disabled} onChange={(e) => setT((x) => applyDelaiRef(data, { ...x, meetingId: e.target.value || undefined }))}>
        <option value="">—</option>
        {aVenir(data.meetings, t.meetingId).map((m) => <option key={m.id} value={m.id}>{m.titre}</option>)}
      </select>
    </label>
  );
}

/** Séances et événements à venir (ou en cours), par date ; plus celui déjà choisi, même passé. */
const aVenir = <T extends { id: string; date: string; dateFin?: string }>(list: T[], current?: string) =>
  list.filter((x) => endOf(x) >= today() || x.id === current).sort((a, b) => a.date.localeCompare(b.date));

/**
 * Pour quand ? Une date, ou une date calculée à partir d'un événement, d'une séance ou d'une étiquette datée (« 1 semaine
 * avant le Tournoi d'automne ») qui suit ensuite ses changements de date.
 */
export function DelaiField({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data, peutEtiqueter } = useStore();
  const [choisir, setChoisir] = useState(false);
  // Événement qui se répète : à sa prochaine occurrence (tant qu'il en reste).
  const events = aVenir(data.events.map((e) => (e.repetition ? aLaDate(e, occurrenceDu(e, today()) ?? derniereOccurrence(e) ?? e.date) : e)), t.eventId);
  const meetings = aVenir(data.meetings, t.meetingId);
  const ref = t.delaiRef;
  // Le point portera l'étiquette : celles qu'on peut mettre (dont on est membre), celles qu'il porte déjà.
  const courante = ref?.type === 'etiquette' ? ref.etiquetteId : undefined;
  const auto = etiquettesAuto(data, t);
  const etiquettes = etiquettesDatees(data, courante).filter((e) => e.id === courante || peutEtiqueter(e.id) || auto.includes(e.id) || !!t.etiquettes?.includes(e.id));
  const mode = !ref ? 'fixe'
    : ref.type === 'etiquette' ? (ref.etiquetteId ? `etiquette:${ref.etiquetteId}` : 'fixe')
    : ref.type === 'event' ? (t.eventId ? `event:${t.eventId}` : 'fixe')
    : t.meetingId ? `meeting:${t.meetingId}` : 'fixe';

  const onMode = (v: string) => {
    if (v === 'fixe') {
      setChoisir(false);
      return setT((x) => ({ ...x, delaiRef: undefined }));
    }
    const i = v.indexOf(':');
    const cle = v.slice(0, i);
    const id = v.slice(i + 1);
    setT((x) => {
      // Selon une étiquette : la tâche la porte (ses membres la voient).
      const y = cle === 'event' ? { ...x, eventId: id, etiquettes: recaler(x.etiquettes, etiquettesAuto(data, x), etiquettesAuto(data, { ...x, eventId: id })) }
        : cle === 'etiquette' ? { ...x, etiquettes: x.etiquettes?.includes(id) ? x.etiquettes : [...(x.etiquettes ?? []), id] }
        : { ...x, meetingId: id };
      const type = cle === 'event' ? 'event' : cle === 'etiquette' ? 'etiquette' : 'meeting';
      // Par défaut le jour même ; autre événement : sa prochaine occurrence (s'il se répète).
      const base = x.delaiRef ? (({ etiquetteId: _, ...r }) => r)(x.delaiRef) : makeDelai(0, 'jours', false);
      return applyDelaiRef(data, sansOccurrence({ ...y, delaiRef: { ...base, type, ...(type === 'etiquette' ? { etiquetteId: id } : {}) } }));
    });
  };

  const choix = (
    <Deroulante
      value={mode}
      disabled={disabled}
      aria-label="Date fixe, ou selon un événement / une séance"
      title="Changer : une autre séance, un événement ou une date fixe"
      onChange={onMode}
      options={[
        { value: 'fixe', label: 'Date fixe', icone: <Icone n="date" /> },
        {
          groupe: 'Selon un événement',
          options: events.map((e) => ({
            value: `event:${e.id}`,
            label: `${e.nom} (${e.repetition ? libelleRegle(e.repetition, e.date).toLowerCase() : fmtRange(e.date, e.dateFin)})`,
            icone: <Icone n={e.repetition ? 'repetition' : 'evenements'} />,
          })),
        },
        {
          groupe: 'Selon une séance de comité',
          options: meetings.map((m) => ({ value: `meeting:${m.id}`, label: `${m.titre} (${fmtDate(m.date)})`, icone: <Icone n="seances" /> })),
        },
        {
          groupe: 'Selon une étiquette datée',
          options: etiquettes.map((e) => ({ value: `etiquette:${e.id}`, label: `${e.nom} (${fmtRange(e.date, e.dateFin)})`, icone: <Icone n="etiquette" /> })),
        },
      ]}
    />
  );

  return (
    <div className="delai-field">
      <span className="field-label">Pour quand ?</span>
      {mode === 'fixe' ? (
        <>
          <input type="date" aria-label="Pour quand ?" value={t.delai} disabled={disabled} onChange={(e) => setT((x) => ({ ...x, delai: e.target.value }))} />
          {!t.delai && <small className="muted">Aucun délai</small>}
          {choisir && choix}
          {!disabled && (
            <div className="delai-liens">
              {!choisir && events.length + meetings.length + etiquettes.length > 0 && (
                <button type="button" className="link-btn" onClick={() => setChoisir(true)}><Icone n="epingle" /> ou selon un événement / une séance</button>
              )}
              {t.delai && <button type="button" className="link-btn" onClick={() => setT((x) => ({ ...x, delai: '' }))}>✕ Aucun délai</button>}
            </div>
          )}
        </>
      ) : (
        <>
          {choix}
          <OccurrenceField t={t} setT={setT} disabled={disabled} />
          <QuandField t={t} setT={setT} disabled={disabled} />
          {!disabled && (
            <div className="delai-liens">
              <button type="button" className="link-btn" onClick={() => onMode('fixe')}><Icone n="date" /> ou une date fixe</button>
              <button type="button" className="link-btn" onClick={() => { setChoisir(false); setT((x) => ({ ...x, delaiRef: undefined, delai: '' })); }}>✕ Aucun délai</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Délai selon un événement qui se répète : l'occurrence qu'il suit (les prochaines, et celle choisie). */
function OccurrenceField({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  const e = t.delaiRef?.type === 'event' ? data.events.find((x) => x.id === t.eventId) : undefined;
  if (!e?.repetition) return null;
  const jour = today();
  const cur = t.delaiRef?.occurrence;
  const prochaines = occurrencesEntre(e, jour, addDays(jour, 3 * 366), 12);
  const liste = [...new Set([...(cur ? [cur] : []), ...prochaines])].sort();
  return (
    <label className="occurrence-field">
      <span className="field-label">Occurrence</span>
      <select
        value={cur ?? ''}
        disabled={disabled}
        onChange={(ev) => setT((x) => applyDelaiRef(data, { ...x, delaiRef: { ...x.delaiRef!, occurrence: ev.target.value } }))}
      >
        {liste.map((o) => <option key={o} value={o}>{longDate(o)}{horaire(e) ? ` · ${horaire(e)}` : ''}</option>)}
      </select>
    </label>
  );
}

/** « jeudi 22.10.2026 ». */
const longDate = (d: string) => `${new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long' })} ${fmtDate(d)}`;

const UNITES: { id: DelaiUnite; un: string; plusieurs: string }[] = [
  { id: 'jours', un: 'jour', plusieurs: 'jours' },
  { id: 'semaines', un: 'semaine', plusieurs: 'semaines' },
  { id: 'mois', un: 'mois', plusieurs: 'mois' },
];

/** « Quand ? » : nombre libre de jours, semaines ou mois, avant ou après l'événement / la séance. */
function QuandField({ t, setT, disabled }: { t: Task; setT: (fn: (x: Task) => Task) => void; disabled: boolean }) {
  const { data } = useStore();
  const cur = splitDelai(t.delaiRef!);
  // Texte du nombre : on peut l'effacer le temps d'en écrire un autre.
  const [txt, setTxt] = useState(String(cur.n));
  const shown = txt === '' || Number(txt) === cur.n ? txt : String(cur.n);
  const change = (patch: Partial<typeof cur>) => {
    const next = { ...cur, ...patch };
    setT((x) => applyDelaiRef(data, { ...x, delaiRef: { ...x.delaiRef!, ...makeDelai(next.n, next.unite, next.apres) } }));
  };
  return (
    <div className="quand">
      <div className="quand-row">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={DELAI_MAX}
          value={shown}
          disabled={disabled}
          aria-label="Nombre"
          onChange={(e) => {
            setTxt(e.target.value);
            if (e.target.value !== '') change({ n: Number(e.target.value) });
          }}
          onBlur={() => setTxt(String(cur.n))}
        />
        <select value={cur.unite} disabled={disabled} aria-label="Unité" onChange={(e) => change({ unite: e.target.value as DelaiUnite })}>
          {UNITES.map((u) => <option key={u.id} value={u.id}>{cur.n > 1 ? u.plusieurs : u.un}</option>)}
        </select>
        <select value={cur.apres ? 'apres' : 'avant'} disabled={disabled} aria-label="Avant ou après" onChange={(e) => change({ apres: e.target.value === 'apres' })}>
          <option value="avant">avant</option>
          <option value="apres">après</option>
        </select>
      </div>
      <small className="delai-calc">→ {fmtDate(t.delai)}{cur.n === 0 || (cur.n === 1 && cur.unite === 'jours') ? ` (${offsetLabel(t.delaiRef!).toLowerCase()})` : ''} · suit la date automatiquement</small>
    </div>
  );
}
