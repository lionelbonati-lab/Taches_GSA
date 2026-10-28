import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { GENRES_RESULTAT, passages, rechercherPartout, termesDe, type GenreResultat, type Resultat } from '../data/recherche';
import { useMesEntites, useSondagesMoi } from '../data/entites';
import { idPartagee } from '../data/partage';
import { Icone, type IconeNom } from './icones';

const ICONES: Record<GenreResultat, IconeNom> = {
  tache: 'taches',
  seance: 'seances',
  archive: 'pv',
  sondage: 'sondage',
  evenement: 'evenements',
  personne: 'personnes',
  entite: 'organigramme',
};
const PAR_GROUPE = 5;

/** Texte des PV et ordres du jour archivés, sans balises (gardé tant que l'appli est ouverte). */
const textes = new Map<string, string>();
function texteArchive(id: string, html: string) {
  let t = textes.get(id);
  if (t === undefined) {
    // Espace après chaque bloc (titre, paragraphe, cellule…) : sans quoi leurs mots se colleraient.
    const espace = html.replace(/<\/(p|h[1-6]|li|div|td|th|tr|blockquote)>|<br\s*\/?>/gi, '$& ');
    t = new DOMParser().parseFromString(espace, 'text/html').body.textContent ?? '';
    textes.set(id, t);
  }
  return t;
}

/** Texte avec les passages trouvés surlignés. */
function Surligne({ texte, termes }: { texte: string; termes: string[] }) {
  const p = passages(texte, termes);
  if (!p.length) return <>{texte}</>;
  return (
    <>
      {p.map(([d, f], i) => (
        <Fragment key={i}>
          {texte.slice(i ? p[i - 1][1] : 0, d)}
          <mark>{texte.slice(d, f)}</mark>
        </Fragment>
      ))}
      {texte.slice(p[p.length - 1][1])}
    </>
  );
}

/** Loupe de l'en-tête : recherche dans tout ce que la personne voit (Ctrl+K ou « / » au clavier). */
export function Recherche() {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const saisie = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !saisie && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        setOuvert(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <>
      <button className="bell recherche-btn" onClick={() => setOuvert(true)} aria-label="Rechercher" title="Rechercher (Ctrl+K)">
        <Icone n="rechercher" />
      </button>
      {ouvert && createPortal(<PanneauRecherche q={q} setQ={setQ} onClose={() => setOuvert(false)} />, document.body)}
    </>
  );
}

function PanneauRecherche({ q, setQ, onClose }: { q: string; setQ: (q: string) => void; onClose: () => void }) {
  const { data, dataMoi, user, can, canSeeTask } = useStore();
  const club = useClubOptional();
  // Vue « moi » : toutes mes entités (tâches et sondages déjà réunis ; séances, événements et personnes de chacune).
  const mes = useMesEntites();
  const sondagesMoi = useSondagesMoi();
  const navigate = useNavigate();
  const [ouverts, setOuverts] = useState<Set<GenreResultat>>(new Set());
  const [sel, setSel] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLDivElement>(null);

  const resultats = useMemo(
    () =>
      user
        ? rechercherPartout(
            q,
            {
              // Vue du club : séances, événements et personnes, ceux de chacune de mes entités (plus bas).
              data: club?.vueClub ? { ...data, meetings: [], events: [], people: [] } : { ...data, tasks: dataMoi.tasks, statuses: dataMoi.statuses },
              moi: user,
              peutVoirTache: canSeeTask,
              sondages: sondagesMoi.map(({ p, ent }) => (ent.ici || !ent.u ? p : { ...p, id: idPartagee(ent.u.id, p.id) })),
              seances: can('tab.meetings'),
              evenements: can('tab.events'),
              coordonnees: can('tab.people'),
              courante: club?.current,
              entites: club?.mine,
              texteArchive,
            },
            mes.flatMap((e) =>
              e.ici || !e.u || !e.store.user
                ? []
                : [{
                    u: e.u,
                    c: {
                      data: { ...e.store.data, tasks: [] },
                      moi: e.store.user,
                      peutVoirTache: () => false,
                      sondages: [],
                      seances: e.store.can('tab.meetings'),
                      evenements: e.store.can('tab.events'),
                      coordonnees: e.store.can('tab.people'),
                      courante: e.u,
                      texteArchive,
                    },
                  }],
            ),
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, data, dataMoi.tasks, dataMoi.statuses, user, can, canSeeTask, club?.current, club?.mine, mes, sondagesMoi],
  );
  const termes = useMemo(() => termesDe(q), [q]);
  // Groupes dans l'ordre fixe ; les premiers résultats de chacun, le reste sur demande.
  const groupes = (Object.keys(GENRES_RESULTAT) as GenreResultat[])
    .map((g) => {
      const tous = resultats.filter((r) => r.genre === g);
      return { g, tous, vus: ouverts.has(g) ? tous : tous.slice(0, PAR_GROUPE) };
    })
    .filter((x) => x.tous.length);
  const visibles = groupes.flatMap((x) => x.vus);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    champ.current?.focus();
    champ.current?.select();
  }, []);
  useEffect(() => {
    liste.current?.querySelector('.recherche-item.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const ouvrir = (r: Resultat) => {
    onClose();
    if (r.lien) navigate(r.lien);
  };
  const clavier = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibles.length) setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : visibles.length - 1)) % visibles.length);
    } else if (e.key === 'Enter' && visibles[sel]) {
      e.preventDefault();
      ouvrir(visibles[sel]);
    }
  };

  let n = -1;
  return (
    <div className="modal-back recherche-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal recherche" role="dialog" aria-label="Rechercher" onKeyDown={clavier}>
        <div className="recherche-champ">
          <Icone n="rechercher" />
          <input
            ref={champ}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Rechercher dans ${club?.vueClub ? 'tout le club' : club ? `« ${club.current.nom} »` : 'l’appli'}…`}
            aria-label="Rechercher"
            enterKeyHint="search"
            autoComplete="off"
          />
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="recherche-liste" ref={liste}>
          {termes.join('').length < 2 ? (
            <p className="recherche-vide">
              Tâches (titre, remarque, checklist, documents), séances, PV et ordres du jour archivés, sondages, événements, personnes
              {club ? ' de toutes tes entités, et entités du club' : ''}. Sans tenir compte des accents ni des majuscules.
            </p>
          ) : !resultats.length ? (
            <p className="recherche-vide">Rien trouvé pour « {q.trim()} ».</p>
          ) : (
            groupes.map(({ g, tous, vus }) => (
              <section key={g}>
                <h3>{GENRES_RESULTAT[g]} <small>{tous.length}</small></h3>
                {vus.map((r) => {
                  n++;
                  const i = n;
                  return (
                    <button key={`${g}:${r.id}`} className={`recherche-item ${i === sel ? 'sel' : ''}`} onClick={() => ouvrir(r)} onMouseMove={() => i !== sel && setSel(i)}>
                      <Icone n={ICONES[g]} />
                      <span className="recherche-texte">
                        <span className="recherche-titre"><Surligne texte={r.titre} termes={termes} /></span>
                        {r.detail && <small><Surligne texte={r.detail} termes={termes} /></small>}
                        {r.extrait && <small className="recherche-extrait"><Surligne texte={r.extrait} termes={termes} /></small>}
                      </span>
                    </button>
                  );
                })}
                {tous.length > vus.length && (
                  <button className="btn link small" onClick={() => setOuverts(new Set([...ouverts, g]))}>
                    Afficher les {tous.length - vus.length} autres
                  </button>
                )}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
