import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from './permissions';
import type { AppData, ChecklistItem, DelaiRef, Recurrence, Role, Task } from './types';
import { applyDelaiRef, postesOf } from './utils';

// Les dates sont calculées par rapport à aujourd'hui pour que la démo reste « vivante ».
const d = (offset: number) => {
  const x = new Date();
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
};

const people: AppData['people'] = [
  { id: 'p1', poste: 'Président', nom: 'Rochat', prenom: 'Marc', email: 'marc.rochat@gsa-club.ch', telephone: '079 412 33 10', roles: ['admin'], actif: true, couleur: '#1d4ed8' },
  { id: 'p2', poste: 'Vice-présidente', nom: 'Favre', prenom: 'Sophie', email: 'sophie.favre@gsa-club.ch', telephone: '078 655 21 04', roles: ['comite'], actif: true, couleur: '#7c3aed' },
  { id: 'p3', poste: 'Secrétaire', nom: 'Dubois', prenom: 'Claire', email: 'claire.dubois@gsa-club.ch', telephone: '076 318 90 22', roles: ['secretaire'], actif: true, couleur: '#db2777' },
  { id: 'p4', poste: 'Trésorier', nom: 'Meylan', prenom: 'Julien', email: 'julien.meylan@gsa-club.ch', telephone: '079 201 45 67', roles: ['comite', 'tresorier'], actif: true, couleur: '#059669' },
  { id: 'p5', poste: 'Responsable sportif', nom: 'Bonvin', prenom: 'Luca', email: 'luca.bonvin@gsa-club.ch', telephone: '077 540 12 88', roles: ['comite'], actif: true, couleur: '#ea580c' },
  { id: 'p6', poste: 'Responsable communication', nom: 'Pittet', prenom: 'Emma', email: 'emma.pittet@gsa-club.ch', telephone: '078 902 67 31', roles: ['comite'], actif: true, couleur: '#0891b2' },
  { id: 'p7', poste: 'Responsable manifestations', nom: 'Girard', prenom: 'Nicolas', email: 'nicolas.girard@gsa-club.ch', telephone: '079 733 04 59', roles: ['comite'], actif: true, couleur: '#ca8a04' },
  { id: 'p8', poste: 'Responsable infrastructures', nom: 'Morel', prenom: 'Thomas', email: 'thomas.morel@gsa-club.ch', telephone: '076 488 16 70', roles: ['comite'], actif: true, couleur: '#475569' },
  { id: 'p10', poste: 'Bénévole buvette', nom: 'Rey', prenom: 'Léa', email: 'lea.rey@gsa-club.ch', telephone: '079 820 55 41', roles: ['benevole'], actif: true, couleur: '#be123c' },
  { id: 'p9', poste: 'Ancien membre', nom: 'Perrin', prenom: 'Anne', email: 'anne.perrin@gsa-club.ch', telephone: '078 111 22 33', roles: ['comite'], actif: false, couleur: '#94a3b8' },
];

const roles: Role[] = [
  { id: ADMIN_ROLE_ID, label: 'Admin (Président)', couleur: '#b45309', permissions: ALL_PERMISSIONS, sections: [], locked: true },
  { id: 'secretaire', label: 'Secrétaire', couleur: '#be185d', permissions: ALL_PERMISSIONS.filter((p) => p !== 'admin.access' && p !== 'settings.lists'), sections: [] },
  { id: 'comite', label: 'Comité', couleur: '#1d4ed8', permissions: ['tasks.viewAll', 'tasks.editOwn', 'tab.meetings', 'tab.events', 'tab.people'], sections: [] },
  // Exemples de rôles ajoutés par l'admin : droits limités à certaines sections.
  { id: 'tresorier', label: 'Trésorier', couleur: '#047857', permissions: ['tasks.viewAll', 'tasks.createAny', 'tasks.editAny', 'tasks.editOwn'], sections: ['sec2'] },
  { id: 'benevole', label: 'Bénévole manifestations', couleur: '#9333ea', permissions: ['tasks.viewAll', 'tasks.editOwn', 'tab.events'], sections: ['sec5'] },
];

const statuses: AppData['statuses'] = [
  { id: 's1', label: 'À faire', couleur: '#64748b', done: false },
  { id: 's2', label: 'En cours', couleur: '#2563eb', done: false },
  { id: 's3', label: 'Bloqué', couleur: '#dc2626', done: false },
  { id: 's4', label: 'Terminé', couleur: '#16a34a', done: true },
];

