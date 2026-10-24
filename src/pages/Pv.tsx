import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useStore } from '../data/store';
import { hasPermission, userRoles } from '../data/permissions';
import type { AppData, ChecklistItem, LienLieu, Meeting, Person, PvSettings, Section, StyleDocs, Task } from '../data/types';
import { fmtDate, fmtDateTime, fullName, initials, shortName, today, uid } from '../data/utils';
import { cleanHtml } from '../data/sanitize';
import { isOpen, pollSection, pollSummary } from '../data/polls';
import { JOURS_APRES, echeanceSuivante, joursApresTexte, selectAgenda } from '../data/agenda';
import type { Poll } from '../data/types';
import { archiveHtml, hydrateArchive, sansAnnexes } from '../data/entete';
import { nomAppli } from '../data/nomAppli';
import { DocEntete, LienEntete, useEntete, useUnitLogo } from '../components/Entete';
import { PageIntro } from '../components/Nav';
import { useClubOptional } from '../data/club';
import { TaskModal } from '../components/TaskModal';
import { MiseEnForme } from '../components/MiseEnForme';
import { ProfilsOdj } from '../components/ProfilsOdj';
import { epurer, margesMm, styleVars } from '../data/styleDocs';
import { BoutonPdf, usePiedImprime } from '../components/BoutonPdf';
import { AvecLiens, LieuSeance } from '../components/Liens';
import { LIENS_LIEU, avecLienLieu, lienLieu, texteLieu } from '../data/lieux';
import { lienMailto } from '../data/lienPartage';
import { ChoixAnnexes, DocsTache, ListeAnnexes, PAR_PAGE, PagesAnnexes, annexeInfo, annexesDe, docsTexte, numerosDe, useAnnexesArchive, useOuvrirDocs } from '../components/Annexes';
import { Icone } from '../components/icones';
import { Modal } from '../components/ui';

// Onglet « Ordre du jour » : document imprimable préparant la prochaine séance de comité
// (et la suivante), sur le modèle des ordres du jour du club : en-tête (le nom du comité), convoqués, liste numérotée
// des tâches par section ; en option, les fichiers liés aux tâches joints à la fin (annexes).
// (Identifiants internes « pv » conservés pour les données déjà enregistrées.)

export const DEFAULT_PV: PvSettings = {
  detail: 'complet',
  club: 'G.S. Ajoie – Comité',
  afficherClub: true,
  parts: { presences: true, retards: true, avantProchaine: true, avantSuivante: true, bilan: true, sondages: true, notes: true, partagees: true },
  tri: 'delai',
  sectionsVides: true,
  colonnes: { sousSection: true, echeance: true, statut: true, remarque: true, checklist: true, documents: true },
  statutsExclus: [],
  sectionsExclues: [],
  orientation: 'portrait',
  taille: 'normale',
  annexes: false,
  annexesParPage: 1,
};

export function withDefaults(p?: Partial<PvSettings>): PvSettings {
  return { ...DEFAULT_PV, ...p, parts: { ...DEFAULT_PV.parts, ...p?.parts }, colonnes: { ...DEFAULT_PV.colonnes, ...p?.colonnes } };
}

const longDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (d: string) => {
  const [y, m, j] = d.split('-');
  return `${j}.${m}.${y.slice(2)}`;
};
const heure = (m: Meeting) => (m.heure ? m.heure.replace(':', 'h') : '');

interface Group {
  key: string;
  label: string;
  tasks: Task[];
}

/** Ce dont dépend l'ordre du jour, hors réglages : séances (précédente, préparée, suivante), convoqués, excusés. */
interface ContexteOdj {
  data: AppData;
  s0?: Meeting;
  s1?: Meeting;
  s2?: Meeting;
  /** Le nom du comité. */
  titre: string;
  committee: Person[];
  excusesTxt: string;
  autresResp: (t: Task) => string;
}

// ---------- Liste numérotée (1. section / a. sous-section / ■ point) ----------
interface OItem {
  key: string;
  task?: Task;
  poll?: Poll;
  text?: string;
  /** Rendu avec liens (documents « lien ») ; `text` reste la version texte. */
  node?: ReactNode;
  children: OItem[];
}
interface OSec {
  key: string;
  label: string;
  items: OItem[];
}

const letter = (i: number) => {
  let r = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) r = String.fromCharCode(97 + ((n - 1) % 26)) + r;
  return r;
};

/**
 * Contenu de l'ordre du jour selon des réglages (ceux affichés, ou ceux d'un profil pour l'email) : tâches retenues,
 * liste numérotée, annexes, version texte.
 */
