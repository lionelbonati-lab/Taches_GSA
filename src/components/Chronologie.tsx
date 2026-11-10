import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, DelaiUnite, Etiquette, Meeting, SerieEvenements, Task } from '../data/types';
import { aLaDate, derniereOccurrence, fmtHeure, horaire, libelleRepetition, occurrenceDu, occurrenceProche } from '../data/repetition';
import {
  DELAI_MAX, addDays, applyDelaiRef, delaiDepuis, diffDays, endOf, fmtDate, fmtRange, isDone, isLate, makeDelai, newTask, offsetLabel, shortName, splitDelai, today,
} from '../data/utils';
import { dateEntre, versSeance } from '../data/chronologieClub';
import { etiquetteDeLaSerie, etiquetteDeLEvenement, placesPour } from '../data/etiquettes';
import { FILTRE_SERIE, evenementsDeLaSerie, periodeDeLaSerie, pointsDeLaSerie, prochainDeLaSerie, racine, seriePassee } from '../data/seriesEvenements';
import { Empty, Modal, StatusBadge } from './ui';
import { Icone } from './icones';
import { BadgeEtiquette } from './IconesEtiquette';
import { TaskModal } from './FicheTache';
import { Progress } from '../pages/Dashboard';

// Chronologie d'un événement (Agenda › Événements, accueil, calendrier) : ses points dans le temps, avant, pendant et
// après lui (J-60 … Jour J … J+7), avec « Aujourd'hui » et les points sans délai à placer. Pour planifier : « Planifier un
// point » (fiche préremplie, délai calé sur l'événement) et « Placer » / « Déplacer » un point (« 2 semaines avant ») ;
// le délai suit ensuite la date de l'événement, et une reprise l'an prochain garde le même écart.
// Les points de l'événement : rattachés à lui, ou qui portent son étiquette (ceux qu'on voit).
// Chronologie d'une série d'événements (ChronologieSerie) : celles de tous ses événements sur une même frise.
// Les deux montrent aussi les séances du club (qui les voit) dans le temps qu'elles couvrent, et se règlent à la souris :
// un point glissé entre deux lignes y prend sa date (calé sur son événement), sur un événement il y est rattaché, sur une
// séance aussi (son délai calé sur elle).

/** L'événement ouvert : un événement de l'agenda (`serie`, à sa date `date` s'il se répète) ou une étiquette datée seule. */
export type CibleChrono = { serie?: ClubEvent; date: string; etiquette?: Etiquette };

/** Écart avec l'événement, tel qu'on le saisit (le nombre en texte : on peut l'effacer le temps d'en écrire un autre). */
type Ecart = { n: string; unite: DelaiUnite; apres: boolean };

const RACCOURCIS: { label: string; n: number; unite: DelaiUnite; apres: boolean }[] = [
  { label: '2 mois avant', n: 2, unite: 'mois', apres: false },
  { label: '1 mois avant', n: 1, unite: 'mois', apres: false },
  { label: '2 semaines avant', n: 2, unite: 'semaines', apres: false },
  { label: '1 semaine avant', n: 1, unite: 'semaines', apres: false },
  { label: 'La veille', n: 1, unite: 'jours', apres: false },
  { label: 'Le jour même', n: 0, unite: 'jours', apres: false },
  { label: '1 semaine après', n: 1, unite: 'semaines', apres: true },
];

const nombre = (e: Ecart) => Math.max(0, Math.min(DELAI_MAX, Math.round(Number(e.n)) || 0));
const decalage = (e: Ecart) => makeDelai(nombre(e), e.unite, e.apres);

/** « lun. 28 janv. » (l'année si ce n'est pas celle de `annee`). */
const jourCourt = (d: string, annee: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', ...(d.slice(0, 4) !== annee ? { year: 'numeric' } : {}) });
const nomMois = (d: string) => new Date(d.slice(0, 7) + '-15T12:00:00').toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });

/** Écart du jour `d` par rapport au jour J `j`, comme on le saisit : en semaines s'il tombe juste, sinon en jours. */
function ecartVers(j: string, d: string): Ecart {
  const n = diffDays(j, d);
  const a = Math.abs(n);
  return a && a % 7 === 0 ? { n: String(a / 7), unite: 'semaines', apres: n > 0 } : { n: String(a), unite: 'jours', apres: n > 0 };
}

/** Séances du club du `de` au `a` (compris), par date. */
const seancesEntre = (meetings: Meeting[], de: string, a: string) =>
  meetings.filter((m) => m.date && m.date >= de && m.date <= a).sort((x, y) => x.date.localeCompare(y.date) || (x.heure ?? '').localeCompare(y.heure ?? ''));

type Glisser = ReturnType<typeof useGlisser>;

/**
 * Glisser-déposer des points sur une frise (à la souris) : le point pris, la ligne ou la zone survolée. `prendre` : de quoi
 * glisser un point ; `recoit` : une ligne (`cle`) qui reçoit le point lâché (`deposer`), s'il `accepte`.
 */
function useGlisser() {
  const [glisse, setGlisse] = useState<Task | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  // Le point pris, aussi hors du rendu : les lignes le reçoivent dès le premier survol.
  const pris = useRef<Task | null>(null);
  const fin = () => {
    pris.current = null;
    setGlisse(null);
    setSurvol(null);
  };
  const prendre = (t: Task) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.titre);
      pris.current = t;
      setGlisse(t);
    },
    onDragEnd: fin,
  });
  const recoit = (cle: string, deposer: (t: Task) => void, accepte: (t: Task) => boolean = () => true) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!pris.current || !accepte(pris.current)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setSurvol(cle);
    },
    onDragLeave: () => setSurvol((x) => (x === cle ? null : x)),
    onDrop: (e: React.DragEvent) => {
      const t = pris.current;
      if (!t || !accepte(t)) return;
      e.preventDefault();
      fin();
      deposer(t);
    },
  });
  return { glisse, survol, prendre, recoit };
}

