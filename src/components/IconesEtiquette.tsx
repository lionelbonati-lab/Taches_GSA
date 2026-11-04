import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  Activity, Ambulance, Award, Backpack, Banknote, Beer, Bed, Bike, Binoculars, Bird, Building, Bus, CakeSlice, Camera, Car, Caravan, Coffee,
  Coins, Compass, Cross, Crown, Dog, Drama, Droplets, Dumbbell, Fish, Flag, Flame, Footprints, Gauge, Gift, Globe, GraduationCap, Guitar, Hammer, HandCoins,
  HandHeart, Handshake, HardHat, Heart, HeartPulse, Hotel, House, IceCreamCone, Landmark, Leaf, Lightbulb, Map, Medal, Megaphone, Mic, Mountain,
  MountainSnow, Music, Newspaper, Package, PartyPopper, PiggyBank, Pizza, Route, Sailboat, School, Shirt, ShieldCheck, Signpost, Snowflake, Star,
  Stethoscope, Sun, Sunrise, Target, Tent, Ticket, Timer, TreePine, Trees, Trophy, Truck, Users, Utensils, UtensilsCrossed, Volleyball, Wallet,
  Warehouse, Wine, Wrench, Zap,
} from 'lucide-react';
import type { Etiquette } from '../data/types';
import { sorteDe, type SorteEtiquette } from '../data/etiquettes';
import { Icone, type IconeNom } from './icones';

// Bibliothèque d'icônes qu'une étiquette peut prendre (page Étiquettes) : sur ses pastilles (liste des points, fiche,
// agenda, accueil, personnes du club). Sans choix : celle de sa sorte (événement, groupe, comité). Reprise de celle des
// anciennes entités, avec les dessins faits pour le club (VTT, vélo de route, coureur, nageur…).
// Les clés sont enregistrées dans l'étiquette (icone) : ne pas les renommer.

type Svg = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;

/** Icône dessinée ici, au trait comme celles de Lucide (grille de 24, bouts arrondis) : Lucide n'a pas ces sports, ni le cochon. */
const dessin = (traits: ReactNode): Svg => {
  const D: Svg = ({ size = 24, strokeWidth = 2, ...props }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {traits}
    </svg>
  );
  return D;
};

// Vague de l'eau, sous le nageur et le triathlète.
const vague = <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />;

const Coureur = dessin(<>
  <circle cx="15" cy="4" r="1" />
  <path d="m13.5 8-3 5.5" />
  <path d="m10.5 13.5 4 2-1.5 5" />
  <path d="M10.5 13.5 8.5 17 4.5 18" />
  <path d="M7.5 10.5 10 8h3.5l2.5 3 2.5-1" />
</>);

// Bras levé au-dessus de l'eau, corps à fleur d'eau.
const Nageur = dessin(<>
  <circle cx="6" cy="11" r="1" />
  <path d="M20 12.5 10 11.5" />
  <path d="M10 11.5 13 6.5 8 5" />
  {vague}
</>);

// Les trois épreuves : la roue du vélo, le coureur, l'eau.
const Triathlete = dessin(<>
  <circle cx="17" cy="3.5" r="1" />
  <path d="m16 6.5-2 4" />
  <path d="m14 10.5 3 1.5-1 3.5" />
  <path d="m14 10.5-1.5 3-2.5.5" />
  <path d="M12 8.5 14 6.5h2.5l1.5 2 2-.5" />
  <circle cx="5.5" cy="10.5" r="3.5" />
  <path d="M5.5 10.5h.01" />
  {vague}
</>);

// Pas alternatif : bâton planté devant, l'autre en arrière (rondelles au bout), skis au sol.
const SkiFond = dessin(<>
  <circle cx="15" cy="3.5" r="1" />
  <path d="m14 6.5-3 5" />
  <path d="m11 11.5 3.5 3-1 4.5" />
  <path d="M11 11.5 5 19" />
  <path d="M19 9.5 14 7l-5 2" />
  <path d="m19 9.5-1 8" />
  <path d="M17 17.5h2" />
  <path d="M9 9 2.5 13" />
  <path d="m2.5 11.5.8 2.6" />
  <path d="M3 21h16a2 2 0 0 0 2-2" />
</>);

// Tête de face (la tirelire de Lucide est déjà prise par les finances).
const Cochon = dessin(<>
  <path d="M6.7 8.2 5 3l4.4 3.45" />
  <path d="M17.3 8.2 19 3l-4.4 3.45" />
  <circle cx="12" cy="13.5" r="7.5" />
  <ellipse cx="12" cy="16" rx="3.5" ry="2.5" />
  <path d="M10.75 16h.01" />
  <path d="M13.25 16h.01" />
  <path d="M9 11.5h.01" />
  <path d="M15 11.5h.01" />
</>);

