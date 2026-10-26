import { useState, type ReactNode } from 'react';
import { useStore } from '../../data/store';
import { useClubOptional } from '../../data/club';
import { partageDe, TACHES_DEPENDANCE } from '../../data/partage';
import { parentDans, reglageTaches } from '../../data/units';
import { choixEvenements, choixSeances, evenementsDependants, memeEvenement, memeSeance } from '../../data/externes';
import type { DelaiUnite, EvenementEntite, OrgUnit, SeanceComite, Task } from '../../data/types';
import { aLaDate, derniereOccurrence, horaire, libelleRegle, occurrenceDu, occurrencesEntre } from '../../data/repetition';
import { DELAI_MAX, addDays, applyDelaiRef, endOf, fmtRange, fmtDate, makeDelai, offsetLabel, splitDelai, today } from '../../data/utils';
import { Icone } from '../icones';
import { Deroulante } from '../Deroulante';
import { IconeEntite, PastilleEntite } from '../IconesEntite';

// Fiche d'une tâche : « Pour quand ? » (délai, séance, événement, occurrence) et rattachement à une séance ou un événement.

export type SetT = (fn: (x: Task) => Task) => void;

/** Sans l'occurrence suivie (autre événement : sa prochaine occurrence, s'il se répète). */
const sansOccurrence = (t: Task): Task => {
  if (!t.delaiRef?.occurrence) return t;
  const { occurrence: _, ...ref } = t.delaiRef;
  return { ...t, delaiRef: ref };
};

/** Tâche liée à une séance du comité dont l'entité dépend : partagée avec ce comité (ses tâches, son ordre du jour, son PV). */
function avecSeance(x: Task, s: SeanceComite, centralId?: string): Task {
  const l = partageDe(x, centralId);
  return {
    ...x,
    meetingId: undefined,
    seanceComite: { uniteId: s.uniteId, id: s.id, titre: s.titre, date: s.date },
    partage: l.includes(s.uniteId) ? l : [...l, s.uniteId],
    auCentral: undefined,
  };
}

/**
 * « Soirée (28.11.2026) · prochaine édition » : édition d'un événement du club (distincte d'un événement du comité du même
 * nom), ou l'un de ses événements (avec le nom de l'entité).
 */
function libelleEvenement(x: EvenementEntite, u?: OrgUnit): { label: string; icone: ReactNode } {
  const icone = u ? <PastilleEntite u={u} /> : <Icone n="evenements" />;
  if (x.id) return { label: `${x.nom} (${fmtRange(x.date, x.dateFin)})${u ? ` · ${u.nom}` : ''}`, icone };
  return { label: `${x.nom} (${x.date ? fmtRange(x.date, x.dateFin) : 'date à fixer'}) · prochaine édition`, icone };
}

/**
 * Ce que la tâche peut lier hors de l'entité (lu par le store, externes.ts) : les séances du comité dont elle dépend, et
 * les événements du club qui dépendent d'elle (prochaine édition, événements de leur agenda).
 */
function useExternes(t: Task) {
  const { externes } = useStore();
  const club = useClubOptional();
  const jour = today();
  const parent = club && club.current.type !== 'central' && !t.source ? parentDans(club.units.filter((u) => !u.archive), club.current) : undefined;
  const comite = externes.seances?.comite || parent?.id || '';
  const seances = parent || t.seanceComite ? choixSeances(externes.seances, comite, t.seanceComite, jour) : [];
  const dependants = club && !t.source ? evenementsDependants(club.units, club.current) : [];
  const evenements = dependants.length || t.evenementEntite ? choixEvenements(dependants, externes.agenda ?? [], t.evenementEntite, jour) : [];
  const unite = (id: string) => club?.units.find((u) => u.id === id);
  return { club, parent, comite, lu: externes.seances, seances, evenements, unite, ici: club?.current.nom ?? '' };
}

/**
 * « Événement lié » : un événement de l'entité ; pour un comité, aussi un événement qui dépend de lui (sa prochaine
 * édition ou l'un de ses événements), dont le nom et la date suivent les changements.
 */
