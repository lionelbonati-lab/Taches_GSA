// Données de départ de la démo, générées à partir du tableau « Suivi_Taches.xlsx » du G.S. Ajoie.
// Les noms de tiers (démissions, radiations, relances, remboursements) sont masqués : le site est public.
// Emails et téléphones fictifs.
import type { AppData } from './types';

export const people: AppData['people'] = [
  {
    "id": "p1",
    "poste": "Président",
    "autresPostes": "Course à Pied, Camp de Pentecôte",
    "nom": "B.",
    "prenom": "Lionel",
    "email": "lionel@gsajoie.example",
    "telephone": "",
    "roles": [
      "admin"
    ],
    "actif": true,
    "couleur": "#1d4ed8"
  },
  {
    "id": "p2",
    "poste": "Vice-Président",
    "autresPostes": "Programme, Critérium",
    "nom": "H.",
    "prenom": "Damien",
    "email": "damien@gsajoie.example",
    "telephone": "",
    "roles": [
      "comite"
    ],
    "actif": true,
    "couleur": "#7c3aed"
  },
  {
    "id": "p3",
    "poste": "Secrétaire",
    "autresPostes": "",
    "nom": "R.",
    "prenom": "Maxime",
    "email": "maxime@gsajoie.example",
    "telephone": "",
    "roles": [
      "secretaire"
    ],
    "actif": true,
    "couleur": "#db2777"
  },
  {
    "id": "p4",
    "poste": "Caissier",
    "autresPostes": "",
    "nom": "J.",
    "prenom": "Marie-France",
    "email": "mariefrance@gsajoie.example",
    "telephone": "",
    "roles": [
      "comite",
      "caissier"
    ],
    "actif": true,
    "couleur": "#059669"
  },
  {
    "id": "p5",
    "poste": "Compétition",
    "autresPostes": "Commande équipement",
    "nom": "T.",
    "prenom": "Christophe",
    "email": "christophe@gsajoie.example",
    "telephone": "",
    "roles": [
      "comite"
    ],
    "actif": true,
    "couleur": "#ea580c"
  },
  {
    "id": "p6",
    "poste": "Compétition",
    "autresPostes": "",
    "nom": "R.",
    "prenom": "Ismaël",
    "email": "ismael@gsajoie.example",
    "telephone": "",
    "roles": [
      "comite"
    ],
    "actif": true,
    "couleur": "#0891b2"
  },
  {
    "id": "p7",
    "poste": "Ecole Cyclisme",
    "autresPostes": "",
    "nom": "R.",
    "prenom": "Noah",
    "email": "noah@gsajoie.example",
    "telephone": "",
    "roles": [
      "comite"
    ],
    "actif": true,
    "couleur": "#ca8a04"
  },
  {
    "id": "p8",
    "poste": "Gruppetto",
    "autresPostes": "Gestion stocks",
    "nom": "S.",
    "prenom": "Stéphanie",
    "email": "stephanie@gsajoie.example",
    "telephone": "",
    "roles": [
      "comite"
    ],
    "actif": true,
    "couleur": "#be123c"
  },
  {
    "id": "p9",
    "poste": "Natation",
    "autresPostes": "",
    "nom": "",
    "prenom": "Dieter",
    "email": "dieter@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#0f766e"
  },
  {
    "id": "p10",
    "poste": "Bruntrutaine",
    "autresPostes": "",
    "nom": "",
    "prenom": "Clément",
    "email": "clement@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#9333ea"
  },
  {
    "id": "p11",
    "poste": "Montvoie",
    "autresPostes": "",
    "nom": "",
    "prenom": "Christian",
    "email": "christian@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#4d7c0f"
  },
  {
    "id": "p12",
    "poste": "Course préparation",
    "autresPostes": "Critérium",
    "nom": "",
    "prenom": "Romain",
    "email": "romain@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#b45309"
  },
  {
    "id": "p13",
    "poste": "Course préparation",
    "autresPostes": "",
    "nom": "",
    "prenom": "Heinz",
    "email": "heinz@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#475569"
  },
  {
    "id": "p14",
    "poste": "Coach JS",
    "autresPostes": "",
    "nom": "",
    "prenom": "Sarah",
    "email": "sarah@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#c026d3"
  },
  {
    "id": "p15",
    "poste": "Camp de Pentecôte",
    "autresPostes": "Camp EC",
    "nom": "",
    "prenom": "Jérôme",
    "email": "jerme@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#2563eb"
  },
  {
    "id": "p16",
    "poste": "Bénévole",
    "autresPostes": "",
    "nom": "",
    "prenom": "Aude",
    "email": "aude@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#65a30d"
  },
  {
    "id": "p17",
    "poste": "Bénévole",
    "autresPostes": "",
    "nom": "",
    "prenom": "Mèg",
    "email": "meg@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#e11d48"
  },
  {
    "id": "p18",
    "poste": "Bénévole",
    "autresPostes": "",
    "nom": "",
    "prenom": "Alphonse",
    "email": "alphonse@gsajoie.example",
    "telephone": "",
    "roles": [
      "responsable"
    ],
    "actif": true,
    "couleur": "#0369a1"
  }
];

