import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Meeting, Task } from '../data/types';
import { addDays, diffDays, endOf, fmtDate, fmtRange, isDone, isLate, newTask, offsetLabel, shortName, today } from '../data/utils';
import { aLaDate, horaire, libelleRepetition } from '../data/repetition';
import { etiquetteDeLEvenement, etiquettesRangees, lieuxDe, sectionEvenements } from '../data/etiquettes';
import { motSeance, titreSelonDate, versProchaineSeance } from '../data/seances';
import { nomAvecSerie } from '../data/seriesEvenements';
import {
  aDateFixe, assemblees, construireFrise, dateEntre, estAg, nomCarte, periodeAnnee, periodeDuJour, periodesAg, versEtiquette, versEvenement, versSeance,
  type Carte, type Jour, type Periode,
} from '../data/chronologieClub';
import { Modal } from '../components/ui';
import { Icone, type IconeNom } from '../components/icones';
import { BadgeEtiquette } from '../components/IconesEtiquette';
import { TaskModal } from '../components/FicheTache';
import { Chronologie, type CibleChrono } from '../components/Chronologie';
import { EventModal, newEvent, useEventActions } from '../components/EventModal';
import { PageIntro } from '../components/Nav';
import { MeetingModal, newMeeting, useAgendaActions } from './Agenda';

// Agenda › Chronologie : tout le club dans le temps (chronologieClub.ts), année par année ou d'une assemblée générale à
// l'autre. À gauche les séances avec leurs points, et les points rattachés à rien, à leur délai ; à droite les événements
// avec leurs points. Glisser-déposer : un point sur une séance ou un événement l'y rattache (son délai suit sa date) ;
// un point, une séance ou un événement entre deux jours de la frise : sa nouvelle date (fenêtre « Déplacer », aussi par
// le bouton « Déplacer » (✥) de chacun, sans souris). « + » partout pour ajouter une séance, un événement ou un point.

/** Ce qu'on déplace ; `depuis` : la carte où était le point. */
type Glisse = { k: 'point'; t: Task; depuis?: string } | { k: 'seance'; m: Meeting } | { k: 'evenement'; e: ClubEvent };

type Mode = 'annee' | 'ag';
const CLE_MODE = 'taches-gsa-chronologie-vue';
const lireMode = (): Mode => {
  try {
    return localStorage.getItem(CLE_MODE) === 'ag' ? 'ag' : 'annee';
  } catch {
    return 'annee';
  }
};

/** « jeu. 8 » */
const jourCourt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric' });
/** « lun. 12 oct. » */
const jourMois = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' });
const nomMois = (ym: string) => new Date(ym + '-15T12:00:00').toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });
const moisSuivant = (ym: string) => addDays(`${ym}-28`, 7).slice(0, 7);
const finDuMois = (ym: string) => addDays(`${moisSuivant(ym)}-01`, -1);
const ICONE_CARTE: Record<Carte['k'], IconeNom> = { seance: 'seances', evenement: 'evenements', etiquette: 'etiquette' };

