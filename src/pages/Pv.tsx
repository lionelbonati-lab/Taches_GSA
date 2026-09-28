import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { hasPermission, userRoles } from '../data/permissions';
import type { Meeting, Person, PvSettings, Section, Task } from '../data/types';
import { fmtDate, fullName, initials, isLate, shortName, today, uid } from '../data/utils';
import { isOpen, pollSection, pollSummary } from '../data/polls';
import { selectAgenda } from '../data/agenda';
import type { Poll } from '../data/types';

// Onglet « Ordre du jour » : document imprimable préparant la prochaine séance de comité
// (et la suivante), sur le modèle des ordres du jour du club : en-tête, convoqués, tâches par section.
// (Identifiants internes « pv » conservés pour les données déjà enregistrées.)

export const DEFAULT_PV: PvSettings = {
  presentation: 'liste',
  detail: 'complet',
  titre: '',
  club: 'G.S. Ajoie – Comité',
  afficherClub: true,
  parts: { ordreDuJour: true, presences: true, retards: true, avantProchaine: true, avantSuivante: true, bilan: true, sondages: true, notes: true },
  groupBy: 'section',
  tri: 'delai',
  separerParEcheance: false,
  sectionsVides: true,
  colonnes: { sousSection: true, echeance: true, statut: true, remarque: true, checklist: true, documents: true, suivi: true },
  statutsExclus: [],
  sectionsExclues: [],
  orientation: 'portrait',
  taille: 'normale',
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

interface Part {
  key: string;
  titre: string;
  tasks: Task[];
  bilan?: boolean;
}

export function Pv() {
  const { data, user, prefs, setPrefs, update, can } = useStore();
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

  const secName = (id: string) => data.sections.find((x) => x.id === id)?.nom ?? '';
  const person = (id: string) => data.people.find((p) => p.id === id);
  const committee: Person[] = data.people.filter((p) => p.actif && hasPermission(userRoles(data.roles, p), 'tab.meetings'));

  // ---------- Sélection des tâches (partagée avec l'onglet PV) ----------
  const { late, avant1, avant2, bilan, since } = selectAgenda(data, s0, s1, s2, {
    retards: s.parts.retards,
    avantProchaine: s.parts.avantProchaine,
    avantSuivante: s.parts.avantSuivante,
    bilan: s.parts.bilan,
    statutsExclus: s.statutsExclus,
    sectionsExclues: s.sectionsExclues,
  });

  const parts: Part[] = [
    ...(late.length ? [{ key: 'late', titre: `⚠ Tâches en retard`, tasks: late }] : []),
    ...(s1 && s.parts.avantProchaine ? [{ key: 'p1', titre: `À faire d’ici le ${s1.titre} (${fmtDate(s1.date)})`, tasks: avant1 }] : []),
    ...(s2 && s.parts.avantSuivante ? [{ key: 'p2', titre: `À faire d’ici le ${s2.titre} (${fmtDate(s2.date)})`, tasks: avant2 }] : []),
    ...(s.parts.bilan ? [{ key: 'bilan', titre: `✓ Terminées depuis ${s0 ? `le ${s0.titre} (${fmtDate(s0.date)})` : '60 jours'}`, tasks: bilan, bilan: true }] : []),
  ];

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
  // Ordre dans un groupe : sous-sections (comme l'ordre du jour), puis retards → séance → suivante → terminées, puis tri choisi.
  const order = (list: Task[], sec?: Section) => {
    let r = sortTasks(list);
    if (!s.separerParEcheance) r = r.sort((a, b) => rank(a) - rank(b));
    if (sec) r = r.sort((a, b) => sec.sousSections.indexOf(a.sousSection) - sec.sousSections.indexOf(b.sousSection));
    return r;
  };

  const group = (list: Task[], keepEmpty = false): Group[] => {
    if (s.groupBy === 'aucun') return [{ key: 'all', label: '', tasks: order(list) }];
    if (s.groupBy === 'section')
      return data.sections
        .filter((sec) => !s.sectionsExclues.includes(sec.id))
        .map((sec) => ({ key: sec.id, label: sec.nom, tasks: order(list.filter((t) => t.sectionId === sec.id), sec) }))
        .filter((g) => g.tasks.length || keepEmpty);
    const groups: Group[] = data.people
      .map((p) => ({ key: p.id, label: `${fullName(p)} – ${p.poste}`, tasks: order(list.filter((t) => t.responsables.includes(p.id))) }))
      .filter((g) => g.tasks.length);
    const none = list.filter((t) => t.responsables.length === 0);
    return none.length ? [...groups, { key: 'none', label: 'Sans responsable', tasks: order(none) }] : groups;
  };
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
  const unifiedGroups = group(unified, true).filter(
    (g) => g.tasks.length || s.sectionsVides || (s.groupBy === 'section' && polls.some((p) => pollSection(data, p) === g.key)),
  );

  const pourLabel = (t: Task) => {
    const b = bucketOf.get(t.id);
    return b === 'late' ? '⚠ Retard' : b === 'bilan' ? '✓ Fait' : b === 'p2' ? s2?.titre ?? '' : s1?.titre ?? '';
  };
  const pollBlock = (list: Poll[]) =>
    list.length > 0 && (
      <div className="pv-polls">
        {list.map((p) => (
          <p key={p.id}><b>📊 {p.question}</b> — {pollSummary(p)}</p>
        ))}
      </div>
    );

  const summary = [
    s.parts.retards && `${late.length} en retard`,
    s1 && s.parts.avantProchaine && `${avant1.length} pour le ${s1.titre}`,
    s2 && s.parts.avantSuivante && `${avant2.length} pour le ${s2.titre}`,
    s.parts.bilan && `${bilan.length} terminée${bilan.length > 1 ? 's' : ''} depuis ${s0 ? `le ${s0.titre}` : '60 jours'}`,
    s.parts.sondages && polls.length > 0 && `${polls.length} sondage${polls.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');

  const titre = s.titre.trim() || (s1 ? `Comité ${shortDate(s1.date)}` : 'Comité');
  // Nom proposé à l'enregistrement en PDF (le navigateur reprend le titre de la page).
  useEffect(() => {
    const before = document.title;
    document.title = `Ordre du jour ${titre}`;
    return () => {
      document.title = before;
    };
  }, [titre]);
  const respText = (t: Task) => t.responsables.map((id) => initials(person(id))).join(', ') || '—';

  // ---------- Actions ----------
  const print = () => window.print();

  const archive = () => {
    if (!s1 || !sheetRef.current || !user) return;
    const html = sheetRef.current.outerHTML;
    update((d) => {
      const m = d.meetings.find((x) => x.id === s1.id)!;
      m.pvArchives = [{ id: uid('pv'), at: new Date().toISOString(), by: user.id, titre, html, orientation: s.orientation }, ...(m.pvArchives ?? [])].slice(0, 10);
    }, `Ordre du jour « ${titre} » archivé dans la séance ${s1.titre}`);
    setMsg(`📁 Archivé dans « ${s1.titre} » (onglet Comité).`);
  };

  const plainText = () => {
    if (s.presentation === 'liste') {
      const out: string[] = [titre];
      if (s1 && heure(s1)) out.push(`Début de séance : ${heure(s1)}`);
      if (s1) out.push(`Lieu : ${s1.lieu || 'à définir'}`);
      if (s.parts.presences) out.push(`Convoqués : ${committee.map((p) => `${fullName(p)} (${initials(p)})`).join(', ')}`, 'Excusés : ');
      out.push('', 'Ordre du jour');
      if (!s.separerParEcheance) out.push(...outlineText(listSecs));
      else {
        for (const part of parts) out.push('', part.titre, ...outlineText(buildOutline(group(part.tasks), false)));
        const extra = extraSections(true).map((x) => (x.key === 'polls' ? { ...x, items: polls.map(pollItem) } : x));
        if (extra.length) out.push('', 'Autres points', ...outlineText(extra));
      }
      if (s2) out.push('', `Prochaine séance : ${s2.titre}, ${longDate(s2.date)}${heure(s2) ? ` à ${heure(s2)}` : ''} – ${s2.lieu || 'lieu à définir'}`);
      return out.join('\n');
    }
    const lines: string[] = [`ORDRE DU JOUR – ${titre.toUpperCase()}`];
    if (s1) lines.push(`${longDate(s1.date)}${heure(s1) ? `, ${heure(s1)}` : ''} – ${s1.lieu}`);
    if (s1?.ordreDuJour && s.parts.ordreDuJour) lines.push('', 'POINTS PARTICULIERS', s1.ordreDuJour);
    const line = (t: Task, pour = false) =>
      `  - ${pour ? `[${pourLabel(t)}] ` : ''}${t.sousSection ? `${t.sousSection} : ` : ''}${t.titre} [${respText(t)}]${t.delai ? ` – ${fmtDate(t.delai)}` : ''}${t.remarque ? ` (${t.remarque})` : ''}`;
    if (!s.separerParEcheance) {
      lines.push('', 'SUIVI DES TÂCHES PAR SECTION', summary);
      for (const g of unifiedGroups) {
        lines.push('', g.label.toUpperCase());
        const gp = s.groupBy === 'section' ? pollsOf(g.key) : [];
        if (!g.tasks.length && !gp.length) lines.push('  (rien à signaler)');
        g.tasks.forEach((t) => lines.push(line(t, true)));
        gp.forEach((p) => lines.push(`  📊 ${p.question} — ${pollSummary(p)}`));
      }
      const rest = s.groupBy === 'section' ? pollsWithoutSection : polls;
      if (rest.length) {
        lines.push('', 'SONDAGES');
        rest.forEach((p) => lines.push(`  📊 ${p.question} — ${pollSummary(p)}`));
      }
    } else
      for (const part of parts) {
        lines.push('', part.titre.toUpperCase() + ` (${part.tasks.length})`);
        for (const g of group(part.tasks)) {
          if (g.label) lines.push(`${g.label}`);
          g.tasks.forEach((t) => lines.push(line(t)));
        }
      }
    if (s.separerParEcheance && polls.length) {
      lines.push('', 'SONDAGES');
      polls.forEach((p) => lines.push(`  📊 ${p.question} — ${pollSummary(p)}`));
    }
    if (s2) lines.push('', `Prochaine séance : ${s2.titre}, ${longDate(s2.date)}${heure(s2) ? ` à ${heure(s2)}` : ''} – ${s2.lieu}`);
    return lines.join('\n');
  };

  const email = () => {
    const to = committee.map((p) => p.email).filter(Boolean).join(',');
    let body = plainText();
    if (body.length > 1800) body = body.slice(0, 1800) + '\n…\n(liste complète dans l’ordre du jour imprimé)';
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(`${titre} – ordre du jour`)}&body=${encodeURIComponent(body)}`;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText());
      setMsg('📋 Texte copié : colle-le dans un email, WhatsApp ou Word.');
    } catch {
      setMsg('Copie impossible dans ce navigateur.');
    }
  };

  const cols = [
    s.groupBy !== 'section' && { k: 'sec', label: 'Section' },
    s.colonnes.sousSection && { k: 'sous', label: 'Sous-section' },
    { k: 'titre', label: 'Tâche' },
    s.groupBy !== 'responsable' && { k: 'resp', label: 'Resp.' },
    { k: 'delai', label: 'Délai' },
    !s.separerParEcheance && s.colonnes.echeance && { k: 'pour', label: 'Pour' },
    s.colonnes.statut && { k: 'statut', label: 'Statut' },
    s.colonnes.remarque && { k: 'rem', label: 'Remarque' },
    s.colonnes.suivi && { k: 'suivi', label: 'Suivi / décision' },
  ].filter(Boolean) as { k: string; label: string }[];

  const cell = (t: Task, k: string) => {
    const st = data.statuses.find((x) => x.id === t.statusId);
    const bilanPart = bucketOf.get(t.id) === 'bilan';
    switch (k) {
      case 'sec': return secName(t.sectionId);
      case 'sous': return t.sousSection;
      case 'titre':
        return (
          <>
            {t.titre}
            {s.colonnes.checklist && t.checklist.length > 0 && (
              <span className="pv-checklist">{t.checklist.map((c) => `${c.done ? '☑' : '☐'} ${c.label}`).join('   ')}</span>
            )}
            {s.colonnes.documents && (t.documents?.length ?? 0) > 0 && (
              <span className="pv-docs">📎 {t.documents!.map((d) => d.nom).join(', ')}</span>
            )}
          </>
        );
      case 'resp': return respText(t);
      case 'pour': return pourLabel(t);
      case 'delai': return bilanPart ? `✓ ${fmtDate(t.termineeLe)}` : t.delai ? fmtDate(t.delai) + (isLate(data, t) ? ' ⚠' : '') : 'libre';
      case 'statut': return st?.label ?? '';
      case 'rem': return t.remarque;
      case 'suivi': return '';
    }
  };

  const table = (tasks: Task[], bilanHeader = false) => (
    <table className="pv-table">
      <thead><tr>{cols.map((c) => <th key={c.k} className={`c-${c.k}`}>{c.k === 'delai' && bilanHeader ? 'Terminée' : c.label}</th>)}</tr></thead>
      <tbody>
        {tasks.map((t) => {
          const b = bucketOf.get(t.id);
          return (
            <tr key={t.id} className={b === 'late' ? 'pv-late' : b === 'bilan' ? 'pv-done' : ''}>
              {cols.map((c) => <td key={c.k} className={`c-${c.k}`}>{cell(t, c.k)}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ---------- Présentation en liste numérotée (1. section / a. sous-section / ■ point) ----------
  interface OItem {
    key: string;
    task?: Task;
    poll?: Poll;
    text?: string;
    children: OItem[];
  }
  interface OSec {
    key: string;
    label: string;
    items: OItem[];
  }
  const firstOpen = data.statuses.find((x) => !x.done)?.id;
  const pollItem = (p: Poll): OItem => ({ key: p.id, poll: p, children: [] });
  const textItem = (key: string, text: string): OItem => ({ key, text, children: [] });
  // Sous-points d'une tâche : checklist, documents, sondages liés.
  const taskItem = (t: Task, withPolls: boolean): OItem => ({
    key: t.id,
    task: t,
    children: [
      ...(s.colonnes.checklist ? t.checklist.map((c) => textItem(c.id, `${c.done ? '☑' : '☐'} ${c.label}`)) : []),
      ...(s.colonnes.documents && t.documents?.length ? [textItem(`${t.id}-docs`, `📎 ${t.documents.map((d) => d.nom).join(', ')}`)] : []),
      ...(withPolls ? polls.filter((p) => p.taskId === t.id).map(pollItem) : []),
    ],
  });
  const buildOutline = (groups: Group[], withPolls: boolean): OSec[] =>
    groups.map((g) => {
      const items: OItem[] = [];
      const bySub = new Map<string, OItem>();
      for (const t of g.tasks) {
        const sub = s.groupBy === 'section' ? (s.colonnes.sousSection ? t.sousSection : '') : secName(t.sectionId);
        if (!sub) {
          items.push(taskItem(t, withPolls));
          continue;
        }
        let head = bySub.get(sub);
        if (!head) {
          head = textItem(`${g.key}:${sub}`, sub);
          bySub.set(sub, head);
          items.push(head);
        }
        head.children.push(taskItem(t, withPolls));
      }
      if (withPolls && s.groupBy === 'section')
        pollsOf(g.key).filter((p) => !g.tasks.some((t) => t.id === p.taskId)).forEach((p) => items.push(pollItem(p)));
      return { key: g.key, label: g.label, items };
    });
  const extraSections = (withPolls: boolean): OSec[] => [
    ...(withPolls && (s.groupBy === 'section' ? pollsWithoutSection : polls).length
      ? [{ key: 'polls', label: 'Sondages', items: (s.groupBy === 'section' ? pollsWithoutSection : polls).map(pollItem) }]
      : []),
    ...(s.parts.ordreDuJour && s1?.ordreDuJour?.trim()
      ? [{ key: 'points', label: 'Points particuliers', items: s1.ordreDuJour.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => textItem(`pt${i}`, l)) }]
      : []),
  ];

  const letter = (i: number) => {
    let r = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) r = String.fromCharCode(97 + ((n - 1) % 26)) + r;
    return r;
  };
  const taskMeta = (t: Task) => {
    const b = bucketOf.get(t.id);
    const st = data.statuses.find((x) => x.id === t.statusId);
    return [
      respText(t) !== '—' && respText(t),
      b !== 'bilan' && t.delai && shortDate(t.delai),
      s.colonnes.echeance && (b === 'late' ? '⚠ en retard' : b === 'p2' && s2 ? `pour le ${s2.titre}` : b === 'bilan' ? `✓ fait${t.termineeLe ? ` le ${shortDate(t.termineeLe)}` : ''}` : ''),
      s.colonnes.statut && b !== 'bilan' && t.statusId !== firstOpen && st?.label,
    ].filter(Boolean) as string[];
  };
  const itemText = (it: OItem) =>
    it.task
      ? `${it.task.titre}${taskMeta(it.task).length ? ` (${taskMeta(it.task).join(' · ')})` : ''}${s.colonnes.remarque && it.task.remarque ? ` – ${it.task.remarque}` : ''}`
      : it.poll
        ? `📊 Sondage : ${it.poll.question} — ${pollSummary(it.poll)}`
        : it.text ?? '';
  const itemNode = (it: OItem): ReactNode => {
    if (!it.task) return it.poll ? <span className="odj-poll">{itemText(it)}</span> : it.text;
    const t = it.task;
    const b = bucketOf.get(t.id);
    const meta = taskMeta(t);
    return (
      <span className={`odj-task ${b === 'late' ? 'late' : b === 'bilan' ? 'done' : ''}`}>
        {t.titre}
        {meta.length > 0 && <span className="odj-meta"> ({meta.join(' · ')})</span>}
        {s.colonnes.remarque && t.remarque && <span className="odj-rem"> – {t.remarque}</span>}
      </span>
    );
  };
  // Niveaux : 1. section · a. point · ■ sous-point · ◦ détail
  // Niveau de détail : sections seulement (0), + sous-sections (1), complet.
  const maxDepth = s.detail === 'sections' ? -1 : s.detail === 'sousSections' ? 0 : 9;
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
    ) : secs.every((x) => !x.label) ? (
      <ol className="odj">{secs.flatMap((x) => x.items).map((it) => <li key={it.key}>{itemNode(it)}{maxDepth >= 1 && renderItems(it.children, 1)}</li>)}</ol>
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
  const outlineText = (secs: OSec[]) => {
    const out: string[] = [];
    const walk = (items: OItem[], depth: number) =>
      depth <= maxDepth &&
      items.forEach((it, j) => {
        const pad = '   '.repeat(depth + 1);
        out.push(`${pad}${depth === 0 ? `${letter(j)}.` : depth === 1 ? '■' : '◦'} ${itemText(it)}`);
        walk(it.children, depth + 1);
      });
    secs.forEach((sec, i) => {
      out.push(`${i + 1}. ${sec.label}`);
      walk(sec.items, 0);
    });
    return out;
  };
  const listSecs = !s.separerParEcheance ? [...buildOutline(unifiedGroups, true), ...extraSections(true)] : [];

  const openStatuses = data.statuses.filter((x) => !x.done);
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="pv-page">
      <style>{`@page { size: A4 ${s.orientation === 'paysage' ? 'landscape' : 'portrait'}; margin: 12mm; @bottom-right { content: counter(page) " / " counter(pages); font-size: 9pt; color: #666; } }`}</style>
      <div className="page-head no-print">
        <h1>Ordre du jour</h1>
        <div className="actions">
          <button className="btn primary" onClick={print}>🖨 Imprimer / PDF</button>
          <button className="btn" onClick={archive} disabled={!s1 || !can('tab.pv')}>📁 Archiver dans la séance</button>
          <button className="btn" onClick={email}>✉ Envoyer par email</button>
          <button className="btn" onClick={copy}>📋 Copier le texte</button>
        </div>
      </div>
      {msg && <p className="pv-msg no-print">{msg}</p>}

      <div className="pv-layout">
        <aside className="pv-settings no-print">
          <details open>
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
          <details open>
            <summary>Contenu</summary>
            {([
              ['presences', 'En-tête : convoqués et présences'],
              ['ordreDuJour', 'Points particuliers saisis dans la séance'],
              ['retards', 'Tâches en retard'],
              ['avantProchaine', 'Tâches à faire d’ici la séance'],
              ['avantSuivante', 'Tâches à faire d’ici la séance suivante'],
              ['bilan', 'Tâches terminées depuis la dernière séance'],
              ['sondages', 'Sondages en cours et récents'],
              ['notes', 'Cadre de notes et décisions'],
            ] as [keyof PvSettings['parts'], string][]).map(([k, label]) => (
              <label key={k} className="inline"><input type="checkbox" checked={s.parts[k]} onChange={(e) => setPart(k, e.target.checked)} /> {label}</label>
            ))}
          </details>
          <details open>
            <summary>Présentation</summary>
            <label>
              Mise en forme
              <select value={s.presentation} onChange={(e) => set({ presentation: e.target.value as PvSettings['presentation'] })}>
                <option value="liste">Liste numérotée (1. / a. / ■)</option>
                <option value="tableaux">Tableaux</option>
              </select>
            </label>
            {s.presentation === 'liste' && (
              <label>
                Niveau de détail
                <select value={s.detail} onChange={(e) => set({ detail: e.target.value as PvSettings['detail'] })}>
                  <option value="complet">Complet (sections, sous-sections, points)</option>
                  <option value="sousSections">Sections et sous-sections</option>
                  <option value="sections">Sections seulement</option>
                </select>
              </label>
            )}
          </details>
          <details open>
            <summary>Regroupement et tri</summary>
            <label>
              Regrouper par
              <select value={s.groupBy} onChange={(e) => set({ groupBy: e.target.value as PvSettings['groupBy'] })}>
                <option value="section">Section (comme l’ordre du jour)</option>
                <option value="responsable">Responsable</option>
                <option value="aucun">Pas de regroupement</option>
              </select>
            </label>
            <label className="inline">
              <input type="checkbox" checked={s.separerParEcheance} onChange={(e) => set({ separerParEcheance: e.target.checked })} />
              Séparer par échéance (retards, séance, suivante, terminées en parties distinctes)
            </label>
            {!s.separerParEcheance && s.groupBy === 'section' && (
              <label className="inline">
                <input type="checkbox" checked={s.sectionsVides} onChange={(e) => set({ sectionsVides: e.target.checked })} />
                Afficher les sections sans tâche
              </label>
            )}
            <label>
              Trier par
              <select value={s.tri} onChange={(e) => set({ tri: e.target.value as PvSettings['tri'] })}>
                <option value="delai">Délai</option>
                <option value="statut">Statut</option>
                <option value="titre">Nom de la tâche</option>
              </select>
            </label>
          </details>
          <details>
            <summary>Détails affichés</summary>
            {([
              ['sousSection', 'Sous-section'],
              ['echeance', 'Échéance : en retard, séance suivante, fait'],
              ['statut', 'Statut'],
              ['remarque', 'Remarque'],
              ['checklist', 'Checklist sous la tâche'],
              ['documents', 'Documents joints sous la tâche'],
              ...(s.presentation === 'tableaux' ? [['suivi', 'Colonne vide « Suivi / décision »']] : []),
            ] as [keyof PvSettings['colonnes'], string][]).map(([k, label]) => (
              <label key={k} className="inline"><input type="checkbox" checked={s.colonnes[k]} onChange={(e) => setCol(k, e.target.checked)} /> {label}</label>
            ))}
          </details>
          <details>
            <summary>Filtres</summary>
            <small className="muted">Statuts inclus</small>
            <div className="chips">
              {openStatuses.map((x) => (
                <button key={x.id} className={`chip ${!s.statutsExclus.includes(x.id) ? 'on' : ''}`} onClick={() => set({ statutsExclus: toggleIn(s.statutsExclus, x.id) })}>{x.label}</button>
              ))}
            </div>
            <small className="muted">Sections incluses</small>
            <div className="chips">
              {data.sections.map((x) => (
                <button key={x.id} className={`chip ${!s.sectionsExclues.includes(x.id) ? 'on' : ''}`} onClick={() => set({ sectionsExclues: toggleIn(s.sectionsExclues, x.id) })}>{x.nom}</button>
              ))}
            </div>
          </details>
          <details>
            <summary>Mise en page</summary>
            <label>
              Titre
              <input value={s.titre} placeholder={s1 ? `Comité ${shortDate(s1.date)}` : 'Comité'} onChange={(e) => set({ titre: e.target.value })} />
            </label>
            <label>
              Nom du club
              <input value={s.club} onChange={(e) => set({ club: e.target.value })} />
            </label>
            <label className="inline"><input type="checkbox" checked={s.afficherClub} onChange={(e) => set({ afficherClub: e.target.checked })} /> Afficher le logo et le nom du club</label>
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
          </details>
          <button className="btn link" onClick={() => setPrefs({ pv: DEFAULT_PV })}>Rétablir les réglages par défaut</button>
          <p className="muted small">Tes réglages sont mémorisés pour la prochaine fois.</p>
        </aside>

        <div className="pv-preview">
          <div ref={sheetRef} className={`pv-sheet ${s.orientation} t-${s.taille}`}>
            <header className="pv-head">
              {s.afficherClub && <div className="pv-club"><img src="./icon.svg" alt="" width={22} height={22} /> {s.club}</div>}
              {s.presentation === 'tableaux' && <p className="pv-kicker">Ordre du jour</p>}
              <h1>{titre}</h1>
              {s1 && (
                <p className="pv-meta">
                  {longDate(s1.date)}
                  {s.presentation === 'tableaux' && (
                    <>
                      {heure(s1) && <> · Début de séance : <b>{heure(s1)}</b></>}
                      {' '}· Lieu : <b>{s1.lieu || 'à définir'}</b>
                    </>
                  )}
                </p>
              )}
            </header>

            {s.presentation === 'liste' && (
              <section className="odj-head">
                {s1 && heure(s1) && <p><b>Début de séance :</b> {heure(s1)}</p>}
                {s1 && <p><b>Lieu :</b> {s1.lieu || 'à définir'}</p>}
                {s.parts.presences && (
                  <>
                    <p><b>Convoqués :</b> {committee.map((p) => `${fullName(p)} (${initials(p)})`).join(', ')}</p>
                    <p className="odj-fill-line"><b>Excusés :</b> <span className="odj-fill" /></p>
                  </>
                )}
              </section>
            )}

            {s.presentation === 'tableaux' && s.parts.presences && (
              <section>
                <p className="pv-convoques"><b>Convoqués :</b> {committee.map((p) => `${fullName(p)} (${initials(p)})`).join(', ')}</p>
                <table className="pv-table pv-presence">
                  <thead><tr><th>Membre</th><th>Fonction</th><th>Présent</th><th>Excusé</th></tr></thead>
                  <tbody>
                    {committee.map((p) => (
                      <tr key={p.id}><td>{shortName(p)} ({initials(p)})</td><td>{p.poste}</td><td className="pv-box">☐</td><td className="pv-box">☐</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {s.presentation === 'tableaux' && s.parts.ordreDuJour && s1?.ordreDuJour && (
              <section>
                <h2>Points particuliers</h2>
                <pre className="pv-odj">{s1.ordreDuJour}</pre>
              </section>
            )}

            {s.presentation === 'liste' ? (
              !s.separerParEcheance ? (
                <section className="pv-part">
                  <h2>Ordre du jour</h2>
                  {renderOutline(listSecs)}
                </section>
              ) : (
                <>
                  {parts.map((part) => (
                    <section key={part.key} className="pv-part">
                      <h2>{part.titre} <span className="pv-count">{part.tasks.length}</span></h2>
                      {part.tasks.length === 0 ? <p className="pv-empty">Aucune tâche.</p> : renderOutline(buildOutline(group(part.tasks), false))}
                    </section>
                  ))}
                  {(polls.length > 0 || (s.parts.ordreDuJour && s1?.ordreDuJour?.trim())) && (
                    <section className="pv-part">
                      <h2>Autres points</h2>
                      {renderOutline(extraSections(true).map((x) => (x.key === 'polls' ? { ...x, items: polls.map(pollItem) } : x)))}
                    </section>
                  )}
                </>
              )
            ) : !s.separerParEcheance ? (
              <section className="pv-part">
                <h2>Suivi des tâches par {s.groupBy === 'responsable' ? 'responsable' : 'section'} <span className="pv-count">{unified.length}</span></h2>
                {summary && <p className="pv-summary">{summary}</p>}
                {unifiedGroups.length === 0 ? (
                  <p className="pv-empty">Aucune tâche.</p>
                ) : (
                  unifiedGroups.map((g) => {
                    const gp = s.groupBy === 'section' ? pollsOf(g.key) : [];
                    return (
                      <div key={g.key} className="pv-group">
                        {g.label && <h3>{g.label}</h3>}
                        {g.tasks.length ? table(g.tasks) : !gp.length && <p className="pv-empty">Rien à signaler.</p>}
                        {pollBlock(gp)}
                      </div>
                    );
                  })
                )}
                {(s.groupBy === 'section' ? pollsWithoutSection : polls).length > 0 && (
                  <div className="pv-group">
                    <h3>Sondages</h3>
                    {pollBlock(s.groupBy === 'section' ? pollsWithoutSection : polls)}
                  </div>
                )}
              </section>
            ) : (
              parts.map((part) => (
                <section key={part.key} className="pv-part">
                  <h2>{part.titre} <span className="pv-count">{part.tasks.length}</span></h2>
                  {part.tasks.length === 0 ? (
                    <p className="pv-empty">Aucune tâche.</p>
                  ) : (
                    group(part.tasks).map((g) => (
                      <div key={g.key} className="pv-group">
                        {g.label && <h3>{g.label}</h3>}
                        {table(g.tasks, part.bilan)}
                      </div>
                    ))
                  )}
                </section>
              ))
            )}
            {s.presentation === 'tableaux' && s.separerParEcheance && polls.length > 0 && (
              <section className="pv-part">
                <h2>📊 Sondages <span className="pv-count">{polls.length}</span></h2>
                {pollBlock(polls)}
              </section>
            )}

            {s.parts.notes && (
              <section className="pv-part">
                <h2>Notes et décisions</h2>
                <div className="pv-lines" />
              </section>
            )}

            {s2 && (
              <p className="pv-next">
                <b>Prochaine séance :</b> {s2.titre}, {longDate(s2.date)}{heure(s2) && ` à ${heure(s2)}`} – Lieu : {s2.lieu || 'à définir'}
              </p>
            )}
            <footer className="pv-foot">Document généré le {fmtDate(today())} par {fullName(user ?? undefined)} · Tâches GSA</footer>
          </div>
        </div>
      </div>
    </div>
  );
}
