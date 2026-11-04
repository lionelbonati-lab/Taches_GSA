import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, DelaiUnite, Etiquette, Task } from '../data/types';
import { aLaDate, horaire, occurrenceApres, occurrencesEntre } from '../data/repetition';
import {
  DELAI_MAX, addDays, applyDelaiRef, delaiDepuis, diffDays, endOf, fmtDate, fmtRange, isDone, isLate, makeDelai, newTask, offsetLabel, shortName, splitDelai, today,
} from '../data/utils';
import { etiquetteDeLEvenement, lieuxDe, sectionEvenements } from '../data/etiquettes';
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
// Événement qui se répète : ‹ › passent à la date précédente ou suivante.

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
  const { data, user, canSeeTask, canEditTask, creatableSections, peutRanger, peutEtiqueter, saveTask, setToast } = useStore();
  // Événement qui se répète : la date ouverte, et ‹ › pour passer à la précédente ou à la suivante.
  const [date, setDate] = useState(cible.date);
  const [fiche, setFiche] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [cacherFaits, setCacherFaits] = useState(false);
  const [titre, setTitre] = useState('');
  const [ecart, setEcart] = useState<Ecart>({ n: '1', unite: 'semaines', apres: false });
  // Point en train d'être placé (son écart).
  const [place, setPlace] = useState<{ id: string; v: Ecart } | null>(null);
  if (!user) return null;

  const serie = cible.serie ? data.events.find((x) => x.id === cible.serie!.id) ?? cible.serie : undefined;
  const ev = serie ? aLaDate(serie, date) : undefined;
  // Son étiquette ; sans, celle du même jour montrée avec lui (ancienne étiquette pas encore reliée).
  const et = (serie && etiquetteDeLEvenement(data, serie.id)) || (cible.etiquette && (data.etiquettes ?? []).find((x) => x.id === cible.etiquette!.id)) || undefined;
  const nom = ev?.nom ?? et?.nom ?? '';
  const debut = ev?.date ?? et?.date ?? date;
  const precedente = serie?.repetition ? occurrencesEntre(serie, addDays(date, -400), addDays(date, -1)).filter((o) => o < date).pop() : undefined;
  const suivante = serie?.repetition ? occurrenceApres(serie, date) : undefined;
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

  // Planifier un point : sa fiche, préremplie (titre, délai calé sur l'événement, rangé à la place de son étiquette ou
  // dans la sous-section de l'événement, quand on peut y ranger le point).
  const peutCreer = creatableSections().length > 0;
  const dateEcart = delaiDepuis(decalage(ecart), debut);
  const planifier = () => {
    const places = [
      ...(et ? lieuxDe(et, data.sections) : []),
      ...(() => {
        const s = sectionEvenements(data);
        return s && ev && s.sousSections.includes(ev.nom) ? [{ sectionId: s.id, sousSection: ev.nom }] : [];
      })(),
    ];
    const ici = places.find((l) => peutRanger(l.sectionId, l.sousSection ?? ''));
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
    return (
      <li key={t.id} className={`chrono-ligne chrono-point ${isDone(data, t) ? 'fait' : ''} ${isLate(data, t) ? 'retard' : ''} ${d && d >= debut && d <= fin ? 'pendant' : ''}`}>
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

  // La frise : les points datés, « Aujourd'hui » et le jour J, par date (le même jour : aujourd'hui, le jour J, puis les
  // points), avec le mois en intercalaire.
  type Repere = { k: 'point'; date: string; t: Task } | { k: 'jour' | 'evenement'; date: string };
  const rang = { jour: 0, evenement: 1, point: 2 };
  const reperes = ([
    ...montres.filter((t) => t.delai).map((t): Repere => ({ k: 'point', date: t.delai, t })),
    { k: 'evenement', date: debut },
    { k: 'jour', date: jour },
  ] as Repere[]).sort((a, b) => a.date.localeCompare(b.date) || rang[a.k] - rang[b.k] || (a.k === 'point' && b.k === 'point' ? a.t.titre.localeCompare(b.t.titre, 'fr') : 0));
  const frise: JSX.Element[] = [];
  let mois = '';
  for (const r of reperes) {
    if (r.date.slice(0, 7) !== mois) {
      mois = r.date.slice(0, 7);
      frise.push(<li key={`m:${mois}`} className="chrono-mois">{nomMois(r.date)}</li>);
    }
    if (r.k === 'point') frise.push(ligne(r.t));
    else if (r.k === 'evenement')
      frise.push(
        <li key="jour-j" className="chrono-ligne chrono-jourj" style={et ? ({ '--c': et.couleur } as React.CSSProperties) : undefined}>
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

  return (
    <Modal title={`Chronologie · ${nom}`} icone="horloge" onClose={onClose} wide className="chronologie">
      <div className="chrono-tete">
        <span className="chrono-quoi">
          {serie?.repetition && (
            <button type="button" className="btn small chrono-date-nav" disabled={!precedente} onClick={() => precedente && setDate(precedente)} aria-label="Date précédente" title={precedente ? `Le ${fmtDate(precedente)}` : undefined}>‹</button>
          )}
          {et && <BadgeEtiquette e={et} />} <span>{[fmtRange(debut, fin), ev && horaire(ev), ev?.lieu].filter(Boolean).join(' · ')}</span>
          {serie?.repetition && (
            <button type="button" className="btn small chrono-date-nav" disabled={!suivante} onClick={() => suivante && setDate(suivante)} aria-label="Date suivante" title={suivante ? `Le ${fmtDate(suivante)}` : undefined}>›</button>
          )}
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

      {points.length > 0 && (
        <label className="inline hide-toggle chrono-filtre">
          <input type="checkbox" checked={cacherFaits} onChange={(e) => setCacherFaits(e.target.checked)} /> Masquer les terminés
        </label>
      )}

      {sansDelai.length > 0 && (
        <section className="chrono-sans-delai">
          <h3><Icone n="alerte" /> À placer dans le temps ({sansDelai.length}) <small className="muted">· sans délai</small></h3>
          <ul className="chrono-liste">{sansDelai.map(ligne)}</ul>
        </section>
      )}

      <ol className="chrono-liste chrono-frise" aria-label={`Points de « ${nom} » dans le temps`}>{frise}</ol>
      {!points.length && <Empty>Aucun point pour l’instant.{peutCreer ? ' Planifie le premier ci-dessus : « 1 mois avant », « la veille »…' : ''}</Empty>}

      <p className="muted chrono-note">
        <Icone n="epingle" /> Calé sur l’événement : le délai suit sa date, et une reprise l’an prochain garde le même écart.
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