// Le cycliste de Lucide (Bike) incliné, qui grimpe une pente.
const Vtt = dessin(<>
  <circle cx="5.75" cy="17.5" r="3.5" />
  <circle cx="18.25" cy="14.5" r="3.5" />
  <circle cx="12" cy="3.25" r="1" />
  <path d="M12 16 11.25 12.5 7.5 10.5l3.25-4 2.5 2.5 2-.5" />
  <path d="M1.5 22.1 22.5 17.1" />
</>);

// Cycliste couché sur un vélo de route, traits de vitesse derrière.
const VeloRoute = dessin(<>
  <circle cx="18.5" cy="17.5" r="3.5" />
  <circle cx="5.5" cy="17.5" r="3.5" />
  <circle cx="17" cy="5.5" r="1" />
  <path d="M12 17.5 12.5 13l-4-3 6-2 2 3h1.5" />
  <path d="M2 7h4" />
  <path d="M1 10h4" />
</>);

// Le cycliste de Lucide (Bike) avec un éclair : assistance électrique.
const VeloElec = dessin(<>
  <circle cx="18.5" cy="17.5" r="3.5" />
  <circle cx="5.5" cy="17.5" r="3.5" />
  <circle cx="15" cy="5" r="1" />
  <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
  <path d="M6.5 1.5 3.5 6h4L4.5 10.5" />
</>);

// Le cycliste de Lucide (Bike), roue arrière posée sur le pied du home-trainer.
const HomeTrainer = dessin(<>
  <circle cx="5.5" cy="16.5" r="3.5" />
  <circle cx="18.5" cy="16.5" r="3.5" />
  <circle cx="15" cy="4" r="1" />
  <path d="M12 16.5V13l-3-3 4-3 2 3h2" />
  <path d="m5.5 16.5-4 5.5h8z" />
  <path d="M18.5 16.5h.01" />
</>);

// Squat de face, kettlebell tenue à deux mains entre les jambes.
const Renfo = dessin(<>
  <circle cx="12" cy="3.5" r="1.5" />
  <path d="M7.5 7.5h9" />
  <path d="m7.5 7.5 3.5 6.5M16.5 7.5 13 14" />
  <path d="M7.5 7.5 8 12l-3 3.5.5 5.5M16.5 7.5 16 12l3 3.5-.5 5.5" />
  <path d="M10.5 15.8a1.5 1.5 0 0 1 3 0" />
  <circle cx="12" cy="18.5" r="2.5" />
</>);

// Troisième valeur facultative : d'autres mots trouvés par la recherche.
type Entree = [nom: string, I: Svg, mots?: string];