export const statuses: AppData['statuses'] = [
  {
    "id": "s1",
    "label": "À faire",
    "couleur": "#64748b",
    "done": false
  },
  {
    "id": "s2",
    "label": "En cours",
    "couleur": "#2563eb",
    "done": false
  },
  {
    "id": "s3",
    "label": "En attente",
    "couleur": "#d97706",
    "done": false
  },
  {
    "id": "s7",
    "label": "Terminé",
    "couleur": "#16a34a",
    "done": true
  },
  {
    "id": "s9",
    "label": "Annulé",
    "couleur": "#475569",
    "done": true
  }
];

export const sections: AppData['sections'] = [
  {
    "id": "sec1",
    "nom": "Administration",
    "sousSections": [
      "Admission",
      "Démission",
      "Radiation",
      "Subvention",
      "Clubdesk",
      "Partenaire",
      "Protection des données",
      "Liste des membres",
      "Swiss Cycling"
    ]
  },
  {
    "id": "sec2",
    "nom": "Comptabilité",
    "sousSections": [
      "Cotisations",
      "Paiements",
      "Frais",
      "Subventions"
    ]
  },
  {
    "id": "sec3",
    "nom": "Section coureurs",
    "sousSections": [
      "Trophée Jurassien"
    ]
  },
  {
    "id": "sec4",
    "nom": "Section natation",
    "sousSections": []
  },
  {
    "id": "sec5",
    "nom": "Groupe compétition",
    "sousSections": [
      "Sponsoring"
    ]
  },
  {
    "id": "sec6",
    "nom": "École de cyclisme",
    "sousSections": [
      "Contrat Moniteur",
      "Conférence Yannis"
    ]
  },
  {
    "id": "sec7",
    "nom": "Gruppetto",
    "sousSections": []
  },
  {
    "id": "sec8",
    "nom": "Événements",
    "sousSections": [
      "Marche familiale 13.09",
      "Sortie St-Martin 14.11",
      "Soirée récréative 28.11",
      "Programme hivernal 26-27",
      "Championnat interne 2027",
      "Bruntrutaine 27.02.27",
      "AG 13.03.2027",
      "Conférence Yannis"
    ]
  },
  {
    "id": "sec9",
    "nom": "Équipements",
    "sousSections": [
      "Cyclisme",
      "Commande",
      "Habits civils"
    ]
  },
  {
    "id": "sec10",
    "nom": "Publicité",
    "sousSections": [
      "Partenariat Boldaire"
    ]
  },
  {
    "id": "sec11",
    "nom": "Communication",
    "sousSections": [
      "Newsletter",
      "WhatsApp",
      "Réseaux sociaux",
      "Site internet"
    ]
  },
  {
    "id": "sec12",
    "nom": "Divers",
    "sousSections": [
      "Prochain comité",
      "Souper comité 01.11"
    ]
  }
];

