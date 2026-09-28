import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from './permissions';
import type { AppData, ChecklistItem, Poll, Role, ScheduledEmail, Task } from './types';
import { DEFAULT_MESSAGE, DEFAULT_OBJET } from './emails';
import { applyDelaiRef } from './utils';
import { COMMITTEE_IDS, COMPTA_SECTION, events, meetings, people, sections, statuses, tasks } from './seedData';
import { OUINON } from './polls';

// Données du G.S. Ajoie (tableau « Suivi des tâches »), voir seedData.ts.

const roles: Role[] = [
  { id: ADMIN_ROLE_ID, label: 'Admin (Président)', couleur: '#b45309', permissions: ALL_PERMISSIONS, sections: [], locked: true },
  { id: 'secretaire', label: 'Secrétaire', couleur: '#be185d', permissions: ALL_PERMISSIONS.filter((p) => p !== 'admin.access' && p !== 'settings.lists' && p !== 'tab.pv'), sections: [] }, // PV (tab.minutes) inclus
  { id: 'comite', label: 'Comité', couleur: '#1d4ed8', permissions: ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people', 'polls.create'], sections: [] },
  // Exemples de rôles ajoutés : droits limités à une section, ou à ses propres tâches.
  { id: 'caissier', label: 'Caissier', couleur: '#047857', permissions: ['tasks.viewAll', 'tasks.createAny', 'tasks.editAny', 'tasks.editOwn'], sections: [COMPTA_SECTION] },
  { id: 'responsable', label: 'Responsable d’activité', couleur: '#9333ea', permissions: ['tasks.editOwn', 'tab.events', 'tab.people'], sections: [] },
];

// Sondages d'exemple (sans réponses : on vote en changeant d'utilisateur).
function demoPolls(): Poll[] {
  const byTitle = (s: string) => tasks.find((t) => t.titre.startsWith(s));
  const sec = (nom: string) => sections.find((s) => s.nom === nom)?.id;
  const swiss = byTitle('Décider avec le comité si on enregistre');
  const lieu = tasks.find((t) => t.titre === 'Définir le lieu' && t.meetingId === 'm5');
  const base = { creePar: 'p1', creeLe: '2026-09-25T18:00:00.000Z', votes: {}, votants: [...COMMITTEE_IDS] };
  return [
    {
      ...base, id: 'poll1', type: 'ouinon', multiple: false, anonyme: false, options: OUINON, dateLimite: '2026-10-20', taskId: swiss?.id,
      question: 'Enregistrer tous les membres (139) à Swiss Cycling au lieu des 44 actuels ?',
      description: 'Avant de transmettre la liste exportée de ClubDesk.',
    },
    {
      ...base, id: 'poll2', type: 'dates', multiple: true, anonyme: false, dateLimite: '2026-10-15', sectionId: sec('Divers'),
      question: 'Date de la fête de l’Avent du club',
      options: [
        { id: 'o1', label: '', date: '2026-12-05', heure: '18:00' },
        { id: 'o2', label: '', date: '2026-12-12', heure: '18:00' },
        { id: 'o3', label: '', date: '2026-12-19', heure: '18:00' },
      ],
    },
    {
      ...base, id: 'poll3', type: 'choix', multiple: false, anonyme: false, taskId: lieu?.id,
      question: 'Lieu du Comité 5 (29.10.2026)',
      options: [
        { id: 'o1', label: 'Chez un membre du comité' },
        { id: 'o2', label: 'Au restaurant' },
        { id: 'o3', label: 'Salle du club' },
      ],
    },
    {
      ...base, id: 'poll4', type: 'choix', multiple: true, anonyme: true, sectionId: sec('Événements'),
      question: 'Programme hivernal : quelles activités ajouter ?',
      description: 'Plusieurs réponses possibles, réponses anonymes.',
      options: [
        { id: 'o1', label: 'Sortie ski de fond' },
        { id: 'o2', label: 'Sortie raquettes' },
        { id: 'o3', label: 'Home trainer en groupe' },
        { id: 'o4', label: 'Rien de plus' },
      ],
    },
  ];
}

// Exemple de sous-tâches confiées à d'autres personnes que les responsables de la tâche.
export function demoSubtasks(list: Task[]) {
  const t = list.find((x) => x.id === 't36');
  if (!t || t.checklist.length) return;
  const items: ChecklistItem[] = [
    { id: 'c36a', label: 'Photos de la saison', done: false, assigneeId: 'p2' },
    { id: 'c36b', label: 'Chiffres des membres', done: false, assigneeId: 'p3' },
    { id: 'c36c', label: 'Comptes de l’année', done: false, assigneeId: 'p4' },
  ];
  t.checklist = items;
}

// Exemples d'emails programmés par le président (l'un est déjà à envoyer).
export function demoEmails(list: Task[]): ScheduledEmail[] {
  const base = { creePar: 'p1', creeLe: '2026-09-20T18:00:00.000Z', statut: 'programme' as const, siNonTerminee: true, objet: DEFAULT_OBJET, message: DEFAULT_MESSAGE };
  const mk = (id: string, taskId: string, quand: ScheduledEmail['quand'], extra: Partial<ScheduledEmail> = {}): ScheduledEmail | null => {
    const t = list.find((x) => x.id === taskId);
    return t ? { ...base, id, taskId, destinataires: [...t.responsables], quand, ...extra } : null;
  };
  return [
    mk('e1', 't48', { type: 'delai', jours: 14, heure: '08:00' }),
    mk('e2', 't26', { type: 'delai', jours: 7, heure: '18:00' }),
    mk('e3', 't62', { type: 'delai', jours: -1, heure: '09:00' }, {
      objet: 'Relance : {tâche}',
      message: 'Bonjour,\n\nLe délai de la tâche « {tâche} » était le {délai}. Peux-tu me dire où tu en es ?\n\nVoir la tâche : {lien}\n\nMerci et à bientôt\n{expéditeur}',
    }),
  ].filter((x): x is ScheduledEmail => !!x);
}

export function makeSeed(): AppData {
  const base = { people, events, meetings } as AppData;
  const list = tasks.map((t) => applyDelaiRef(base, structuredClone(t)));
  demoSubtasks(list);
  return {
    people: structuredClone(people),
    statuses: structuredClone(statuses),
    sections: structuredClone(sections),
    tasks: list,
    meetings: structuredClone(meetings),
    events: structuredClone(events),
    roles: structuredClone(roles),
    polls: demoPolls(),
    emails: demoEmails(list),
    schema: 10,
    log: [{ id: 'l0', at: new Date().toISOString(), userId: 'p1', action: 'Import du tableau « Suivi des tâches » (G.S. Ajoie)' }],
    prefs: {},
  };
}