export function ChronologieClub() {
  const { data, user, can, canSeeTask, canEditTask, creatableSections, peutRanger, peutEtiqueter, saveTask, setToast } = useStore();
  const { saveMeeting } = useAgendaActions();
  const { saveEvent } = useEventActions();
  const navigate = useNavigate();

  const [mode, setModeEtat] = useState<Mode>(lireMode);
  const [an, setAn] = useState(() => Number(today().slice(0, 4)));
  /** Vue AG : la période choisie (son premier jour) ; aucune : celle d'aujourd'hui. */
  const [deAg, setDeAg] = useState<string | null>(null);
  const [scope, setScope] = useState<'mes' | 'toutes'>('toutes');
  const [fEtiquette, setFEtiquette] = useState('');
  const [fSection, setFSection] = useState('');
  const [cacherFaits, setCacherFaits] = useState(false);

  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [deplacer, setDeplacer] = useState<{ g: Glisse; date?: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [fiche, setFiche] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [seance, setSeance] = useState<Meeting | null>(null);
  const [evenement, setEvenement] = useState<ClubEvent | null>(null);
  const [chrono, setChrono] = useState<CibleChrono | null>(null);

  // Ferme le petit menu « + » d'un mois au clic ailleurs.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fermer = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [menu]);

  const ags = useMemo(() => assemblees(data), [data]);
  const periodes = useMemo(() => periodesAg(ags), [ags]);

  if (!user) return null;
  const jour = today();
  const voitSeances = can('tab.meetings');
  const voitEvenements = can('tab.events');
  const gereSeances = can('meetings.manage');
  const gereEvenements = can('events.manage');
  const peutCreer = creatableSections().length > 0;

  const setMode = (m: Mode) => {
    setModeEtat(m);
    try {
      localStorage.setItem(CLE_MODE, m);
    } catch {
      /* navigation privée : le choix n'est pas retenu */
    }
  };
  const iChoisie = deAg ? periodes.findIndex((x) => x.de === deAg) : -1;
  const iCourant = iChoisie >= 0 ? iChoisie : periodeDuJour(periodes, jour);
  const p: Periode | undefined = mode === 'annee' ? periodeAnnee(an) : periodes[iCourant];

  const points = data.tasks.filter(
    (t) =>
      !t.paiement && canSeeTask(t) &&
      (scope === 'toutes' || t.responsables.includes(user.id)) &&
      (!cacherFaits || !isDone(data, t)) &&
      (!fEtiquette || !!t.etiquettes?.includes(fEtiquette)) &&
      (!fSection || t.sectionId === fSection),
  );
  const frise = p
    ? construireFrise(data, p, { seances: voitSeances, evenements: voitEvenements, moi: user.id, points, etiquette: fEtiquette || undefined }, jour)
    : { jours: [] as Jour[], sansDate: [] as Task[], nbPoints: 0 };
  const cartes = frise.jours.flatMap((j) => [...j.gauche, ...j.droite]).filter((c): c is Carte => c.k !== 'point');
  const montres = [...cartes.flatMap((c) => c.points), ...frise.jours.flatMap((j) => j.gauche.flatMap((c) => (c.k === 'point' ? [c.t] : [])))];
  const enRetard = montres.filter((t) => isLate(data, t)).length;

  // ---------- Déplacer ----------

  const tache = (t: Task) => data.tasks.find((x) => x.id === t.id) ?? t;
  /** Le point peut aller sur cette carte. */
  const accepte = (t: Task, c: Carte) => canEditTask(t) && (c.k !== 'etiquette' || !!t.etiquettes?.includes(c.et.id) || peutEtiqueter(c.et.id));
  const rattacher = (g: Extract<Glisse, { k: 'point' }>, c: Carte) => {
    const t = tache(g.t);
    if (c.cle === g.depuis || !accepte(t, c)) return;
    const x = c.k === 'seance' ? versSeance(data, t, c.m, g.depuis) : c.k === 'evenement' ? versEvenement(data, t, c.e, c.occurrences, g.depuis) : versEtiquette(data, t, c.et, g.depuis);
    saveTask(x, false);
    setToast(`« ${t.titre} » → ${nomCarte(c)}${x.delai ? ` · délai ${x.delaiRef ? offsetLabel(x.delaiRef).toLowerCase() : ''} (${fmtDate(x.delai)})` : ''}`);
  };
  const dater = (g: Glisse, date: string) => {
    if (g.k === 'point') {
      const t = tache(g.t);
      saveTask(aDateFixe(t, date), false);
      setToast(`« ${t.titre} » : date fixe, le ${fmtDate(date)}`);
    } else if (g.k === 'seance') {
      const m = data.meetings.find((x) => x.id === g.m.id) ?? g.m;
      if (m.date === date) return;
      const n = data.tasks.filter((t) => t.meetingId === m.id && t.delaiRef?.type === 'meeting').length;
      const titre = titreSelonDate(m.titre, date) ?? m.titre;
      saveMeeting({ ...m, date, titre });
      setToast(`${titre} déplacée au ${fmtDate(date)}${n ? ` · le délai de ${n} point(s) suit` : ''}`);
    } else {
      const e = data.events.find((x) => x.id === g.e.id) ?? g.e;
      if (e.date === date) return;
      const x = aLaDate(e, date);
      saveEvent(x);
      setToast(`${e.nom} déplacé au ${fmtRange(x.date, x.dateFin)}`);
    }
  };

  const finGlisse = () => {
    setGlisse(null);
    setSurvol(null);
  };
  const debut = (g: Glisse) => (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', g.k === 'point' ? g.t.titre : g.k === 'seance' ? g.m.titre : g.e.nom);
    setGlisse(g);
  };
  /** Une carte reçoit un point. */
  const cible = (c: Carte) =>
    glisse?.k === 'point' && glisse.depuis !== c.cle && accepte(glisse.t, c)
      ? {
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setSurvol(c.cle); },
        onDragLeave: () => setSurvol((s) => (s === c.cle ? null : s)),
        onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (glisse?.k === 'point') rattacher(glisse, c); finGlisse(); },
      }
      : {};
  /** Entre deux jours de la frise : la date se choisit ensuite (proposée : `date`). */
  const depot = (cle: string, date: string) => (
    <li
      key={`depot:${cle}`}
      className={`cc-depot ${survol === `z:${cle}` ? 'survol' : ''}`}
      aria-hidden="true"
      onDragOver={(e) => { if (!glisse) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setSurvol(`z:${cle}`); }}
      onDragLeave={() => setSurvol((s) => (s === `z:${cle}` ? null : s))}
      onDrop={(e) => { e.preventDefault(); if (glisse) setDeplacer({ g: glisse, date }); finGlisse(); }}
    >
      <span>Déposer ici · vers le {fmtDate(date)}</span>
    </li>
  );

  // ---------- Ouvrir, ajouter ----------

  const ouvrirCarte = (c: Carte) => {
    if (c.k === 'seance') {
      if (gereSeances) setSeance(c.m);
      else navigate(`/comite?seance=${encodeURIComponent(c.m.id)}`);
    } else if (c.k === 'evenement') {
      if (gereEvenements) setEvenement(c.e);
      else setChrono({ serie: c.e, date: c.occurrences[0] ?? c.e.date });
    } else setChrono({ date: c.et.date!, etiquette: c.et });
  };
  /** Nouveau point : dans la carte (rattaché, délai calé sur elle), ou à une date. */
  const nouveauPoint = (c?: Carte, date?: string) => {
    if (!c) return setFiche({ task: newTask(user.id, date ? { delai: date } : versProchaineSeance(data.meetings)), isNew: true });
    if (c.k === 'seance') return setFiche({ task: newTask(user.id, { meetingId: c.m.id, delaiRef: { type: 'meeting', joursAvant: 0 }, delai: c.m.date }), isNew: true });
    // Rangé à la place de son étiquette, ou dans la sous-section de l'événement, quand on peut y ranger le point.
    const et = c.k === 'etiquette' ? c.et : etiquetteDeLEvenement(data, c.e.id);
    const s = sectionEvenements(data);
    const places = [...(et ? lieuxDe(et, data.sections) : []), ...(c.k === 'evenement' && s?.sousSections.includes(c.e.nom) ? [{ sectionId: s.id, sousSection: c.e.nom }] : [])];
    const ici = places.find((l) => peutRanger(l.sectionId, l.sousSection ?? ''));
    const base = newTask(user.id, ici ? { sectionId: ici.sectionId, sousSection: ici.sousSection ?? '' } : {});
    setFiche({ task: c.k === 'evenement' ? versEvenement(data, base, c.e, c.occurrences) : versEtiquette(data, base, c.et), isNew: true });
  };
  const choixAjout = [
    gereSeances && voitSeances && { k: 'seance' as const, label: 'Séance', icone: 'seances' as IconeNom },
    gereEvenements && voitEvenements && { k: 'evenement' as const, label: 'Événement', icone: 'evenements' as IconeNom },
    peutCreer && { k: 'point' as const, label: 'Point', icone: 'taches' as IconeNom },
  ].filter(Boolean) as { k: 'seance' | 'evenement' | 'point'; label: string; icone: IconeNom }[];
  const ajouter = (k: 'seance' | 'evenement' | 'point', date: string) => {
    setMenu(null);
    if (k === 'seance') setSeance(newMeeting(data.meetings, date, motSeance()));
    else if (k === 'evenement') setEvenement(newEvent(date));
    else nouveauPoint(undefined, date);
  };
  /** Date d'un ajout depuis l'en-tête : aujourd'hui s'il est dans la période, sinon son début. */
  const dateAjout = p && jour >= p.de && jour <= p.a ? jour : p?.de ?? jour;

  // ---------- Affichage ----------

  const qui = (t: Task) => {
    const noms = [...t.responsables.map((id) => shortName(data.people.find((x) => x.id === id))), ...(t.respHors ?? []).map((x) => shortName(x))];
    return noms.length ? noms.join(', ') : t.aPrendre ? '🙋 à prendre' : '';
  };
  const statut = (t: Task) => data.statuses.find((s) => s.id === t.statusId);

  const ligne = (t: Task, depuis?: string, seul?: boolean) => {
    const g: Glisse = { k: 'point', t, depuis };
    const bouge = canEditTask(t);
    const s = statut(t);
    const section = seul ? data.sections.find((x) => x.id === t.sectionId)?.nom : undefined;
    return (
      <li
        key={t.id}
        className={`cc-point ${seul ? 'seul' : ''} ${isDone(data, t) ? 'fait' : ''} ${isLate(data, t) ? 'retard' : ''} ${glisse?.k === 'point' && glisse.t.id === t.id ? 'glisse' : ''}`}
        draggable={bouge}
        onDragStart={bouge ? debut(g) : undefined}
        onDragEnd={finGlisse}
      >
        <span className="cc-puce" style={{ background: s?.couleur }} title={s?.label} aria-hidden="true">{isDone(data, t) ? '✓' : ''}</span>
        <button type="button" className="cc-point-titre" onClick={() => setFiche({ task: t, isNew: false })} title="Ouvrir le point">
          {t.parentId && <span className="muted" title="Rattaché à un autre point">↳ </span>}
          {t.titre || '(sans titre)'}
        </button>
        {bouge && (
          <button type="button" className="cc-bouger" onClick={() => setDeplacer({ g })} title="Déplacer : vers une séance, un événement ou une date" aria-label={`Déplacer « ${t.titre} »`}>
            <Icone n="deplacer" />
          </button>
        )}
        <span className="cc-point-info">
          {t.delai ? <span className={isLate(data, t) ? 'cc-retard' : ''}>{jourMois(t.delai)}</span> : <span className="muted">sans délai</span>}
          {t.delaiRef && !seul && <span className="cc-cale" title="Le délai suit la date de la carte"><Icone n="epingle" /> {offsetLabel(t.delaiRef).toLowerCase()}</span>}
          {qui(t) && <span className="muted">{qui(t)}</span>}
          {section && <span className="muted">· {section}</span>}
        </span>
      </li>
    );
  };

  const carte = (c: Carte) => {
    const g: Glisse | undefined = c.k === 'seance' ? { k: 'seance', m: c.m } : c.k === 'evenement' && !c.e.repetition ? { k: 'evenement', e: c.e } : undefined;
    const bouge = !!g && (g.k === 'seance' ? gereSeances : gereEvenements);
    const et = c.k === 'etiquette' ? c.et : c.k === 'evenement' ? etiquetteDeLEvenement(data, c.e.id) : undefined;
    const faits = c.points.filter((t) => isDone(data, t)).length;
    const fin = c.k === 'seance' ? c.date : c.fin;
    const quand =
      c.k === 'seance'
        ? [jourMois(c.m.date), c.m.heure?.replace(':', 'h'), c.m.lieu].filter(Boolean).join(' · ')
        : c.k === 'evenement'
          ? c.e.repetition
            ? [libelleRepetition(c.e), `${c.occurrences.length} date${c.occurrences.length > 1 ? 's' : ''} sur la période`, c.e.lieu].filter(Boolean).join(' · ')
            : [fmtRange(c.e.date, c.e.dateFin), horaire(c.e), c.e.lieu].filter(Boolean).join(' · ')
          : fmtRange(c.et.date, c.et.dateFin);
    const plus = c.k === 'seance' ? peutCreer : peutCreer && (c.k === 'evenement' || peutEtiqueter(c.et.id));
    return (
      <article
        key={c.cle}
        className={`cc-carte k-${c.k} ${estAg(c) ? 'ag' : ''} ${fin < jour ? 'passee' : ''} ${survol === c.cle ? 'survol' : ''} ${glisse && g && glisse.k === g.k && (glisse.k === 'seance' ? glisse.m.id === c.cle.slice(2) : glisse.k === 'evenement' && glisse.e.id === c.cle.slice(2)) ? 'glisse' : ''}`}
        style={et ? ({ '--c': et.couleur } as React.CSSProperties) : undefined}
        draggable={bouge}
        onDragStart={bouge && g ? debut(g) : undefined}
        onDragEnd={finGlisse}
        {...cible(c)}
      >
        <header className="cc-carte-tete">
          <Icone n={ICONE_CARTE[c.k]} />
          <button type="button" className="cc-carte-titre" onClick={() => ouvrirCarte(c)} title={c.k === 'seance' ? 'Ouvrir la séance' : 'Ouvrir l’événement'}>
            {c.k === 'evenement' ? nomAvecSerie(data, c.e) : nomCarte(c)}
          </button>
          {estAg(c) && <span className="cc-ag" title="Assemblée générale">AG</span>}
          {c.k === 'evenement' && c.e.repetition && <span className="cc-repete" title={libelleRepetition(c.e)}><Icone n="repetition" /></span>}
          {bouge && g && (
            <button type="button" className="cc-bouger" onClick={() => setDeplacer({ g })} title="Changer la date" aria-label={`Déplacer « ${nomCarte(c)} »`}>
              <Icone n="deplacer" />
            </button>
          )}
        </header>
        <div className="cc-carte-quand">
          {et && c.k === 'evenement' && <BadgeEtiquette e={et} sansNom />}
          <span>{quand}</span>
        </div>
        {c.points.length > 0 && <ul className="cc-points">{c.points.map((t) => ligne(t, c.cle))}</ul>}
        <footer className="cc-carte-pied">
          {c.points.length > 0 ? (
            <span className="muted" title="Points terminés">{faits}/{c.points.length} terminé{faits > 1 ? 's' : ''}</span>
          ) : (
            <span className="muted">{glisse?.k === 'point' ? 'Déposer un point ici' : 'Aucun point'}</span>
          )}
          {plus && (
            <button type="button" className="btn small link" onClick={() => nouveauPoint(c)}>
              <Icone n="ajoutTache" /> Point
            </button>
          )}
        </footer>
      </article>
    );
  };

  // La frise : chaque mois de la période (même vide), ses jours, et entre eux de quoi déposer.
  const lignes: JSX.Element[] = [];
  if (p) {
    const parMois = new Map<string, Jour[]>();
    for (const j of frise.jours) parMois.set(j.date.slice(0, 7), [...(parMois.get(j.date.slice(0, 7)) ?? []), j]);
    for (let ym = p.de.slice(0, 7); ym <= p.a.slice(0, 7); ym = moisSuivant(ym)) {
      const debutMois = ym === p.de.slice(0, 7) ? p.de : `${ym}-01`;
      const finMois = ym === p.a.slice(0, 7) ? p.a : finDuMois(ym);
      const dateMenu = jour >= debutMois && jour <= finMois ? jour : debutMois;
      lignes.push(
        <li key={`m:${ym}`} className="cc-mois">
          <span className="cc-mois-nom">{nomMois(ym)}</span>
          {choixAjout.length > 0 && (
            <span className="cc-mois-plus">
              <button type="button" className="cc-ajout" onClick={() => setMenu(menu === ym ? null : ym)} aria-label={`Ajouter en ${nomMois(ym)}`} title="Ajouter ce mois-là">+</button>
              {menu === ym && (
                <div className="cal-menu" ref={menuRef}>
                  <small>Ajouter le {fmtDate(dateMenu)}</small>
                  {choixAjout.map((x) => <button key={x.k} type="button" onClick={() => ajouter(x.k, dateMenu)}><Icone n={x.icone} /> {x.label}</button>)}
                </div>
              )}
            </span>
          )}
        </li>,
      );
      const js = parMois.get(ym) ?? [];
      const borne = (d: string) => (d < debutMois ? debutMois : d > finMois ? finMois : d);
      js.forEach((j, i) => {
        lignes.push(depot(`${ym}:${i}`, borne(dateEntre(i ? js[i - 1].date : addDays(debutMois, -1), j.date))));
        const auj = j.date === jour;
        lignes.push(
          <li key={j.date} className={`cc-jour ${auj ? 'aujourdhui' : ''} ${j.date < jour ? 'passe' : ''}`}>
            <div className="cc-gauche">
              {j.gauche.map((x) => (x.k === 'point' ? <ul key={x.cle} className="cc-seuls">{ligne(x.t, undefined, true)}</ul> : carte(x)))}
            </div>
            <div className="cc-date">
              <time dateTime={j.date}>{auj ? 'Aujourd’hui' : jourCourt(j.date)}</time>
            </div>
            <div className="cc-droite">{j.droite.map(carte)}</div>
          </li>,
        );
      });
      lignes.push(depot(`${ym}:fin`, borne(dateEntre(js.length ? js[js.length - 1].date : addDays(debutMois, -1), addDays(finMois, 1)))));
    }
  }

  // ---------- Période ----------

  const titrePeriode = !p
    ? ''
    : mode === 'annee'
      ? String(an)
      : p.agDebut && p.agFin
        ? `${fmtDate(p.agDebut.date)} → ${fmtDate(p.agFin.date)}`
        : p.agFin
          ? `Avant l’AG du ${fmtDate(p.agFin.date)}`
          : `Depuis l’AG du ${fmtDate(p.agDebut!.date)}`;
  const sousTitre = mode === 'ag' && p
    ? p.agDebut && p.agFin
      ? `De « ${p.agDebut.nom} » à « ${p.agFin.nom} »`
      : p.agFin
        ? `L’année avant « ${p.agFin.nom} »`
        : `« ${p.agDebut!.nom} » et l’année qui suit (prochaine AG pas encore prévue)`
    : '';
  const surAujourdhui = mode === 'annee' ? an === Number(jour.slice(0, 4)) : iCourant === periodeDuJour(periodes, jour);
  const precedente = () => (mode === 'annee' ? setAn(an - 1) : setDeAg(periodes[Math.max(0, iCourant - 1)]?.de ?? null));
  const suivante = () => (mode === 'annee' ? setAn(an + 1) : setDeAg(periodes[Math.min(periodes.length - 1, iCourant + 1)]?.de ?? null));
  const versAujourdhui = () => (mode === 'annee' ? setAn(Number(jour.slice(0, 4))) : setDeAg(null));

  // Vue AG sans assemblée cochée : celles qui en ont l'air, à cocher en un clic.
  const AG_NOM = /assembl[ée]e\s+g[ée]n[ée]rale|\bAG\b/i;
  const pistes = [
    ...(gereEvenements ? data.events.filter((e) => !e.serie && AG_NOM.test(e.nom)).map((e) => ({ id: e.id, nom: e.nom, date: e.date, cocher: () => saveEvent({ ...e, ag: true }) })) : []),
    ...(gereSeances ? data.meetings.filter((m) => AG_NOM.test(m.titre)).map((m) => ({ id: m.id, nom: m.titre, date: m.date, cocher: () => saveMeeting({ ...m, ag: true }) })) : []),
  ];

  const rangees = etiquettesRangees(data.etiquettes, data.events, jour);
  const sections = data.sections.filter((s) => data.tasks.some((t) => t.sectionId === s.id && canSeeTask(t)));
  const filtres = (fEtiquette ? 1 : 0) + (fSection ? 1 : 0) + (cacherFaits ? 1 : 0) + (scope === 'mes' ? 1 : 0);

  return (
    <div className="cc-page">
      <div className="page-head">
        <h1>Chronologie</h1>
        <div className="actions">
          {choixAjout.map((x) => (
            <button key={x.k} type="button" className={`btn ${x.k === 'point' ? 'primary' : ''}`} onClick={() => ajouter(x.k, dateAjout)}>
              + {x.label}
            </button>
          ))}
        </div>
      </div>
      <PageIntro />

      <div className="cc-barre">
        <div className="seg" role="group" aria-label="Vue">
          <button type="button" className={mode === 'annee' ? 'on' : ''} aria-pressed={mode === 'annee'} onClick={() => setMode('annee')}>Année</button>
          <button type="button" className={mode === 'ag' ? 'on' : ''} aria-pressed={mode === 'ag'} onClick={() => setMode('ag')}>D’une AG à l’autre</button>
        </div>
        {p && (
          <div className="cal-nav cc-nav">
            <button type="button" className="btn small" onClick={precedente} disabled={mode === 'ag' && iCourant <= 0} aria-label="Période précédente">‹</button>
            <strong className="cc-periode">{titrePeriode}</strong>
            <button type="button" className="btn small" onClick={suivante} disabled={mode === 'ag' && iCourant >= periodes.length - 1} aria-label="Période suivante">›</button>
            {!surAujourdhui && <button type="button" className="btn small" onClick={versAujourdhui}>Aujourd’hui</button>}
          </div>
        )}
      </div>
      {sousTitre && <p className="muted cc-sous-titre">{sousTitre}</p>}

      <div className="filters open cc-filtres">
        <div className="seg small" role="group" aria-label="Points">
          <button type="button" className={scope === 'mes' ? 'on' : ''} aria-pressed={scope === 'mes'} onClick={() => setScope('mes')}>Mes points</button>
          <button type="button" className={scope === 'toutes' ? 'on' : ''} aria-pressed={scope === 'toutes'} onClick={() => setScope('toutes')}>Tous</button>
        </div>
        {!!data.etiquettes?.length && (
          <select value={fEtiquette} onChange={(e) => setFEtiquette(e.target.value)} aria-label="Étiquette">
            <option value="">Toutes étiquettes</option>
            {rangees.groupes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            {rangees.aVenir.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            {rangees.passees.length > 0 && (
              <optgroup label="Événements passés">
                {rangees.passees.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </optgroup>
            )}
          </select>
        )}
        <select value={fSection} onChange={(e) => setFSection(e.target.value)} aria-label="Section">
          <option value="">Toutes sections</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <label className="inline hide-toggle">
          <input type="checkbox" checked={cacherFaits} onChange={(e) => setCacherFaits(e.target.checked)} /> Masquer les terminés
        </label>
        {filtres > 0 && (
          <button type="button" className="btn link" onClick={() => { setFEtiquette(''); setFSection(''); setCacherFaits(false); setScope('toutes'); }}>Effacer</button>
        )}
        {p && (
          <span className="muted cc-compte">
            {frise.nbPoints} point{frise.nbPoints > 1 ? 's' : ''}{enRetard ? ` · ${enRetard} en retard` : ''}
          </span>
        )}
      </div>

      {mode === 'ag' && !periodes.length && (
        <div className="cc-sans-ag">
          <p><Icone n="alerte" /> Aucune assemblée générale : coche « Assemblée générale » dans la fiche de l’événement (ou de la séance) de l’AG.</p>
          {pistes.length > 0 && (
            <p className="row wrap">
              {pistes.map((x) => (
                <button key={x.id} type="button" className="btn small" onClick={() => { x.cocher(); setDeAg(null); }}>
                  Cocher « {x.nom} » ({fmtDate(x.date)})
                </button>
              ))}
            </p>
          )}
        </div>
      )}

      {p && frise.sansDate.length > 0 && (
        <details className="cc-sans-date">
          <summary><Icone n="alerte" /> Sans date ({frise.sansDate.length}) <small className="muted">· ni séance, ni événement, ni délai : à glisser dans la frise</small></summary>
          <ul className="cc-seuls">{frise.sansDate.map((t) => ligne(t, undefined, true))}</ul>
        </details>
      )}

      {p && (
        <>
          <div className="cc-voies" aria-hidden="true">
            <span><Icone n="seances" /> {voitSeances ? 'Séances' : 'Points'}{voitSeances && <small className="muted"> et points sans séance</small>}</span>
            <span />
            <span><Icone n="evenements" /> Événements</span>
          </div>
          <ol className={`cc-frise ${glisse ? 'glisse' : ''}`} aria-label={`Chronologie du club · ${titrePeriode}`}>{lignes}</ol>
          <p className="muted cc-astuce hide-mobile">
            Astuce : glisse un point sur une séance ou un événement pour l’y rattacher (son délai suit sa date), ou entre deux jours pour lui donner une date fixe ;
            glisse une séance ou un événement entre deux jours pour changer sa date. Le bouton <Icone n="deplacer" /> fait la même chose sans souris.
          </p>
        </>
      )}

      {deplacer && <Deplacer g={deplacer.g} date={deplacer.date} cartes={cartes} periode={p} accepte={accepte} onRattacher={rattacher} onDater={dater} onClose={() => setDeplacer(null)} />}
      {fiche && <TaskModal task={fiche.task} isNew={fiche.isNew} onClose={() => setFiche(null)} />}
      {seance && <MeetingModal meeting={seance} onClose={() => setSeance(null)} />}
      {evenement && (
        <EventModal
          event={evenement}
          onClose={() => setEvenement(null)}
          onChronologie={() => {
            const o = cartes.find((c) => c.k === 'evenement' && c.e.id === evenement.id);
            setChrono({ serie: evenement, date: o?.k === 'evenement' ? o.occurrences[0] ?? evenement.date : evenement.date });
            setEvenement(null);
          }}
        />
      )}
      {chrono && <Chronologie cible={chrono} onClose={() => setChrono(null)} />}
    </div>
  );
}

/**
 * Déplacer un point (vers une séance, un événement de la période, ou une date fixe), une séance ou un événement (sa
 * date). Ouvert par un dépôt entre deux jours de la frise (`date` : celle proposée) ou par le bouton « Déplacer » (✥).
 */
function Deplacer({ g, date, cartes, periode, accepte, onRattacher, onDater, onClose }: {
  g: Glisse;
  date?: string;
  cartes: Carte[];
  periode?: Periode;
  accepte: (t: Task, c: Carte) => boolean;
  onRattacher: (g: Extract<Glisse, { k: 'point' }>, c: Carte) => void;
  onDater: (g: Glisse, date: string) => void;
  onClose: () => void;
}) {
  const { data } = useStore();
  const actuelle = g.k === 'point' ? g.t.delai || today() : g.k === 'seance' ? g.m.date : g.e.date;
  const [quand, setQuand] = useState(date ?? actuelle);
  const [vers, setVers] = useState(g.k === 'point' && !date && g.depuis ? g.depuis : 'date');
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(quand);
  const nom = g.k === 'point' ? g.t.titre : g.k === 'seance' ? g.m.titre : g.e.nom;
  const seances = cartes.filter((c) => c.k === 'seance');
  const evenements = cartes.filter((c) => c.k !== 'seance');
  const choisie = cartes.find((c) => c.cle === vers);

  const valider = () => {
    if (g.k === 'point' && vers !== 'date') {
      if (choisie && vers !== g.depuis) onRattacher(g, choisie);
      return onClose();
    }
    if (!ok) return;
    onDater(g, quand);
    onClose();
  };

  const option = (c: Carte) => (
    <option key={c.cle} value={c.cle} disabled={g.k === 'point' && !accepte(g.t, c)}>
      {nomCarte(c)} · {c.k === 'seance' ? fmtDate(c.date) : fmtRange(c.date, c.fin)}{g.k === 'point' && c.cle === g.depuis ? ' (actuellement)' : ''}
    </option>
  );
  const liees = g.k === 'seance' ? data.tasks.filter((t) => t.meetingId === g.m.id && t.delaiRef?.type === 'meeting').length : g.k === 'evenement' ? data.tasks.filter((t) => t.eventId === g.e.id && t.delaiRef?.type === 'event').length : 0;
  const titre = g.k === 'seance' && ok ? titreSelonDate(g.m.titre, quand) : undefined;
  const dehors = periode && ok && (quand < periode.de || quand > periode.a);

  return (
    <Modal title={`Déplacer « ${nom} »`} icone="deplacer" onClose={onClose}>
      <form className="form cc-deplacer" onSubmit={(e) => { e.preventDefault(); valider(); }}>
        {g.k === 'point' && (
          <label className="full">
            Vers
            <select value={vers} onChange={(e) => setVers(e.target.value)} autoFocus>
              {seances.length > 0 && <optgroup label="Séances">{seances.map(option)}</optgroup>}
              {evenements.length > 0 && <optgroup label="Événements">{evenements.map(option)}</optgroup>}
              <option value="date">📆 Une date fixe</option>
            </select>
          </label>
        )}
        {(g.k !== 'point' || vers === 'date') && (
          <label className="full">
            {g.k === 'point' ? 'Délai' : g.k === 'seance' ? 'Date de la séance' : 'Premier jour'}
            <input type="date" value={quand} onChange={(e) => setQuand(e.target.value)} autoFocus={g.k !== 'point'} />
          </label>
        )}
        {g.k === 'point' && vers !== 'date' && choisie && (
          <p className="muted full">
            <Icone n="epingle" /> Rattaché à « {nomCarte(choisie)} » : son délai suit sa date
            {g.t.delaiRef ? ' (même écart si possible)' : ' (le jour même, à changer dans sa fiche)'}.
          </p>
        )}
        {g.k === 'point' && vers === 'date' && (g.t.meetingId || g.t.eventId || g.t.delaiRef) && (
          <p className="muted full">Il n’est plus rattaché à sa séance ni à son événement ; son délai ne suit plus leur date.</p>
        )}
        {g.k === 'evenement' && ok && g.e.dateFin && <p className="muted full">Jusqu’au {fmtDate(endOf(aLaDate(g.e, quand)))} (même durée).</p>}
        {g.k === 'seance' && titre && titre !== g.m.titre && <p className="muted full">Elle s’appellera « {titre} ».</p>}
        {liees > 0 && <p className="muted full"><Icone n="epingle" /> Le délai de {liees} point(s) calé(s) dessus suit.</p>}
        {dehors && <p className="muted full"><Icone n="alerte" /> Hors de la période affichée ({diffDays(quand, periode!.de) > 0 ? 'avant' : 'après'}).</p>}
        <div className="modal-foot full">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn primary" disabled={(g.k !== 'point' || vers === 'date') && !ok}>Déplacer</button>
        </div>
      </form>
    </Modal>
  );
}
