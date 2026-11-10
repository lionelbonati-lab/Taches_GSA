import { useState } from 'react';
import { useStore } from '../data/store';
import type { AppData, ClubEvent, RepetitionEvenement, SerieEvenements } from '../data/types';
import { addDays, diffDays, fmtDate, today, uid } from '../data/utils';
import { stable } from '../data/cloud';
import {
  JOURS_COURTS, aLaDate, jourDuMois, jourSemaine, libelleRegle, libelleRepetition, memeRegle, nomJour, normaliser, rangDansMois,
} from '../data/repetition';
import { PORTEES, modifierOccurrence, supprimerOccurrence, type Portee } from '../data/series';
import { Modal } from './ui';
import { Icone } from './icones';
import { ZoneTexte } from './ZoneTexte';
import { CaseEtiquette } from './ReglageEtiquette';
import {
  estLaNewsletter, etiquetteDeLEvenement, nomLieu, nomPlaceNewsletter, reglerEtiquetteEvenement, sectionEvenements, type ChoixEtiquette,
} from '../data/etiquettes';
import { enregistrerSerie, rangerDansSerie, seriesDuClub } from '../data/seriesEvenements';

// Fiche d'un événement, comme dans un agenda : toute la journée ou de telle heure à telle heure, sur un ou plusieurs
// jours, une seule fois ou répété (tous les jours, semaines, mois, ans, ou personnalisé). Une occurrence d'un événement
// qui se répète se modifie ou se supprime seule, avec les suivantes, ou toute la série.
// « Type » (liste en tête de la fiche) : un événement, une assemblée générale (la chronologie du club se lit d'une AG à
// l'autre), une newsletter (sa place est la sous-section « Newsletter » : etiquettes.ts, estNewsletter) ou un événement
// d'une série d'événements (programme hivernal, championnat ; seriesEvenements.ts : une existante ou une nouvelle, nommée
// ici). La fiche s'adapte : titre proposé (« Assemblée générale 2027 », « Newsletter de décembre 2026 ») ; une newsletter
// n'a qu'une date d'envoi, sans heure ni lieu ; une série se choisit.

/** Type d'un événement (liste « Type » de sa fiche) : il décide de `ag`, `newsletter` et `dansSerie`. */
export type TypeEvenement = 'evenement' | 'ag' | 'newsletter' | 'serie';
export const TYPES_EVENEMENT: { id: TypeEvenement; label: string; aide: string }[] = [
  { id: 'evenement', label: 'Événement', aide: 'Une manifestation du club, avec sa sous-section dans « Événements » si elle a son étiquette.' },
  { id: 'ag', label: 'Assemblée générale', aide: 'La chronologie du club se lit aussi d’une assemblée générale à l’autre (Agenda › Chronologie).' },
  { id: 'newsletter', label: 'Newsletter', aide: 'Une date d’envoi, sans heure ni lieu.' },
  { id: 'serie', label: 'Série d’événements', aide: 'Un événement d’une série : le programme hivernal (une activité par jour de la semaine), un championnat en plusieurs manches…' },
];
const libelleType = (t: TypeEvenement) => TYPES_EVENEMENT.find((x) => x.id === t)!.label;

/** Type d'après ses champs : dans une série, sinon newsletter, sinon assemblée générale, sinon événement. */
const typeDesChamps = (e: Pick<ClubEvent, 'ag' | 'newsletter' | 'dansSerie'>): TypeEvenement =>
  e.dansSerie ? 'serie' : e.newsletter ? 'newsletter' : e.ag ? 'ag' : 'evenement';

/** Type d'un événement (une série qui n'existe plus ne compte pas). */
export const typeDe = (data: Pick<AppData, 'seriesEvenements'>, e: Pick<ClubEvent, 'ag' | 'newsletter' | 'dansSerie'>): TypeEvenement =>
  typeDesChamps({ ...e, dansSerie: e.dansSerie && data.seriesEvenements?.some((s) => s.id === e.dansSerie) ? e.dansSerie : undefined });

/** Titre proposé pour une assemblée générale (« Assemblée générale 2027 ») ou une newsletter (« Newsletter de décembre 2026 »). */
function titreAuto(t: TypeEvenement, date: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  if (t === 'ag') return `Assemblée générale ${date.slice(0, 4)}`;
  if (t !== 'newsletter') return undefined;
  const mois = new Date(date + 'T12:00:00').toLocaleDateString('fr-CH', { month: 'long' });
  return `Newsletter ${/^[aeiouyâéèêîôû]/i.test(mois) ? 'd’' : 'de '}${mois} ${date.slice(0, 4)}`;
}

