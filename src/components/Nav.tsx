import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { navigation, pageOuverte } from '../data/navigation';
import { Icone } from './icones';
import { PastilleEntite } from './IconesEntite';
import { Deroulante } from './Deroulante';
import { pageParEntite, PERMS_MOI, useComites } from '../data/comites';
import { useAutres } from '../data/entites';

/** Rubriques, pages du compte et page ouverte, selon mes droits (pages Comité, Événements : dans l'une de mes entités). */
export function useNavigation() {
  const { can } = useStore();
  const club = useClubOptional();
  const comites = useComites();
  const autres = useAutres(!club?.arrierePlan);
  const { pathname } = useLocation();
  // Nom des séances (« Comité », « Réunions »…) : celui de mes comités s'ils sont tous du même type.
  const types = new Set(comites?.liste('tab.meetings').map((u) => u.type));
  const nav = navigation({
    can: (p) => (comites && PERMS_MOI.includes(p) ? comites.canUn(p) : can(p)),
    club: !!club,
    registre: !!club?.personnes.voir,
    type: types.size === 1 ? [...types][0] : types.size ? 'central' : club?.current.type ?? 'central',
    demandes: !!club?.demandesMdp.length || autres.some((e) => e.club.demandesMdp.length && e.store.can('admin.access')),
    superAdmin: !!club?.superAdmin,
  });
  return { ...nav, ouverte: pageOuverte(nav.rubriques, nav.compte, pathname) };
}

/** Chemin lisible d'une page (« Comité › PV »), null si elle n'est pas accessible. */
export function useChemin() {
  const { rubriques, compte } = useNavigation();
  return (to: string) => {
    for (const r of rubriques) {
      const p = r.pages.find((x) => x.to === to);
      if (p) return r.pages.length > 1 ? `${r.label} › ${p.label}` : p.label;
    }
    const p = compte.find((x) => x.to === to);
    if (!p) return null;
    // Page ouverte depuis une autre (« … › page »).
    const dans = p.dans && compte.find((x) => x.to === p.dans);
    return dans ? `${dans.label} › ${p.label}` : p.label;
  };
}

/**
 * Pages de la rubrique ouverte (ex. Comité : Séances, Ordre du jour, PV). Ordre du jour et PV : d'abord le comité dont ce
 * sont l'ordre du jour et le PV, à choisir parmi les miens ; console admin : l'entité réglée, à choisir parmi celles dont
 * je suis admin (vue « moi » : sans changer d'entité).
 */
export function SousOnglets() {
  const { ouverte } = useNavigation();
  const comites = useComites();
  const club = useClubOptional();
  const { pathname } = useLocation();
  const barre = useRef<HTMLElement>(null);
  const r = ouverte?.rubrique;
  const choix = pageParEntite(pathname);
  const perm = choix?.perm;
  const liste = perm && comites ? comites.liste(perm) : [];
  const entite = perm && (liste.length > 1 || (club?.mine.length ?? 0) > 1) ? comites?.choisi(perm) : undefined;
  const page = ouverte?.page.label;
  // Téléphone : la page ouverte reste visible dans la barre (qui défile de côté). Seule la barre bouge, jamais la page.
  useEffect(() => {
    const bar = barre.current;
    const a = bar?.querySelector('a.active');
    if (!bar || !a) return;
    const [x, b] = [a.getBoundingClientRect(), bar.getBoundingClientRect()];
    if (x.left < b.left || x.right > b.right) bar.scrollLeft += x.left - b.left - 12;
  }, [ouverte?.page.to]);
  if (!entite && (!r || r.pages.length < 2)) return null;
  return (
    <nav ref={barre} className="subtabs no-print" aria-label={r?.label ?? page}>
      {entite && comites && liste.length > 1 ? (
        <span className="subtabs-entite subtabs-choix">
          <Deroulante
            aria-label={choix!.libelle}
            title={`${page} de « ${entite.nom} » : choisis ${choix!.libelle === 'Comité' ? 'l’un de tes comités' : 'l’une de tes entités'}`}
            value={entite.id}
            onChange={comites.choisir}
            options={liste.map((u) => ({ value: u.id, label: u.nom, icone: <PastilleEntite u={u} /> }))}
          />
        </span>
      ) : (
        entite && (
          <span className="subtabs-entite" title={`${page} de « ${entite.nom} »`}>
            <PastilleEntite u={entite} /> {entite.nom}
          </span>
        )
      )}
      {r && r.pages.length > 1 &&
        r.pages.map((p) => (
          <NavLink key={p.to} to={p.to}>
            <Icone n={p.icon} /> {p.label}
          </NavLink>
        ))}
    </nav>
  );
}

/** Une phrase sous le titre : à quoi sert la page (masquable dans les réglages). */
export function PageIntro() {
  const { prefs } = useStore();
  const { ouverte } = useNavigation();
  if (prefs.explications === false || !ouverte) return null;
  return <p className="page-intro no-print">{ouverte.page.aide}</p>;
}
