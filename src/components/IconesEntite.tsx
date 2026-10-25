import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  Activity, Ambulance, Award, Backpack, Banknote, Beer, Bed, Bike, Binoculars, Bird, Building, Bus, CakeSlice, Camera, Car, Caravan, Coffee,
  Coins, Compass, Cross, Crown, Dog, Drama, Droplets, Dumbbell, Fish, Flag, Flame, Footprints, Gauge, Gift, Globe, GraduationCap, Guitar, Hammer, HandCoins,
  HandHeart, Handshake, HardHat, Heart, HeartPulse, Hotel, House, IceCreamCone, Landmark, Leaf, Lightbulb, Map, Medal, Megaphone, Mic, Mountain,
  MountainSnow, Music, Newspaper, Package, PartyPopper, PiggyBank, Pizza, Route, Sailboat, School, Shirt, ShieldCheck, Signpost, Snowflake, Star,
  Stethoscope, Sun, Sunrise, Target, Tent, Ticket, Timer, TreePine, Trees, Trophy, Truck, Users, Utensils, UtensilsCrossed, Volleyball, Wallet,
  Warehouse, Wine, Wrench, Zap,
} from 'lucide-react';
import type { Unit } from '../data/types';
import { UNIT_TYPES } from '../data/units';
import { Icone } from './icones';

// Bibliothèque d'icônes qu'une entité peut prendre (fiche de l'entité, console admin) : sa pastille dans l'en-tête et
// l'organigramme, ses repères dans l'agenda, les événements et l'accueil. Sans choix : l'icône de son type.
// Les clés sont enregistrées dans la fiche de l'entité (info.icone) : ne pas les renommer.

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

// Le cycliste de Lucide (Bike) sur un vélo fixe : volant d'inertie devant, pied au sol.
const VeloSalle = dessin(<>
  <circle cx="14" cy="3.5" r="1" />
  <path d="M11 15.5V12l-3-3 4-3 2 3h2" />
  <circle cx="17" cy="15" r="3" />
  <path d="M8 9 6.5 20" />
  <path d="m16 9 1 6" />
  <path d="M4 20h16" />
</>);

export const THEMES_ICONES: { titre: string; icones: Record<string, [nom: string, I: Svg]> }[] = [
  {
    titre: 'Sport',
    icones: {
      velo: ['Vélo', Bike], velosalle: ['Vélo de salle', VeloSalle], coureur: ['Coureur', Coureur], nageur: ['Nageur', Nageur],
      triathlete: ['Triathlète', Triathlete], skifond: ['Ski de fond', SkiFond], route: ['Parcours', Route], montagne: ['Montagne', Mountain],
      neige: ['Montagne enneigée', MountainSnow], chrono: ['Chronomètre', Timer], vitesse: ['Compteur', Gauge], course: ['Course à pied', Footprints], natation: ['Natation', Droplets],
      muscu: ['Musculation', Dumbbell], forme: ['Forme', HeartPulse], effort: ['Effort', Activity], volley: ['Ballon', Volleyball],
      voile: ['Voile', Sailboat], cible: ['Objectif', Target],
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
export const ICONES_ENTITE: Record<string, [nom: string, I: Svg]> = Object.assign({}, ...THEMES_ICONES.map((t) => t.icones));

/** Une icône de la bibliothèque (rien pour une clé inconnue), comme `Icone`. */
export function IconeBiblio({ cle }: { cle: string }) {
  const I = ICONES_ENTITE[cle]?.[1];
  return I ? <I className="icone-trait" size="1.2em" strokeWidth={1.8} aria-hidden="true" focusable="false" /> : null;
}

/** Icône de l'entité : celle choisie dans la bibliothèque, sinon celle de son type. */
export function IconeEntite({ u }: { u: Pick<Unit, 'type' | 'icone'> }) {
  return u.icone && ICONES_ENTITE[u.icone] ? <IconeBiblio cle={u.icone} /> : <Icone n={UNIT_TYPES[u.type].trait} />;
}

/** Icône de l'entité dans une petite pastille de sa couleur (listes déroulantes, puces). */
export function PastilleEntite({ u }: { u: Pick<Unit, 'type' | 'icone' | 'couleur'> }) {
  return (
    <span className="unit-dot petite" style={{ background: u.couleur }} aria-hidden>
      <IconeEntite u={u} />
    </span>
  );
}

/**
 * Choix de l'icône d'une entité : l'actuelle dans sa couleur, et la bibliothèque (par thème, avec recherche) à déplier.
 * `value` absent : l'icône de son type.
 */
export function ChoixIconeEntite({ type, value, couleur, disabled, onChange }: {
  type: Unit['type'];
  value?: string;
  couleur: string;
  disabled?: boolean;
  onChange: (icone: string | undefined) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState('');
  const actuelle = value && ICONES_ENTITE[value] ? value : undefined;
  const nom = actuelle ? ICONES_ENTITE[actuelle][0] : `celle du type (${UNIT_TYPES[type].label.toLowerCase()})`;
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
      style={actuelle === cle ? { background: couleur, borderColor: couleur } : undefined}
      title={titre}
      aria-label={titre}
      disabled={disabled}
      onClick={() => choisir(cle)}
    >
      {contenu}
    </button>
  );
  const themes = THEMES_ICONES.map((t) => ({ titre: t.titre, icones: Object.entries(t.icones).filter(([, [n]]) => garde(n)) })).filter((t) => t.icones.length);
  return (
    <div className="choix-icone">
      <div className="row wrap choix-icone-actuelle">
        <span className="unit-dot grande" style={{ background: couleur }} aria-hidden>
          <IconeEntite u={{ type, icone: actuelle }} />
        </span>
        <span>{actuelle ? nom : <span className="muted">Par défaut : {nom}</span>}</span>
        <button type="button" className="btn small" disabled={disabled} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
          {ouvert ? 'Fermer la bibliothèque' : 'Choisir une icône…'}
        </button>
        {actuelle && !ouvert && (
          <button type="button" className="btn small link" disabled={disabled} onClick={() => choisir(undefined)}>Reprendre celle du type</button>
        )}
      </div>
      {ouvert && (
        <div className="choix-icone-biblio">
          <input className="search" type="search" placeholder="Chercher (vélo, repas, trophée…)" aria-label="Chercher une icône" value={q} onChange={(e) => setQ(e.target.value)} />
          <div role="radiogroup" aria-label="Icône de l’entité">
            {!cherche && (
              <div className="choix-icone-theme">
                <small className="muted">Par défaut</small>
                <div className="icone-grille">{tuile(undefined, `Icône du type (${UNIT_TYPES[type].label})`, <Icone n={UNIT_TYPES[type].trait} />)}</div>
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
