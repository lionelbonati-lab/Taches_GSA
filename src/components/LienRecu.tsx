import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useClubOptional } from '../data/club';
import { pageParEntite, PERMS_COMITE, useComites } from '../data/comites';
import { lienDepuisEntite } from '../data/vueMoi';

/** Pages qui réunissent toutes mes entités (vue « moi »). */
export const PAGES_REUNIES = ['/', '/taches', '/messages', '/agenda', '/comite', '/evenements', '/sondages', '/propositions'];

/**
 * Ouvre une page d'ici, ou de l'une de mes autres entités (`entite`), sans changer d'entité : une page qui les réunit
 * toutes (séances, sondages…) s'ouvre d'ici ; une séance y choisit son comité (ordre du jour, PV), un « Pour info » reçu
 * s'ouvre chez elle ; une page d'une seule entité (mots de passe oubliés…) s'y choisit.
 */
export function useOuvrirLien() {
  const comites = useComites();
  const navigate = useNavigate();
  return useCallback(
    (link: string, entite?: string, o?: { replace?: boolean }) => {
      const [chemin, q = ''] = link.split('?');
      const parEntite = pageParEntite(chemin);
      if (entite && (PAGES_REUNIES.includes(chemin) || parEntite)) {
        const perms = parEntite ? [parEntite.perm] : PERMS_COMITE;
        if (perms.some((p) => comites?.liste(p).some((u) => u.id === entite))) comites!.choisir(entite);
        navigate(chemin === '/taches' && q.startsWith('pourinfo=') ? `${link}&chez=${encodeURIComponent(entite)}` : link, o);
      } else navigate(link, o);
    },
    [comites, navigate],
  );
}

/**
 * Lien reçu vers une page de l'une de mes autres entités (notification du téléphone, WhatsApp, email : « u=<entité> ») :
 * l'appli reste sur son entité de base et l'ouvre d'ici, comme une notification de la cloche (une tâche : sa clé vue
 * d'ici, « x:<entité>:<tâche> »).
 */
export function LienRecu() {
  const club = useClubOptional();
  const { pathname, search } = useLocation();
  const ouvrir = useOuvrirLien();
  const u = new URLSearchParams(search).get('u');
  const ici = club?.current.id;
  const mienne = !!u && u !== ici && !!club?.mine.some((m) => m.id === u);
  useEffect(() => {
    if (!mienne || !u || !ici) return;
    const params = new URLSearchParams(search);
    params.delete('u');
    const q = params.toString();
    const l = lienDepuisEntite(`${pathname}${q ? `?${q}` : ''}`, u, ici);
    ouvrir(l.lien, l.ici ? undefined : u, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mienne, u, ici]);
  return null;
}
