import type { AgendaClubEvent, AppData, ClubEvent, Task, Unit } from './types';
import type { ElementIcs } from './ics';
import { estOccurrence, fmtHeure, occurrenceDu } from './repetition';
import { fullName, isDone } from './utils';
import { isOpen } from './polls';
import { UNIT_TYPES } from './units';

// Ce que contient l'agenda envoyé dans un agenda personnel : fichier .ics de « Exporter » (ExportAgenda) et lien
// d'abonnement relu par l'agenda (fonction gsa-agenda, qui inclut ce module : npm run fonction). Mêmes règles des
// deux côtés : séances, événements, dates du club, délais des tâches et fins de sondage, avec des identifiants
// stables (un élément modifié remplace l'ancien dans l'agenda).

/** Entité du club telle que l'agenda en a besoin. */
export type UniteAgenda = Pick<Unit, 'id' | 'nom' | 'type' | 'date' | 'dateFin' | 'archive'>;

/** Dans l'agenda du club : une entité, ses événements (pas ceux de l'entité ouverte, déjà dans son agenda) et sa prochaine édition. */
export interface ManifAgenda<U extends UniteAgenda = UniteAgenda> {
  u: U;
  events: AgendaClubEvent[];
  edition: boolean;
  /** L'entité ouverte. */
  own: boolean;
}

export type TachesAgenda = 'non' | 'mes' | 'toutes';

/** Ce que la personne met dans son agenda. */
export interface ChoixAgenda {
  seances: boolean;
  evenements: boolean;
  club: boolean;
  taches: TachesAgenda;
  sondages: boolean;
}

/** Choix enregistrés avec un lien d'abonnement (migration 045), avec l'adresse et le nom de l'appli (liens, nom de l'agenda). */
export type OptionsAbonnement = Partial<ChoixAgenda> & { appli?: string; nomAppli?: string };

/** Sans heure de fin : une séance dure 2 h (un événement 1 h, ics.ts). */
const DUREE_SEANCE = 120;
const DOMAINE = 'taches-gsa';
/** Répétitions sans règle exacte : occurrences écrites jusqu'à deux ans. */
export const HORIZON_AGENDA = 730;
/** Lien d'abonnement : ce qui s'est passé depuis un an reste dans l'agenda. */
export const PASSE_ABONNEMENT = 365;

/**
 * Agenda du club, par entité : ses événements et sa prochaine édition (sous-comité, équipe), sauf si l'un de ses
 * événements tombe déjà à cette date. Entités archivées et entités sans rien à montrer : absentes.
 */
export function manifsAgenda<U extends UniteAgenda>(units: U[], courante: string | undefined, clubEvents: AgendaClubEvent[], ownEvents: Pick<ClubEvent, 'date' | 'dateFin' | 'repetition' | 'sauf'>[]): ManifAgenda<U>[] {
  return units
    .filter((u) => !u.archive)
    .map((u) => {
      const own = u.id === courante;
      const events = own ? [] : clubEvents.filter((e) => e.uniteId === u.id);
      const edition = (u.type === 'sous-comite' || u.type === 'equipe') && !!u.date && !(own ? ownEvents : events).some((e) => e.date === u.date || (!!e.repetition && estOccurrence(e, u.date!)));
      return { u, events, edition, own };
    })
    .filter((x) => x.events.length > 0 || x.edition);
}

/** Lieu à mettre dans l'agenda (« À définir » : aucun). */
const lieu = (l?: string) => (l?.trim() && !/^à définir$/i.test(l.trim()) ? l.trim() : undefined);

export interface ListesAgenda {
  seances: ElementIcs[];
  evenements: ElementIcs[];
  club: ElementIcs[];
  taches: ElementIcs[];
  sondages: ElementIcs[];
}

/**
 * Éléments de l'agenda. `depuis` : rien d'avant ce jour (sans : tout) ; `voit` : tâches que la personne voit
 * (canSeeTask) ; `lien` : adresse de l'appli ouverte sur une page (« /taches?tache=… »).
 */