export function EvenementLie({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  const { club, evenements, unite, ici } = useExternes(t);
  const lie = t.evenementEntite;
  const value = lie ? `x:${evenements.findIndex((x) => memeEvenement(x, lie))}` : (t.eventId ?? '');
  const choisir = (v: string) =>
    setT((x) =>
      applyDelaiRef(data, sansOccurrence(v.startsWith('x:') ? { ...x, eventId: undefined, evenementEntite: evenements[Number(v.slice(2))] } : { ...x, eventId: v || undefined, evenementEntite: undefined })),
    );
  const locales = data.events.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.repetition ? ' 🔁' : ''}</option>);
  const localesChoix = data.events.map((e) => ({ value: e.id, label: e.nom, icone: <Icone n={e.repetition ? 'repetition' : 'evenements'} /> }));
  const u = lie && unite(lie.uniteId);
  const partagee = !!lie && partageDe(t, club?.central?.id).includes(lie.uniteId);
  return (
    <label className={evenements.length ? 'full' : undefined}>
      Événement
      {evenements.length > 0 ? (
        <Deroulante
          value={value}
          disabled={disabled}
          onChange={choisir}
          options={[
            { value: '', label: '—' },
            { groupe: `Événements de « ${ici} »`, options: localesChoix },
            { groupe: `Événements qui dépendent de « ${ici} »`, options: evenements.map((x, i) => ({ value: `x:${i}`, ...libelleEvenement(x, unite(x.uniteId)) })) },
          ]}
        />
      ) : (
        <select value={value} disabled={disabled} onChange={(e) => choisir(e.target.value)}>
          <option value="">—</option>
          {locales}
        </select>
      )}
      {lie && (
        <small className="muted">
          {u ? <IconeEntite u={u} /> : <Icone n="evenements" />} {lie.id ? `Événement de « ${u?.nom ?? '?'} »` : 'Prochaine édition'}, qui dépend de « {ici} » : son nom et sa date sont suivis (délai calé dessus compris).
          {!partagee && !disabled && u && ` Pour que « ${u.nom} » voie aussi la tâche : 🤝 Partager.`}
        </small>
      )}
    </label>
  );
}

/**
 * « Séance de comité liée » : une séance de l'entité, ou une séance du comité dont elle dépend. Dans ce cas, la tâche
 * est partagée avec ce comité et figure à l'ordre du jour et au PV de cette séance (partage.ts : avecPartagees).
 */