/** Entre deux lignes de la frise : de quoi déposer un point, qui y prend la date `date` (visible pendant qu'on glisse). */
function zoneDepot(g: Glisser, cle: string, date: string, dater: (t: Task, date: string) => void) {
  return (
    <li key={cle} className={`chrono-depot ${g.survol === cle ? 'survol' : ''}`} aria-hidden="true" {...g.recoit(cle, (t) => dater(t, date))}>
      <span>Déposer ici · le {fmtDate(date)}</span>
    </li>
  );
}

/** Une séance sur la frise : `quand` (« J-12 », « Séance ») ; on y dépose un point pour l'y rattacher. */
function ligneSeance(g: Glisser, m: Meeting, quand: string, annee: string, deposer: (t: Task, m: Meeting) => void) {
  const cle = `s:${m.id}`;
  return (
    <li key={cle} className={`chrono-ligne chrono-seance ${g.survol === cle ? 'survol' : ''}`} {...g.recoit(cle, (t) => deposer(t, m), (t) => t.meetingId !== m.id)}>
      <span className="chrono-quand"><b>{quand}</b><small>{jourCourt(m.date, annee)}</small></span>
      <span className="chrono-puce" aria-hidden="true"><Icone n="seances" /></span>
      <div className="chrono-corps">
        <Link className="chrono-titre" to={`/comite?seance=${encodeURIComponent(m.id)}`} title="Ouvrir la séance">{m.titre}</Link>
        <span className="muted">{['Séance', fmtHeure(m.heure), m.lieu].filter(Boolean).join(' · ')}</span>
      </div>
    </li>
  );
}

/** Nombre, unité, avant / après l'événement. */
function ChampEcart({ v, onChange }: { v: Ecart; onChange: (v: Ecart) => void }) {
  const n = nombre(v);
  return (
    <span className="chrono-ecart">
      <input type="number" inputMode="numeric" min={0} max={DELAI_MAX} value={v.n} aria-label="Combien" onChange={(e) => onChange({ ...v, n: e.target.value })} />
      <select value={v.unite} aria-label="Unité" onChange={(e) => onChange({ ...v, unite: e.target.value as DelaiUnite })}>
        <option value="jours">{n > 1 ? 'jours' : 'jour'}</option>
        <option value="semaines">{n > 1 ? 'semaines' : 'semaine'}</option>
        <option value="mois">mois</option>
      </select>
      <select value={v.apres ? 'apres' : 'avant'} aria-label="Avant ou après l’événement" onChange={(e) => onChange({ ...v, apres: e.target.value === 'apres' })}>
        <option value="avant">avant</option>
        <option value="apres">après</option>
      </select>
    </span>
  );
}