export const THEMES_ICONES: { titre: string; icones: Record<string, Entree> }[] = [
  {
    titre: 'Sport',
    icones: {
      velo: ['Vélo', Bike], vtt: ['VTT', Vtt, 'vélo tout terrain mountain bike'],
      veloroute: ['Vélo de route', VeloRoute, 'cyclisme course'], veloelec: ['Vélo électrique', VeloElec, 'eVTT VAE assistance'], velosalle: ['Home-trainer', HomeTrainer, 'vélo de salle spinning'],
      coureur: ['Coureur', Coureur], nageur: ['Nageur', Nageur], triathlete: ['Triathlète', Triathlete], skifond: ['Ski de fond', SkiFond],
      route: ['Parcours', Route], montagne: ['Montagne', Mountain], neige: ['Montagne enneigée', MountainSnow], chrono: ['Chronomètre', Timer],
      vitesse: ['Compteur', Gauge], course: ['Course à pied', Footprints], natation: ['Natation', Droplets], muscu: ['Musculation', Dumbbell],
      renfo: ['Renforcement', Renfo, 'renfo musculation kettlebell squat'], forme: ['Forme', HeartPulse], effort: ['Effort', Activity],
      volley: ['Ballon', Volleyball], voile: ['Voile', Sailboat], cible: ['Objectif', Target],
    },
  },
  {
    titre: 'Compétition',
    icones: {
      trophee: ['Trophée', Trophy], medaille: ['Médaille', Medal], prix: ['Prix', Award], arrivee: ['Drapeau', Flag], couronne: ['Couronne', Crown],
      etoile: ['Étoile', Star], eclair: ['Éclair', Zap], flamme: ['Flamme', Flame],
    },
  },
  {
    titre: 'Jeunesse et formation',
    icones: { ecole: ['École', GraduationCap], salle: ['Salle', School], idee: ['Idée', Lightbulb], equipe: ['Équipe', Users] },
  },
  {
    titre: 'Fête et repas',
    icones: {
      fete: ['Fête', PartyPopper], musique: ['Musique', Music], micro: ['Micro', Mic], guitare: ['Concert', Guitar], spectacle: ['Spectacle', Drama],
      repas: ['Repas', Utensils], cantine: ['Cantine', UtensilsCrossed], pizza: ['Pizza', Pizza], gateau: ['Gâteau', CakeSlice],
      glace: ['Glace', IceCreamCone], biere: ['Bière', Beer], vin: ['Vin', Wine], cafe: ['Café', Coffee], cadeau: ['Cadeau', Gift],
      billet: ['Billet', Ticket],
    },
  },
  {
    titre: 'Sorties et nature',
    icones: {
      tente: ['Camp', Tent], caravane: ['Caravane', Caravan], carte: ['Carte', Map], boussole: ['Boussole', Compass], panneau: ['Itinéraire', Signpost],
      jumelles: ['Jumelles', Binoculars], sac: ['Sac à dos', Backpack], bus: ['Car', Bus], voiture: ['Voiture', Car], camion: ['Camion', Truck],
      hotel: ['Hôtel', Hotel], lit: ['Nuitée', Bed], sapin: ['Sapin', TreePine], foret: ['Forêt', Trees], feuille: ['Feuille', Leaf],
      soleil: ['Soleil', Sun], aube: ['Lever du soleil', Sunrise], flocon: ['Hiver', Snowflake], oiseau: ['Oiseau', Bird], poisson: ['Poisson', Fish],
      chien: ['Chien', Dog], cochon: ['Cochon', Cochon],
    },
  },
  {
    titre: 'Organisation',
    icones: {
      comite: ['Comité', Landmark], batiment: ['Bâtiment', Building], maison: ['Local', House], partenaires: ['Partenaires', Handshake],
      benevoles: ['Bénévoles', HandHeart], coeur: ['Cœur', Heart], outils: ['Outils', Wrench], marteau: ['Construction', Hammer],
      chantier: ['Chantier', HardHat], materiel: ['Matériel', Package], depot: ['Dépôt', Warehouse], maillot: ['Maillot', Shirt],
      photo: ['Photo', Camera], annonce: ['Annonce', Megaphone], journal: ['Journal', Newspaper], monde: ['Monde', Globe],
      securite: ['Sécurité', ShieldCheck], secours: ['Secours', Ambulance], soins: ['Premiers soins', Cross], medical: ['Médical', Stethoscope],
    },
  },
  {
    titre: 'Finances',
    icones: { caisse: ['Caisse', Wallet], tirelire: ['Tirelire', PiggyBank], pieces: ['Pièces', Coins], billets: ['Billets', Banknote], dons: ['Dons', HandCoins] },
  },
];

/** Toutes les icônes de la bibliothèque, par clé. */
export const ICONES_BIBLIO: Record<string, Entree> = Object.assign({}, ...THEMES_ICONES.map((t) => t.icones));

/** Une icône de la bibliothèque (rien pour une clé inconnue), comme `Icone`. */
export function IconeBiblio({ cle }: { cle: string }) {
  const I = ICONES_BIBLIO[cle]?.[1];
  return I ? <I className="icone-trait" size="1.2em" strokeWidth={1.8} aria-hidden="true" focusable="false" /> : null;
}

/** Icône d'office selon la sorte de l'étiquette (une icône de la bibliothèque, sinon une des icônes de l'appli). */
const PAR_DEFAUT: Record<SorteEtiquette, { cle?: string; n?: IconeNom; nom: string }> = {
  evenement: { cle: 'fete', nom: 'celle des événements' },
  groupe: { cle: 'equipe', nom: 'celle des groupes' },
  comite: { cle: 'comite', nom: 'celle du comité' },
  libre: { n: 'etiquette', nom: 'celle des étiquettes' },
};
const IconeDefaut = ({ s }: { s: SorteEtiquette }) => {
  const d = PAR_DEFAUT[s];
  return d.cle ? <IconeBiblio cle={d.cle} /> : <Icone n={d.n!} />;
};

/** Icône de l'étiquette : celle choisie dans la bibliothèque, sinon celle de sa sorte. */
export function IconeEtiquette({ e }: { e: Etiquette }) {
  return e.icone && ICONES_BIBLIO[e.icone] ? <IconeBiblio cle={e.icone} /> : <IconeDefaut s={sorteDe(e)} />;
}