export const meetings: AppData['meetings'] = [
  {
    "id": "m1",
    "titre": "Comité 1",
    "date": "2026-04-09",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m2",
    "titre": "Comité 2",
    "date": "2026-05-19",
    "heure": "19:30",
    "lieu": "Chez Marie-France",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m3",
    "titre": "Comité 3",
    "date": "2026-06-30",
    "heure": "19:30",
    "lieu": "Chez Stéphanie",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m4",
    "titre": "Comité 4",
    "date": "2026-09-03",
    "heure": "19:30",
    "lieu": "Chez Stéphanie",
    "ordreDuJour": "Administration : admissions / démissions, sondage réseau cyclable jurassien, tri ClubDesk (EC / membre / AVS), PV AG 2026, subvention 2026\nComptabilité : réception Yannis, camp de juillet, remboursements, factures à transmettre\nSection coureurs : trail en commun (Trail du Jura bernois, 26.09.2026)\nSection natation : séance du vendredi confirmée\nGroupe compétition : groupe de travail, retours sponsors\nÉcole de cyclisme : JU Bike Parc, home trainer, passeport vacances\nÉvénements : AG 13.03.27 (lieu), marche familiale 13.09.26, programme hivernal, conférence Yannis, championnat d'hiver\nÉquipements : erreurs de commande, réponse Gobik\nPublicité : impression des flyers de l'EC\nCommunication : newsletter, WhatsApp, réseaux sociaux, site internet, serveur photo\nDivers : prochain comité 29.10.2026 19h30 (lieu ?), repas du comité, bénévoles, Jura Bike Parc, photo du comité, fête de l'Avent, location de matériel",
    "notes": ""
  },
  {
    "id": "m5",
    "titre": "Comité 5",
    "date": "2026-10-29",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m6",
    "titre": "Comité 6",
    "date": "2026-12-03",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m7",
    "titre": "Comité 7",
    "date": "2027-01-26",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m8",
    "titre": "Comité 8",
    "date": "2027-02-25",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m9",
    "titre": "Comité 1 (2027)",
    "date": "2027-03-18",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  }
];

export const events: AppData['events'] = [
  {
    "id": "e1",
    "nom": "Course de préparation",
    "date": "2026-04-25",
    "lieu": "",
    "description": "Organisation : Romain / Heinz."
  },
  {
    "id": "e2",
    "nom": "Camp de Pentecôte",
    "date": "2026-05-23",
    "lieu": "",
    "description": "Du 23 au 25 mai."
  },
  {
    "id": "e3",
    "nom": "Critérium",
    "date": "2026-06-03",
    "lieu": "Porrentruy",
    "description": "Organisation : Romain / Damien."
  },
  {
    "id": "e4",
    "nom": "Camp de juillet (École de cyclisme)",
    "date": "2026-07-04",
    "lieu": "",
    "description": "4 et 5 juillet."
  },
  {
    "id": "e5",
    "nom": "Course du Col de Montvoie",
    "date": "2026-08-16",
    "lieu": "Montvoie",
    "description": "Manche du Trophée jurassien."
  },
  {
    "id": "e6",
    "nom": "Marche familiale",
    "date": "2026-09-13",
    "lieu": "",
    "description": ""
  },
  {
    "id": "e7",
    "nom": "Programme hivernal 2026-27",
    "date": "2026-10-25",
    "lieu": "",
    "description": "Du 25.10.2026 au 28.03.2027 : mardi salle 18h30 (Noah), mercredi course à pied 18h15 (Clément), jeudi renfo ou spinning 19h15 (Aristote), vendredi natation 20h (Dieter)."
  },
  {
    "id": "e8",
    "nom": "Souper du comité",
    "date": "2026-11-01",
    "lieu": "Auberge du Peupe",
    "description": "Menu de groupe, 20 personnes."
  },
  {
    "id": "e9",
    "nom": "Sortie de la St-Martin",
    "date": "2026-11-14",
    "lieu": "",
    "description": ""
  },
  {
    "id": "e10",
    "nom": "Soirée récréative",
    "date": "2026-11-28",
    "lieu": "Stand de tir, Courtemautruy",
    "description": "Repas choucroute et animations."
  },
  {
    "id": "e11",
    "nom": "Bruntrutaine",
    "date": "2027-02-27",
    "lieu": "Porrentruy",
    "description": "Responsable : Clément."
  },
  {
    "id": "e12",
    "nom": "Assemblée générale 2027",
    "date": "2027-03-13",
    "lieu": "À définir",
    "description": "AG ordinaire."
  }
];

