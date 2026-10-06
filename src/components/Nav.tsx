import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { navigation, pageOuverte } from '../data/navigation';

/** Rubriques, pages du compte et page ouverte, selon les droits et l'entité ouverte. */
export function useNavigation() {
  const { can } = useStore();
  const club = useClubOptional();
  const { pathname } = useLocation();
  const nav = navigation({ can, club: !!club, registre: !!club?.membresAcces, type: club?.current.type ?? 'central' });
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
    return p ? p.label : null;
  };
}

/** Pages de la rubrique ouverte (ex. Comité : Séances, Ordre du jour, PV, Sondages). */
export function SousOnglets() {
  const { ouverte } = useNavigation();
  const barre = useRef<HTMLElement>(null);
  const r = ouverte?.rubrique;
  // Téléphone : la page ouverte reste visible dans la barre (qui défile de côté).
  useEffect(() => barre.current?.querySelector('a.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), [ouverte?.page.to]);
  if (!r || r.pages.length < 2) return null;
  return (
    <nav ref={barre} className="subtabs no-print" aria-label={r.label}>
      {r.pages.map((p) => (
        <NavLink key={p.to} to={p.to}>
          <span aria-hidden>{p.icon}</span> {p.label}
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
