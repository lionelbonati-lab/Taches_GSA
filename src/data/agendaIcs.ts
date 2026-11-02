import type { AppData, Etiquette, Task } from './types';
import type { ElementIcs } from './ics';
import { fmtHeure, occurrenceDu } from './repetition';
import { fullName, isDone } from './utils';
import { isOpen } from './polls';

// Ce que contient l'agenda envoyé dans un agenda personnel : fichier .ics de « Exporter » (ExportAgenda) et lien
// d'abonnement relu par l'agenda (fonction gsa-agenda, qui inclut ce module : npm run fonction). Mêmes règles des
// deux côtés : séances, événements, dates des étiquettes « événement », délais des tâches et fins de sondage, avec des
// identifiants stables (un élément modifié remplace l'ancien dans l'agenda).

/** Étiquettes « événement » datées : les dates du club dans l'agenda. */
export const etiquettesDatees = (etiquettes: Etiquette[] = []) => etiquettes.filter((e) => e.type === 'evenement' && !!e.date);

const simple = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Même événement : même jour, et même nom (ou l'un contenu dans l'autre, ex. « Bruntrutaine » et « Bruntrutaine 2027 »). */
export const memeEvenement = (et: Pick<Etiquette, 'nom' | 'date'>, e: { nom: string; date: string }) => {
  const [x, y] = [simple(et.nom), simple(e.nom)];
  return et.date === e.date && !!x && !!y && (x.includes(y) || y.includes(x));
};

export type TachesAgenda = 'non' | 'mes' | 'toutes';

/** Ce que la personne met dans son agenda (`club` : les dates des étiquettes « événement »). */
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
  data: Pick<AppData, 'meetings' | 'events' | 'tasks' | 'polls' | 'sections' | 'statuses' | 'people' | 'etiquettes'>;
  userId?: string;
  voit: (t: Task) => boolean;
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
  // Étiquettes « événement » : leur date, sauf si un événement de l'agenda tombe déjà ce jour-là sous le même nom.
  const club: ElementIcs[] = etiquettesDatees(data.etiquettes)
    .filter((e) => (!depuis || (e.dateFin ?? e.date!) >= depuis) && !data.events.some((x) => x.date === e.date && x.nom.trim().toLowerCase() === e.nom.trim().toLowerCase()))
    .map((e) => ({ uid: `etiquette-${e.id}-${e.date}@${DOMAINE}`, titre: e.nom, date: e.date!, dateFin: e.dateFin, description: 'Événement (étiquette)', url: lien(`/taches?etiquette=${encodeURIComponent(e.id)}`) }));
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

/** Nom de l'agenda : « Tâches GSA », ou avec le nom de l'espace. */
export const nomAgenda = (appli: string, entite?: string) => (entite ? `${appli} – ${entite}` : appli);