export const tasks: AppData['tasks'] = [
  {
    "id": "t1",
    "sectionId": "sec1",
    "sousSection": "Admission",
    "titre": "Traiter les admissions",
    "responsables": [
      "p3"
    ],
    "statusId": "s1",
    "delai": "2027-03-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Secrétaire"
    ]
  },
  {
    "id": "t2",
    "sectionId": "sec1",
    "sousSection": "Démission",
    "titre": "Traiter les démissions",
    "responsables": [
      "p3"
    ],
    "statusId": "s1",
    "delai": "2027-03-13",
    "remarque": "2 démissions (noms masqués dans la démo)",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Secrétaire"
    ]
  },
  {
    "id": "t3",
    "sectionId": "sec1",
    "sousSection": "Radiation",
    "titre": "Radiation AG",
    "responsables": [
      "p3"
    ],
    "statusId": "s1",
    "delai": "2027-03-13",
    "remarque": "2 radiations (noms masqués dans la démo)",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Secrétaire"
    ]
  },
  {
    "id": "t4",
    "sectionId": "sec1",
    "sousSection": "Subvention",
    "titre": "Subvention 2026 Porrentruy",
    "responsables": [
      "p3",
      "p1"
    ],
    "statusId": "s7",
    "delai": "2026-09-06",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "termineeLe": "2026-09-06"
  },
  {
    "id": "g5",
    "sectionId": "sec1",
    "sousSection": "Clubdesk",
    "titre": "Clubdesk",
    "responsables": [
      "p3"
    ],
    "statusId": "s2",
    "delai": "2027-01-26",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m7",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t5",
    "sectionId": "sec1",
    "sousSection": "Clubdesk",
    "titre": "Mettre à jour les numéro de téléphone",
    "responsables": [
      "p3"
    ],
    "statusId": "s7",
    "delai": "",
    "remarque": "Mail pour mise à jour envoyé",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g5"
  },
  {
    "id": "t6",
    "sectionId": "sec1",
    "sousSection": "Clubdesk",
    "titre": "Mise à jour des groupes de tri par âge",
    "responsables": [
      "p3"
    ],
    "statusId": "s1",
    "delai": "2027-01-26",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m7",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "parentId": "g5"
  },
  {
    "id": "g7",
    "sectionId": "sec1",
    "sousSection": "Partenaire",
    "titre": "Partenaire",
    "responsables": [
      "p3"
    ],
    "statusId": "s7",
    "delai": "2027-03-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Secrétaire"
    ]
  },
  {
    "id": "t7",
    "sectionId": "sec1",
    "sousSection": "Partenaire",
    "titre": "Liste membres pour Boldaire",
    "responsables": [
      "p3"
    ],
    "statusId": "s7",
    "delai": "2027-03-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Secrétaire"
    ],
    "parentId": "g7"
  },
  {
    "id": "t8",
    "sectionId": "sec1",
    "sousSection": "Partenaire",
    "titre": "Liste membres pour Olivélo",
    "responsables": [
      "p3"
    ],
    "statusId": "s7",
    "delai": "2027-03-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Secrétaire"
    ],
    "parentId": "g7"
  },
  {
    "id": "t9",
    "sectionId": "sec1",
    "sousSection": "Partenaire",
    "titre": "Liste membres pour Aristote",
    "responsables": [
      "p3"
    ],
    "statusId": "s7",
    "delai": "2027-03-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Secrétaire"
    ],
    "parentId": "g7"
  },
  {
    "id": "t10",
    "sectionId": "sec1",
    "sousSection": "Protection des données",
    "titre": "Modification formulaire d'adhésion",
    "responsables": [
      "p1",
      "p3",
      "p5",
      "p6",
      "p7",
      "p2",
      "p8",
      "p4"
    ],
    "statusId": "s1",
    "delai": "2027-02-25",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m8",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t11",
    "sectionId": "sec1",
    "sousSection": "Liste des membres",
    "titre": "Envoie liste des membres",
    "responsables": [
      "p3"
    ],
    "statusId": "s7",
    "delai": "2026-09-03",
    "remarque": "2 membres (noms masqués dans la démo)",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m4",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "termineeLe": "2026-09-03"
  },
  {
    "id": "t12",
    "sectionId": "sec2",
    "sousSection": "Cotisations",
    "titre": "Relance",
    "responsables": [
      "p4"
    ],
    "statusId": "s1",
    "delai": "",
    "remarque": "2 membres en retard (noms masqués dans la démo)",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "g13",
    "sectionId": "sec2",
    "sousSection": "Paiements",
    "titre": "Paiements",
    "responsables": [
      "p4"
    ],
    "statusId": "s2",
    "delai": "2027-01-26",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m7",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t13",
    "sectionId": "sec2",
    "sousSection": "Paiements",
    "titre": "Paiement assurance Mobilière",
    "responsables": [
      "p4"
    ],
    "statusId": "s3",
    "delai": "2027-01-26",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m7",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Caissier"
    ],
    "parentId": "g13"
  },
  {
    "id": "t57",
    "sectionId": "sec2",
    "sousSection": "Paiements",
    "titre": "Vérifier la modification du compte de paiement signalée par la banque",
    "responsables": [
      "p4"
    ],
    "statusId": "s2",
    "delai": "",
    "remarque": "Notification du 17.09.2026",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g13"
  },
  {
    "id": "t14",
    "sectionId": "sec2",
    "sousSection": "Frais",
    "titre": "Frais postaux",
    "responsables": [
      "p4"
    ],
    "statusId": "s3",
    "delai": "2027-01-26",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m7",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t15",
    "sectionId": "sec2",
    "sousSection": "Subventions",
    "titre": "Commune de Porrentruy 730.–",
    "responsables": [
      "p4"
    ],
    "statusId": "s7",
    "delai": "",
    "remarque": "Reçu 2025",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "g16",
    "sectionId": "sec3",
    "sousSection": "Trophée Jurassien",
    "titre": "Trophée Jurassien",
    "responsables": [],
    "statusId": "s7",
    "delai": "2026-10-18",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t16",
    "sectionId": "sec3",
    "sousSection": "Trophée Jurassien",
    "titre": "252 Marches",
    "responsables": [],
    "statusId": "s7",
    "delai": "2026-09-06",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g16"
  },
  {
    "id": "t17",
    "sectionId": "sec3",
    "sousSection": "Trophée Jurassien",
    "titre": "Course du Montbautier",
    "responsables": [],
    "statusId": "s7",
    "delai": "2026-09-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g16"
  },
  {
    "id": "t18",
    "sectionId": "sec3",
    "sousSection": "Trophée Jurassien",
    "titre": "Tour du val Terbi",
    "responsables": [],
    "statusId": "s7",
    "delai": "2026-09-19",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g16"
  },
  {
    "id": "t19",
    "sectionId": "sec3",
    "sousSection": "Trophée Jurassien",
    "titre": "Tabeillon",
    "responsables": [],
    "statusId": "s7",
    "delai": "2026-10-18",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g16"
  },
  {
    "id": "t20",
    "sectionId": "sec5",
    "sousSection": "",
    "titre": "Groupe de travail",
    "responsables": [
      "p5",
      "p6"
    ],
    "statusId": "s1",
    "delai": "2026-12-03",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m6",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t21",
    "sectionId": "sec5",
    "sousSection": "Sponsoring",
    "titre": "Trouver des sponsors pour maillots 2027",
    "responsables": [
      "p5",
      "p6"
    ],
    "statusId": "s2",
    "delai": "",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t22",
    "sectionId": "sec6",
    "sousSection": "Contrat Moniteur",
    "titre": "Signer contrat Moniteur",
    "responsables": [
      "p1",
      "p7"
    ],
    "statusId": "s1",
    "delai": "2026-12-03",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m6",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t23",
    "sectionId": "sec6",
    "sousSection": "",
    "titre": "Flyers",
    "responsables": [
      "p1"
    ],
    "statusId": "s7",
    "delai": "",
    "remarque": "Modification QR, URL",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t24",
    "sectionId": "sec6",
    "sousSection": "",
    "titre": "Coach JS",
    "responsables": [
      "p14"
    ],
    "statusId": "s1",
    "delai": "2026-09-03",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m4",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t25",
    "sectionId": "sec8",
    "sousSection": "Marche familiale 13.09",
    "titre": "Définir le parcours",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "2026-09-03",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e6",
    "meetingId": "m4",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t26",
    "sectionId": "sec8",
    "sousSection": "Sortie St-Martin 14.11",
    "titre": "Sortie de St-Martin",
    "responsables": [
      "p6"
    ],
    "statusId": "s1",
    "delai": "2026-10-29",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e9",
    "meetingId": "m5",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "g27",
    "sectionId": "sec8",
    "sousSection": "Soirée récréative 28.11",
    "titre": "Soirée récréative 28.11",
    "responsables": [
      "p5",
      "p7",
      "p1",
      "p2"
    ],
    "statusId": "s1",
    "delai": "2026-10-29",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e10",
    "meetingId": "m5",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t27",
    "sectionId": "sec8",
    "sousSection": "Soirée récréative 28.11",
    "titre": "Organiser le repas",
    "responsables": [
      "p5"
    ],
    "statusId": "s1",
    "delai": "2026-10-29",
    "remarque": "Choucroute",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e10",
    "meetingId": "m5",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "parentId": "g27"
  },
  {
    "id": "t28",
    "sectionId": "sec8",
    "sousSection": "Soirée récréative 28.11",
    "titre": "Planifier les animations",
    "responsables": [
      "p7",
      "p1"
    ],
    "statusId": "s1",
    "delai": "2026-10-29",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e10",
    "meetingId": "m5",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "parentId": "g27"
  },
  {
    "id": "t29",
    "sectionId": "sec8",
    "sousSection": "Soirée récréative 28.11",
    "titre": "Boissons (minérales, vin, bière, café)",
    "responsables": [
      "p2"
    ],
    "statusId": "s1",
    "delai": "2026-10-29",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e10",
    "meetingId": "m5",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "parentId": "g27"
  },
  {
    "id": "t30",
    "sectionId": "sec8",
    "sousSection": "Programme hivernal 26-27",
    "titre": "Préparer le programme",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "2026-09-03",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e7",
    "meetingId": "m4",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t31",
    "sectionId": "sec8",
    "sousSection": "Championnat interne 2027",
    "titre": "Organisation à définir",
    "responsables": [
      "p12"
    ],
    "statusId": "s1",
    "delai": "2026-12-03",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m6",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t32",
    "sectionId": "sec8",
    "sousSection": "Bruntrutaine 27.02.27",
    "titre": "Bruntrutaine",
    "responsables": [
      "p10"
    ],
    "statusId": "s7",
    "delai": "2027-02-27",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e11"
  },
  {
    "id": "g33",
    "sectionId": "sec8",
    "sousSection": "AG 13.03.2027",
    "titre": "AG 13.03.2027",
    "responsables": [
      "p4",
      "p1",
      "p3",
      "p8"
    ],
    "statusId": "s1",
    "delai": "2027-03-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Caissier",
      "Président",
      "Secrétaire",
      "Gruppetto"
    ]
  },
  {
    "id": "t33",
    "sectionId": "sec8",
    "sousSection": "AG 13.03.2027",
    "titre": "Reserver le lieu",
    "responsables": [
      "p4"
    ],
    "statusId": "s1",
    "delai": "2026-09-03",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "meetingId": "m4",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Caissier"
    ],
    "parentId": "g33"
  },
  {
    "id": "t34",
    "sectionId": "sec8",
    "sousSection": "AG 13.03.2027",
    "titre": "Organiser le repas",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "2027-01-26",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "meetingId": "m7",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Président"
    ],
    "parentId": "g33"
  },
  {
    "id": "t35",
    "sectionId": "sec8",
    "sousSection": "AG 13.03.2027",
    "titre": "Préparer l'ordre du jour",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "2027-02-25",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "meetingId": "m8",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Président"
    ],
    "parentId": "g33"
  },
  {
    "id": "t36",
    "sectionId": "sec8",
    "sousSection": "AG 13.03.2027",
    "titre": "Préparer le PowerPoint",
    "responsables": [
      "p1",
      "p3"
    ],
    "statusId": "s1",
    "delai": "2027-02-25",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "meetingId": "m8",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Président",
      "Secrétaire"
    ],
    "parentId": "g33"
  },
  {
    "id": "t37",
    "sectionId": "sec8",
    "sousSection": "AG 13.03.2027",
    "titre": "Beamer",
    "responsables": [
      "p8"
    ],
    "statusId": "s1",
    "delai": "2027-03-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Gruppetto"
    ],
    "parentId": "g33"
  },
  {
    "id": "t38",
    "sectionId": "sec8",
    "sousSection": "AG 13.03.2027",
    "titre": "Liste remerciements",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "2027-02-25",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "meetingId": "m8",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Président"
    ],
    "parentId": "g33"
  },
  {
    "id": "t39",
    "sectionId": "sec8",
    "sousSection": "AG 13.03.2027",
    "titre": "Chercher bons remerciements",
    "responsables": [
      "p4"
    ],
    "statusId": "s1",
    "delai": "2027-03-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Caissier"
    ],
    "parentId": "g33"
  },
  {
    "id": "t40",
    "sectionId": "sec8",
    "sousSection": "AG 13.03.2027",
    "titre": "Distribuer bons remerciements",
    "responsables": [
      "p1",
      "p3",
      "p5",
      "p6",
      "p7",
      "p2",
      "p8",
      "p4"
    ],
    "statusId": "s1",
    "delai": "2027-03-13",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e12",
    "delaiRef": {
      "type": "event",
      "joursAvant": 0
    },
    "recurrence": "annuelle",
    "postesResp": [
      "Président",
      "Secrétaire",
      "Compétition",
      "Ecole Cyclisme",
      "Vice-Président",
      "Gruppetto",
      "Caissier"
    ],
    "parentId": "g33"
  },
  {
    "id": "g41",
    "sectionId": "sec9",
    "sousSection": "Cyclisme",
    "titre": "Cyclisme",
    "responsables": [
      "p5",
      "p8"
    ],
    "statusId": "s1",
    "delai": "",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t41",
    "sectionId": "sec9",
    "sousSection": "Cyclisme",
    "titre": "Combinaison 1 pièce cyclisme",
    "responsables": [
      "p5",
      "p8"
    ],
    "statusId": "s1",
    "delai": "",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g41"
  },
  {
    "id": "t42",
    "sectionId": "sec9",
    "sousSection": "Cyclisme",
    "titre": "Combinaison triathlon",
    "responsables": [
      "p5",
      "p8"
    ],
    "statusId": "s1",
    "delai": "",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g41"
  },
  {
    "id": "t43",
    "sectionId": "sec9",
    "sousSection": "Commande",
    "titre": "Erreur de commande",
    "responsables": [
      "p5",
      "p8"
    ],
    "statusId": "s3",
    "delai": "",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t44",
    "sectionId": "sec9",
    "sousSection": "Habits civils",
    "titre": "Habits civils Jérôme R.",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "g45",
    "sectionId": "sec10",
    "sousSection": "Partenariat Boldaire",
    "titre": "Partenariat Boldaire",
    "responsables": [
      "p1",
      "p5",
      "p6"
    ],
    "statusId": "s2",
    "delai": "",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t45",
    "sectionId": "sec10",
    "sousSection": "Partenariat Boldaire",
    "titre": "Négocier meilleur % sur habits",
    "responsables": [
      "p1"
    ],
    "statusId": "s7",
    "delai": "",
    "remarque": "Au cas par cas selon marges",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g45"
  },
  {
    "id": "t46",
    "sectionId": "sec10",
    "sousSection": "Partenariat Boldaire",
    "titre": "Sponsoring futurs maillots",
    "responsables": [
      "p5",
      "p6"
    ],
    "statusId": "s3",
    "delai": "",
    "remarque": "Recontacter le moment venu",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g45"
  },
  {
    "id": "g47",
    "sectionId": "sec11",
    "sousSection": "Newsletter",
    "titre": "Newsletter",
    "responsables": [
      "p3"
    ],
    "statusId": "s1",
    "delai": "2026-10-10",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t47",
    "sectionId": "sec11",
    "sousSection": "Newsletter",
    "titre": "Marche familiale",
    "responsables": [
      "p3"
    ],
    "statusId": "s1",
    "delai": "2026-09-05",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g47"
  },
  {
    "id": "t48",
    "sectionId": "sec11",
    "sousSection": "Newsletter",
    "titre": "Programme hivernale",
    "responsables": [
      "p3"
    ],
    "statusId": "s1",
    "delai": "2026-10-10",
    "remarque": "Fichier fourni par Lionel",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g47"
  },
  {
    "id": "t49",
    "sectionId": "sec11",
    "sousSection": "WhatsApp",
    "titre": "Même contenu newsletter en différé",
    "responsables": [
      "p7"
    ],
    "statusId": "s1",
    "delai": "",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t50",
    "sectionId": "sec11",
    "sousSection": "Réseaux sociaux",
    "titre": "Rien pour le moment",
    "responsables": [
      "p4"
    ],
    "statusId": "s7",
    "delai": "",
    "remarque": "Récupérer les identifiants FB et Instagram",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t51",
    "sectionId": "sec11",
    "sousSection": "Site internet",
    "titre": "Mise à jour des informations",
    "responsables": [
      "p12"
    ],
    "statusId": "s2",
    "delai": "",
    "remarque": "Fournir du contenu",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "g52",
    "sectionId": "sec12",
    "sousSection": "Prochain comité",
    "titre": "Prochain comité",
    "responsables": [
      "p1"
    ],
    "statusId": "s2",
    "delai": "2027-02-25",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m8",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    }
  },
  {
    "id": "t52",
    "sectionId": "sec12",
    "sousSection": "Prochain comité",
    "titre": "Définir le lieu",
    "responsables": [
      "p1"
    ],
    "statusId": "s2",
    "delai": "2026-09-03",
    "remarque": "Chez Ismaël",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m4",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "parentId": "g52"
  },
  {
    "id": "t53",
    "sectionId": "sec12",
    "sousSection": "Prochain comité",
    "titre": "Définir le lieu",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "2026-10-29",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m5",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "parentId": "g52"
  },
  {
    "id": "t54",
    "sectionId": "sec12",
    "sousSection": "Prochain comité",
    "titre": "Définir le lieu",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "2026-12-03",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m6",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "parentId": "g52"
  },
  {
    "id": "t55",
    "sectionId": "sec12",
    "sousSection": "Prochain comité",
    "titre": "Définir le lieu",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "2027-01-26",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m7",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "parentId": "g52"
  },
  {
    "id": "t56",
    "sectionId": "sec12",
    "sousSection": "Prochain comité",
    "titre": "Définir le lieu",
    "responsables": [
      "p1"
    ],
    "statusId": "s1",
    "delai": "2027-02-25",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "meetingId": "m8",
    "delaiRef": {
      "type": "meeting",
      "joursAvant": 0
    },
    "parentId": "g52"
  },
  {
    "id": "t58",
    "sectionId": "sec12",
    "sousSection": "Souper comité 01.11",
    "titre": "Confirmer le menu groupe avec l'Auberge du Peupe (20 pers.)",
    "responsables": [
      "p1"
    ],
    "statusId": "s2",
    "delai": "",
    "remarque": "Voir mail de l’auberge",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "eventId": "e8"
  },
  {
    "id": "t59",
    "sectionId": "sec1",
    "sousSection": "Swiss Cycling",
    "titre": "Décider avec le comité si on enregistre tous les 139 membres à Swiss Cycling (vs 44 actuels) et transmettre la liste",
    "responsables": [
      "p3"
    ],
    "statusId": "s2",
    "delai": "2026-10-31",
    "remarque": "Sonder le comité sur WhatsApp d'abord ; export ClubDesk à envoyer à SC",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "g60",
    "sectionId": "sec6",
    "sousSection": "Conférence Yannis",
    "titre": "Conférence Yannis",
    "responsables": [
      "p18",
      "p7"
    ],
    "statusId": "s2",
    "delai": "2026-10-21",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  },
  {
    "id": "t60",
    "sectionId": "sec6",
    "sousSection": "Conférence Yannis",
    "titre": "Réserver la cabane du Banné (ou aula école, plan B météo)",
    "responsables": [
      "p18"
    ],
    "statusId": "s2",
    "delai": "2026-10-21",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g60"
  },
  {
    "id": "t62",
    "sectionId": "sec6",
    "sousSection": "Conférence Yannis",
    "titre": "Commander pizzas familiales (Bella-Ciao) pour les jeunes",
    "responsables": [
      "p7"
    ],
    "statusId": "s2",
    "delai": "2026-10-21",
    "remarque": "Dernier entraînement de la saison",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g60"
  },
  {
    "id": "t63",
    "sectionId": "sec6",
    "sousSection": "Conférence Yannis",
    "titre": "Contacter Manu et Eric (anciens coachs de Yannis)",
    "responsables": [
      "p7"
    ],
    "statusId": "s2",
    "delai": "2026-10-21",
    "remarque": "Demandé par Lionel à Yannis",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z",
    "parentId": "g60"
  },
  {
    "id": "t61",
    "sectionId": "sec8",
    "sousSection": "Conférence Yannis",
    "titre": "Prévoir boissons (eau plate/gazeuse) pour la conférence",
    "responsables": [
      "p1"
    ],
    "statusId": "s2",
    "delai": "2026-10-21",
    "remarque": "",
    "checklist": [],
    "createdBy": "p1",
    "updatedAt": "2026-09-20T18:00:00.000Z"
  }
];

/** Première ligne d'un groupe → tâche principale du groupe (mise à niveau des données enregistrées en v11). */
export const GROUPS: Record<string, string> = {
  "t5": "g5",
  "t7": "g7",
  "t13": "g13",
  "t16": "g16",
  "t27": "g27",
  "t33": "g33",
  "t41": "g41",
  "t45": "g45",
  "t47": "g47",
  "t52": "g52",
  "t60": "g60"
};

export const COMMITTEE_IDS = ["p1", "p3", "p5", "p6", "p7", "p2", "p8", "p4"];
export const COMPTA_SECTION = "sec2";
