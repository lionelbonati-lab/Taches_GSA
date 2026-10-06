// Données de départ de la démo, d'après l'organisation du G.S. Ajoie (sections, séances, événements).
// Le site est public : aucun nom, chaque personne est désignée par son poste (numéroté quand il y en a
// plusieurs), adresses fictives, pas de téléphones. Pas de tâches : chaque testeur part de zéro.
import type { AppData } from './types';

export const people: AppData['people'] = [
  {
    "id": "p1",
    "poste": "Président",
    "autresPostes": "Course à Pied, Camp de Pentecôte",
    "nom": "",
    "prenom": "Président",
    "email": "president@gsajoie.example",
    "telephone": "",
    "roles": [
      "admin"
    ],
    "actif": true,
    "couleur": "#1d4ed8"
  },
  {
    "id": "p2",
    "poste": "Vice-président",
    "autresPostes": "Programme, Critérium",
    "nom": "",
    "prenom": "Vice-président",
    "email": "vice-president@gsajoie.example",
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
    "nom": "",
    "prenom": "Secrétaire",
    "email": "secretaire@gsajoie.example",
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
    "nom": "",
    "prenom": "Caissier",
    "email": "caissier@gsajoie.example",
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
    "nom": "",
    "prenom": "Compétition 1",
    "email": "competition-1@gsajoie.example",
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
    "nom": "",
    "prenom": "Compétition 2",
    "email": "competition-2@gsajoie.example",
    "telephone": "",
    "roles": [
      "comite"
    ],
    "actif": true,
    "couleur": "#0891b2"
  },
  {
    "id": "p7",
    "poste": "École de cyclisme",
    "nom": "",
    "prenom": "École de cyclisme",
    "email": "ecole-de-cyclisme@gsajoie.example",
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
    "nom": "",
    "prenom": "Gruppetto",
    "email": "gruppetto@gsajoie.example",
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
    "nom": "",
    "prenom": "Natation",
    "email": "natation@gsajoie.example",
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
    "nom": "",
    "prenom": "Bruntrutaine",
    "email": "bruntrutaine@gsajoie.example",
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
    "nom": "",
    "prenom": "Montvoie",
    "email": "montvoie@gsajoie.example",
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
    "prenom": "Course préparation 1",
    "email": "course-preparation-1@gsajoie.example",
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
    "nom": "",
    "prenom": "Course préparation 2",
    "email": "course-preparation-2@gsajoie.example",
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
    "nom": "",
    "prenom": "Coach JS",
    "email": "coach-js@gsajoie.example",
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
    "prenom": "Camp de Pentecôte",
    "email": "camp-de-pentecote@gsajoie.example",
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
    "nom": "",
    "prenom": "Bénévole 1",
    "email": "benevole-1@gsajoie.example",
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
    "nom": "",
    "prenom": "Bénévole 2",
    "email": "benevole-2@gsajoie.example",
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
    "nom": "",
    "prenom": "Bénévole 3",
    "email": "benevole-3@gsajoie.example",
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
      "Conférence"
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
      "Conférence"
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
      "Partenariats"
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
    "titre": "Comité d’avril 2026",
    "date": "2026-04-09",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m2",
    "titre": "Comité de mai 2026",
    "date": "2026-05-19",
    "heure": "19:30",
    "lieu": "Chez un membre du comité",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m3",
    "titre": "Comité de juin 2026",
    "date": "2026-06-30",
    "heure": "19:30",
    "lieu": "Chez un membre du comité",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m4",
    "titre": "Comité de septembre 2026",
    "date": "2026-09-03",
    "heure": "19:30",
    "lieu": "Chez un membre du comité",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m5",
    "titre": "Comité d’octobre 2026",
    "date": "2026-10-29",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m6",
    "titre": "Comité de décembre 2026",
    "date": "2026-12-03",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m7",
    "titre": "Comité de janvier 2027",
    "date": "2027-01-26",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m8",
    "titre": "Comité de février 2027",
    "date": "2027-02-25",
    "heure": "19:30",
    "lieu": "À définir",
    "ordreDuJour": "",
    "notes": ""
  },
  {
    "id": "m9",
    "titre": "Comité de mars 2027",
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
    "description": "Organisation : Course préparation 1 et 2."
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
    "description": "Organisation : Course préparation 1 et vice-président."
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
    "description": "Du 25.10.2026 au 28.03.2027 : mardi salle 18h30, mercredi course à pied 18h15, jeudi renfo ou spinning 19h15, vendredi natation 20h."
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
    "description": "Organisation : CO Bruntrutaine."
  },
  {
    "id": "e12",
    "nom": "Assemblée générale 2027",
    "date": "2027-03-13",
    "lieu": "À définir",
    "description": "AG ordinaire."
  }
];

export const COMPTA_SECTION = "sec2";