const sections: AppData['sections'] = [
  { id: 'sec1', nom: 'Administration', sousSections: ['Assemblée générale', 'Membres', 'Assurances', 'Statuts & règlements'] },
  { id: 'sec2', nom: 'Finances', sousSections: ['Budget', 'Cotisations', 'Sponsoring', 'Subventions'] },
  { id: 'sec3', nom: 'Communication', sousSections: ['Site web', 'Réseaux sociaux', 'Newsletter', 'Presse'] },
  { id: 'sec4', nom: 'Sportif', sousSections: ['Entraînements', 'Compétitions', 'Juniors', 'Arbitrage'] },
  { id: 'sec5', nom: 'Manifestations', sousSections: ['Logistique', 'Bénévoles', 'Buvette', 'Autorisations'] },
  { id: 'sec6', nom: 'Infrastructures', sousSections: ['Terrain', 'Vestiaires', 'Matériel', 'Local'] },
];

const meetings: AppData['meetings'] = [
  { id: 'm1', titre: 'Séance de comité n°1', date: d(-60), lieu: 'Club-house', ordreDuJour: '1. PV\n2. Bilan saison\n3. Budget prévisionnel', notes: 'Budget à finaliser pour l’AG.' },
  { id: 'm2', titre: 'Séance de comité n°2', date: d(-30), lieu: 'Club-house', ordreDuJour: '1. PV\n2. Tournoi d’été\n3. Sponsoring', notes: 'Recherche de 3 nouveaux sponsors.' },
  { id: 'm3', titre: 'Séance de comité n°3', date: d(-7), lieu: 'Visio', ordreDuJour: '1. PV\n2. Préparation AG\n3. Divers', notes: 'Convocation AG à envoyer.' },
  { id: 'm4', titre: 'Séance de comité n°4', date: d(10), lieu: 'Club-house', ordreDuJour: '1. PV\n2. Soirée annuelle\n3. Travaux vestiaires', notes: '' },
  { id: 'm5', titre: 'Séance de comité n°5', date: d(40), lieu: 'Salle communale', ordreDuJour: '1. PV\n2. Bilan AG\n3. Planning hiver', notes: '' },
  { id: 'm6', titre: 'Séance extraordinaire', date: d(70), lieu: 'Club-house', ordreDuJour: '1. Projet nouveau terrain', notes: '' },
];

const events: AppData['events'] = [
  { id: 'e1', nom: 'Assemblée générale', date: d(21), lieu: 'Salle communale', description: 'AG ordinaire annuelle des membres.' },
  { id: 'e2', nom: 'Tournoi d’automne', date: d(35), lieu: 'Terrain principal', description: 'Tournoi juniors et actifs, 16 équipes.' },
  { id: 'e3', nom: 'Soirée annuelle', date: d(55), lieu: 'Grande salle', description: 'Repas de soutien et remise des prix.' },
  { id: 'e4', nom: 'Marché de Noël (stand)', date: d(85), lieu: 'Place du village', description: 'Stand vin chaud au profit des juniors.' },
  { id: 'e5', nom: 'Camp d’entraînement', date: d(120), lieu: 'Centre sportif', description: 'Camp de printemps pour les juniors.' },
  { id: 'e6', nom: 'Tournoi d’été', date: d(-40), lieu: 'Terrain principal', description: 'Édition passée.' },
];

let n = 0;
const cl = (...items: [string, boolean][]): ChecklistItem[] =>
  items.map(([label, done]) => ({ id: `c${++n}`, label, done }));