function contenuOdj(c: ContexteOdj, s: PvSettings, joursApres: number) {
  const { data, s0, s1, s2, titre, committee, excusesTxt, autresResp } = c;
  // Tâches partagées par d'autres entités : dans l'ordre du jour comme les autres (rangées sous leur événement,
  // la section qui porte le nom de l'entité, ou la section choisie), sauf si on les retire.
  const odj = s.parts.partagees ? data : { ...data, tasks: data.tasks.filter((t) => !t.source) };
  const person = (id: string) => data.people.find((p) => p.id === id);

  // ---------- Sélection des tâches (partagée avec l'onglet PV) ----------
  const { late, avant1, avant2, bilan, since } = selectAgenda(odj, s0, s1, s2, {
    retards: s.parts.retards,
    avantProchaine: s.parts.avantProchaine,
    avantSuivante: s.parts.avantSuivante,
    bilan: s.parts.bilan,
    statutsExclus: s.statutsExclus,
    sectionsExclues: s.sectionsExclues,
    joursApres,
  });

  // Échéance de chaque tâche retenue (retard, séance, séance suivante, terminée).
  type Bucket = 'late' | 'p1' | 'p2' | 'bilan';
  const bucketOf = new Map<string, Bucket>();
  late.forEach((t) => bucketOf.set(t.id, 'late'));
  avant1.forEach((t) => bucketOf.set(t.id, 'p1'));
  avant2.forEach((t) => bucketOf.set(t.id, 'p2'));
  bilan.forEach((t) => bucketOf.set(t.id, 'bilan'));
  const RANK: Record<Bucket, number> = { late: 0, p1: 1, p2: 2, bilan: 3 };
  const rank = (t: Task) => RANK[bucketOf.get(t.id) ?? 'p1'];
  const unified = [...late, ...avant1, ...avant2, ...bilan];

  const statusIndex = (t: Task) => data.statuses.findIndex((x) => x.id === t.statusId);
  const sortTasks = (list: Task[]) =>
    [...list].sort((a, b) => {
      if (s.tri === 'statut') return statusIndex(a) - statusIndex(b) || (a.delai || '9').localeCompare(b.delai || '9');
      if (s.tri === 'titre') return a.titre.localeCompare(b.titre, 'fr');
      return (a.delai || '9999').localeCompare(b.delai || '9999');
    });
  // Ordre dans une section : sous-sections (comme l'ordre du jour), puis retards → séance → suivante → terminées, puis tri choisi.
  const order = (list: Task[], sec: Section) =>
    sortTasks(list)
      .sort((a, b) => rank(a) - rank(b))
      .sort((a, b) => sec.sousSections.indexOf(a.sousSection) - sec.sousSections.indexOf(b.sousSection));
  // Sondages : en cours, ou clôturés depuis la séance précédente ; placés sous leur section.
  const polls: Poll[] = s.parts.sondages
    ? (data.polls ?? []).filter((p) => {
        const sec = pollSection(data, p);
        if (sec && s.sectionsExclues.includes(sec)) return false;
        return isOpen(p) || (p.clotureLe ?? p.dateLimite ?? '') >= since;
      })
    : [];
  const pollsOf = (secId?: string) => polls.filter((p) => pollSection(data, p) === secId);
  const pollsWithoutSection = polls.filter((p) => !pollSection(data, p) || !data.sections.some((x) => x.id === pollSection(data, p)));
  // Sections de l'ordre du jour, chacune avec toutes ses tâches retenues.
  const unifiedGroups: Group[] = odj.sections
    .filter((sec) => !s.sectionsExclues.includes(sec.id))
    .map((sec) => ({ key: sec.id, label: sec.nom, tasks: order(unified.filter((t) => t.sectionId === sec.id), sec) }))
    .filter((g) => g.tasks.length || s.sectionsVides || pollsOf(g.key).length);

  // Annexes : fichiers et liens des tâches de l'ordre du jour, dans leur ordre, sauf ceux retirés pour cette séance
  // (choix commun au comité, enregistré dans la séance).
  const tachesOdj = unifiedGroups.flatMap((g) => g.tasks);
  const annexes = s.annexes ? annexesDe(tachesOdj, s1?.odjAnnexesExclues ?? []) : [];
  // Sous-tâche : case, intitulé et initiales de la personne chargée.
  const checkText = (_t: Task, ch: ChecklistItem) => `${ch.done ? '☑' : '☐'} ${ch.label}`;
  // Tâche partagée : aussi les responsables des autres entités (noms complets).
  const respText = (t: Task) => [t.responsables.map((id) => initials(person(id))).join(', '), autresResp(t)].filter(Boolean).join(' · ') || '—';

  const firstOpen = data.statuses.find((x) => !x.done)?.id;
  const pollItem = (p: Poll): OItem => ({ key: p.id, poll: p, children: [] });
  const textItem = (key: string, text: string): OItem => ({ key, text, children: [] });
  // Sous-points d'une tâche : checklist, documents, sondages liés.
  const taskItem = (t: Task): OItem => ({
    key: t.id,
    task: t,
    children: [
      ...(s.colonnes.checklist ? t.checklist.map((ch) => textItem(ch.id, checkText(t, ch))) : []),
      ...(s.colonnes.documents && t.documents?.length ? [{ ...textItem(`${t.id}-docs`, `📎 ${docsTexte(t, annexes)}`), node: <DocsTache t={t} annexes={annexes} /> }] : []),
      ...polls.filter((p) => p.taskId === t.id).map(pollItem),
    ],
  });
  const buildOutline = (groups: Group[]): OSec[] =>
    groups.map((g) => {
      const items: OItem[] = [];
      const bySub = new Map<string, OItem>();
      // Tâches liées dont la tâche principale figure aussi ici : placées sous elle.
      const ids = new Set(g.tasks.map((t) => t.id));
      const underParent = (t: Task) => !!t.parentId && ids.has(t.parentId);
      const itemOf = new Map<string, OItem>();
      for (const t of g.tasks) {
        if (underParent(t)) continue;
        const sub = s.colonnes.sousSection ? t.sousSection : '';
        if (!sub) {
          const it = taskItem(t);
          itemOf.set(t.id, it);
          items.push(it);
          continue;
        }
        let head = bySub.get(sub);
        if (!head) {
          head = textItem(`${g.key}:${sub}`, sub);
          bySub.set(sub, head);
          items.push(head);
        }
        // Tâche qui porte le nom de sa sous-section (tâche principale d'un groupe) : elle devient la ligne de la sous-section.
        if (!head.task && t.titre.trim().toLowerCase() === sub.trim().toLowerCase()) {
          head.task = t;
          head.children = [...taskItem(t).children, ...head.children];
          itemOf.set(t.id, head);
        } else {
          const it = taskItem(t);
          itemOf.set(t.id, it);
          head.children.push(it);
        }
      }
      g.tasks.filter(underParent).forEach((t) => itemOf.get(t.parentId!)?.children.push(taskItem(t)));
      pollsOf(g.key).filter((p) => !g.tasks.some((t) => t.id === p.taskId)).forEach((p) => items.push(pollItem(p)));
      return { key: g.key, label: g.label, items };
    });
  // Sondages sans section.
  const extraSections = (): OSec[] => (pollsWithoutSection.length ? [{ key: 'polls', label: 'Sondages', items: pollsWithoutSection.map(pollItem) }] : []);

  const taskMeta = (t: Task) => {
    const b = bucketOf.get(t.id);
    const st = data.statuses.find((x) => x.id === t.statusId);
    return [
      respText(t) !== '—' && respText(t),
      b !== 'bilan' && t.delai && shortDate(t.delai),
      s.colonnes.echeance && (b === 'late' ? '⚠ en retard' : b === 'p2' && s2 ? echeanceSuivante(t, s2) : b === 'bilan' ? `✓ fait${t.termineeLe ? ` le ${shortDate(t.termineeLe)}` : ''}` : ''),
      s.colonnes.statut && b !== 'bilan' && t.statusId !== firstOpen && st?.label,
    ].filter(Boolean) as string[];
  };
  const itemText = (it: OItem) =>
    it.task
      ? `${it.task.titre}${taskMeta(it.task).length ? ` (${taskMeta(it.task).join(' · ')})` : ''}${s.colonnes.remarque && it.task.remarque ? ` – ${it.task.remarque.trim()}` : ''}${!s.colonnes.documents && numerosDe(annexes, it.task).length ? ` 📎 annexe ${numerosDe(annexes, it.task).join(', ')}` : ''}`
      : it.poll
        ? `📊 Sondage : ${it.poll.question} — ${pollSummary(it.poll)}`
        : it.text ?? '';
  // Niveaux : 1. section · a. point · ■ sous-point · ◦ détail
  // Niveau de détail : sections seulement (0), + sous-sections (1), complet.
  const maxDepth = s.detail === 'sections' ? -1 : s.detail === 'sousSections' ? 0 : 9;
  const outlineText = (secs: OSec[]) => {
    const out: string[] = [];
    const walk = (items: OItem[], depth: number) =>
      depth <= maxDepth &&
      items.forEach((it, j) => {
        const pad = '   '.repeat(depth + 1);
        // Remarque sur plusieurs lignes : les suivantes alignées sous le texte du point.
        out.push(`${pad}${depth === 0 ? `${letter(j)}.` : depth === 1 ? '■' : '◦'} ${itemText(it).replace(/[ \t]*\n\s*/g, `\n${pad}   `)}`);
        walk(it.children, depth + 1);
      });
    secs.forEach((sec, i) => {
      out.push(`${i + 1}. ${sec.label}`);
      walk(sec.items, 0);
    });
    return out;
  };
  const listSecs = [...buildOutline(unifiedGroups), ...extraSections()];

  const plainText = () => {
    const out: string[] = [s1 ? `${titre} – ${longDate(s1.date)}` : titre];
    if (s1 && heure(s1)) out.push(`Début de séance : ${heure(s1)}`);
    if (s1) out.push(`Lieu : ${texteLieu(s1)}`);
    if (s.parts.presences) out.push(`Convoqués : ${committee.map((p) => `${fullName(p)} (${initials(p)})`).join(', ')}`, `Excusés : ${excusesTxt}`);
    out.push('', 'Ordre du jour', ...outlineText(listSecs));
    if (s2) out.push('', `Prochaine séance : ${s2.titre}, ${longDate(s2.date)}${heure(s2) ? ` à ${heure(s2)}` : ''} – ${s2.lieu || 'lieu à définir'}`);
    if (annexes.length) out.push('', 'Annexes', ...annexes.map((a) => `   ${a.n}. ${a.d.nom} (${annexeInfo(a)})`));
    return out.join('\n');
  };

  return { odj, tachesOdj, annexes, listSecs, bucketOf, taskMeta, itemText, maxDepth, plainText };
}
type ContenuOdj = ReturnType<typeof contenuOdj>;

