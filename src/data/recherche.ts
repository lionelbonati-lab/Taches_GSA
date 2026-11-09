import type { AppData, Person, Poll, Task } from './types';
import { fmtDate, fmtDateTime, fullName, isDone } from './utils';
import { echeance, isOpen } from './polls';
import { evenementsDeLaSerie, serieDe } from './seriesEvenements';

// Recherche globale (loupe de l'en-tête) : tâches, séances, PV et ordres du jour archivés, sondages, événements,
// personnes et étiquettes. Sans accents ni majuscules ; tous les mots doivent se trouver.

export type GenreResultat = 'tache' | 'seance' | 'archive' | 'sondage' | 'evenement' | 'personne' | 'etiquette';

export const GENRES_RESULTAT: Record<GenreResultat, string> = {
  tache: 'Points',
  seance: 'Séances',
  archive: 'PV et ordres du jour',
  sondage: 'Sondages',
  evenement: 'Événements',
  personne: 'Personnes',
  etiquette: 'Étiquettes',
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
  /** Personnes du club : leur liste est ouverte (sinon pas de personnes). */
  personnes?: boolean;
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
        detail: [fait ? `✓ ${statut ?? 'terminé'}` : statut, t.delai && `délai : ${fmtDate(t.delai)}`, t.responsables.map(nom).join(', ')].filter(Boolean).join(' · '),
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

  for (const e of data.events) {
    const s = serieDe(data, e);
    ajouter(
      { genre: 'evenement', id: e.id, titre: e.nom, detail: [fmtDate(e.date), e.lieu, s && `série « ${s.nom} »`].filter(Boolean).join(' · '), lien: c.evenements ? `/evenements?id=${e.id}` : '/agenda', date: e.date },
      [e.nom],
      [e.lieu ?? '', e.description ?? '', s?.nom ?? ''],
    );
  }

  // Séries d'événements (programme hivernal, championnat) : leur carte, dans la page Événements.
  for (const s of data.seriesEvenements ?? []) {
    const evs = evenementsDeLaSerie(data.events, s.id);
    ajouter(
      { genre: 'evenement', id: s.id, titre: s.nom, detail: `Série · ${evs.length} événement${evs.length > 1 ? 's' : ''}`, lien: c.evenements ? `/evenements?id=${s.id}` : '/agenda', date: evs[0]?.date ?? '' },
      [s.nom],
      [s.description ?? '', ...evs.map((e) => e.nom)],
    );
  }

  if (c.personnes)
    for (const p of data.people) {
      if (!p.actif) continue;
      ajouter(
        { genre: 'personne', id: p.id, titre: fullName(p), detail: [p.poste, p.autresPostes].filter(Boolean).join(', '), lien: `/membres-club?q=${encodeURIComponent(fullName(p))}`, date: '' },
        [fullName(p)],
        [p.poste ?? '', p.autresPostes ?? '', ...(c.coordonnees ? [p.email ?? '', p.telephone ?? ''] : [])],
      );
    }

  // Étiquettes (événements, groupes) : leurs tâches.
  for (const e of data.etiquettes ?? [])
    ajouter({ genre: 'etiquette', id: e.id, titre: e.nom, detail: [e.type === 'evenement' ? 'Événement' : 'Groupe', e.date && fmtDate(e.date)].filter(Boolean).join(' · '), lien: `/taches?etiquette=${e.id}`, date: e.date ?? '' }, [e.nom]);

  return trier(out);
}

const trier = (l: Resultat[]) => l.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date) || a.titre.localeCompare(b.titre, 'fr'));
