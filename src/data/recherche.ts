import type { AppData, OrgUnit, Person, Poll, Task } from './types';
import { fmtDate, fmtDateTime, fullName, isDone } from './utils';
import { UNIT_TYPES } from './units';
import { echeance, isOpen } from './polls';

// Recherche globale (loupe de l'en-tête) : tâches, séances, PV et ordres du jour archivés, sondages, événements,
// personnes de toutes mes entités (vue « moi » : rechercherPartout) et entités du club. Sans accents ni majuscules ;
// tous les mots doivent se trouver.

export type GenreResultat = 'tache' | 'seance' | 'archive' | 'sondage' | 'evenement' | 'personne' | 'entite';

export const GENRES_RESULTAT: Record<GenreResultat, string> = {
  tache: 'Tâches',
  seance: 'Séances',
  archive: 'PV et ordres du jour',
  sondage: 'Sondages',
  evenement: 'Événements',
  personne: 'Personnes',
  entite: 'Entités du club',
};

export interface Resultat {
  genre: GenreResultat;
  id: string;
  titre: string;
  /** Ligne d'information (statut, date, poste…). */
  detail?: string;
  /** Passage du texte où se trouve la recherche, quand ce n'est pas le titre. */
  extrait?: string;
  /** Page à ouvrir (hash router). */
  lien?: string;
  /** Classement : titre qui commence par la recherche, titre qui la contient, ailleurs. */
  score: number;
  /** Plus récent d'abord, à score égal. */
  date: string;
}

/** Texte comparable : minuscules, sans accents. Garde la position d'origine de chaque caractère. */
export function normaliser(texte: string) {
  let n = '';
  const pos: number[] = [];
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const x of c) {
      n += x;
      pos.push(i);
    }
  }
  return { n, pos };
}

export const termesDe = (q: string) => normaliser(q.trim()).n.split(/\s+/).filter(Boolean);