export function listesAgenda(o: {
  data: Pick<AppData, 'meetings' | 'events' | 'tasks' | 'polls' | 'sections' | 'statuses' | 'people'>;
  userId?: string;
  voit: (t: Task) => boolean;
  manifs: ManifAgenda[];
  taches: TachesAgenda;
  depuis?: string;
  lien: (chemin: string) => string;
}): ListesAgenda {
  const { data, userId, depuis, lien } = o;
  const nomPersonne = (id: string) => fullName(data.people.find((p) => p.id === id));
  const seances: ElementIcs[] = data.meetings
    .filter((m) => !depuis || m.date >= depuis)
    .map((m) => ({
      uid: `seance-${m.id}@${DOMAINE}`, titre: m.titre, date: m.date, heure: m.heure, dureeDefaut: DUREE_SEANCE,
      lieu: lieu(m.lieu), geo: m.lieuGeo, url: lien('/comite'),
    }));
  const evenements: ElementIcs[] = data.events
    .filter((x) => !depuis || !!occurrenceDu(x, depuis))
    .map((x) => ({
      uid: `evenement-${x.id}@${DOMAINE}`, titre: x.nom, date: x.date, dateFin: x.dateFin, heure: x.heure, heureFin: x.heureFin,
      lieu: lieu(x.lieu), description: x.description, repetition: x.repetition, sauf: x.sauf, url: lien('/evenements'),
    }));
  const club: ElementIcs[] = o.manifs.flatMap(({ u, events, edition }) => [
    ...(edition && (!depuis || (u.dateFin ?? u.date!) >= depuis)
      ? [{ uid: `edition-${u.id}-${u.date}@${DOMAINE}`, titre: u.nom, date: u.date!, dateFin: u.dateFin, description: UNIT_TYPES[u.type].label }]
      : []),
    ...events
      .filter((x) => !depuis || !!occurrenceDu(x, depuis))
      .map((x) => ({
        uid: `club-${u.id}-${x.id}@${DOMAINE}`, titre: x.nom === u.nom ? x.nom : `${x.nom} (${u.nom})`, date: x.date, dateFin: x.dateFin, heure: x.heure, heureFin: x.heureFin,
        lieu: lieu(x.lieu), repetition: x.repetition, sauf: x.sauf,
      })),
  ]);
  const taches: ElementIcs[] = !userId || o.taches === 'non' ? [] : data.tasks
    .filter((x) => x.delai && (!depuis || x.delai >= depuis) && !isDone(data as AppData, x) && (o.taches === 'mes' ? x.responsables.includes(userId) : o.voit(x)))
    .map((x) => ({
      uid: `tache-${x.id}@${DOMAINE}`, titre: `Délai : ${x.titre}`, date: x.delai, libre: true, url: lien(`/taches?tache=${encodeURIComponent(x.id)}`),
      description: [
        data.sections.find((z) => z.id === x.sectionId)?.nom,
        data.statuses.find((z) => z.id === x.statusId)?.label,
        x.responsables.length ? `Responsables : ${x.responsables.map(nomPersonne).join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    }));
  const sondages: ElementIcs[] = (data.polls ?? [])
    .filter((x) => x.dateLimite && isOpen(x) && (!depuis || x.dateLimite >= depuis))
    .map((x) => ({
      uid: `sondage-${x.id}@${DOMAINE}`, titre: `Fin du sondage${x.heureLimite ? ` (${fmtHeure(x.heureLimite)})` : ''} : ${x.question}`, date: x.dateLimite!,
      libre: true, url: lien(`/sondages?id=${encodeURIComponent(x.id)}`),
    }));
  return { seances, evenements, club, taches, sondages };
}

/** Éléments choisis (les tâches : déjà selon le choix, dans listesAgenda). */
export const elementsChoisis = (l: ListesAgenda, c: Omit<ChoixAgenda, 'taches'>): ElementIcs[] => [
  ...(c.seances ? l.seances : []),
  ...(c.evenements ? l.evenements : []),
  ...(c.club ? l.club : []),
  ...l.taches,
  ...(c.sondages ? l.sondages : []),
];

/** Nom de l'agenda : « Tâches GSA – Comité central ». */
export const nomAgenda = (appli: string, entite?: string) => (entite ? `${appli} – ${entite}` : appli);
