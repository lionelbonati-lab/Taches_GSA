import type { AppData, Person } from './types';
import { hasPermission, userRoles, voitTache } from './permissions';
import { addDays } from './utils';
import { calendrierIcs } from './ics';
import { elementsChoisis, HORIZON_AGENDA, listesAgenda, nomAgenda, PASSE_ABONNEMENT, type OptionsAbonnement } from './agendaIcs';

// Fonction « gsa-agenda » (abonnement à l'agenda par lien privé) : des lignes lues sur le serveur, comme la personne
// (mêmes règles d'accès que dans l'appli), au fichier .ics. Mêmes règles que « Exporter » (agendaIcs.ts), avec en plus
// les droits de la personne (séances, événements, toutes les tâches).
// Inclus dans la fonction par `npm run fonction` (supabase/functions/gsa-agenda/agenda.js).

export interface LigneAgenda { kind: string; id: string; pos: number; data: unknown }
export interface UniteServeur { id: string; nom: string }

const LISTES = ['people', 'roles', 'sections', 'statuses', 'meetings', 'events', 'tasks', 'polls', 'etiquettes'] as const;

/** Données de l'entité à partir de ses lignes (gsa_items). */
function donnees(lignes: LigneAgenda[]) {
  const d: Record<string, unknown[]> = Object.fromEntries(LISTES.map((k) => [k, []]));
  for (const r of [...lignes].sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1))) if (r.kind in d) d[r.kind].push(r.data);
  return d as unknown as AppData;
}

/** Fichier .ics du lien d'abonnement. `fiche` : la fiche de la personne ; `courante` : l'espace. */
export function agendaAbonnement(o: {
  lignes: LigneAgenda[];
  fiche: string | null;
  courante: string;
  unites?: UniteServeur[];
  options: OptionsAbonnement;
  maintenant: Date;
}): string {
  const data = donnees(o.lignes);
  const moi = (data.people as Person[]).find((p) => p.id === o.fiche && p.actif !== false) ?? null;
  const roles = userRoles(data.roles, moi);
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(roles, p);
  const jour = o.maintenant.toISOString().slice(0, 10);
  const op = o.options;
  // Lien vers l'appli réelle (comme lienAppli).
  const lien = (chemin: string) => (op.appli ? `${op.appli}?reel#${chemin}` : '');
  const taches = !moi ? 'non' : op.taches === 'toutes' && !can('tasks.viewAll') ? 'mes' : op.taches ?? 'non';
  const listes = listesAgenda({ data, userId: moi?.id, voit: (t) => voitTache(t, moi?.id, roles, data.etiquettes), taches, depuis: addDays(jour, -PASSE_ABONNEMENT), lien });
  const choisis = elementsChoisis(listes, {
    seances: !!op.seances && can('tab.meetings'),
    evenements: !!op.evenements && can('tab.events'),
    club: !!op.club,
    sondages: !!op.sondages,
  });
  return calendrierIcs(nomAgenda(op.nomAppli || 'Tâches GSA'), choisis, { depuis: addDays(jour, -PASSE_ABONNEMENT), horizon: addDays(jour, HORIZON_AGENDA), maintenant: o.maintenant });
}