/** Passages de `texte` qui correspondent aux termes : [début, fin[ dans le texte d'origine, triés, fusionnés. */
export function passages(texte: string, termes: string[]): [number, number][] {
  const { n, pos } = normaliser(texte);
  const out: [number, number][] = [];
  for (const t of termes) {
    for (let i = n.indexOf(t); i >= 0; i = n.indexOf(t, i + t.length)) out.push([pos[i], pos[i + t.length - 1] + 1]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.reduce<[number, number][]>((acc, p) => {
    const d = acc[acc.length - 1];
    if (d && p[0] <= d[1]) d[1] = Math.max(d[1], p[1]);
    else acc.push([...p]);
    return acc;
  }, []);
}

/** Tous les termes se trouvent dans l'un ou l'autre des textes. */
const trouve = (textes: string[], termes: string[]) => {
  const n = normaliser(textes.join(' \n ')).n;
  return termes.every((t) => n.includes(t));
};

function score(titre: string, termes: string[]) {
  const n = normaliser(titre).n;
  if (termes.every((t) => n.includes(t))) return n.startsWith(termes[0]) ? 3 : 2;
  return 1;
}

/** Une centaine de caractères autour du premier passage trouvé (ou rien). */
export function extraitDe(texte: string, termes: string[], largeur = 110) {
  const t = texte.replace(/\s+/g, ' ').trim();
  const p = passages(t, termes)[0];
  if (!p) return undefined;
  const debut = Math.max(0, p[0] - Math.floor((largeur - (p[1] - p[0])) / 2));
  const fin = Math.min(t.length, debut + largeur);
  return `${debut > 0 ? '…' : ''}${t.slice(debut, fin).trim()}${fin < t.length ? '…' : ''}`;
}

export interface Contexte {
  data: AppData;
  moi: Person;
  peutVoirTache: (t: Task) => boolean;
  sondages: Poll[];
  /** Pages ouvertes à la personne. */
  seances: boolean;
  evenements: boolean;
  coordonnees: boolean;
  /** Entité ouverte et entités du club (sans club : pas de personnes ni d'entités). */
  courante?: OrgUnit;
  entites?: OrgUnit[];
  /** Texte des PV et ordres du jour archivés (sans balises), par identifiant. */
  texteArchive: (id: string, html: string) => string;
}

export function rechercher(q: string, c: Contexte): Resultat[] {
  const termes = termesDe(q);
  if (!termes.length || termes.join('').length < 2) return [];
  const { data } = c;
  const out: Resultat[] = [];
  const ajouter = (r: Omit<Resultat, 'score'>, textes: string[], autres: string[] = []) => {
    if (!trouve([...textes, ...autres], termes)) return;
    const s = score(r.titre, termes);
    // Extrait : pas quand le passage trouvé est déjà dans la ligne d'information (poste d'une personne…).
    const extrait = s === 1 ? r.extrait ?? autres.concat(textes.slice(1)).map((x) => extraitDe(x, termes)).find((x) => x && !r.detail?.includes(x)) : undefined;
    out.push({ ...r, score: s, extrait });
  };
  const nom = (id: string) => fullName(data.people.find((p) => p.id === id));

  for (const t of data.tasks) {
    if (!c.peutVoirTache(t)) continue;
    const fait = isDone(data, t);
    const statut = data.statuses.find((s) => s.id === t.statusId)?.label;
    ajouter(
      {
        genre: 'tache',
        id: t.id,
        titre: t.titre,
        detail: [fait ? `✓ ${statut ?? 'terminée'}` : statut, t.delai && `délai : ${fmtDate(t.delai)}`, t.responsables.map(nom).join(', ')].filter(Boolean).join(' · '),
        lien: `/taches?tache=${t.id}`,
        // Tâches en cours avant les terminées.
        date: `${fait ? 0 : 1}${t.updatedAt ?? ''}`,
      },
      [t.titre],
      [t.remarque ?? '', ...(t.checklist ?? []).map((x) => x.label), ...(t.documents ?? []).map((d) => d.nom), t.sousSection ?? ''],
    );
  }

  for (const m of data.meetings) {
    ajouter(
      { genre: 'seance', id: m.id, titre: m.titre, detail: [fmtDate(m.date), m.heure?.replace(':', 'h'), m.lieu].filter(Boolean).join(' · '), lien: c.seances ? `/comite?seance=${m.id}` : '/agenda', date: m.date },
      [m.titre],
      [m.lieu ?? '', fmtDate(m.date)],
    );
    if (!c.seances) continue;
    const archives = [
      ...(m.minutesArchives ?? []).map((a, i) => ({ a, titre: `PV · ${a.titre}${i > 0 ? ` (version du ${fmtDateTime(a.at)})` : ''}` })),
      ...(m.pvArchives ?? []).map((a) => ({ a, titre: `Ordre du jour · ${m.titre} · ${fmtDateTime(a.at)}` })),
    ];
    for (const { a, titre } of archives)
      ajouter(
        { genre: 'archive', id: a.id, titre, detail: `${m.titre} · ${fmtDate(m.date)}`, lien: `/comite?archive=${a.id}`, date: a.at },
        [titre],
        [c.texteArchive(a.id, a.html)],
      );
  }

  for (const p of c.sondages)
    ajouter(
      { genre: 'sondage', id: p.id, titre: p.question, detail: isOpen(p) ? (p.dateLimite ? `en cours · réponses avant le ${echeance(p)}` : 'en cours') : 'clôturé', lien: `/sondages?id=${p.id}`, date: p.creeLe },
      [p.question],
      [p.description ?? '', ...p.options.map((o) => o.label)],
    );

  for (const e of data.events)
    ajouter(
      { genre: 'evenement', id: e.id, titre: e.nom, detail: [fmtDate(e.date), e.lieu].filter(Boolean).join(' · '), lien: c.evenements ? `/evenements?id=${e.id}` : '/agenda', date: e.date },
      [e.nom],
      [e.lieu ?? '', e.description ?? ''],
    );

  if (c.courante)
    for (const p of data.people) {
      if (!p.actif) continue;
      ajouter(
        { genre: 'personne', id: p.id, titre: fullName(p), detail: [p.poste, p.autresPostes].filter(Boolean).join(', '), lien: `/organigramme?entite=${c.courante.id}&personne=${p.id}`, date: '' },
        [fullName(p)],
        [p.poste ?? '', p.autresPostes ?? '', ...(c.coordonnees ? [p.email ?? '', p.telephone ?? ''] : [])],
      );
    }

  // Mes entités : dans l'organigramme (vue « moi » : on ne change pas d'entité).
  for (const u of c.entites ?? []) ajouter({ genre: 'entite', id: u.id, titre: u.nom, detail: UNIT_TYPES[u.type]?.label, lien: '/organigramme', date: '' }, [u.nom]);

  return trier(out);
}

const trier = (l: Resultat[]) => l.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date) || a.titre.localeCompare(b.titre, 'fr'));

/** Lien d'un résultat de l'une de mes autres entités : la carte de cette entité (séances, archives, événements). */
const lienChez = (lien: string | undefined, u: string) => (lien && /^\/(comite|evenements)\?/.test(lien) ? `${lien}&entite=${encodeURIComponent(u)}` : lien);

/**
 * Vue « moi » : la recherche dans toutes mes entités. `ici` : l'entité sur laquelle s'appuie l'appli, avec les tâches et
 * les sondages déjà réunis de toutes ; `autres` : le reste de chacune des autres (séances, événements, personnes), à
 * son nom.
 */
export function rechercherPartout(q: string, ici: Contexte, autres: { u: OrgUnit; c: Contexte }[]): Resultat[] {
  return trier([
    ...rechercher(q, ici),
    ...autres.flatMap(({ u, c }) =>
      rechercher(q, c).map((r) => ({ ...r, id: `${u.id}:${r.id}`, detail: [r.detail, u.nom].filter(Boolean).join(' · '), lien: lienChez(r.lien, u.id) })),
    ),
  ]);
}
