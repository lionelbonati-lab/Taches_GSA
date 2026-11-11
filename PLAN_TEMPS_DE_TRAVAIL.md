# Plan : compter le temps passé pour le club (temps dans l'appli, heures déclarées)

Demande du président (11.11.2026) : *savoir s'il est possible de compter le temps que chacun passe sur la plateforme,
en vue, éventuellement, d'une rémunération selon le temps de travail fait pour le club. Pour le moment : un plan, et
savoir si c'est réalisable.*

> Rien n'est construit. Ce plan sert à décider ; les questions à trancher sont à la fin.

## En bref

**Oui, c'est réalisable.** L'appli peut compter, pour chaque personne et chaque jour, le temps pendant lequel elle l'a
**ouverte et utilisée** (pas seulement laissée ouverte). Le compteur serait tenu par le serveur. C'est un petit travail.

**Mais ce compteur ne doit pas servir seul de base à une rémunération :**

1. **Il ne voit qu'une petite partie du travail.** L'essentiel du travail pour le club se fait hors de l'appli :
   téléphoner, préparer un parcours, encadrer un entraînement, monter une manifestation, faire les virements dans
   l'e-banking, tenir les séances en salle. Pour un remboursement, la caisse passe une minute dans l'appli, et bien plus
   dans son e-banking.
2. **Il récompense la lenteur.** Qui travaille vite, ou sur papier, gagne moins ; qui laisse l'appli ouverte pour lire
   gagne plus.
3. **Il se gonfle facilement.** Un onglet ouvert et un geste de temps en temps suffisent. On peut rendre la triche plus
   difficile, jamais impossible.
4. **C'est de la surveillance.** Payer quelqu'un d'après un compteur d'activité, c'est mesurer son comportement en
   continu. C'est délicat pour la protection des données, et le droit du travail interdit les systèmes destinés à
   surveiller le comportement des salariés (voir « Points juridiques »).

**Recommandation : payer sur des heures déclarées et validées**, comme cela se fait couramment dans les clubs. Chacun
note ses heures (sur un point, ou dans une page « Mes heures »), un membre du comité les valide et la caisse paie.
**Le temps dans l'appli reste un repère** : il aide chacun à remplir ses heures (« 45 min dans l'appli aujourd'hui :
les ajouter ? »), mais il n'est jamais à lui seul la base du paiement. Le circuit de la caisse (demande → visa →
virement) existe déjà : il servirait aussi à payer les heures validées.

| Piste | Réalisable ? | Effort | Juste pour payer ? |
| --- | --- | --- | --- |
| A. Temps dans l'appli (automatique) | Oui | Petit | Non : un repère seulement |
| B. Heures déclarées, validées par le comité | Oui | Moyen | Oui (pratique courante) |
| C. Paiement des heures validées par la caisse | Oui, le circuit existe | Petit | Oui |
| Forfait par fonction (sans rien compter) | Rien à construire | Aucun | Oui, et c'est le plus simple |

Il faut comparer avec le **forfait** : une **indemnité annuelle par fonction** (président, caissier, secrétaire,
moniteur…), votée avec le budget à l'AG, ne demande aucun comptage. Compter les heures n'a d'intérêt que si le club
veut payer à l'heure, ou répartir une enveloppe selon le travail fait.

## A. Le temps dans l'appli (automatique)

### Ce qui compte comme « actif »

Une minute compte quand, pendant cette minute :

- l'appli est **à l'écran** (l'onglet ou l'appli installée est au premier plan) ;
- **et** la personne a fait **un geste dans les 2 dernières minutes** (clic, touche, défilement, toucher). Sans geste,
  le compteur s'arrête : une appli oubliée ouverte ne compte pas.
- Cas à part : pendant une **séance** (PV ou ordre du jour ouvert le jour de la séance, projection), on peut écouter
  longtemps sans toucher l'écran. Proposition : ce jour-là, sur ces pages, le délai passe à 10 minutes.

### Comment c'est compté

- Chaque minute active, l'appli envoie un **battement** au serveur. Le serveur ajoute **une minute au plus par minute
  réelle** et par compte, à son heure à lui. Deux onglets, ou un ordinateur et un téléphone ouverts en même temps, ne
  comptent donc pas double, et changer l'heure de l'appareil n'y fait rien.
- **Hors ligne** : rien n'est compté (première version). L'appli ne peut pas prouver ce qui s'est passé sans réseau.
- **Démo** : le compteur reste dans le navigateur, comme le reste des données de la démo.
- Coût : un petit appel par minute et par personne active, ce qui ne pèse rien pour le serveur (quelques dizaines de
  comptes).

### Ce qui est gardé (le minimum)

- **Un total par personne, par jour et par rubrique** : Points, Comité (séances, ordre du jour, PV), AG, Agenda et
  événements, Caisse (paiements, remboursements), Personnes du club, Autre. La rubrique se déduit de la page ouverte
  (`#/taches`, `#/pv`, `#/ag`…).