/** Texte du journal pour la case « Étiquette » d'un événement. */
const quoiEtiquette = (c: ChoixEtiquette) => (c ? ` · étiquette (${c.membres.length} membre${c.membres.length > 1 ? 's' : ''})` : ' · sans étiquette');

/** Choix « Nouvelle série… » de la liste « Série d'événements ». */
const NOUVELLE_SERIE = '+';

/** Enregistrement / suppression des événements (Agenda, Événements). */
export function useEventActions() {
  const { data, update } = useStore();
  const portee = (p: Portee) => ({ une: 'cette occurrence', suivantes: 'celle-ci et les suivantes', toutes: 'toute la série' })[p];
  /** Texte du journal pour la série d'un événement (`nouvelle` : créée en même temps). */
  const quoiSerie = (id?: string, nouvelle?: SerieEvenements) =>
    id ? ` · série « ${nouvelle?.nom ?? data.seriesEvenements?.find((s) => s.id === id)?.nom ?? ''} »` : ' · hors série';
  return {
    /**
     * `etiquette` : la case « Étiquette » réglée dans le formulaire (absente : pas touchée) ; `nouvelle` : la série
     * créée depuis le formulaire, où l'événement entre.
     */
    saveEvent: (x: ClubEvent, etiquette?: ChoixEtiquette, nouvelle?: SerieEvenements) => {
      const e = normaliser(sansFinVide(x));
      const avant = data.events.find((y) => y.id === e.id);
      const isNew = !avant;
      const serieChangee = (avant?.dansSerie ?? '') !== (e.dansSerie ?? '');
      // Type changé (assemblée générale, newsletter ; la série : ci-dessus) : dit dans le journal. Une newsletter en plus
      // ou en moins : son étiquette change de place (etiquettes.ts, synchroniserEtiquettes).
      const typeChange = avant ? !!avant.ag !== !!e.ag || !!avant.newsletter !== !!e.newsletter : !!(e.ag || e.newsletter);
      const quoiType = typeChange && !e.dansSerie ? ` · ${libelleType(typeDesChamps(e)).toLowerCase()}` : '';
      update((d) => {
        if (nouvelle) enregistrerSerie(d, nouvelle);
        d.events = isNew ? [...d.events, e] : d.events.map((y) => (y.id === e.id ? e : y));
        // Ses dates modifiées seules (s'il s'est répété) suivent.
        if (serieChangee) rangerDansSerie(d, e.id, e.dansSerie);
        if (etiquette !== undefined) reglerEtiquetteEvenement(d, e, etiquette);
      }, `${isNew ? 'Ajout' : 'Modification'} de l'événement « ${e.nom} »${serieChangee ? quoiSerie(e.dansSerie, nouvelle) : ''}${quoiType}${etiquette !== undefined ? quoiEtiquette(etiquette) : ''}`);
    },
    /**
     * Type d'un événement qui se répète (assemblée générale, newsletter, série) : celui de toutes ses dates, celles
     * modifiées seules comprises (réglé tout de suite, comme son étiquette). `nouvelle` : la série créée depuis la fiche.
     */
    reglerType: (eventId: string, t: Pick<ClubEvent, 'ag' | 'newsletter' | 'dansSerie'>, nouvelle?: SerieEvenements) => {
      const avant = data.events.find((y) => y.id === eventId);
      const serieChangee = (avant?.dansSerie ?? '') !== (t.dansSerie ?? '');
      update((d) => {
        if (nouvelle) enregistrerSerie(d, nouvelle);
        d.events = d.events.map((y) => (y.id === eventId || y.serie?.id === eventId ? { ...y, ag: t.ag || undefined, newsletter: t.newsletter || undefined } : y));
        // Ses dates modifiées seules suivent.
        if (serieChangee) rangerDansSerie(d, eventId, t.dansSerie);
      }, `Événement « ${avant?.nom ?? ''} »${serieChangee ? quoiSerie(t.dansSerie, nouvelle) : ` · ${libelleType(typeDesChamps(t)).toLowerCase()}`}`);
    },
    /** Étiquette d'un événement qui se répète : celle de toute la série. */
    reglerEtiquette: (serieId: string, etiquette: ChoixEtiquette) =>
      update((d) => {
        const ev = d.events.find((y) => y.id === serieId);
        if (ev) reglerEtiquetteEvenement(d, ev, etiquette);
      }, `Événement « ${data.events.find((y) => y.id === serieId)?.nom ?? ''} »${quoiEtiquette(etiquette)}`),
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

/** Nouvel événement, le `date` ; `dansSerie` : dans cette série (« + Événement » d'une série). */
export const newEvent = (date = today(), dansSerie?: string): ClubEvent => ({ id: uid('e'), nom: '', date, lieu: '', description: '', ...(dansSerie ? { dansSerie } : {}) });

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
 * occurrence ; à l'enregistrement, on choisit : cet événement, les suivants, ou tous). `onChronologie` : bouton
 * « Chronologie » (les points de l'événement dans le temps), sans enregistrer.
 */
export function EventModal({ event, jour, onClose, onChronologie }: { event: ClubEvent; jour?: string; onClose: () => void; onChronologie?: () => void }) {
  const { data, can } = useStore();
  const { saveEvent, saveOccurrence, removeEvent, removeOccurrence, reglerEtiquette, reglerType } = useEventActions();
  const serie = jour && event.repetition ? event : undefined;
  // Case « Étiquette » : celle de l'événement (d'une série : de toute la série).
  const deja = etiquetteDeLEvenement(data, event.serie?.id ?? event.id);
  const [etiquette, setEtiquette] = useState<ChoixEtiquette>(deja ? { membres: deja.membres ?? [] } : null);
  const [etiquetteTouchee, setEtiquetteTouchee] = useState(false);
  const choixEtiquette = (c: ChoixEtiquette) => {
    if (!c && deja) {
      const n = data.tasks.filter((t) => t.etiquettes?.includes(deja.id)).length;
      if (!confirm(`Retirer l’étiquette « ${deja.nom} » ?${n ? ` Ses ${n} point(s) la perdent ; ils restent dans leur sous-section.` : ''}`)) return;
    }
    setEtiquette(c);
    setEtiquetteTouchee(true);
  };
  const depart = serie ? aLaDate(serie, jour!) : event;
  const [v, setV] = useState<ClubEvent>(depart);
  // « Type » : événement, assemblée générale, newsletter ou série d'événements ; une série : une existante, ou une nouvelle
  // (son identifiant, prêt d'avance, et son nom).
  const series = seriesDuClub(data);
  const [type, setType] = useState<TypeEvenement>(() => typeDe(data, event));
  const [choixSerie, setChoixSerie] = useState(event.dansSerie && series.some((s) => s.id === event.dansSerie) ? event.dansSerie : '');
  const [idNouvelle] = useState(() => uid('se'));
  const [nomNouvelle, setNomNouvelle] = useState('');
  const dansSerie = type !== 'serie' ? undefined : choixSerie === NOUVELLE_SERIE ? idNouvelle : choixSerie || undefined;
  const serieNouvelle = (): SerieEvenements | undefined => (dansSerie === idNouvelle ? { id: idNouvelle, nom: nomNouvelle.trim() } : undefined);
  const serieChoisie = type === 'serie' ? series.find((s) => s.id === choixSerie) : undefined;
  // Une newsletter, ou un événement d'une série de newsletters : sa place est « Newsletter ».
  const newsletter = type === 'newsletter' || !!serieChoisie?.newsletter;
  // Une newsletter : une date d'envoi, sans heure ni lieu.
  const envoi = type === 'newsletter';
  const [perso, setPerso] = useState(false);
  const [err, setErr] = useState('');
  const [demande, setDemande] = useState<'modifier' | 'supprimer' | null>(null);
  const isNew = !data.events.some((x) => x.id === event.id);
  const set = (p: Partial<ClubEvent>) => setV((x) => ({ ...x, ...p }));
  const r = v.repetition;
  const setR = (p: Partial<RepetitionEvenement>) => setV((x) => ({ ...x, repetition: { ...(x.repetition ?? { freq: 'semaine' }), ...p } }));
  const journee = !v.heure && v.heureFin === undefined;
  const fin = v.dateFin || v.date;

  // Titre proposé par la fiche (« Assemblée générale 2027 ») : il suit le type et la date tant qu'on ne l'a pas changé (un
  // type sans titre proposé l'efface). Un titre tapé, ou celui d'un événement déjà là, reste tel quel.
  const [propose, setPropose] = useState<string>();
  const nomAuto = (t: TypeEvenement, date: string) => {
    if (v.nom.trim() && v.nom !== propose) return v.nom;
    const auto = titreAuto(t, date) ?? '';
    setPropose(auto || undefined);
    return auto;
  };
  const choisirType = (t: TypeEvenement) => {
    setType(t);
    set({ nom: nomAuto(t, v.date) });
    // Pas encore de série : « Nouvelle série… ».
    if (t === 'serie' && !choixSerie && !series.length) setChoixSerie(NOUVELLE_SERIE);
  };

  // Début déplacé : la fin suit (même durée), comme dans un agenda.
  const setDebut = (date: string) => {
    const nom = nomAuto(type, date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return set({ date, nom });
    const n = diffDays(v.date, date);
    set({ date, nom, dateFin: v.dateFin ? addDays(v.dateFin, n) : undefined });
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

  // Le champ du titre, selon le type.
  const titreChamp = { evenement: 'Événement', ag: 'Assemblée générale', newsletter: 'Newsletter', serie: 'Événement' }[type];
  const verifier = (): string | undefined => {
    if (type === 'serie' && !choixSerie) return 'Choisis la série d’événements, ou « Nouvelle série… ».';
    if (type === 'serie' && choixSerie === NOUVELLE_SERIE && !nomNouvelle.trim()) return 'Donne un nom à la nouvelle série.';
    if (!v.nom.trim()) return `« ${titreChamp} » est obligatoire.`;
    if (!v.date) return envoi ? '« Date d’envoi » est obligatoire.' : '« Début » est obligatoire.';
    if (!envoi && fin < v.date) return 'La fin ne peut pas précéder le début.';
    if (!envoi && !journee && !v.heure) return 'Indique l’heure de début, ou coche « Toute la journée ».';
    if (!envoi && !journee && v.heure && v.heureFin && fin === v.date && v.heureFin < v.heure) return 'L’heure de fin doit suivre l’heure de début.';
    if (r?.jusquau !== undefined && (!r.jusquau || r.jusquau < v.date)) return 'La répétition doit se terminer après le premier jour.';
    if (r?.nombre !== undefined && !(r.nombre >= 1 && r.nombre <= 999)) return 'Nombre d’occurrences : de 1 à 999.';
    return undefined;
  };
  const pret = (): ClubEvent => ({
    ...v,
    nom: v.nom.trim(),
    heure: journee || envoi ? undefined : v.heure,
    heureFin: journee || envoi || !v.heureFin ? undefined : v.heureFin,
    ...(envoi ? { dateFin: undefined, lieu: '' } : {}),
    dansSerie,
    ag: type === 'ag' || undefined,
    newsletter: type === 'newsletter' || undefined,
  });
  const submit = () => {
    const bad = verifier();
    if (bad) return setErr(bad);
    setErr('');
    if (!serie) {
      saveEvent(pret(), etiquetteTouchee ? etiquette : undefined, serieNouvelle());
      return onClose();
    }
    // Type (assemblée générale, newsletter, série) et étiquette d'un événement qui se répète : ceux de toutes ses dates,
    // réglés tout de suite.
    const p = pret();
    const t = { ag: p.ag, newsletter: p.newsletter, dansSerie: p.dansSerie };
    if (!!t.ag !== !!serie.ag || !!t.newsletter !== !!serie.newsletter || (t.dansSerie ?? '') !== (serie.dansSerie ?? '')) reglerType(serie.id, t, serieNouvelle());
    if (etiquetteTouchee) reglerEtiquette(serie.id, etiquette);
    // Rien d'autre de changé : rien à demander.
    if (stable(normaliser(sansFinVide(p))) === stable(normaliser(sansFinVide({ ...depart, ...t })))) return onClose();
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
          if (demande === 'modifier') saveOccurrence({ ...serie, dansSerie, ag: pret().ag, newsletter: pret().newsletter }, jour!, pret(), p);
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
      ? `${liees.length} point(s) ont un délai calé sur une occurrence de cette série : si sa date change, leurs délais suivent automatiquement.`
      : `${liees.length} point(s) ont un délai calé sur cette date : si tu la changes, leurs délais suivront automatiquement.`;
  const origine = event.serie && data.events.find((x) => x.id === event.serie!.id);
  // Place de son étiquette (aide de la case « Étiquette ») : « Newsletter » pour une newsletter ; sinon la sienne dans
  // « Événements » (pas « Newsletter », qu'elle quitte si le type change).
  const placeEtiquette = deja?.lieux?.find((l) => !estLaNewsletter(data, l));

  return (
    <Modal title={isNew ? 'Nouvel événement' : 'Événement'} onClose={onClose}>
      <div className="form event-form">
        {/* Une date modifiée seule suit l'événement qui se répète : son type est le sien. */}
        {!event.serie && (
          <>
            <label className="full">
              Type
              <select value={type} onChange={(e) => choisirType(e.target.value as TypeEvenement)}>
                {TYPES_EVENEMENT.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <p className="muted full serie-note">
              {TYPES_EVENEMENT.find((t) => t.id === type)!.aide}
              {newsletter && ` Ses points se rangent dans « ${nomPlaceNewsletter(data)} » (son étiquette aussi), pas dans une sous-section à son nom dans « Événements ».`}
            </p>
          </>
        )}
        {!event.serie && type === 'serie' && (
          <label className="full">
            Série d’événements
            <select value={choixSerie} onChange={(e) => setChoixSerie(e.target.value)}>
              {!choixSerie && <option value="">— Choisir —</option>}
              {series.map((s) => <option key={s.id} value={s.id}>{s.nom}{s.newsletter ? ' (newsletters)' : ''}</option>)}
              <option value={NOUVELLE_SERIE}>Nouvelle série…</option>
            </select>
          </label>
        )}
        {!event.serie && type === 'serie' && choixSerie === NOUVELLE_SERIE && (
          <label className="full">
            Nom de la nouvelle série
            <input value={nomNouvelle} onChange={(e) => setNomNouvelle(e.target.value)} placeholder="Programme hivernal 2026-27, Championnat interne 2027…" />
          </label>
        )}
        <label className="full">
          {titreChamp}
          <input value={v.nom} onChange={(e) => set({ nom: e.target.value })} placeholder={type === 'ag' ? 'Assemblée générale 2027' : type === 'newsletter' ? 'Newsletter de décembre 2026' : 'Ajouter un titre'} />
        </label>
        {envoi ? (
          <label>
            Date d’envoi
            <input type="date" value={v.date} onChange={(e) => setDebut(e.target.value)} />
          </label>
        ) : (
          <>
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
        {!envoi && (
          <label className="full">
            Lieu
            <input value={v.lieu} onChange={(e) => set({ lieu: e.target.value })} />
          </label>
        )}
        <label className="full">
          Description
          <ZoneTexte rows={4} value={v.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
      </div>
      {can('events.manage') && !event.serie && (
        <div className="form">
          <CaseEtiquette
            titre="Étiquette"
            aide={`Ses membres, du comité ou non, voient les points de l’événement : ceux de la sous-section « ${
              newsletter ? nomPlaceNewsletter(data) : placeEtiquette ? nomLieu(placeEtiquette, data.sections) : `${sectionEvenements(data)?.nom ?? 'Événements'} › ${v.nom.trim() || '…'}`
            } »${newsletter || placeEtiquette ? '' : ' (créée d’office)'}, et ceux rattachés à l’événement.`}
            deja={deja}
            nom={v.nom.trim()}
            date={v.date}
            valeur={etiquette}
            onChange={choixEtiquette}
          />
        </div>
      )}
      {origine && <p className="muted"><Icone n="repetition" /> Occurrence de « {origine.nom} » modifiée seule (prévue le {fmtDate(event.serie!.date)}).</p>}
      {note && <p className="muted"><Icone n="epingle" /> {note}</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && <button className="btn danger" onClick={supprimer} title="Supprimer l’événement" aria-label="Supprimer l’événement"><Icone n="supprimer" /></button>}
        {!isNew && onChronologie && (
          <button className="btn" onClick={onChronologie} title="Les points de l’événement dans le temps, pour les planifier (sans enregistrer)">
            <Icone n="horloge" /> Chronologie
          </button>
        )}
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