export function Chronologie({ cible, onClose }: { cible: CibleChrono; onClose: () => void }) {
  const { data, user, can, canSeeTask, canEditTask, creatableSections, peutRanger, peutEtiqueter, saveTask, setToast } = useStore();
  const [fiche, setFiche] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [cacherFaits, setCacherFaits] = useState(false);
  const [voirSeances, setVoirSeances] = useState(true);
  const [titre, setTitre] = useState('');
  const [ecart, setEcart] = useState<Ecart>({ n: '1', unite: 'semaines', apres: false });
  // Point en train d'être placé (son écart).
  const [place, setPlace] = useState<{ id: string; v: Ecart } | null>(null);
  const g = useGlisser();
  if (!user) return null;

  const serie = cible.serie ? data.events.find((x) => x.id === cible.serie!.id) ?? cible.serie : undefined;
  const ev = serie ? aLaDate(serie, cible.date) : undefined;
  // Son étiquette ; sans, celle du même jour montrée avec lui (ancienne étiquette pas encore reliée).
  const et = (serie && etiquetteDeLEvenement(data, serie.id)) || (cible.etiquette && (data.etiquettes ?? []).find((x) => x.id === cible.etiquette!.id)) || undefined;
  const nom = ev?.nom ?? et?.nom ?? '';
  const debut = ev?.date ?? et?.date ?? cible.date;
  const fin = ev ? endOf(ev) : endOf({ date: debut, dateFin: et?.dateFin });
  const jour = today();
  const annee = debut.slice(0, 4);

  const points = data.tasks.filter(
    (t) => !t.paiement && canSeeTask(t) && ((!!serie && t.eventId === serie.id) || (!!et && !!t.etiquettes?.includes(et.id))),
  );
  const faits = points.filter((t) => isDone(data, t)).length;
  const montres = points.filter((t) => !cacherFaits || !isDone(data, t));
  const sansDelai = montres.filter((t) => !t.delai).sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  const enRetard = points.filter((t) => isLate(data, t)).length;

  /** « J-30 », « Jour J », « J+2 ». */
  const relatif = (d: string) => {
    const n = diffDays(debut, d);
    return n < 0 ? `J-${-n}` : n === 0 ? 'Jour J' : `J+${n}`;
  };
  /** Le délai du point suit la date de cet événement (📌). */
  const cale = (t: Task) =>
    !!t.delaiRef && ((t.delaiRef.type === 'event' && !!serie && t.eventId === serie.id) || (t.delaiRef.type === 'etiquette' && !!et && t.delaiRef.etiquetteId === et.id));

  /**
   * Le point, son délai calé sur l'événement (`e` : l'écart) ; `null` s'il ne peut pas l'être (rattaché à un autre
   * événement ; étiquette seule qu'on ne peut pas mettre).
   */
  const caler = (t: Task, e: Ecart): Task | null => {
    const d = decalage(e);
    if (serie) {
      if (t.eventId && t.eventId !== serie.id) return null;
      return applyDelaiRef(data, { ...t, eventId: serie.id, delaiRef: { type: 'event', ...d, ...(serie.repetition ? { occurrence: debut } : {}) } });
    }
    if (!et?.date || !(t.etiquettes?.includes(et.id) || peutEtiqueter(et.id))) return null;
    const etiquettes = t.etiquettes?.includes(et.id) ? t.etiquettes : [...(t.etiquettes ?? []), et.id];
    return applyDelaiRef(data, { ...t, etiquettes, delaiRef: { type: 'etiquette', etiquetteId: et.id, ...d } });
  };
  const placable = (t: Task) => canEditTask(t) && !!caler(t, { n: '0', unite: 'jours', apres: false });
  /** Écart actuel du point (calé : le sien ; date fixe : en jours ; sans délai : une semaine avant). */
  const ecartDe = (t: Task): Ecart => {
    if (cale(t)) {
      const x = splitDelai(t.delaiRef!);
      return { n: String(x.n), unite: x.unite, apres: x.apres };
    }
    if (!t.delai) return { n: '1', unite: 'semaines', apres: false };
    const n = diffDays(t.delai, debut);
    return { n: String(Math.abs(n)), unite: 'jours', apres: n < 0 };
  };
  const valider = (t: Task, e: Ecart) => {
    const x = caler(t, e);
    setPlace(null);
    if (!x) return;
    saveTask(x, false);
    setToast(`« ${t.titre} » : ${offsetLabel(decalage(e)).toLowerCase()} (${fmtDate(x.delai)}), calé sur « ${nom} »`);
  };
  // Glissé entre deux lignes (ou sur le jour J) : à cette date, calé sur l'événement ; s'il ne peut pas l'être, à date fixe.
  const dater = (t: Task, d: string) => {
    if (caler(t, { n: '0', unite: 'jours', apres: false })) return valider(t, ecartVers(debut, d));
    saveTask({ ...t, delai: d, delaiRef: undefined }, false);
    setToast(`« ${t.titre} » : le ${fmtDate(d)}`);
  };
  // Glissé sur une séance : rattaché à elle, son délai calé sur elle (il reste dans l'événement).
  const versLaSeance = (t: Task, m: Meeting) => {
    const x = versSeance(data, t, m);
    saveTask(x, false);
    setToast(`« ${t.titre} » → ${m.titre} (${fmtDate(x.delai)})`);
  };

  // Planifier un point : sa fiche, préremplie (titre, délai calé sur l'événement, rangé à la place de son étiquette, dans
  // « Newsletter » pour une newsletter, ou dans la sous-section de l'événement, quand on peut y ranger le point).
  const peutCreer = creatableSections().length > 0;
  const dateEcart = delaiDepuis(decalage(ecart), debut);
  const planifier = () => {
    const ici = placesPour(data, { et, ev }).find((l) => peutRanger(l.sectionId, l.sousSection ?? ''));
    const base = newTask(user.id, { titre: titre.trim(), ...(ici ? { sectionId: ici.sectionId, sousSection: ici.sousSection ?? '' } : {}) });
    setFiche({ task: caler(base, ecart) ?? { ...base, delai: dateEcart }, isNew: true });
    setTitre('');
  };

  const qui = (t: Task) => {
    const noms = [...t.responsables.map((id) => shortName(data.people.find((p) => p.id === id))), ...(t.respHors ?? []).map((p) => shortName(p))];
    return noms.length ? noms.join(', ') : t.aPrendre ? '🙋 à prendre' : 'personne pour l’instant';
  };

  const ligne = (t: Task) => {
    const enCours = place?.id === t.id ? place : null;
    const d = t.delai;
    const glissable = canEditTask(t) && !enCours;
    return (
      <li
        key={t.id}
        className={`chrono-ligne chrono-point ${isDone(data, t) ? 'fait' : ''} ${isLate(data, t) ? 'retard' : ''} ${d && d >= debut && d <= fin ? 'pendant' : ''} ${glissable ? 'glissable' : ''} ${g.glisse?.id === t.id ? 'pris' : ''}`}
        {...(glissable ? g.prendre(t) : {})}
      >
        <span className="chrono-quand">
          {d ? <><b>{relatif(d)}</b><small>{jourCourt(d, annee)}</small></> : <b className="muted">—</b>}
        </span>
        <span className="chrono-puce" aria-hidden="true">{isDone(data, t) ? '✓' : ''}</span>
        <div className="chrono-corps">
          <button type="button" className="chrono-titre" onClick={() => setFiche({ task: t, isNew: false })} title="Ouvrir le point">
            {t.titre || '(sans titre)'}
          </button>
          <span className="chrono-info">
            <StatusBadge task={t} />
            <span className="muted">{qui(t)}</span>
            {cale(t) && (
              <span className="chrono-cale" title={`Le délai suit la date de « ${nom} »`}>
                <Icone n="epingle" /> {offsetLabel(t.delaiRef!).toLowerCase()}
              </span>
            )}
          </span>
          {enCours && (
            <div className="chrono-placer" role="group" aria-label={`Placer « ${t.titre} »`}>
              <ChampEcart v={enCours.v} onChange={(v) => setPlace({ id: t.id, v })} />
              <small className="delai-calc">→ {fmtDate(delaiDepuis(decalage(enCours.v), debut))}</small>
              <button type="button" className="btn small primary" onClick={() => valider(t, enCours.v)}>OK</button>
              <button type="button" className="btn small" onClick={() => setPlace(null)}>Annuler</button>
            </div>
          )}
        </div>
        {!enCours && placable(t) && (
          <button type="button" className="btn small chrono-bouger" onClick={() => setPlace({ id: t.id, v: ecartDe(t) })} title="Choisir combien de temps avant ou après l’événement">
            <Icone n="date" /> {d ? 'Déplacer' : 'Placer'}
          </button>
        )}
      </li>
    );
  };

  // La frise : les points datés, « Aujourd'hui », le jour J et les séances du club dans ce temps-là, par date (le même
  // jour : aujourd'hui, les séances, le jour J, puis les points), avec le mois en intercalaire ; entre deux lignes, de quoi
  // y déposer un point.
  type Repere = { k: 'point'; date: string; t: Task } | { k: 'jour' | 'evenement'; date: string } | { k: 'seance'; date: string; m: Meeting };
  const rang = { jour: 0, seance: 1, evenement: 2, point: 3 };
  const base: Repere[] = [
    ...montres.filter((t) => t.delai).map((t): Repere => ({ k: 'point', date: t.delai, t })),
    { k: 'evenement', date: debut },
    { k: 'jour', date: jour },
  ];
  const bornes = base.map((r) => r.date).sort();
  const seances = can('tab.meetings') ? seancesEntre(data.meetings, bornes[0], bornes[bornes.length - 1]) : [];
  const reperes = [...base, ...(voirSeances ? seances.map((m): Repere => ({ k: 'seance', date: m.date, m })) : [])].sort(
    (a, b) => a.date.localeCompare(b.date) || rang[a.k] - rang[b.k] || (a.k === 'point' && b.k === 'point' ? a.t.titre.localeCompare(b.t.titre, 'fr') : 0),
  );
  const frise: JSX.Element[] = [];
  let mois = '';
  let prec: string | undefined;
  for (const r of reperes) {
    frise.push(zoneDepot(g, `z:${frise.length}`, prec ? dateEntre(prec, r.date) : addDays(r.date, -7), dater));
    prec = r.date;
    if (r.date.slice(0, 7) !== mois) {
      mois = r.date.slice(0, 7);
      frise.push(<li key={`m:${mois}`} className="chrono-mois">{nomMois(r.date)}</li>);
    }
    if (r.k === 'point') frise.push(ligne(r.t));
    else if (r.k === 'seance') frise.push(ligneSeance(g, r.m, relatif(r.date), annee, versLaSeance));
    else if (r.k === 'evenement')
      frise.push(
        <li
          key="jour-j"
          className={`chrono-ligne chrono-jourj ${g.survol === 'jourj' ? 'survol' : ''}`}
          style={et ? ({ '--c': et.couleur } as React.CSSProperties) : undefined}
          {...g.recoit('jourj', (t) => dater(t, debut))}
        >
          <span className="chrono-quand"><b>Jour J</b><small>{jourCourt(debut, annee)}</small></span>
          <span className="chrono-puce" aria-hidden="true"><Icone n="evenements" /></span>
          <div className="chrono-corps">
            <strong>{nom}</strong>
            <span className="muted">{[fmtRange(debut, fin), ev && horaire(ev), ev?.lieu].filter(Boolean).join(' · ')}</span>
          </div>
        </li>,
      );
    else
      frise.push(
        <li key="aujourdhui" className="chrono-ligne chrono-aujourdhui">
          <span className="chrono-quand"><b>Aujourd’hui</b><small>{relatif(jour)}</small></span>
          <span className="chrono-puce" aria-hidden="true" />
          <div className="chrono-corps muted">
            {debut > jour ? `L’événement est dans ${diffDays(jour, debut)} j` : fin >= jour ? 'L’événement est en cours' : `L’événement est passé depuis ${diffDays(fin, jour)} j`}
          </div>
        </li>,
      );
  }
  if (prec) frise.push(zoneDepot(g, `z:${frise.length}`, addDays(prec, 7), dater));

  return (
    <Modal title={`Chronologie · ${nom}`} icone="horloge" onClose={onClose} wide className="chronologie">
      <div className="chrono-tete">
        <span className="chrono-quoi">
          {et && <BadgeEtiquette e={et} />} <span>{[fmtRange(debut, fin), ev && horaire(ev), ev?.lieu].filter(Boolean).join(' · ')}</span>
        </span>
        <Progress done={faits} total={points.length} />
        <span className="muted chrono-compte">
          {[enRetard && `${enRetard} en retard`, points.filter((t) => !t.delai).length && `${points.filter((t) => !t.delai).length} sans délai`].filter(Boolean).join(' · ')}
        </span>
      </div>

      {peutCreer && (
        <form className="chrono-planifier" onSubmit={(e) => { e.preventDefault(); planifier(); }}>
          <strong><Icone n="ajoutTache" /> Planifier un point</strong>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Que faut-il faire ?" aria-label="Point à planifier" maxLength={200} />
          <span className="chrono-ecart-ligne">
            <ChampEcart v={ecart} onChange={setEcart} />
            <small className="delai-calc">→ {fmtDate(dateEcart)}</small>
          </span>
          <span className="chips chrono-raccourcis">
            {RACCOURCIS.map((r) => {
              const on = nombre(ecart) === r.n && ecart.unite === r.unite && (ecart.apres === r.apres || r.n === 0);
              return (
                <button key={r.label} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setEcart({ n: String(r.n), unite: r.unite, apres: r.apres })}>
                  {r.label}
                </button>
              );
            })}
          </span>
          <button type="submit" className="btn primary">Ajouter…</button>
        </form>
      )}

      <Filtres points={points.length} seances={seances.length} cacherFaits={cacherFaits} setCacherFaits={setCacherFaits} voirSeances={voirSeances} setVoirSeances={setVoirSeances} />

      {sansDelai.length > 0 && (
        <section className="chrono-sans-delai">
          <h3><Icone n="alerte" /> À placer dans le temps ({sansDelai.length}) <small className="muted">· sans délai</small></h3>
          <ul className="chrono-liste">{sansDelai.map(ligne)}</ul>
        </section>
      )}

      <ol className={`chrono-liste chrono-frise ${g.glisse ? 'glisse' : ''}`} aria-label={`Points de « ${nom} » dans le temps`}>{frise}</ol>
      {!points.length && <Empty>Aucun point pour l’instant.{peutCreer ? ' Planifie le premier ci-dessus : « 1 mois avant », « la veille »…' : ''}</Empty>}

      <p className="muted chrono-note">
        <Icone n="epingle" /> Calé sur l’événement : le délai suit sa date, et une reprise l’an prochain garde le même écart.
        {' '}À la souris : glisse un point entre deux lignes pour lui donner cette date, sur une séance pour l’y rattacher.
      </p>
      <div className="modal-foot">
        {/* Avec une étiquette : tous ses points (rangés chez elle ou rattachés à l'événement) ; sinon, ceux rattachés. */}
        <Link to={et ? `/taches?etiquette=${encodeURIComponent(et.id)}` : `/taches?event=${encodeURIComponent(serie?.id ?? '')}`}>Voir dans la liste des points →</Link>
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>Fermer</button>
      </div>
      {fiche && <TaskModal task={fiche.task} isNew={fiche.isNew} onClose={() => setFiche(null)} />}
    </Modal>
  );
}