/** Feuille de l'ordre du jour générée selon des réglages : affichée, ou cachée pour le PDF joint à l'email. */
function FeuilleOdj({ c, s, o, style, feuilleRef, onOuvrir }: {
  c: ContexteOdj;
  s: PvSettings;
  o: ContenuOdj;
  style?: StyleDocs;
  feuilleRef: RefObject<HTMLDivElement>;
  /** Clic sur une tâche, pour la modifier (feuille affichée). */
  onOuvrir?: (t: Task) => void;
}) {
  const { user } = useStore();
  const logo = useUnitLogo();
  const entete = useEntete();
  const { s1, s2, titre, committee, excusesTxt } = c;
  const { listSecs, annexes, bucketOf, taskMeta, itemText, maxDepth } = o;

  const itemNode = (it: OItem): ReactNode => {
    if (!it.task) return it.poll ? <span className="odj-poll">{itemText(it)}</span> : it.node ?? <AvecLiens texte={it.text ?? ''} />;
    const t = it.task;
    const b = bucketOf.get(t.id);
    const meta = taskMeta(t);
    return (
      <span className={`odj-task ${b === 'late' ? 'late' : b === 'bilan' ? 'done' : ''}`} onClick={onOuvrir && (() => onOuvrir(t))}>
        {t.titre}
        {meta.length > 0 && <span className="odj-meta"> ({meta.join(' · ')})</span>}
        {s.colonnes.remarque && t.remarque && <span className="odj-rem"> – <AvecLiens texte={t.remarque.trim()} /></span>}
        {!s.colonnes.documents && numerosDe(annexes, t).length > 0 && <span className="odj-meta"> 📎 annexe {numerosDe(annexes, t).join(', ')}</span>}
      </span>
    );
  };
  const renderItems = (items: OItem[], depth: number): ReactNode => {
    if (!items.length || depth > maxDepth) return null;
    const cls = ['odj-l1', 'odj-l2', 'odj-l3'][Math.min(depth, 2)];
    const inner = items.map((it) => (
      <li key={it.key}>
        {itemNode(it)}
        {renderItems(it.children, depth + 1)}
      </li>
    ));
    return depth === 0 ? <ol className={cls}>{inner}</ol> : <ul className={cls}>{inner}</ul>;
  };
  const renderOutline = (secs: OSec[]) =>
    secs.length === 0 ? (
      <p className="pv-empty">Aucun point.</p>
    ) : (
      <ol className="odj">
        {secs.map((sec) => (
          <li key={sec.key}>
            <span className="odj-sec">{sec.label}</span>
            {renderItems(sec.items, 0)}
          </li>
        ))}
      </ol>
    );

  return (
    <div ref={feuilleRef} className={`pv-sheet ${s.orientation} t-${s.taille}`} style={styleVars(style)}>
      <header className="pv-head">
        {s.afficherClub && <DocEntete e={entete} logo={logo} />}
        <h1>{titre}</h1>
        {s1 && <p className="pv-meta">{longDate(s1.date)}</p>}
      </header>

      <section className="odj-head">
        {s1 && heure(s1) && <p><b>Début de séance :</b> {heure(s1)}</p>}
        {s1 && <p><b>Lieu :</b> <LieuSeance m={s1} /></p>}
        {s.parts.presences && (
          <>
            <p><b>Convoqués :</b> {committee.map((p) => `${fullName(p)} (${initials(p)})`).join(', ')}</p>
            <p className="odj-fill-line"><b>Excusés :</b> <span className={excusesTxt ? '' : 'odj-fill'} data-champ="excuses">{excusesTxt}</span></p>
          </>
        )}
      </section>

      <section className="pv-part">
        <h2>Ordre du jour</h2>
        {renderOutline(listSecs)}
      </section>

      {s.parts.notes && (
        <section className="pv-part">
          <h2>Notes et décisions</h2>
          <div className="pv-lines" />
        </section>
      )}

      {s2 && (
        <p className="pv-next">
          <b>Prochaine séance :</b> {s2.titre}, {longDate(s2.date)}{heure(s2) && ` à ${heure(s2)}`} – Lieu : <LieuSeance m={s2} />
        </p>
      )}
      <ListeAnnexes annexes={annexes} />
      <footer className="pv-foot">Document généré le {fmtDate(today())} par {fullName(user ?? undefined)} · {nomAppli()}</footer>
      <PagesAnnexes annexes={annexes} parPage={s.annexesParPage} />
    </div>
  );
}