- **Pas de journal détaillé** : ni heure d'arrivée ou de départ, ni liste des points ouverts, ni nombre de clics.
  Savoir que quelqu'un a passé « 1 h 10 dans Comité le 12.11 » suffit pour l'aider à déclarer ses heures. Le reste
  serait de la surveillance.
- **Durée** : les totaux par jour sont gardés 24 mois (deux saisons : le temps de régler les indemnités et de faire un
  contrôle). Ensuite, il ne reste que les totaux par mois. À confirmer.

### Qui le voit

Proposition : **chacun voit le sien** (Réglages › « Mon temps dans l'appli » : par semaine, par mois, par rubrique).
Les admins ne voient les totaux des autres **que si le club le décide** et l'annonce (question 5). Le compteur ne
démarre qu'une fois **tout le monde informé**, idéalement **avec l'accord de chacun** (une case que la personne coche
elle-même dans Réglages).

## B. Les heures déclarées (pour la rémunération)

### Noter ses heures

- **Sur un point** : une ligne « ⏱ Temps passé » dans sa fiche. Chacun ajoute **ses** heures (« 1 h 30 le 12.11 –
  reconnaissance du parcours »), plusieurs fois au besoin. On ne note pas les heures de quelqu'un d'autre, sauf avec le
  droit prévu pour cela (voir plus bas).
- **Page « Mes heures »** (menu du compte) : ses heures du mois, et « + Ajouter des heures » sans point
  (« Entraînement du mercredi », « Montage de la course de côte »).
- **Activité** : chaque entrée est rangée dans une activité, choisie dans une liste réglée par le club (console
  admin) : Encadrement, Organisation d'événement, Administration, Comité, Transport… Chaque activité peut avoir **son
  tarif**, ou être marquée « non rémunérée » (bénévolat compté pour le rapport annuel, sans paiement).
- **Propositions pré-remplies** pour aller vite, à accepter ou à corriger :
  - les **séances du comité** où la personne était présente (d'après le PV : sa présence et la durée de la séance) ;
  - les **événements** des étiquettes dont elle est membre (les heures restent à saisir) ;
  - le **temps passé dans l'appli** ce jour-là, s'il y en a (« 45 min dans l'appli, rubrique Caisse : les ajouter ? »).
- **Personnes sans l'appli** (moniteurs, bénévoles d'une manifestation) : quelqu'un qui en a le droit (« Saisir des
  heures pour d'autres » : le chef technique, le responsable de l'événement…) note leurs heures pour elles.

### Valider

- À la fin du mois (ou de la saison, au choix du club), chacun **envoie son relevé**. Une fois envoyé, il ne peut plus
  être modifié, sauf s'il est renvoyé pour correction.
- Une personne qui a le droit **« Valider les heures »** (nouveau droit, console admin) l'accepte, le corrige en
  donnant un motif, ou le refuse. **On ne valide jamais ses propres heures**, comme pour les visas : le président fait
  valider les siennes par un autre membre du comité.
- **Relevé PDF** par personne et par période (heures par activité, tarif, total), avec l'en-tête du club. Il sert de
  pièce comptable, et de justificatif pour la personne.
- **Export CSV** pour la comptabilité, et un tableau des totaux par personne et par activité pour le comité et le
  rapport annuel (« 1 240 heures de bénévolat en 2027 »). Ce tableau sert aussi pour les demandes de subventions, même
  si le club ne paie rien.

### Payer (C)

Un relevé validé crée **une demande de paiement à la caisse**, comme un remboursement : la caisse demande le visa, la
personne désignée vise et la caisse fait le virement (circuit existant, avec l'IBAN enregistré de la personne). Le
paiement lui-même n'a rien de nouveau à construire.

## Points juridiques à vérifier

Ce qui suit n'est pas un avis juridique : à faire confirmer par la caisse de compensation AVS du canton, une
fiduciaire ou l'association faîtière.

- **Protection des données (nLPD)** : informer chacun **avant** de compter (quoi, pourquoi, qui voit, pendant combien
  de temps), ne garder que le nécessaire (des totaux, pas un mouchard) et ne pas s'en servir à autre chose. Le compteur
  du temps dans l'appli doit être annoncé à tous (texte dans l'aide, message à la première ouverture).
- **Surveillance** : si des personnes deviennent salariées du club, l'ordonnance 3 de la loi sur le travail
  (art. 26 OLT 3) interdit les systèmes **destinés à surveiller le comportement** des travailleurs, et l'art. 328b CO
  limite les données que l'employeur peut traiter. Un relevé d'heures déclarées ne pose pas de problème ; un compteur
  d'activité qui fixe la paie est une zone grise. C'est une raison de plus de payer sur les heures déclarées.
- **Cotisations sociales (AVS/AI/APG)** : une rémunération à l'heure est en principe un **salaire**. Jusqu'à
  **2 500 fr. par an et par employeur** (montant de 2025, le même en 2026), les cotisations ne sont prélevées que si la
  personne le demande ; au-delà, le club cotise et déclare. Le remboursement de frais réels (déplacements, matériel)
  n'est pas un salaire.
- **Assurance accidents** : un club qui verse des salaires peut devoir assurer ses salariés (LAA). À vérifier.
- **Impôts** : l'indemnité est un revenu imposable pour la personne, et le club peut devoir établir un certificat de
  salaire. Si le club est **exonéré d'impôt** (but d'utilité publique), rémunérer le comité peut remettre
  l'exonération en question.