/** « Masquer les terminés » (s'il y a des points) et « Afficher les séances » (s'il y en a dans ce temps-là). */
function Filtres({ points, seances, cacherFaits, setCacherFaits, voirSeances, setVoirSeances }: {
  points: number; seances: number; cacherFaits: boolean; setCacherFaits: (x: boolean) => void; voirSeances: boolean; setVoirSeances: (x: boolean) => void;
}) {
  if (!points && !seances) return null;
  return (
    <div className="chrono-filtres">
      {points > 0 && (
        <label className="inline hide-toggle chrono-filtre">
          <input type="checkbox" checked={cacherFaits} onChange={(e) => setCacherFaits(e.target.checked)} /> Masquer les terminés
        </label>
      )}
      {seances > 0 && (
        <label className="inline hide-toggle chrono-filtre">
          <input type="checkbox" checked={voirSeances} onChange={(e) => setVoirSeances(e.target.checked)} /> Afficher les séances ({seances})
        </label>
      )}
    </div>
  );
}

/** « J-30 », « Jour J », « J+2 » : le jour `d` par rapport au jour J `j`. */
const ecartJ = (j: string, d: string) => {
  const n = diffDays(j, d);
  return n < 0 ? `J-${-n}` : n === 0 ? 'Jour J' : `J+${n}`;
};