export function SeanceLiee({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  const { club, parent, comite, lu, seances: choix, unite, ici } = useExternes(t);
  const nomComite = (id: string) => unite(id)?.nom ?? 'comité';
  const lie = t.seanceComite;
  const value = lie ? `c:${choix.findIndex((s) => memeSeance(s, lie))}` : (t.meetingId ?? '');
  const reglage = club ? reglageTaches(club.units, club.current) : undefined;

  const choisir = (v: string) =>
    setT((x) =>
      applyDelaiRef(data, v.startsWith('c:') ? avecSeance(x, choix[Number(v.slice(2))], club?.central?.id) : { ...x, meetingId: v || undefined, seanceComite: undefined }),
    );

  const locales = aVenir(data.meetings, t.meetingId).map((m) => <option key={m.id} value={m.id}>{m.titre}</option>);
  return (
    <label className={parent ? 'full' : undefined}>
      Séance de comité
      <select value={value} disabled={disabled} onChange={(e) => choisir(e.target.value)}>
        <option value="">—</option>
        {choix.length > 0 ? (
          <>
            {locales.length > 0 && <optgroup label={`Séances de « ${ici} »`}>{locales}</optgroup>}
            <optgroup label={`Séances de « ${nomComite(comite)} » (comité dont dépend « ${ici} »)`}>
              {choix.map((s, i) => <option key={`${s.uniteId}:${s.id}`} value={`c:${i}`}>🏛️ {s.titre} ({fmtDate(s.date)}){s.uniteId !== comite ? ` · ${nomComite(s.uniteId)}` : ''}</option>)}
            </optgroup>
          </>
        ) : locales}
      </select>
      {lie ? (
        <small className="muted">
          🏛️ À l’ordre du jour et au PV de « {lie.titre} » ({nomComite(lie.uniteId)}) : la tâche est partagée avec ce comité, qui la modifie comme les siennes.
          {reglage === 'rien' && lie.uniteId === parent?.id && ` ⚠️ Réglage de « ${ici} » : « ${TACHES_DEPENDANCE.rien.label} » ; elle n’y apparaîtra pas tant qu’il reste ainsi.`}
        </small>
      ) : parent && lu === null ? (
        <small className="muted">Les séances de « {parent.nom} » seront proposées ici après la mise à jour du serveur (migration 032).</small>
      ) : null}
    </label>
  );
}

/**
 * Tâche partagée par une autre entité (041) : une séance de l'entité ouverte (son ordre du jour et son PV), si la tâche
 * n'est pas déjà liée à une séance de son entité ou d'une autre (seanceAilleurs, en lecture).
 */
export function SeanceIci({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  const club = useClubOptional();
  const ailleurs = t.source?.seanceAilleurs;
  const ici = club?.current.nom ?? 'cette entité';
  return (
    <label className="full">
      Séance de comité
      {ailleurs ? (
        <input value={ailleurs.replace(/^./, (c) => c.toUpperCase())} disabled readOnly />
      ) : (
        <select value={t.meetingId ?? ''} disabled={disabled} onChange={(e) => setT((x) => ({ ...x, meetingId: e.target.value || undefined }))}>
          <option value="">—</option>
          {aVenir(data.meetings, t.meetingId).map((m) => <option key={m.id} value={m.id}>{m.titre} ({fmtDate(m.date)})</option>)}
        </select>
      )}
      <small className="muted">
        {ailleurs
          ? `Elle se change dans « ${t.source!.unite} », l’entité de la tâche.`
          : t.meetingId
            ? `🗓️ À l’ordre du jour et au PV de cette séance de « ${ici} ».`
            : `Une séance de « ${ici} » : la tâche figure alors à son ordre du jour et à son PV.`}
      </small>
    </label>
  );
}

/** Séances et événements à venir (ou en cours), par date ; plus celui déjà choisi, même passé. */
const aVenir = <T extends { id: string; date: string; dateFin?: string }>(list: T[], current?: string) =>
  list.filter((x) => endOf(x) >= today() || x.id === current).sort((a, b) => a.date.localeCompare(b.date));

/**
 * Pour quand ? Une date, ou une date calculée à partir d'un événement / d'une séance (« 1 semaine avant le Tournoi
 * d'automne ») qui suit ensuite ses changements de date. Aussi : une séance du comité dont l'entité dépend, un événement
 * qui dépend du comité ouvert.
 */
export function DelaiField({ t, setT, disabled, dateSeule }: { t: Task; setT: SetT; disabled: boolean; dateSeule?: boolean }) {
  const { data } = useStore();
  const { club, comite, seances: xm, evenements, unite, ici } = useExternes(t);
  const [choisir, setChoisir] = useState(false);
  // Événement qui se répète : à sa prochaine occurrence (tant qu'il en reste).
  const events = aVenir(data.events.map((e) => (e.repetition ? aLaDate(e, occurrenceDu(e, today()) ?? derniereOccurrence(e) ?? e.date) : e)), t.eventId);
  const meetings = aVenir(data.meetings, t.meetingId);
  // Édition pas encore datée : pas de repère pour un délai.
  const xe = evenements.filter((x) => x.date);
  const ref = t.delaiRef;
  const mode = !ref
    ? 'fixe'
    : ref.type === 'event'
      ? t.eventId ? `event:${t.eventId}` : t.evenementEntite ? `xe:${xe.findIndex((x) => memeEvenement(x, t.evenementEntite))}` : 'fixe'
      : t.meetingId ? `meeting:${t.meetingId}` : t.seanceComite ? `xm:${xm.findIndex((s) => memeSeance(s, t.seanceComite))}` : 'fixe';

  const onMode = (v: string) => {
    if (v === 'fixe') {
      setChoisir(false);
      return setT((x) => ({ ...x, delaiRef: undefined }));
    }
    const i = v.indexOf(':');
    const cle = v.slice(0, i);
    const id = v.slice(i + 1);
    setT((x) => {
      const y =
        cle === 'event' ? { ...x, eventId: id, evenementEntite: undefined }
        : cle === 'xe' ? { ...x, eventId: undefined, evenementEntite: xe[Number(id)] }
        : cle === 'meeting' ? { ...x, meetingId: id, seanceComite: undefined }
        : avecSeance(x, xm[Number(id)], club?.central?.id);
      const type = cle === 'event' || cle === 'xe' ? 'event' : 'meeting';
      // Par défaut le jour même ; autre événement : sa prochaine occurrence (s'il se répète).
      return applyDelaiRef(data, sansOccurrence({ ...y, delaiRef: { ...(x.delaiRef ?? makeDelai(0, 'jours', false)), type } }));
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
        { groupe: `Selon un événement qui dépend de « ${ici} »`, options: xe.map((x, i) => ({ value: `xe:${i}`, ...libelleEvenement(x, unite(x.uniteId)) })) },
        {
          groupe: xm.length ? `Selon une séance de « ${ici} »` : 'Selon une séance de comité',
          options: meetings.map((m) => ({ value: `meeting:${m.id}`, label: `${m.titre} (${fmtDate(m.date)})`, icone: <Icone n="seances" /> })),
        },
        {
          groupe: `Selon une séance de « ${unite(comite)?.nom ?? 'comité'} » (comité dont dépend « ${ici} »)`,
          options: xm.map((x, i) => {
            const c = unite(x.uniteId);
            return { value: `xm:${i}`, label: `${x.titre} (${fmtDate(x.date)})`, icone: c ? <PastilleEntite u={c} /> : <Icone n="comite" /> };
          }),
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
              {!choisir && !dateSeule && events.length + meetings.length + xe.length + xm.length > 0 && (
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