- **Statuts et AG** : vérifier que les statuts permettent de rémunérer le comité. Le **budget des indemnités** se vote
  à l'AG (point « Budget et cotisations » de l'ordre du jour de l'AG).

## Étapes proposées

| Étape | Contenu | Taille |
| --- | --- | --- |
| **T0** | Décisions du club (questions ci-dessous), avis de la caisse AVS ou d'une fiduciaire, budget à l'AG. Pas de code. | – |
| **T1** | Temps dans l'appli, **pour soi** : la mesure, « Mon temps dans l'appli » dans Réglages, l'information et l'accord. Démo, puis serveur. On voit sur quelques semaines ce que le compteur donne vraiment, avant de décider de la suite. | Petite |
| **T2** | Heures déclarées : « ⏱ Temps passé » sur les points, page « Mes heures », activités et tarifs (console admin), propositions pré-remplies. Démo d'abord. | Moyenne |
| **T3** | Validation : envoi du relevé, droit « Valider les heures », relevé PDF, export CSV, totaux. Puis le serveur (heures protégées : chacun n'écrit que les siennes, plus de modification après la validation). | Moyenne |
| **T4** | Paiement : un relevé validé crée la demande de paiement à la caisse. | Petite |

T1 peut se faire seule, sans engager la suite. T2 et T3 n'ont pas besoin de T1 (s'il est fait, ses propositions
« temps dans l'appli » s'ajoutent).

## Comment ce serait construit (pour la suite)

- **La mesure** : un module `src/data/tempsActif.ts` (geste récent, page visible, battement chaque minute, rubrique
  d'après la page), branché dans la mise en page (`Layout`). Version réelle : un appel au serveur ; démo : un total
  gardé dans le navigateur.
- **Serveur, temps dans l'appli** : une migration (numéro suivant), sur le modèle du rapport d'erreurs (051). Une
  table `gsa_temps` (club, compte, jour, rubrique, minutes), que personne ne lit ni n'écrit directement.
  `gsa_temps_battement(entite, rubrique)` ajoute une minute si le dernier battement du compte date de plus de 50 s
  (heure du serveur). `gsa_temps_mien(entite, du, au)` donne ses propres totaux, et `gsa_temps_club(entite, du, au)`
  ceux de tout le club aux admins, seulement si le club le décide. Ménage automatique : totaux par mois après 24 mois.
- **Serveur, heures déclarées** : une table à part plutôt que les données partagées (`gsa_items`), comme pour les
  paiements. Le serveur vérifie que chacun n'écrit que ses heures (ou celles des personnes qu'il a le droit de
  saisir), qu'un relevé envoyé n'est plus modifié, et que personne ne valide les siennes.
- **Tests** : la démo couvre la mesure (geste, onglet caché, deux onglets), la saisie, l'envoi et la validation
  (`tests/`).

## Questions à trancher

1. **Qui** est concerné : le comité seulement, les moniteurs et entraîneurs, les bénévoles des manifestations (souvent
   sans l'appli) ?
2. **Quoi** : toutes les heures faites pour le club, ou seulement certaines activités (encadrement, organisation) ? Le
   temps dans l'appli compte-t-il comme une activité à part entière, ou seulement comme une aide à la saisie
   (recommandé) ?
3. **Comment payer** : à l'heure (quel tarif, et par activité ?), au forfait par fonction, ou avec une enveloppe
   annuelle répartie selon les heures ? Avec un plafond par personne (par exemple pour rester sous 2 500 fr. par an) ?
4. **Qui valide** les heures, et à quel rythme (mois, trimestre, saison) ?
5. **Qui voit quoi** : le temps dans l'appli reste-t-il personnel, ou les admins voient-ils les totaux de chacun ? Les
   heures déclarées sont vues par la personne, le valideur et la caisse ; le comité voit-il aussi les totaux par
   personne ?
6. **Accord** : le compteur du temps dans l'appli tourne-t-il pour tout le monde dès qu'il est annoncé, ou seulement
   pour ceux qui l'acceptent (recommandé) ?