type Row = [string, string, string, string[], string, number, string, string?, string?, ChecklistItem[]?];
// [section, sous-section, titre, responsables, statut, délai (jours), remarque, événement, séance, checklist]
const rows: Row[] = [
  ['sec1', 'Assemblée générale', 'Envoyer la convocation à l’AG', ['p3'], 's2', 3, 'Délai statutaire : 20 jours avant.', 'e1', 'm3', cl(['Rédiger la convocation', true], ['Valider avec le président', true], ['Envoi email', false], ['Envoi postal', false])],
  ['sec1', 'Assemblée générale', 'Préparer le rapport du président', ['p1'], 's1', 14, '', 'e1', 'm3'],
  ['sec1', 'Assemblée générale', 'Réserver la salle communale', ['p7'], 's4', -10, 'Confirmé par la commune.', 'e1'],
  ['sec1', 'Membres', 'Mettre à jour la liste des membres', ['p3'], 's2', 7, ''],
  ['sec1', 'Membres', 'Relancer les nouveaux membres sans licence', ['p3', 'p5'], 's1', -2, '5 joueurs concernés.'],
  ['sec1', 'Assurances', 'Renouveler l’assurance RC', ['p4'], 's3', -5, 'En attente de l’offre de l’assureur.'],
  ['sec1', 'Statuts & règlements', 'Réviser l’article 12 des statuts', ['p1', 'p2'], 's1', 20, 'À soumettre à l’AG.', 'e1', 'm3'],
  ['sec2', 'Budget', 'Finaliser le budget prévisionnel', ['p4'], 's2', 5, '', 'e1', 'm1', cl(['Charges', true], ['Produits', true], ['Validation comité', false])],
  ['sec2', 'Budget', 'Clôturer les comptes de la saison', ['p4'], 's4', -15, ''],
  ['sec2', 'Cotisations', 'Envoyer les factures de cotisation', ['p4', 'p3'], 's4', -20, ''],
  ['sec2', 'Cotisations', 'Relancer les cotisations impayées', ['p4'], 's1', -3, '12 membres en retard.'],
  ['sec2', 'Sponsoring', 'Démarcher 3 nouveaux sponsors', ['p2', 'p6'], 's2', 25, '', undefined, 'm2', cl(['Garage du Centre', true], ['Boulangerie Martin', false], ['Banque locale', false])],
  ['sec2', 'Sponsoring', 'Renouveler le contrat sponsor maillots', ['p1'], 's1', 30, ''],
  ['sec2', 'Subventions', 'Déposer la demande de subvention communale', ['p4'], 's3', 2, 'Manque attestation.'],
  ['sec3', 'Site web', 'Mettre à jour le calendrier sur le site', ['p6'], 's2', 1, ''],
  ['sec3', 'Site web', 'Publier le PV de la dernière AG', ['p6', 'p3'], 's4', -25, ''],
  ['sec3', 'Réseaux sociaux', 'Campagne Instagram tournoi d’automne', ['p6'], 's1', 20, '', 'e2'],
  ['sec3', 'Newsletter', 'Rédiger la newsletter mensuelle', ['p6'], 's1', 9, ''],
  ['sec3', 'Presse', 'Communiqué de presse soirée annuelle', ['p6'], 's1', 40, '', 'e3'],
  ['sec4', 'Entraînements', 'Planning des entraînements d’hiver', ['p5'], 's2', 12, '', undefined, 'm5'],
  ['sec4', 'Entraînements', 'Recruter un entraîneur juniors B', ['p5', 'p1'], 's3', -8, 'Aucun candidat pour l’instant.'],
  ['sec4', 'Compétitions', 'Inscrire les équipes au championnat', ['p5'], 's4', -30, ''],
  ['sec4', 'Compétitions', 'Organiser le tableau du tournoi', ['p5'], 's1', 28, '', 'e2'],
  ['sec4', 'Juniors', 'Organiser le camp d’entraînement', ['p5', 'p7'], 's1', 90, '', 'e5'],
  ['sec4', 'Arbitrage', 'Former 2 nouveaux arbitres', ['p5'], 's2', 45, ''],
  ['sec5', 'Logistique', 'Réserver tentes et tables tournoi', ['p7'], 's2', 15, '', 'e2', undefined, cl(['Tentes', true], ['Tables', false], ['Sonorisation', false])],
  ['sec5', 'Bénévoles', 'Planning des bénévoles tournoi', ['p7', 'p3', 'p10'], 's1', 25, '', 'e2'],
  ['sec5', 'Buvette', 'Commander les boissons buvette', ['p10'], 's1', 30, '', 'e2'],
  ['sec5', 'Autorisations', 'Demande de patente pour le tournoi', ['p7'], 's3', -1, 'Formulaire refusé, à corriger.', 'e2'],
  ['sec5', 'Logistique', 'Choisir le traiteur soirée annuelle', ['p7', 'p2'], 's2', 18, '', 'e3', 'm4'],
  ['sec5', 'Bénévoles', 'Trouver des bénévoles marché de Noël', ['p10', 'p7'], 's1', 60, '', 'e4'],
  ['sec5', 'Buvette', 'Bilan financier buvette tournoi d’été', ['p4', 'p7'], 's4', -12, '', 'e6'],
  ['sec6', 'Terrain', 'Faire réparer l’arrosage automatique', ['p8'], 's3', -14, 'Pièce en commande.'],
  ['sec6', 'Vestiaires', 'Devis rénovation des vestiaires', ['p8', 'p4'], 's2', 8, '', undefined, 'm4', cl(['Devis entreprise A', true], ['Devis entreprise B', false])],
  ['sec6', 'Matériel', 'Inventaire du matériel', ['p8', 'p5'], 's1', 11, ''],
  ['sec6', 'Matériel', 'Commander 20 ballons', ['p8'], 's4', -6, ''],
  ['sec6', 'Local', 'Changer la serrure du local', ['p8'], 's1', 4, ''],
  ['sec6', 'Terrain', 'Étude projet nouveau terrain', ['p1', 'p8'], 's1', 65, '', undefined, 'm6'],
  ['sec1', 'Membres', 'Archiver les dossiers des anciens membres', ['p9'], 's1', 50, 'Réassigner (membre inactif).'],
  ['sec3', 'Réseaux sociaux', 'Vidéo récap saison', ['p6', 'p5'], 's1', 16, ''],
];