/** Pastille d'une étiquette : sa couleur, son icône, son nom. */
export function BadgeEtiquette({ e, sansNom }: { e: Etiquette; sansNom?: boolean }) {
  return (
    <span className="badge etiquette" style={{ background: e.couleur }} title={`Étiquette « ${e.nom} »`}>
      <IconeEtiquette e={e} />
      {!sansNom && <> {e.nom}</>}
    </span>
  );
}

/**
 * Choix de l'icône d'une étiquette : l'actuelle dans sa couleur, et la bibliothèque (par thème, avec recherche) à déplier.
 * `icone` absente : celle de sa sorte.
 */
export function ChoixIconeEtiquette({ e, disabled, onChange, ouvert: ouvertAuDepart, onFermer }: {
  e: Etiquette;
  disabled?: boolean;
  onChange: (icone: string | undefined) => void;
  /** La bibliothèque dépliée d'emblée (un clic sur la pastille de l'étiquette). */
  ouvert?: boolean;
  /** « Fermer la bibliothèque » : referme aussi ce qui l'a ouverte. */
  onFermer?: () => void;
}) {
  const [ouvert, setOuvert] = useState(!!ouvertAuDepart);
  const [q, setQ] = useState('');
  const actuelle = e.icone && ICONES_BIBLIO[e.icone] ? e.icone : undefined;
  const defaut = PAR_DEFAUT[sorteDe(e)];
  const nom = actuelle ? ICONES_BIBLIO[actuelle][0] : defaut.nom;
  const cherche = q.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '');
  const garde = (n: string) => !cherche || n.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '').includes(cherche);
  const choisir = (c: string | undefined) => {
    onChange(c);
    setOuvert(false);
    setQ('');
  };
  const tuile = (cle: string | undefined, titre: string, contenu: ReactNode) => (
    <button
      key={cle ?? '-'}
      type="button"
      role="radio"
      aria-checked={actuelle === cle}
      className={`icone-tuile ${actuelle === cle ? 'on' : ''}`}
      style={actuelle === cle ? { background: e.couleur, borderColor: e.couleur } : undefined}
      title={titre}
      aria-label={titre}
      disabled={disabled}
      onClick={() => choisir(cle)}
    >
      {contenu}
    </button>
  );
  const themes = THEMES_ICONES.map((t) => ({ titre: t.titre, icones: Object.entries(t.icones).filter(([, [n, , mots]]) => garde(mots ? `${n} ${mots}` : n)) })).filter((t) => t.icones.length);
  return (
    <div className="choix-icone">
      <div className="row wrap choix-icone-actuelle">
        <span className="unit-dot grande" style={{ background: e.couleur }} aria-hidden>
          <IconeEtiquette e={{ ...e, icone: actuelle }} />
        </span>
        <span>{actuelle ? nom : <span className="muted">Par défaut : {nom}</span>}</span>
        <button type="button" className="btn small" disabled={disabled} aria-expanded={ouvert} aria-label={`Icône de l’étiquette ${e.nom}`} onClick={() => (ouvert && onFermer ? onFermer() : setOuvert(!ouvert))}>
          {ouvert ? 'Fermer la bibliothèque' : 'Choisir une icône…'}
        </button>
        {actuelle && !ouvert && (
          <button type="button" className="btn small link" disabled={disabled} onClick={() => choisir(undefined)}>Icône par défaut</button>
        )}
      </div>
      {ouvert && (
        <div className="choix-icone-biblio">
          <input className="search" type="search" placeholder="Chercher (vélo, repas, trophée…)" aria-label="Chercher une icône" value={q} onChange={(ev) => setQ(ev.target.value)} />
          <div role="radiogroup" aria-label={`Icône de l’étiquette ${e.nom}`}>
            {!cherche && (
              <div className="choix-icone-theme">
                <small className="muted">Par défaut</small>
                <div className="icone-grille">{tuile(undefined, `Par défaut (${defaut.nom})`, <IconeDefaut s={sorteDe(e)} />)}</div>
              </div>
            )}
            {themes.map((t) => (
              <div key={t.titre} className="choix-icone-theme">
                <small className="muted">{t.titre}</small>
                <div className="icone-grille">
                  {t.icones.map(([cle, [n]]) => tuile(cle, n, <IconeBiblio cle={cle} />))}
                </div>
              </div>
            ))}
            {!themes.length && <p className="muted">Aucune icône pour « {q} ».</p>}
          </div>
        </div>
      )}
    </div>
  );
}