const SANS_PDF = 'aucun';

/**
 * « Envoyer par email » : le texte du mail selon un profil, le PDF joint selon un autre (choix mémorisés pour l'entité).
 * Un lien vers la messagerie (mailto) ne peut pas joindre de fichier : le partage de l'appareil joint le PDF au mail ;
 * sinon le PDF est téléchargé et le mail s'ouvre, prêt, dans la messagerie.
 */
function EnvoiOdj({ c, s, joursApres, nomDoc, edite, canEdit, onClose }: {
  c: ContexteOdj;
  /** Réglages affichés. */
  s: PvSettings;
  joursApres: number;
  nomDoc: string;
  /** Ordre du jour modifié à la main : son texte et sa feuille, repris tels quels. */
  edite?: { texte: string; feuille: RefObject<HTMLDivElement> };
  canEdit: boolean;
  onClose: () => void;
}) {
  const { data, user, updateSilent, setToast } = useStore();
  const profils = data.reglagesOdj?.profils ?? [];
  const style = data.reglagesOdj?.style;
  // Choix enregistré : un profil qui existe encore (ou « Pas de PDF ») ; sinon les réglages affichés.
  const valide = (id: string | undefined, pdf = false) => (id && (profils.some((p) => p.id === id) || (pdf && id === SANS_PDF)) ? id : '');
  const [texteId, setTexteId] = useState(() => valide(data.reglagesOdj?.envoi?.texte));
  const [pdfId, setPdfId] = useState(() => valide(data.reglagesOdj?.envoi?.pdf, true));
  const [lieuChoix, setLieuChoix] = useState<LienLieu>(() => data.reglagesOdj?.envoi?.lieu ?? 'google');
  // Avec le droit de changer l'ordre du jour, le choix est mémorisé pour l'entité : la prochaine fois, les mêmes profils.
  const choisir = (k: 'texte' | 'pdf' | 'lieu', v: string) => {
    if (k === 'lieu') setLieuChoix(v as LienLieu);
    else (k === 'texte' ? setTexteId : setPdfId)(v);
    if (canEdit)
      updateSilent((d) => {
        const { envoi: avant, ...reste } = d.reglagesOdj ?? {};
        // Itinéraire Google Maps : le choix par défaut, pas besoin de le garder.
        const envoi = { ...avant, [k]: v && !(k === 'lieu' && v === 'google') ? v : undefined };
        d.reglagesOdj = envoi.texte || envoi.pdf || envoi.lieu ? { ...reste, envoi } : reste;
      });
  };

  /** Réglages, marge « et jusqu'à … après » et mise en forme d'un profil ('' : ceux affichés). */
  const reglages = (id: string) => {
    const p = profils.find((x) => x.id === id);
    return p ? { s: withDefaults(p.reglages), joursApres: p.joursApres ?? joursApres, style: p.style ? epurer(p.style) : style } : { s, joursApres, style };
  };
  // Version modifiée à la main : reprise telle quelle, sans profil.
  const pdfChoix = edite && pdfId !== SANS_PDF ? '' : pdfId;
  const avecPdf = pdfChoix !== SANS_PDF;
  const rt = reglages(texteId);
  // Lieu placé sur la carte : lien sous « Lieu : … » (sur téléphone, l'itinéraire s'ouvre dans l'application de navigation).
  const urlLieu = c.s1?.lieuGeo && lienLieu(c.s1.lieuGeo, lieuChoix);
  const texteOdj = edite ? edite.texte : contenuOdj(c, rt.s, rt.joursApres).plainText();
  const texte = urlLieu ? avecLienLieu(texteOdj, urlLieu, lieuChoix) : texteOdj;
  const rp = reglages(pdfChoix);
  const contenuPdf = avecPdf && !edite ? contenuOdj(c, rp.s, rp.joursApres) : null;
  const feuillePdf = useRef<HTMLDivElement>(null);

  // PDF préparé dès le choix du profil : « Partager » doit suivre le clic de près (exigence des navigateurs).
  const titrePdf = `Ordre du jour ${nomDoc}`;
  const [pdf, setPdf] = useState<{ pour: string; fichier?: File; erreur?: string } | null>(null);
  const telecharger = useRef<(b: Blob, titre: string) => void>();
  useEffect(() => {
    if (!avecPdf) {
      setPdf(null);
      return;
    }
    let actif = true;
    setPdf({ pour: pdfChoix });
    const st = edite ? style : rp.style;
    const paysage = (edite ? s : rp.s).orientation === 'paysage';
    (async () => {
      try {
        const el = edite ? edite.feuille.current : feuillePdf.current;
        if (!el) throw new Error('feuille introuvable');
        const mod = await import('../data/pdfDoc');
        telecharger.current = mod.telechargerPdf;
        const blob = await mod.creerPdf(el, { titre: titrePdf, paysage, margesMm: margesMm(st), police: st?.police, auteur: user ? fullName(user) : undefined, createur: nomAppli() });
        if (actif) setPdf({ pour: pdfChoix, fichier: new File([blob], mod.nomFichierPdf(titrePdf), { type: 'application/pdf' }) });
      } catch (e) {
        console.error(e);
        if (actif) setPdf({ pour: pdfChoix, erreur: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfChoix]);

  const avecAdresse = c.committee.filter((p) => p.email);
  const sansAdresse = c.committee.filter((p) => !p.email);
  const sujet = `${nomDoc} – ordre du jour`;
  const etat = pdf?.pour === pdfChoix ? pdf : null;
  const fichier = etat?.fichier;
  const pret = !avecPdf || !!fichier || !!etat?.erreur;
  const partageable = !!fichier && !!navigator.canShare?.({ files: [fichier] });
  const mobile = !!window.matchMedia?.('(pointer: coarse)').matches;

  const ouvrirMessagerie = () => {
    if (fichier) telecharger.current?.(fichier, titrePdf);
    let body = texte;
    if (body.length > 1800) body = body.slice(0, 1800) + (fichier ? '\n…\n(suite dans le PDF joint)' : '\n…\n(liste complète dans l’ordre du jour imprimé)');
    const mailto = lienMailto(avecAdresse.map((p) => p.email).join(','), sujet, body);
    // La messagerie s'ouvre juste après le téléchargement du PDF.
    if (fichier) setTimeout(() => (window.location.href = mailto), 500);
    else window.location.href = mailto;
    if (fichier) setToast(`PDF « ${fichier.name} » téléchargé : joins-le au mail (trombone ou glisser-déposer).`);
  };
  const partager = async () => {
    if (!fichier) return;
    try {
      await navigator.share({ files: [fichier], title: sujet, text: texte });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setToast('Partage impossible : utilise « Ouvrir dans ma messagerie ».');
    }
  };
  const copierAdresses = async () => {
    try {
      await navigator.clipboard.writeText(avecAdresse.map((p) => p.email).join(', '));
      setToast(avecAdresse.length > 1 ? `${avecAdresse.length} adresses copiées : colle-les dans « À ».` : 'Adresse copiée : colle-la dans « À ».');
    } catch {
      setToast('Copie impossible dans ce navigateur.');
    }
  };
  const voirPdf = () => {
    if (!fichier) return;
    const u = URL.createObjectURL(fichier);
    window.open(u, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  };

  const affiches = edite ? 'Version modifiée à la main' : 'Réglages affichés';
  const options = edite ? null : profils.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>);
  return (
    <Modal title="Envoyer l’ordre du jour par email" onClose={onClose}>
      <div className="envoi-odj">
        <p>
          <b>À :</b> {avecAdresse.length ? avecAdresse.map((p) => fullName(p)).join(', ') : 'personne (aucune adresse connue)'}
          {avecAdresse.length > 0 && <button type="button" className="btn small link" onClick={copierAdresses}><Icone n="copier" /> Copier les adresses</button>}
        </p>
        {sansAdresse.length > 0 && <p className="muted small">Sans adresse email : {sansAdresse.map((p) => fullName(p)).join(', ')}.</p>}
        <p><b>Objet :</b> {sujet}</p>
        <label>
          Texte du mail
          <select value={edite ? '' : texteId} disabled={!!edite} onChange={(e) => choisir('texte', e.target.value)}>
            <option value="">{affiches}</option>
            {options}
          </select>
        </label>
        <label>
          PDF joint
          <select value={pdfChoix} onChange={(e) => choisir('pdf', e.target.value)}>
            <option value="">{affiches}</option>
            {options}
            <option value={SANS_PDF}>Pas de PDF</option>
          </select>
        </label>
        {c.s1?.lieuGeo && (
          <label>
            Lien du lieu
            <select value={lieuChoix} onChange={(e) => choisir('lieu', e.target.value)}>
              {LIENS_LIEU.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
            </select>
          </label>
        )}
        {avecPdf && (
          <p className="small envoi-etat" aria-live="polite">
            {fichier ? (
              <>
                <span><Icone n="pdf" /> {fichier.name} ({Math.max(1, Math.round(fichier.size / 1024))} Ko)</span>
                <button type="button" className="btn small link" onClick={voirPdf}><Icone n="voir" /> Voir</button>
              </>
            ) : etat?.erreur ? (
              <span className="error">Le PDF n’a pas pu être créé ({etat.erreur.slice(0, 120)}) : le mail partira sans lui.</span>
            ) : (
              <span><Icone n="attente" /> Préparation du PDF…</span>
            )}
          </p>
        )}
        <details className="envoi-apercu">
          <summary>Aperçu du texte</summary>
          <pre>{texte}</pre>
        </details>
        {edite ? (
          <p className="muted small">Ordre du jour modifié à la main : le mail et le PDF reprennent cette version.</p>
        ) : profils.length ? (
          canEdit && <p className="muted small">Choix mémorisés pour l’entité : la prochaine fois, les mêmes profils.</p>
        ) : (
          <p className="muted small">Pas encore de profil : « Profils », dans les réglages de l’ordre du jour, pour en enregistrer (par exemple un texte court pour le mail, le document complet pour le PDF).</p>
        )}
        <div className="modal-foot wrap">
          <button className="btn" onClick={onClose}>Fermer</button>
          {partageable && <button className={`btn ${mobile ? 'primary' : ''}`} onClick={partager}><Icone n="partager" /> Partager avec le PDF joint</button>}
          <button className={`btn ${partageable && mobile ? '' : 'primary'}`} disabled={!pret} onClick={ouvrirMessagerie}><Icone n="email" /> Ouvrir dans ma messagerie</button>
        </div>
        <p className="muted small">
          {partageable && '« Partager » : choisis ta messagerie, le PDF y est joint ; ajoute les destinataires (« Copier les adresses »). '}
          {fichier
            ? '« Ouvrir dans ma messagerie » : le mail s’ouvre prêt (destinataires, objet, texte) et le PDF est téléchargé, à joindre au mail : un lien vers la messagerie ne peut pas le joindre lui-même.'
            : '« Ouvrir dans ma messagerie » : le mail s’ouvre prêt (destinataires, objet, texte).'}
        </p>
        {contenuPdf && (
          <div className="odj-cache" hidden aria-hidden="true">
            <FeuilleOdj c={c} s={rp.s} o={contenuPdf} style={rp.style} feuilleRef={feuillePdf} />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function Pv() {
  const { data, user, prefs, setPrefs, update, updateSilent, can, autresResp } = useStore();
  const club = useClubOptional();
  const s = withDefaults(prefs.pv);
  const set = (patch: Partial<PvSettings>) => setPrefs({ pv: { ...s, ...patch } });
  const setPart = (k: keyof PvSettings['parts'], v: boolean) => set({ parts: { ...s.parts, [k]: v } });
  const setCol = (k: keyof PvSettings['colonnes'], v: boolean) => set({ colonnes: { ...s.colonnes, [k]: v } });

  const meetings = useMemo(() => [...data.meetings].sort((a, b) => a.date.localeCompare(b.date)), [data.meetings]);
  const upcoming = meetings.filter((m) => m.date >= today());
  const [s1Id, setS1Id] = useState(upcoming[0]?.id ?? meetings[meetings.length - 1]?.id ?? '');
  const s1 = meetings.find((m) => m.id === s1Id);
  const after = meetings.filter((m) => s1 && m.date > s1.date);
  const [s2Choice, setS2Choice] = useState<string>('auto');
  const s2 = s2Choice === 'auto' ? after[0] : after.find((m) => m.id === s2Choice);
  const s0 = s1 ? [...meetings].reverse().find((m) => m.date < s1.date) : undefined;

  const sheetRef = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState('');
  const [envoi, setEnvoi] = useState(false);
  // En-tête commun à tous les documents de l'entité (console admin).
  const logo = useUnitLogo();

  const nbPartagees = data.tasks.filter((t) => t.source).length;
  const committee: Person[] = data.people.filter((p) => p.actif && hasPermission(userRoles(data.roles, p), 'tab.meetings'));
  const canEdit = can('tab.pv');

  // ---------- Excusés ----------
  const excuses = s1?.excuses ?? [];
  const isExcused = (id: string) => excuses.some((e) => e.personId === id);
  const excusesTxt = excuses
    .map((e) => data.people.find((x) => x.id === e.personId))
    .filter((p): p is Person => !!p)
    .map((p) => `${fullName(p)} (${initials(p)})${excuses.find((e) => e.personId === p.id)?.motif ? ` – ${excuses.find((e) => e.personId === p.id)!.motif}` : ''}`)
    .join(', ');
  const toggleExcuse = (p: Person) =>
    s1 &&
    update((d) => {
      const m = d.meetings.find((x) => x.id === s1.id)!;
      const has = (m.excuses ?? []).some((e) => e.personId === p.id);
      m.excuses = has ? (m.excuses ?? []).filter((e) => e.personId !== p.id) : [...(m.excuses ?? []), { personId: p.id, le: today() }];
    }, `${fullName(p)} ${isExcused(p.id) ? 'n’est plus excusé(e)' : 'excusé(e)'} pour ${s1.titre}`);

  // ---------- Texte modifié à la main ----------
  const edite = s1?.odjEdite;
  const [draft, setDraft] = useState<string | null>(null);
  // Tâche ouverte d'un clic dans l'ordre du jour généré, pour la modifier.
  const [ouverte, setOuverte] = useState<Task | null>(null);
  useEffect(() => setDraft(null), [s1Id]);

  // Marge après la séance suivante : réglage commun à l'entité (le PV reprend les mêmes tâches).
  const joursApres = data.reglagesOdj?.joursApres ?? 0;
  const setJoursApres = (n: number) =>
    update((d) => {
      d.reglagesOdj = { ...d.reglagesOdj, joursApres: n };
    }, n ? `Ordre du jour : aussi les tâches jusqu’à ${joursApresTexte(n)} après la séance suivante` : 'Ordre du jour : plus de tâches après la séance suivante');

  // Titre : le nom du comité ; avec la date de la séance pour nommer le document (PDF, archive, email).
  const titre = club?.current.nom ?? 'Comité';
  const nomDoc = s1 ? `${titre} ${shortDate(s1.date)}` : titre;
  const ctx: ContexteOdj = { data, s0, s1, s2, titre, committee, excusesTxt, autresResp };
  const contenu = contenuOdj(ctx, s, joursApres);
  const { odj, tachesOdj, annexes } = contenu;
  const exclues = s1?.odjAnnexesExclues ?? [];
  const setExclues = (ids: string[]) =>
    s1 &&
    updateSilent((d) => {
      d.meetings.find((x) => x.id === s1.id)!.odjAnnexesExclues = ids.length ? ids : undefined;
    });
  // Nom proposé à l'enregistrement en PDF (le navigateur reprend le titre de la page).
  useEffect(() => {
    const before = document.title;
    document.title = `Ordre du jour ${nomDoc}`;
    return () => {
      document.title = before;
    };
  }, [nomDoc]);

  // ---------- Actions ----------
  const print = () => window.print();
  // Les fichiers joints (adresses locales) sont remis par useAnnexesArchive.
  const startEdit = () => sheetRef.current && setDraft(sansAnnexes(sheetRef.current.innerHTML));
  const saveEdit = () => {
    if (!s1 || !sheetRef.current || !user) return;
    const html = cleanHtml(archiveHtml(sheetRef.current.innerHTML));
    update((d) => {
      d.meetings.find((x) => x.id === s1.id)!.odjEdite = { html, le: new Date().toISOString(), par: user.id };
    }, `Ordre du jour « ${nomDoc} » modifié à la main`);
    setDraft(null);
    setMsg('✏️ Modifications enregistrées : tout le comité voit cette version.');
  };
  const resetEdit = () => {
    if (!s1 || !confirm('Revenir à l’ordre du jour généré ? Les modifications faites à la main seront perdues.')) return;
    update((d) => {
      delete d.meetings.find((x) => x.id === s1.id)!.odjEdite;
    }, `Ordre du jour « ${nomDoc} » : retour à la version générée`);
    setMsg('');
  };

  const archive = () => {
    if (!s1 || !sheetRef.current || !user) return;
    const html = archiveHtml(sheetRef.current.outerHTML);
    update((d) => {
      const m = d.meetings.find((x) => x.id === s1.id)!;
      m.pvArchives = [{ id: uid('pv'), at: new Date().toISOString(), by: user.id, titre: nomDoc, html, orientation: s.orientation }, ...(m.pvArchives ?? [])].slice(0, 10);
    }, `Ordre du jour « ${nomDoc} » archivé dans la séance ${s1.titre}`);
    setMsg(`📁 Archivé dans « ${s1.titre} » (liste des séances).`);
  };

  // Version modifiée à la main : le texte du document tel qu'il est affiché.
  const texteEdite = () => (sheetRef.current?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim();
  const docText = () => ((edite || draft !== null) && sheetRef.current ? texteEdite() : contenu.plainText());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(docText());
      setMsg('📋 Texte copié : colle-le dans un email, WhatsApp ou Word.');
    } catch {
      setMsg('Copie impossible dans ce navigateur.');
    }
  };

  // Version modifiée à la main (ou en cours de modification) : photos et pages de PDF joints remis à l'affichage.
  const htmlEdite = edite ? cleanHtml(hydrateArchive(edite.html, data, logo), { excuses: excusesTxt }) : '';
  useAnnexesArchive(sheetRef, draft ?? htmlEdite, draft !== null || !!edite);
  usePiedImprime(sheetRef);
  useOuvrirDocs();

  const openStatuses = data.statuses.filter((x) => !x.done);
  const docStyle = styleVars(data.reglagesOdj?.style);
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="pv-page">
      <style>{`@page { size: A4 ${s.orientation === 'paysage' ? 'landscape' : 'portrait'}; margin: ${margesMm(data.reglagesOdj?.style)}mm; @bottom-right { content: counter(page) " / " counter(pages); font-size: 9pt; color: #666; } }`}</style>
      <div className="page-head no-print">
        <h1>Ordre du jour</h1>
        <div className="actions">
          <BoutonPdf className="btn primary toujours" feuille={sheetRef} titre={`Ordre du jour ${nomDoc}`} paysage={s.orientation === 'paysage'} margesMm={margesMm(data.reglagesOdj?.style)} police={data.reglagesOdj?.style?.police} disabled={draft !== null} />
          <button className="btn" onClick={print}><Icone n="imprimer" /> Imprimer</button>
          {canEdit && s1 && draft === null && <button className="btn" onClick={startEdit}><Icone n="modifier" /> Modifier le texte</button>}
          <button className="btn" onClick={archive} disabled={!s1 || !canEdit || draft !== null}><Icone n="archiver" /> Archiver dans la séance</button>
          <button className="btn" onClick={() => setEnvoi(true)} disabled={draft !== null}><Icone n="email" /> Envoyer par email</button>
          <button className="btn" onClick={copy}><Icone n="copier" /> Copier le texte</button>
        </div>
      </div>
      <PageIntro />
      {msg && <p className="pv-msg no-print">{msg}</p>}

      <div className="pv-layout">
        <aside className="pv-settings no-print">
          <ProfilsOdj s={s} normaliser={withDefaults} appliquerReglages={(r) => setPrefs({ pv: r })} canEdit={canEdit} />
          <details>
            <summary>Séances</summary>
            <label>
              Séance à préparer
              <select value={s1Id} onChange={(e) => { setS1Id(e.target.value); setS2Choice('auto'); }}>
                {meetings.map((m) => <option key={m.id} value={m.id}>{m.titre} – {fmtDate(m.date)}{m.date < today() ? ' (passée)' : ''}</option>)}
              </select>
            </label>
            <label>
              Séance suivante
              <select value={s2Choice} onChange={(e) => setS2Choice(e.target.value)}>
                <option value="auto">Automatique{after[0] ? ` (${after[0].titre})` : ''}</option>
                {after.map((m) => <option key={m.id} value={m.id}>{m.titre} – {fmtDate(m.date)}</option>)}
                <option value="none">Aucune</option>
              </select>
            </label>
          </details>
          {s1 && (
            <details>
              <summary>Excusés</summary>
              <span className="field-label">Excusés {excuses.length > 0 && `(${excuses.length})`}</span>
              {canEdit ? (
                <div className="chips">
                  {committee.map((p) => (
                    <button key={p.id} type="button" className={`chip ${isExcused(p.id) ? 'on' : ''}`} onClick={() => toggleExcuse(p)} title={excuses.find((e) => e.personId === p.id)?.motif}>
                      {isExcused(p.id) && <><Icone n="absent" /> </>}{shortName(p)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">{excusesTxt || 'Personne pour l’instant.'}</p>
              )}
              <small className="muted">Chacun peut aussi s’excuser lui-même dans la liste des séances.</small>
            </details>
          )}
          <details>
            <summary>Contenu</summary>
            <span className="field-label pv-sous-titre">Dans l’ordre du jour</span>
            {([
              ['presences', 'En-tête : convoqués et présences'],
              ['retards', 'Tâches en retard'],
              ['avantProchaine', 'Tâches à faire d’ici la séance'],
              ['avantSuivante', 'Tâches à faire d’ici la séance suivante'],
              ['bilan', 'Tâches terminées depuis la dernière séance'],
              ['sondages', 'Sondages en cours et récents'],
              ['notes', 'Cadre de notes et décisions'],
              ...(nbPartagees || !s.parts.partagees ? [['partagees', `Tâches partagées par d’autres entités${nbPartagees ? ` (${nbPartagees})` : ''}`]] : []),
            ] as [keyof PvSettings['parts'], string][]).map(([k, label]) => (
              <div key={k}>
                <label className="inline"><input type="checkbox" checked={s.parts[k]} onChange={(e) => setPart(k, e.target.checked)} /> {label}</label>
                {k === 'avantSuivante' && s.parts.avantSuivante && (
                  <label className="inline odj-marge" title="Une tâche à faire juste après la séance suivante est mieux vue dès cette séance. Réglage commun à l’entité, repris par le PV.">
                    et jusqu’à
                    <select value={joursApres} disabled={!canEdit} onChange={(e) => setJoursApres(Number(e.target.value))}>
                      {[...new Set([...JOURS_APRES, joursApres])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{joursApresTexte(n)}</option>)}
                    </select>
                    après
                  </label>
                )}
              </div>
            ))}
            <span className="field-label pv-sous-titre">Sections</span>
            <label>
              Niveau de détail
              <select value={s.detail} onChange={(e) => set({ detail: e.target.value as PvSettings['detail'] })}>
                <option value="complet">Complet (sections, sous-sections, points)</option>
                <option value="sousSections">Sections et sous-sections</option>
                <option value="sections">Sections seulement</option>
              </select>
            </label>
            <label className="inline">
              <input type="checkbox" checked={s.sectionsVides} onChange={(e) => set({ sectionsVides: e.target.checked })} />
              Afficher les sections sans tâche
            </label>
            <small className="muted pv-petit-titre">Sections incluses</small>
            <div className="chips">
              {odj.sections.map((x) => (
                <button key={x.id} className={`chip ${!s.sectionsExclues.includes(x.id) ? 'on' : ''}`} onClick={() => set({ sectionsExclues: toggleIn(s.sectionsExclues, x.id) })}>{x.nom}</button>
              ))}
            </div>
            <span className="field-label pv-sous-titre">Tâches</span>
            <small className="muted pv-petit-titre">Statuts inclus</small>
            <div className="chips">
              {openStatuses.map((x) => (
                <button key={x.id} className={`chip ${!s.statutsExclus.includes(x.id) ? 'on' : ''}`} onClick={() => set({ statutsExclus: toggleIn(s.statutsExclus, x.id) })}>{x.label}</button>
              ))}
            </div>
            <label>
              Trier par
              <select value={s.tri} onChange={(e) => set({ tri: e.target.value as PvSettings['tri'] })}>
                <option value="delai">Délai</option>
                <option value="statut">Statut</option>
                <option value="titre">Nom de la tâche</option>
              </select>
            </label>
            <small className="muted pv-petit-titre">Affiché pour chaque tâche</small>
            {([
              ['sousSection', 'Sous-section'],
              ['echeance', 'Échéance (en retard, séance suivante, fait)'],
              ['statut', 'Statut'],
              ['remarque', 'Remarque'],
              ['checklist', 'Checklist'],
              ['documents', 'Noms de ses documents'],
            ] as [keyof PvSettings['colonnes'], string][]).map(([k, label]) => (
              <label key={k} className="inline"><input type="checkbox" checked={s.colonnes[k]} onChange={(e) => setCol(k, e.target.checked)} /> {label}</label>
            ))}
            <span className="field-label pv-sous-titre">Annexes</span>
            <label className="inline" title="Les fichiers et liens des tâches de l’ordre du jour : liste des annexes, puis les photos et les pages des PDF (1, 2 ou 4 par page)">
              <input type="checkbox" checked={s.annexes} onChange={(e) => set({ annexes: e.target.checked })} /> 📎 Joindre les fichiers liés en fin d’ordre du jour
              {s.annexes && <span className="muted">{annexes.length ? ` (${annexes.length})` : annexesDe(tachesOdj).length ? ' (aucun choisi)' : ' (aucun pour l’instant)'}</span>}
            </label>
            {s.annexes && (
              <label>
                Fichiers par page
                <select value={s.annexesParPage} onChange={(e) => set({ annexesParPage: Number(e.target.value) as PvSettings['annexesParPage'] })}>
                  {PAR_PAGE.map((n) => <option key={n} value={n}>{n === 1 ? '1 fichier (pleine page)' : `${n} fichiers`}</option>)}
                </select>
              </label>
            )}
            {s.annexes && s1 && (
              <ChoixAnnexes
                tasks={tachesOdj}
                exclues={exclues}
                onChange={setExclues}
                disabled={!canEdit}
                note={edite ? 'Ordre du jour modifié à la main : le choix s’appliquera en revenant à la version générée.' : 'Choix commun au comité, pour cette séance.'}
              />
            )}
          </details>
          <details>
            <summary>Mise en page</summary>
            <label className="inline"><input type="checkbox" checked={s.afficherClub} onChange={(e) => set({ afficherClub: e.target.checked })} /> Afficher l’en-tête (logo, nom du club…)</label>
            <LienEntete />
            <label>
              Orientation
              <select value={s.orientation} onChange={(e) => set({ orientation: e.target.value as PvSettings['orientation'] })}>
                <option value="portrait">Portrait</option>
                <option value="paysage">Paysage</option>
              </select>
            </label>
            <label>
              Taille du texte
              <select value={s.taille} onChange={(e) => set({ taille: e.target.value as PvSettings['taille'] })}>
                <option value="petite">Petite</option>
                <option value="normale">Normale</option>
                <option value="grande">Grande</option>
              </select>
            </label>
            {canEdit && (
              <>
                <p className="field-label pv-sous-titre">Mise en forme</p>
                <MiseEnForme />
              </>
            )}
          </details>
          <button className="btn link" onClick={() => setPrefs({ pv: DEFAULT_PV })}>Rétablir les réglages par défaut</button>
          <p className="muted small">Tes réglages sont mémorisés pour la prochaine fois.</p>
        </aside>

        <div className={`pv-preview ${draft === null && !edite ? 'odj-live' : ''}`}>
          {draft !== null ? (
            <div className="odj-edit-bar no-print">
              <span>✏️ Modifie directement le document : corriger, ajouter ou supprimer des lignes.</span>
              <span className="grow" />
              <button className="btn" onClick={() => setDraft(null)}>Annuler</button>
              <button className="btn primary" onClick={saveEdit}>Enregistrer</button>
            </div>
          ) : (
            edite && (
              <div className="odj-edit-bar no-print">
                <span>✏️ Version modifiée à la main le {fmtDateTime(edite.le)}{data.people.find((p) => p.id === edite.par) ? ` par ${fullName(data.people.find((p) => p.id === edite.par))}` : ''}. Les changements de tâches et de mise en page n’y apparaissent plus (les excusés, si).</span>
                <span className="grow" />
                {canEdit && <button className="btn" onClick={resetEdit}><Icone n="revenir" /> Revenir à la version générée</button>}
              </div>
            )
          )}
          {draft !== null ? (
            <div ref={sheetRef} className={`pv-sheet ${s.orientation} t-${s.taille} editing`} style={docStyle} contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: draft }} />
          ) : edite ? (
            <div ref={sheetRef} className={`pv-sheet ${s.orientation} t-${s.taille}`} style={docStyle} dangerouslySetInnerHTML={{ __html: htmlEdite }} />
          ) : (
            <FeuilleOdj c={ctx} s={s} o={contenu} style={data.reglagesOdj?.style} feuilleRef={sheetRef} onOuvrir={setOuverte} />
          )}
        </div>
      </div>
      {envoi && (
        <EnvoiOdj
          c={ctx}
          s={s}
          joursApres={joursApres}
          nomDoc={nomDoc}
          edite={edite ? { texte: texteEdite(), feuille: sheetRef } : undefined}
          canEdit={canEdit}
          onClose={() => setEnvoi(false)}
        />
      )}
      {ouverte && <TaskModal task={data.tasks.find((x) => x.id === ouverte.id) ?? ouverte} isNew={false} onClose={() => setOuverte(null)} />}
    </div>
  );
}