const tasks: Task[] = rows.map(([sectionId, sousSection, titre, responsables, statusId, off, remarque, eventId, meetingId, checklist], i) => ({
  id: `t${i + 1}`,
  sectionId,
  sousSection,
  titre,
  responsables,
  statusId,
  delai: d(off),
  remarque,
  eventId,
  meetingId,
  checklist: checklist ?? [],
  createdBy: 'p1',
  updatedAt: new Date(Date.now() - (rows.length - i) * 3600_000 * 7).toISOString(),
}));

// Délais liés à la date d'un événement / d'une séance (jours avant).
const LINKED: Record<string, DelaiRef> = {
  'Envoyer la convocation à l’AG': { type: 'event', joursAvant: 20 },
  'Préparer le rapport du président': { type: 'event', joursAvant: 7 },
  'Réviser l’article 12 des statuts': { type: 'event', joursAvant: 3 },
  'Campagne Instagram tournoi d’automne': { type: 'event', joursAvant: 14 },
  'Organiser le tableau du tournoi': { type: 'event', joursAvant: 7 },
  'Réserver tentes et tables tournoi': { type: 'event', joursAvant: 21 },
  'Planning des bénévoles tournoi': { type: 'event', joursAvant: 14 },
  'Commander les boissons buvette': { type: 'event', joursAvant: 7 },
  'Choisir le traiteur soirée annuelle': { type: 'event', joursAvant: 30 },
  'Communiqué de presse soirée annuelle': { type: 'event', joursAvant: 7 },
  'Trouver des bénévoles marché de Noël': { type: 'event', joursAvant: 21 },
  'Organiser le camp d’entraînement': { type: 'event', joursAvant: 30 },
  'Devis rénovation des vestiaires': { type: 'meeting', joursAvant: 3 },
  'Planning des entraînements d’hiver': { type: 'meeting', joursAvant: 7 },
};

// Tâches qui reviennent régulièrement.
const RECURRING: Record<string, Recurrence> = {
  'Envoyer la convocation à l’AG': 'annuelle',
  'Préparer le rapport du président': 'annuelle',
  'Finaliser le budget prévisionnel': 'annuelle',
  'Renouveler l’assurance RC': 'annuelle',
  'Relancer les cotisations impayées': 'trimestrielle',
  'Déposer la demande de subvention communale': 'annuelle',
  'Rédiger la newsletter mensuelle': 'mensuelle',
  'Mettre à jour le calendrier sur le site': 'mensuelle',
  'Inventaire du matériel': 'annuelle',
  'Planning des entraînements d’hiver': 'annuelle',
};

export function makeSeed(): AppData {
  const base = { people, events, meetings } as AppData;
  const seeded = tasks.map((t) => {
    const x: Task = { ...t, delaiRef: LINKED[t.titre], recurrence: RECURRING[t.titre] };
    if (x.recurrence) x.postesResp = postesOf(base, x.responsables);
    return applyDelaiRef(base, x);
  });
  return {
    people,
    statuses,
    sections,
    tasks: seeded,
    meetings,
    events,
    roles: structuredClone(roles),
    log: [{ id: 'l0', at: new Date().toISOString(), userId: 'p1', action: 'Initialisation des données de démonstration' }],
    prefs: {},
  };
}