/**
 * Chronologie d'une série d'événements (programme hivernal, championnat ; seriesEvenements.ts) : celles de tous ses
 * événements sur une même frise. Le jour J de chacun (un événement qui se répète : sa première date et celles que suivent
 * des points, pas chaque semaine), chaque point avec son événement et son écart (« J-7 · Natation »), ceux de la série
 * seule (son étiquette) à leur date ; « Aujourd'hui » ; les points sans délai, à placer. « Planifier un point » : pour
 * l'un de ses événements (calé sur lui ; s'il se répète, sur sa prochaine date) ou pour toute la série (à une date, chez
 * son étiquette) ; « Placer » / « Déplacer » un point par rapport à son événement.
 */
export function ChronologieSerie({ serie, onClose }: { serie: SerieEvenements; onClose: () => void }) {
  const { data, user, can, canSeeTask, canEditTask, creatableSections, peutRanger, peutEtiqueter, saveTask, setToast } = useStore();
  const [fiche, setFiche] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [cacherFaits, setCacherFaits] = useState(false);
  const [voirSeances, setVoirSeances] = useState(true);
  const [titre, setTitre] = useState('');
  const [ecart, setEcart] = useState<Ecart>({ n: '1', unite: 'semaines', apres: false });
  const g = useGlisser();
  // Pour quel événement planifier (d'office le prochain) ; '' : toute la série.
  const [pour, setPour] = useState(() => {
    const p = prochainDeLaSerie(evenementsDeLaSerie(data.events, serie.id));
    return p ? racine(data.events, p) : '';
  });
  const [place, setPlace] = useState<{ id: string; v: Ecart } | null>(null);
  if (!user) return null;

  const s = data.seriesEvenements?.find((x) => x.id === serie.id) ?? serie;
  const evs = evenementsDeLaSerie(data.events, s.id);
  const racines = evs.filter((e) => racine(data.events, e) === e.id);
  const jour = today();
  const annee = jour.slice(0, 4);
  const etSerie = etiquetteDeLaSerie(data, s.id);
  const periode = periodeDeLaSerie(evs, s);
  // L'étiquette d'un événement (une date modifiée seule : celle de son événement d'origine).
  const etiquetteEv = new Map(evs.map((e) => [e.id, etiquetteDeLEvenement(data, racine(data.events, e))]));
  const couleur = (e?: ClubEvent) => (e && etiquetteEv.get(e.id)?.couleur) || etSerie?.couleur;

  const points = pointsDeLaSerie(data, s.id, evs).filter((t) => !t.paiement && canSeeTask(t));
  const faits = points.filter((t) => isDone(data, t)).length;
  const montres = points.filter((t) => !cacherFaits || !isDone(data, t));
  const sansDelai = montres.filter((t) => !t.delai).sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  const enRetard = points.filter((t) => isLate(data, t)).length;

  /** L'événement du point : celui auquel il est rattaché, sinon celui dont il porte l'étiquette ; aucun : la série seule. */
  const evDe = (t: Task) =>
    evs.find((e) => e.id === t.eventId) ??
    evs.find((e) => {
      const et = etiquetteEv.get(e.id);
      return !!et && !!t.etiquettes?.includes(et.id);
    });
  /** Son jour J : la date de son événement ; s'il se répète, l'occurrence suivie (sinon la plus proche de son délai). */
  const jourJ = (t: Task, e: ClubEvent) =>
    !e.repetition
      ? e.date
      : (t.eventId === e.id && t.delaiRef?.type === 'event' && t.delaiRef.occurrence) || (t.delai && occurrenceProche(e, t.delai)) || occurrenceDu(e, jour) || e.date;
  /** Le délai du point suit la date de son événement (📌). */
  const cale = (t: Task, e?: ClubEvent) => !!e && t.eventId === e.id && t.delaiRef?.type === 'event';

  /** Le point, son délai calé sur son événement `e` (au jour J `j`) ; `null` s'il est rattaché à un autre événement. */
  const caler = (t: Task, e: ClubEvent, j: string, v: Ecart): Task | null => {
    if (t.eventId && t.eventId !== e.id) return null;
    return applyDelaiRef(data, { ...t, eventId: e.id, delaiRef: { type: 'event', ...decalage(v), ...(e.repetition ? { occurrence: j } : {}) } });
  };
  const ecartDe = (t: Task, e: ClubEvent): Ecart => {
    if (cale(t, e)) {
      const x = splitDelai(t.delaiRef!);
      return { n: String(x.n), unite: x.unite, apres: x.apres };
    }
    if (!t.delai) return { n: '1', unite: 'semaines', apres: false };
    const n = diffDays(t.delai, jourJ(t, e));
    return { n: String(Math.abs(n)), unite: 'jours', apres: n < 0 };
  };
  const valider = (t: Task, v: Ecart) => {
    const e = evDe(t);
    setPlace(null);
    const x = e && caler(t, e, jourJ(t, e), v);
    if (!x) return;
    saveTask(x, false);
    setToast(`« ${t.titre} » : ${offsetLabel(decalage(v)).toLowerCase()} (${fmtDate(x.delai)}), calé sur « ${e!.nom} »`);
  };
  /** « Manche 2 », « Natation du 27.11.2026 ». */
  const nomJalon = (e: ClubEvent, j: string) => `${e.nom}${e.repetition ? ` du ${fmtDate(j)}` : ''}`;
  // Glissé entre deux lignes : à cette date, calé sur son événement (s'il se répète : sur sa date la plus proche) ; un point
  // de la série seule, ou rattaché ailleurs : à date fixe.
  const dater = (t: Task, d: string) => {
    const e = evDe(t);
    const j = e && (e.repetition ? occurrenceProche(e, d) ?? jourJ(t, e) : e.date);
    const v = j ? ecartVers(j, d) : undefined;
    const x = e && j && v && caler(t, e, j, v);
    if (x) {
      saveTask(x, false);
      return setToast(`« ${t.titre} » : ${offsetLabel(decalage(v!)).toLowerCase()} (${fmtDate(x.delai)}), calé sur « ${nomJalon(e!, j!)} »`);
    }
    saveTask({ ...t, delai: d, delaiRef: undefined }, false);
    setToast(`« ${t.titre} » : le ${fmtDate(d)}`);
  };
  // Glissé sur un événement de la série (à une date) : rattaché à lui, au même écart s'il était calé sur le sien, sinon le
  // jour même.
  const versJalon = (t: Task, e: ClubEvent, j: string) => {
    const avant = evDe(t);
    const v: Ecart = avant && cale(t, avant) ? ecartDe(t, avant) : { n: '0', unite: 'jours', apres: false };
    const x = caler({ ...t, eventId: undefined }, e, j, v)!;
    saveTask(x, false);
    setToast(`« ${t.titre} » → ${nomJalon(e, j)} : ${offsetLabel(decalage(v)).toLowerCase()} (${fmtDate(x.delai)})`);
  };
  // Glissé sur une séance : rattaché à elle, son délai calé sur elle (il reste dans la série).
  const versLaSeance = (t: Task, m: Meeting) => {
    const x = versSeance(data, t, m);
    saveTask(x, false);
    setToast(`« ${t.titre} » → ${m.titre} (${fmtDate(x.delai)})`);
  };

  // Planifier un point : pour un événement (calé sur lui, rangé chez son étiquette, dans « Newsletter » pour une newsletter,
  // ou dans sa sous-section quand on peut), ou pour toute la série (à la date choisie, chez son étiquette).
  const peutCreer = creatableSections().length > 0;
  const evPour = racines.find((e) => e.id === pour);
  const refPour = evPour ? (evPour.repetition ? occurrenceDu(evPour, jour) ?? derniereOccurrence(evPour) ?? evPour.date : evPour.date) : (periode?.debut ?? jour);
  const dateEcart = delaiDepuis(decalage(ecart), refPour);
  const planifier = () => {
    const et = evPour ? etiquetteEv.get(evPour.id) : etSerie;
    const ici = placesPour(data, evPour ? { et, ev: evPour } : { et, serie: s }).find((l) => peutRanger(l.sectionId, l.sousSection ?? ''));
    const base = newTask(user.id, { titre: titre.trim(), ...(ici ? { sectionId: ici.sectionId, sousSection: ici.sousSection ?? '' } : {}) });
    const task = evPour
      ? caler(base, evPour, refPour, ecart)!
      : { ...base, delai: dateEcart, ...(etSerie && peutEtiqueter(etSerie.id) ? { etiquettes: [...new Set([...(base.etiquettes ?? []), etSerie.id])] } : {}) };
    setFiche({ task, isNew: true });
    setTitre('');
  };

  const qui = (t: Task) => {
    const noms = [...t.responsables.map((id) => shortName(data.people.find((p) => p.id === id))), ...(t.respHors ?? []).map((p) => shortName(p))];
    return noms.length ? noms.join(', ') : t.aPrendre ? '🙋 à prendre' : 'personne pour l’instant';
  };

  const ligne = (t: Task) => {
    const e = evDe(t);
    const j = e ? jourJ(t, e) : undefined;
    const enCours = place?.id === t.id ? place : null;
    const d = t.delai;
    const pendant = !!d && !!e && !!j && d >= j && d <= endOf(aLaDate(e, j));
    const glissable = canEditTask(t) && !enCours;
    return (
      <li
        key={t.id}
        className={`chrono-ligne chrono-point ${isDone(data, t) ? 'fait' : ''} ${isLate(data, t) ? 'retard' : ''} ${pendant ? 'pendant' : ''} ${glissable ? 'glissable' : ''} ${g.glisse?.id === t.id ? 'pris' : ''}`}
        {...(glissable ? g.prendre(t) : {})}
      >
        <span className="chrono-quand">
          {d ? <><b>{j ? ecartJ(j, d) : jourCourt(d, annee)}</b><small>{j ? jourCourt(d, annee) : ''}</small></> : <b className="muted">—</b>}
        </span>
        <span className="chrono-puce" aria-hidden="true">{isDone(data, t) ? '✓' : ''}</span>
        <div className="chrono-corps">
          <button type="button" className="chrono-titre" onClick={() => setFiche({ task: t, isNew: false })} title="Ouvrir le point">
            {t.titre || '(sans titre)'}
          </button>
          <span className="chrono-info">
            <span className="chrono-de" style={{ '--c': couleur(e) } as React.CSSProperties}>
              <Icone n={e ? 'evenements' : 'serie'} /> {e ? `${e.nom}${e.repetition && j ? ` du ${fmtDate(j)}` : ''}` : 'Toute la série'}
            </span>
            <StatusBadge task={t} />
            <span className="muted">{qui(t)}</span>
            {cale(t, e) && (
              <span className="chrono-cale" title={`Le délai suit la date de « ${e!.nom} »`}>
                <Icone n="epingle" /> {offsetLabel(t.delaiRef!).toLowerCase()}
              </span>
            )}
          </span>
          {enCours && e && j && (
            <div className="chrono-placer" role="group" aria-label={`Placer « ${t.titre} »`}>
              <ChampEcart v={enCours.v} onChange={(v) => setPlace({ id: t.id, v })} />
              <small className="delai-calc">→ {fmtDate(delaiDepuis(decalage(enCours.v), j))}</small>
              <button type="button" className="btn small primary" onClick={() => valider(t, enCours.v)}>OK</button>
              <button type="button" className="btn small" onClick={() => setPlace(null)}>Annuler</button>
            </div>
          )}
        </div>
        {!enCours && e && canEditTask(t) && (!t.eventId || t.eventId === e.id) && (
          <button type="button" className="btn small chrono-bouger" onClick={() => setPlace({ id: t.id, v: ecartDe(t, e) })} title={`Choisir combien de temps avant ou après « ${e.nom} »`}>
            <Icone n="date" /> {d ? 'Déplacer' : 'Placer'}
          </button>
        )}
      </li>
    );
  };

  // Les jours J : chaque événement à sa date ; celui qui se répète, à sa première date et à celles que suivent des points.
  type Jalon = { date: string; e: ClubEvent; debut: boolean };
  const jalons: Jalon[] = [];
  for (const e of evs) {
    if (!e.repetition) {
      jalons.push({ date: e.date, e, debut: false });
      continue;
    }
    const dates = new Set([e.date, ...montres.filter((t) => t.delai && evDe(t)?.id === e.id).map((t) => jourJ(t, e))]);
    [...dates].forEach((d) => jalons.push({ date: d, e, debut: d === e.date }));
  }
  // La frise : les points datés, les jours J, « Aujourd'hui » et les séances du club dans ce temps-là, par date (le même
  // jour : aujourd'hui, les séances, les jours J, les points), avec le mois en intercalaire ; entre deux lignes, de quoi y
  // déposer un point.
  type Repere =
    | { k: 'point'; date: string; t: Task }
    | { k: 'evenement'; date: string; j: Jalon }
    | { k: 'jour'; date: string }
    | { k: 'officiel'; date: string; fin: boolean }
    | { k: 'seance'; date: string; m: Meeting };
  const rang = { jour: 0, seance: 1, officiel: 2, evenement: 3, point: 4 };
  const base = [
    ...montres.filter((t) => t.delai).map((t): Repere => ({ k: 'point', date: t.delai, t })),
    ...jalons.map((j): Repere => ({ k: 'evenement', date: j.date, j })),
    // Sa période officielle (programme hivernal : les changements d'heure).
    ...(s.debut ? [{ k: 'officiel', date: s.debut, fin: false } as Repere] : []),
    ...(s.fin ? [{ k: 'officiel', date: s.fin, fin: true } as Repere] : []),
    { k: 'jour', date: jour } as Repere,
  ];
  // Les séances : dans le temps de la frise et de toute la période de la série.
  const bornes = [...base.map((r) => r.date), ...(periode ? [periode.debut, periode.fin ?? periode.debut] : [])].sort();
  const seances = can('tab.meetings') ? seancesEntre(data.meetings, bornes[0], bornes[bornes.length - 1]) : [];
  const reperes = [...base, ...(voirSeances ? seances.map((m): Repere => ({ k: 'seance', date: m.date, m })) : [])].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || rang[a.k] - rang[b.k] ||
      (a.k === 'point' && b.k === 'point' ? a.t.titre.localeCompare(b.t.titre, 'fr') : a.k === 'evenement' && b.k === 'evenement' ? (a.j.e.heure ?? '').localeCompare(b.j.e.heure ?? '') : 0),
  );
  const prochain = prochainDeLaSerie(evs, jour);
  const passee = seriePassee(evs, jour);
  const frise: JSX.Element[] = [];
  let mois = '';
  let prec: string | undefined;
  for (const r of reperes) {
    frise.push(zoneDepot(g, `z:${frise.length}`, prec ? dateEntre(prec, r.date) : addDays(r.date, -7), dater));
    prec = r.date;
    if (r.date.slice(0, 7) !== mois) {
      mois = r.date.slice(0, 7);
      frise.push(<li key={`m:${mois}`} className="chrono-mois">{nomMois(r.date)}</li>);
    }
    if (r.k === 'point') frise.push(ligne(r.t));
    else if (r.k === 'seance') frise.push(ligneSeance(g, r.m, 'Séance', annee, versLaSeance));
    else if (r.k === 'officiel')
      frise.push(
        <li key={`o:${r.fin ? 'fin' : 'debut'}`} className="chrono-ligne chrono-officiel">
          <span className="chrono-quand"><b>{r.fin ? 'Fin' : 'Début'}</b><small>{jourCourt(r.date, annee)}</small></span>
          <span className="chrono-puce" aria-hidden="true"><Icone n="serie" /></span>
          <div className="chrono-corps">
            <strong>{r.fin ? 'Fin officielle' : 'Début officiel'} de « {s.nom} »</strong>
          </div>
        </li>,
      );
    else if (r.k === 'evenement') {
      const { e, debut } = r.j;
      const x = aLaDate(e, r.date);
      const cle = `j:${e.id}@${r.date}`;
      frise.push(
        <li
          key={cle}
          className={`chrono-ligne chrono-jourj ${g.survol === cle ? 'survol' : ''}`}
          style={couleur(e) ? ({ '--c': couleur(e) } as React.CSSProperties) : undefined}
          {...g.recoit(cle, (t) => versJalon(t, e, r.date), (t) => !t.eventId || evs.some((y) => y.id === t.eventId))}
        >
          <span className="chrono-quand"><b>{debut ? 'Début' : 'Jour J'}</b><small>{jourCourt(r.date, annee)}</small></span>
          <span className="chrono-puce" aria-hidden="true"><Icone n="evenements" /></span>
          <div className="chrono-corps">
            <strong>{e.nom}</strong>
            <span className="muted">
              {[debut ? libelleRepetition(e) : fmtRange(x.date, x.dateFin), horaire(x), e.lieu].filter(Boolean).join(' · ')}
            </span>
          </div>
        </li>,
      );
    } else
      frise.push(
        <li key="aujourdhui" className="chrono-ligne chrono-aujourdhui">
          <span className="chrono-quand"><b>Aujourd’hui</b><small>{jourCourt(jour, annee)}</small></span>
          <span className="chrono-puce" aria-hidden="true" />
          <div className="chrono-corps muted">
            {!prochain ? 'Aucun événement dans la série' : passee ? 'La série est passée' : prochain.date <= jour ? `En cours : ${prochain.nom}` : `Prochain : ${prochain.nom}, dans ${diffDays(jour, prochain.date)} j`}
          </div>
        </li>,
      );
  }
  if (prec) frise.push(zoneDepot(g, `z:${frise.length}`, addDays(prec, 7), dater));

  return (
    <Modal title={`Chronologie · ${s.nom}`} icone="horloge" onClose={onClose} wide className="chronologie">
      <div className="chrono-tete">
        <span className="chrono-quoi">
          {etSerie && <BadgeEtiquette e={etSerie} />}{' '}
          <span>
            {[`Série · ${evs.length} événement${evs.length > 1 ? 's' : ''}`, periode && (periode.fin ? fmtRange(periode.debut, periode.fin) : `dès le ${fmtDate(periode.debut)}`)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <Progress done={faits} total={points.length} />
        <span className="muted chrono-compte">
          {[enRetard && `${enRetard} en retard`, points.filter((t) => !t.delai).length && `${points.filter((t) => !t.delai).length} sans délai`].filter(Boolean).join(' · ')}
        </span>
      </div>

      {peutCreer && (racines.length > 0 || etSerie) && (
        <form className="chrono-planifier" onSubmit={(e) => { e.preventDefault(); planifier(); }}>
          <strong><Icone n="ajoutTache" /> Planifier un point</strong>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Que faut-il faire ?" aria-label="Point à planifier" maxLength={200} />
          <label className="inline chrono-pour">
            Pour
            <select value={evPour ? pour : ''} aria-label="Pour quel événement" onChange={(e) => setPour(e.target.value)}>
              {racines.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.repetition ? ' (sa prochaine date)' : ` (${fmtDate(e.date)})`}</option>)}
              {etSerie && <option value="">Toute la série (dès son premier jour)</option>}
            </select>
          </label>
          <span className="chrono-ecart-ligne">
            <ChampEcart v={ecart} onChange={setEcart} />
            <small className="delai-calc">→ {fmtDate(dateEcart)}</small>
          </span>
          <span className="chips chrono-raccourcis">
            {RACCOURCIS.map((r) => {
              const on = nombre(ecart) === r.n && ecart.unite === r.unite && (ecart.apres === r.apres || r.n === 0);
              return (
                <button key={r.label} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setEcart({ n: String(r.n), unite: r.unite, apres: r.apres })}>
                  {r.label}
                </button>
              );
            })}
          </span>
          <button type="submit" className="btn primary">Ajouter…</button>
        </form>
      )}

      <Filtres points={points.length} seances={seances.length} cacherFaits={cacherFaits} setCacherFaits={setCacherFaits} voirSeances={voirSeances} setVoirSeances={setVoirSeances} />

      {sansDelai.length > 0 && (
        <section className="chrono-sans-delai">
          <h3><Icone n="alerte" /> À placer dans le temps ({sansDelai.length}) <small className="muted">· sans délai</small></h3>
          <ul className="chrono-liste">{sansDelai.map(ligne)}</ul>
        </section>
      )}

      <ol className={`chrono-liste chrono-frise ${g.glisse ? 'glisse' : ''}`} aria-label={`Points de la série « ${s.nom} » dans le temps`}>{frise}</ol>
      {!points.length && <Empty>Aucun point pour l’instant.{peutCreer ? ' Planifie le premier ci-dessus : « 1 mois avant » la première manche, « la veille »…' : ''}</Empty>}

      <p className="muted chrono-note">
        <Icone n="epingle" /> Calé sur son événement : le délai suit sa date, et une reprise de la série garde le même écart.
        {' '}À la souris : glisse un point entre deux lignes pour lui donner cette date, sur un événement ou une séance pour l’y rattacher.
      </p>
      <div className="modal-foot">
        <Link to={`/taches?event=${encodeURIComponent(FILTRE_SERIE + s.id)}`}>Voir dans la liste des points →</Link>
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>Fermer</button>
      </div>
      {fiche && <TaskModal task={fiche.task} isNew={fiche.isNew} onClose={() => setFiche(null)} />}
    </Modal>
  );
}
