import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { FULL_AGENDA, echeanceSuivante, meetingContext, selectAgenda, sortedMeetings } from '../data/agenda';
import { committeeOf, isOpen, pollSection, pollSummary } from '../data/polls';
import { EMPTY_MINUTES, diffTask, shortDate, stateOf } from '../data/minutes';
import type { MeetingMinutes, Poll, PvOptions, Task, TaskSnapshot } from '../data/types';
import { fmtDate, fmtDateTime, fullName, initials, isDone, today, uid } from '../data/utils';
import { NoteField } from '../components/NoteField';
import { TaskModal, newTask } from '../components/TaskModal';
import { finAnticipee, versProchaineSeance } from '../data/seances';
import { nomAppli } from '../data/nomAppli';
import { archiveHtml } from '../data/entete';
import { DocEntete, LienEntete, useEntete, useUnitLogo } from '../components/Entete';
import { PageIntro } from '../components/Nav';
import { ChoixAnnexes, DocsTache, ListeAnnexes, PAR_PAGE, PagesAnnexes, annexeInfo, annexesDe, docsTexte, numerosDe, useOuvrirDocs } from '../components/Annexes';
import { useClubOptional } from '../data/club';
import { MiseEnForme } from '../components/MiseEnForme';
import { margesMm, styleVars } from '../data/styleDocs';
import { BoutonPdf, pdfDeFeuille, usePiedImprime } from '../components/BoutonPdf';
import { AvecLiens } from '../components/Liens';
import { Icone } from '../components/icones';

// Onglet « PV » (secrétaire) : reprend l'ordre du jour de la séance, prise de notes sous chaque point,
// mise à jour des tâches (enregistrée dans le PV), génération / validation / envoi du procès-verbal,
// correction après coup avec versions successives.

const longDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const nowHM = () => new Date().toTimeString().slice(0, 5);
const hm = (h?: string) => (h ? h.replace(':', 'h') : '');
/** Options du PV par défaut. */
const OPTIONS: Required<PvOptions> = { details: true, misesAJour: true, documents: true, annexes: false, annexesParPage: 1, taille: 'normale' };

/** Adresse de la page de dépôt du PV : http(s) seulement (« www… » complété en https), sinon null. */
const urlDepot = (s?: string): string | null => {
  let u = s?.trim().replace(/\s/g, '%20') ?? '';
  if (!u || u.length > 2000) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u);
    return (x.protocol === 'https:' || x.protocol === 'http:') && x.hostname.includes('.') ? x.href : null;
  } catch {
    return null;
  }
};
const hote = (u: string) => new URL(u).hostname.replace(/^www\./, '');

const letter = (i: number) => {
  let r = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) r = String.fromCharCode(97 + ((n - 1) % 26)) + r;
  return r;
};

export function Minutes() {
  const { data, user, can, canEditTask, saveTask, update, updateSilent } = useStore();
  const club = useClubOptional();
  useOuvrirDocs();
  const [params] = useSearchParams();
  const meetings = useMemo(() => sortedMeetings(data), [data]);
  // Séance par défaut : celle du jour, sinon la prochaine, sinon la dernière.
  const [meetingId, setMeetingId] = useState(
    () =>
      params.get('seance') ??
      meetings.find((m) => m.date === today())?.id ??
      meetings.find((m) => m.date >= today())?.id ??
      meetings[meetings.length - 1]?.id ??
      '',
  );
  const [view, setView] = useState<'saisie' | 'pv'>('saisie');
  const [edit, setEdit] = useState<{ task: Task; isNew: boolean } | null>(null);
  // Tâche ouverte depuis le PV : on compare avant / après pour l'inscrire au PV.
  const [pending, setPending] = useState<{ id: string; before?: TaskSnapshot; isNew: boolean } | null>(null);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  // Après « Valider et archiver » : page de dépôt ouverte (ou bloquée par le navigateur) et PDF en cours, créé ou raté.
  const [depotEtat, setDepotEtat] = useState<{ seance: string; ouverte: boolean; pdf: 'encours' | 'ok' | 'erreur' } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  usePiedImprime(sheetRef);
  // En-tête commun à tous les documents de l'entité (console admin).
  const logo = useUnitLogo();
  const entete = useEntete();

  const s1 = meetings.find((m) => m.id === meetingId);
  const { s0, s2 } = meetingContext(data, s1);
  // Excuses annoncées avant la séance : reprises dans les présences tant que le PV n'est pas validé.
  const withExcuses = (mm: MeetingMinutes, pre: { personId: string }[] = []): MeetingMinutes =>
    mm.valideLe && !mm.enCorrection ? mm : { ...mm, excuses: [...new Set([...mm.excuses, ...pre.map((e) => e.personId).filter((id) => !mm.presents.includes(id))])] };
  const m: MeetingMinutes = withExcuses({ ...EMPTY_MINUTES, ...s1?.minutes }, s1?.excuses);
  const committee = committeeOf(data);
  const person = (id: string) => data.people.find((p) => p.id === id);
  // Titre : le nom du comité (comme l'ordre du jour) ; avec la date de la séance pour nommer le PDF, l'archive et l'email.
  const nomComite = club?.current.nom ?? 'Comité';
  const titre = s1 ? `${nomComite} ${shortDate(s1.date)}` : nomComite;
  const secretaire = data.people.find((p) => p.actif && p.roles.includes('secretaire'));
  const version = m.version ?? 0;
  const locked = !!m.valideLe && !m.enCorrection; // PV validé : lecture seule jusqu'à « Corriger »
  const editable = can('tab.minutes') && !locked;
  const draftVersion = m.enCorrection ? version + 1 : version || 1;
  // Options du PV de la séance ; non réglées : celles du PV précédent.
  const opts: Required<PvOptions> = { ...OPTIONS, ...s0?.minutes?.options, ...m.options };
  const depot = urlDepot(data.reglagesOdj?.depotPv);
  const setOpt = (patch: PvOptions) => setMinutes((x) => { x.options = { ...opts, ...patch }; });

  useEffect(() => {
    if (view !== 'pv') return;
    const before = document.title;
    document.title = `PV ${titre}${draftVersion > 1 ? ` v${draftVersion}` : ''}`;
    return () => {
      document.title = before;
    };
  }, [view, titre, draftVersion]);

  const setMinutes = (fn: (x: MeetingMinutes) => void) =>
    s1 &&
    updateSilent((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      const mm: MeetingMinutes = structuredClone(withExcuses({ ...EMPTY_MINUTES, ...x.minutes }, x.excuses));
      fn(mm);
      x.minutes = mm;
      // Excusé retiré (ou finalement présent) dans le PV : l'excuse annoncée tombe aussi.
      if (x.excuses) x.excuses = x.excuses.filter((e) => mm.excuses.includes(e.personId));
    });
  const setNote = (key: string, v: string) =>
    setMinutes((x) => {
      if (v.trim()) x.notes[key] = v;
      else delete x.notes[key];
    });
  const record = (t: Task, changes: string[]) =>
    changes.length &&
    setMinutes((x) => {
      x.journal = [...(x.journal ?? []), { taskId: t.id, titre: t.titre, changes, at: new Date().toISOString() }];
    });

  // Modifications faites dans la fiche tâche ouverte depuis le PV : enregistrées une fois la tâche sauvegardée.
  useEffect(() => {
    if (!pending || edit) return;
    const t = data.tasks.find((x) => x.id === pending.id);
    if (pending.isNew) {
      if (t) setMinutes((x) => { x.nouvelles = [...(x.nouvelles ?? []), t.id]; });
    } else if (!t && pending.before) {
      setMinutes((x) => { x.supprimees = [...(x.supprimees ?? []), pending.before!.titre]; });
    } else if (t && pending.before) {
      record(t, diffTask(data, pending.before, t));
    }
    setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pending, edit]);

  // ---------- Points de la séance ----------
  const sel = selectAgenda(data, s0, s1, s2, { ...FULL_AGENDA, joursApres: data.reglagesOdj?.joursApres });
  const bucket = new Map<string, 'late' | 'p1' | 'p2' | 'bilan'>();
  sel.late.forEach((t) => bucket.set(t.id, 'late'));
  sel.avant1.forEach((t) => bucket.set(t.id, 'p1'));
  sel.avant2.forEach((t) => bucket.set(t.id, 'p2'));
  sel.bilan.forEach((t) => bucket.set(t.id, 'bilan'));
  const journal = m.journal ?? [];
  const nouvelles = new Set(m.nouvelles ?? []);
  const newTasks = data.tasks.filter((t) => nouvelles.has(t.id));
  const deleted = m.supprimees ?? [];
  // Points affichés : ordre du jour + points présents au début de la séance + tâches modifiées ou créées depuis le PV.
  const ids = new Set<string>([...bucket.keys(), ...(m.pointIds ?? []), ...journal.map((j) => j.taskId), ...nouvelles]);
  const points = data.tasks.filter((t) => ids.has(t.id));
  const polls = (data.polls ?? []).filter((p) => isOpen(p) || (p.clotureLe ?? p.dateLimite ?? '') >= sel.since);
  const changesOf = (t: Task) => journal.filter((j) => j.taskId === t.id).flatMap((j) => j.changes);
  const isNewTask = (t: Task) => nouvelles.has(t.id);

  const meta = (t: Task) => {
    const b = bucket.get(t.id);
    return [
      t.responsables.map((id) => initials(person(id))).join(', '),
      b !== 'bilan' && t.delai && shortDate(t.delai),
      b === 'late' ? '⚠ en retard' : b === 'p2' && s2 ? echeanceSuivante(t, s2) : b === 'bilan' ? '✓ fait' : '',
      isNewTask(t) && '🆕 nouvelle',
    ].filter(Boolean) as string[];
  };

  // Regroupement : section → sous-section → tâches (ordre de l'ordre du jour)
  const RANK = { late: 0, p1: 1, p2: 2, bilan: 3 } as const;
  const bySection = data.sections.map((sec) => {
    const tasks = points
      .filter((t) => t.sectionId === sec.id)
      .sort(
        (a, b) =>
          sec.sousSections.indexOf(a.sousSection) - sec.sousSections.indexOf(b.sousSection) ||
          RANK[bucket.get(a.id) ?? 'p1'] - RANK[bucket.get(b.id) ?? 'p1'] ||
          (a.delai || '9999').localeCompare(b.delai || '9999'),
      );
    const subs: { key: string; label: string; tasks: Task[] }[] = [];
    for (const t of tasks) {
      const key = t.sousSection || `__${t.id}`;
      let g = subs.find((x) => x.key === key);
      if (!g) subs.push((g = { key, label: t.sousSection, tasks: [] }));
      g.tasks.push(t);
    }
    // Tâches liées placées juste après leur tâche principale (si elle est dans la même sous-section).
    for (const g of subs) {
      const ids = new Set(g.tasks.map((t) => t.id));
      const kids = g.tasks.filter((t) => t.parentId && ids.has(t.parentId));
      g.tasks = g.tasks.filter((t) => !kids.includes(t)).flatMap((t) => [t, ...kids.filter((k) => k.parentId === t.id)]);
    }
    return { sec, subs, polls: polls.filter((p) => pollSection(data, p) === sec.id) };
  });
  const orphanPolls = polls.filter((p) => !data.sections.some((x) => x.id === pollSection(data, p)));

  // ---------- Actions de séance ----------
  const start = () =>
    setMinutes((x) => {
      x.heureDebut = x.heureDebut ?? nowHM();
      x.demarreLe = new Date().toISOString();
      x.pointIds = [...bucket.keys()];
    });
  const setPresence = (id: string, kind: 'present' | 'excuse') =>
    setMinutes((x) => {
      const inP = x.presents.includes(id);
      const inE = x.excuses.includes(id);
      x.presents = x.presents.filter((v) => v !== id);
      x.excuses = x.excuses.filter((v) => v !== id);
      if (kind === 'present' && !inP) x.presents.push(id);
      if (kind === 'excuse' && !inE) x.excuses.push(id);
    });

  const quickChange = (t: Task, patch: Partial<Task>) => {
    const after = { ...t, ...patch };
    const q = finAnticipee(data, t, after);
    if (q && !confirm(q)) return;
    saveTask(after, false);
    record(t, diffTask(data, stateOf(t), after));
  };
  const openTask = (t: Task) => {
    setEdit({ task: t, isNew: false });
    setPending({ id: t.id, before: stateOf(t), isNew: false });
  };
  const addTask = (sectionId: string) => {
    if (!user) return;
    const t = newTask(user.id, {
      sectionId,
      responsables: [],
      // Pour la séance suivante (pas encore passée), le jour même : elle figure à son ordre du jour.
      ...versProchaineSeance(data.meetings, s1?.date),
    });
    setEdit({ task: t, isNew: true });
    setPending({ id: t.id, isNew: true });
  };

  // Correction après coup : rouvrir un PV validé ; la prochaine validation crée une nouvelle version.
  const startCorrection = () => {
    if (!s1) return;
    update((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      x.minutes = { ...EMPTY_MINUTES, ...x.minutes, enCorrection: true };
    }, `PV du ${s1.titre} rouvert pour correction`);
    setView('saisie');
    setMsg(`✏️ Correction du PV (future version ${version + 1}) : modifie les notes, présences ou points, puis valide.`);
  };
  const cancelCorrection = () => {
    if (!s1 || !m.derniereValidee || !confirm('Annuler les corrections et revenir à la dernière version validée ?')) return;
    update((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      x.minutes = { ...structuredClone(m.derniereValidee!), derniereValidee: m.derniereValidee, enCorrection: false };
    }, `Correction du PV du ${s1.titre} annulée`);
    setMsg('Corrections annulées : retour à la version validée.');
  };

  // ---------- Texte et document du PV ----------
  const noteOf = (key: string) => m.notes[key]?.trim() ?? '';
  const taskInPv = (t: Task) => m.tousLesPoints || !!noteOf(`task:${t.id}`) || changesOf(t).length > 0 || isNewTask(t);
  const pollInPv = (p: Poll) => m.tousLesPoints || !!noteOf(`poll:${p.id}`) || !isOpen(p);
  const pvSections = bySection
    .map((g) => ({ ...g, subs: g.subs.map((s) => ({ ...s, tasks: s.tasks.filter(taskInPv) })).filter((s) => s.tasks.length), polls: g.polls.filter(pollInPv) }))
    .filter((g) => m.tousLesPoints || noteOf(`sec:${g.sec.id}`) || g.subs.length || g.polls.length);
  const others = orphanPolls.filter(pollInPv);
  // Annexes : fichiers et liens des tâches du PV, dans l'ordre du PV (nouvelles tâches comprises).
  const tachesPv = [...new Map([...pvSections.flatMap((g) => g.subs.flatMap((s) => s.tasks)), ...newTasks].map((t) => [t.id, t])).values()];
  // Sauf ceux retirés pour ce PV ; tant que le PV n'a pas son choix, ceux retirés de l'ordre du jour de la séance.
  const exclues = m.annexesExclues ?? s1?.odjAnnexesExclues ?? [];
  const annexes = annexesDe(tachesPv, exclues);
  const joints = opts.annexes ? annexes : [];
  // Numéros d'annexe à côté du titre, quand les documents ne sont pas nommés (sinon : avec leur nom).
  const numeros = (t: Task) => (opts.documents && t.documents?.length ? [] : numerosDe(joints, t));
  const docs = (t: Task) => (opts.documents && t.documents?.length ? ` – 📎 ${docsTexte(t, joints)}` : '');
  const presentsTxt = m.presents.map((id) => `${fullName(person(id))} (${initials(person(id))})`).join(', ') || '—';
  const excusesTxt = m.excuses.map((id) => fullName(person(id))).join(', ') || '—';
  const absents = committee.filter((p) => !m.presents.includes(p.id) && !m.excuses.includes(p.id));
  const versionLine =
    draftVersion > 1
      ? m.enCorrection
        ? `Version ${draftVersion} (corrigée, non encore validée) – remplace la version ${version}`
        : `Version ${version} – corrigée le ${fmtDate(m.valideLe!.slice(0, 10))}`
      : '';

  const nouvelleInfo = (t: Task) =>
    [data.sections.find((x) => x.id === t.sectionId)?.nom, ...(opts.details ? meta(t).filter((x) => x !== '🆕 nouvelle') : [])].filter(Boolean).join(' · ');
  const taskLine = (t: Task) =>
    `${t.titre}${opts.details && meta(t).length ? ` (${meta(t).join(' · ')})` : ''}${numeros(t).length ? ` 📎 annexe ${numeros(t).join(', ')}` : ''}${docs(t)}`;
  const plainText = () => {
    const out: string[] = [`PROCÈS-VERBAL – ${titre}`];
    if (versionLine) out.push(versionLine);
    if (s1) out.push(`${longDate(s1.date)} · ${hm(m.heureDebut ?? s1.heure)}${m.heureFin ? ` – ${hm(m.heureFin)}` : ''} · Lieu : ${s1.lieu || 'à définir'}`);
    out.push(`Présents : ${presentsTxt}`, `Excusés : ${excusesTxt}`);
    if (m.invites?.trim()) out.push(`Invités : ${m.invites.trim()}`);
    out.push('');
    pvSections.forEach((g, i) => {
      out.push(`${i + 1}. ${g.sec.nom}`);
      if (noteOf(`sec:${g.sec.id}`)) out.push(...noteOf(`sec:${g.sec.id}`).split('\n').map((l) => `   ${l}`));
      let j = 0;
      g.subs.forEach((s) => {
        const pad = s.label ? '      ' : '   ';
        if (s.label) out.push(`   ${letter(j++)}. ${s.label}`);
        s.tasks.forEach((t) => {
          out.push(`${pad}${s.label ? '■' : `${letter(j++)}.`} ${taskLine(t)}`);
          noteOf(`task:${t.id}`).split('\n').filter(Boolean).forEach((l) => out.push(`${pad}   → ${l}`));
          if (opts.misesAJour) changesOf(t).forEach((c) => out.push(`${pad}   ↻ ${c}`));
        });
      });
      g.polls.forEach((p) => {
        out.push(`   ${letter(j++)}. Sondage : ${p.question} — ${pollSummary(p)}`);
        noteOf(`poll:${p.id}`).split('\n').filter(Boolean).forEach((l) => out.push(`      → ${l}`));
      });
    });
    let n = pvSections.length;
    others.forEach((p) => out.push(`${++n}. Sondage : ${p.question} — ${pollSummary(p)}`));
    if (noteOf('divers')) out.push(`${++n}. Divers`, ...noteOf('divers').split('\n').map((l) => `   ${l}`));
    if (newTasks.length) {
      out.push('', 'NOUVELLES TÂCHES DÉCIDÉES');
      newTasks.forEach((t) => out.push(`   ■ ${t.titre} (${nouvelleInfo(t)})${docs(t)}`));
    }
    if (opts.annexes && annexes.length) {
      out.push('', 'ANNEXES');
      annexes.forEach((a) => out.push(`   ${a.n}. ${a.d.nom} (${annexeInfo(a)})`));
    }
    if (deleted.length) out.push('', `Tâches supprimées : ${deleted.join(', ')}`);
    if (s2) out.push('', `Prochaine séance : ${s2.titre}, ${longDate(s2.date)}${s2.heure ? ` à ${hm(s2.heure)}` : ''} – ${s2.lieu || 'lieu à définir'}`);
    out.push('', `PV établi par ${fullName(secretaire ?? user ?? undefined)} le ${fmtDate(today())}`);
    return out.join('\n');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText());
      setMsg('📋 Texte du PV copié.');
    } catch {
      setMsg('Copie impossible dans ce navigateur.');
    }
  };
  const email = () => {
    const to = committee.map((p) => p.email).filter(Boolean).join(',');
    let body = plainText();
    if (body.length > 1800) body = body.slice(0, 1800) + '\n…\n(PV complet en pièce jointe / imprimé)';
    const subject = draftVersion > 1 ? `PV corrigé (version ${draftVersion}) – ${titre}` : `PV – ${titre}`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const validate = () => {
    if (!s1 || !user || !sheetRef.current) return;
    // Page de dépôt : ouverte dès le clic (plus tard, le navigateur la bloquerait), sans accès en retour à l'appli.
    const fenetre = depot ? window.open(depot, '_blank') : null;
    if (fenetre) {
      try {
        fenetre.opener = null;
      } catch {
        /* déjà sur la page de dépôt */
      }
    }
    const n = m.valideLe ? (m.enCorrection ? version + 1 : version) : 1;
    const html = archiveHtml(sheetRef.current.outerHTML);
    const now = new Date().toISOString();
    update((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      // Excusés annoncés (ordre du jour, « Je m'excuse ») : enregistrés dans le PV validé, comme affichés.
      const mm: MeetingMinutes = { ...withExcuses({ ...EMPTY_MINUTES, ...x.minutes }, x.excuses), valideLe: now, validePar: user.id, version: n, enCorrection: false };
      // Fichiers joints : le choix du moment est fixé (l'ordre du jour peut encore changer).
      mm.annexesExclues = mm.annexesExclues ?? x.odjAnnexesExclues ?? [];
      const { derniereValidee: _old, ...copyOf } = mm;
      void _old;
      mm.derniereValidee = structuredClone(copyOf);
      x.minutes = mm;
      const label = n > 1 ? `PV ${titre} – version ${n} (corrigé le ${fmtDate(now.slice(0, 10))})` : `PV ${titre}`;
      x.minutesArchives = [{ id: uid('pvf'), at: now, by: user.id, titre: label, html }, ...(x.minutesArchives ?? [])].slice(0, 10);
    }, n > 1 ? `PV du ${s1.titre} corrigé : version ${n} validée` : `PV du ${s1.titre} validé et archivé`);
    setMsg(
      n > 1
        ? `✅ Version ${n} validée et archivée (la version ${n - 1} reste consultable dans la liste des séances). Tu peux envoyer le PV corrigé.`
        : `✅ PV validé et archivé dans « ${s1.titre} » (liste des séances). Tu peux maintenant l’envoyer par email.`,
    );
    if (!depot) return setDepotEtat(null);
    // PDF du PV validé, à déposer sur la page : créé une fois la feuille redessinée (pied « version n validée »).
    const seance = s1.id;
    setDepotEtat({ seance, ouverte: !!fenetre, pdf: 'encours' });
    const o = { titre: `PV ${titre}${n > 1 ? ` v${n}` : ''}`, margesMm: margesMm(data.reglagesOdj?.style), police: data.reglagesOdj?.style?.police, auteur: fullName(user) };
    window.setTimeout(async () => {
      let ok = false;
      try {
        ok = await pdfDeFeuille(sheetRef.current, o);
      } catch (e) {
        console.error(e);
      }
      setDepotEtat((x) => (x?.seance === seance ? { ...x, pdf: ok ? 'ok' : 'erreur' } : x));
    }, 0);
  };

  // ---------- Rendu ----------
  const noteToggle = (key: string, label: string) =>
    noteOf(key) || (openNotes[key] && editable) ? (
      <NoteField value={m.notes[key] ?? ''} onCommit={(v) => setNote(key, v)} placeholder={label} autoFocus={openNotes[key] && !noteOf(key)} readOnly={!editable} />
    ) : null;

  // Tâche liée dont la tâche principale est aussi un point de la séance : affichée en retrait sous elle.
  const isChild = (t: Task) => !!t.parentId && points.some((x) => x.id === t.parentId && x.sectionId === t.sectionId && x.sousSection === t.sousSection);
  const taskRow = (t: Task) => {
    const ch = changesOf(t);
    const b = bucket.get(t.id);
    const can2 = editable && canEditTask(t);
    return (
      <div key={t.id} className={`min-task ${ch.length ? 'changed' : ''} ${isNewTask(t) ? 'new' : ''} ${b === 'late' ? 'late' : ''} ${isDone(data, t) ? 'done' : ''} ${isChild(t) ? 'child' : ''}`}>
        <div className="min-task-head">
          <span className="min-title">
            {isChild(t) && <span className="muted">↳ </span>}
            {t.titre} <span className="odj-meta">({meta(t).join(' · ')})</span>
            {t.remarque && <span className="odj-rem"> – <AvecLiens texte={t.remarque.trim()} /></span>}
          </span>
          {editable && (
            <span className="min-controls">
              <select className="min-status" value={t.statusId} disabled={!can2} onChange={(e) => quickChange(t, { statusId: e.target.value })} aria-label={`Statut de ${t.titre}`}>
                {data.statuses.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              <input type="date" className="min-date" value={t.delai} disabled={!can2} title={t.delaiRef ? 'Délai calé sur un événement ou une séance (le changer à la main le détache)' : 'Délai'}
                onChange={(e) => quickChange(t, { delai: e.target.value, delaiRef: undefined })} />
              <button className="icon-btn" title="Modifier la tâche" onClick={() => openTask(t)} aria-label="Modifier la tâche"><Icone n="modifier" /></button>
              {!noteOf(`task:${t.id}`) && !openNotes[`task:${t.id}`] && (
                <button className="icon-btn" title="Ajouter une note" onClick={() => setOpenNotes({ ...openNotes, [`task:${t.id}`]: true })} aria-label="Ajouter une note"><Icone n="note" /></button>
              )}
            </span>
          )}
        </div>
        {!!t.documents?.length && <div className="min-docs"><DocsTache t={t} annexes={[]} /></div>}
        {t.checklist.length > 0 && (
          <ul className="min-subs">
            {t.checklist.map((c) => (
              <li key={c.id}>
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={c.done}
                    disabled={!(editable && can2)}
                    onChange={() => quickChange(t, { checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })}
                  />
                  <span className={c.done ? 'strike' : ''}>{c.label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {ch.length > 0 && <div className="min-changes">↻ {ch.join(' · ')}</div>}
        {noteToggle(`task:${t.id}`, 'Note / décision sur ce point…')}
      </div>
    );
  };
  const pollRow = (p: Poll) => (
    <div key={p.id} className="min-task poll-row-min">
      <div className="min-task-head">
        <span className="min-title odj-poll">📊 Sondage : {p.question} <span className="odj-meta">— {pollSummary(p)}</span></span>
        {editable && !noteOf(`poll:${p.id}`) && !openNotes[`poll:${p.id}`] && (
          <span className="min-controls">
            <button className="icon-btn" title="Ajouter une note" onClick={() => setOpenNotes({ ...openNotes, [`poll:${p.id}`]: true })} aria-label="Ajouter une note"><Icone n="note" /></button>
          </span>
        )}
      </div>
      {noteToggle(`poll:${p.id}`, 'Note / décision sur ce sondage…')}
    </div>
  );

  function pvTask(t: Task) {
    return (
      <>
        {t.titre}
        {opts.details && meta(t).length > 0 && <span className="odj-meta"> ({meta(t).join(' · ')})</span>}
        {numeros(t).length > 0 && <span className="odj-meta"> 📎 annexe {numeros(t).join(', ')}</span>}
        {opts.documents && !!t.documents?.length && <p className="min-pv-docs"><DocsTache t={t} annexes={joints} /></p>}
        {noteOf(`task:${t.id}`) && <p className="min-pv-note">→ <AvecLiens texte={noteOf(`task:${t.id}`)} /></p>}
        {opts.misesAJour && changesOf(t).length > 0 && <p className="min-pv-change">↻ {changesOf(t).join(' · ')}</p>}
      </>
    );
  }

  const pvDoc: ReactNode = (
    <div ref={sheetRef} className={`pv-sheet portrait t-${opts.taille}`} style={styleVars(data.reglagesOdj?.style)}>
      <header className="pv-head">
        <DocEntete e={entete} logo={logo} />
        <p className="pv-kicker">Procès-verbal{draftVersion > 1 ? ` · version ${draftVersion}` : ''}</p>
        <h1>{nomComite}</h1>
        {s1 && <p className="pv-meta">{longDate(s1.date)}</p>}
        {versionLine && <p className="pv-version">{versionLine}</p>}
      </header>
      <section className="odj-head">
        <p><b>Début de séance :</b> {hm(m.heureDebut ?? s1?.heure) || '—'}{m.heureFin && <> · <b>Fin :</b> {hm(m.heureFin)}</>}</p>
        <p><b>Lieu :</b> {s1?.lieu || 'à définir'}</p>
        <p><b>Présents :</b> {presentsTxt}</p>
        <p><b>Excusés :</b> {excusesTxt}</p>
        {absents.length > 0 && (m.presents.length > 0 || m.excuses.length > 0) && <p><b>Absents :</b> {absents.map((p) => fullName(p)).join(', ')}</p>}
        {m.invites?.trim() && <p><b>Invités :</b> {m.invites.trim()}</p>}
      </section>
      <section className="pv-part">
        <h2>Points traités</h2>
        {pvSections.length === 0 && !others.length && !noteOf('divers') ? (
          <p className="pv-empty">Aucune note ni mise à jour pour l’instant.</p>
        ) : (
          <ol className="odj">
            {pvSections.map((g) => (
              <li key={g.sec.id}>
                <span className="odj-sec">{g.sec.nom}</span>
                {noteOf(`sec:${g.sec.id}`) && <p className="min-pv-note"><AvecLiens texte={noteOf(`sec:${g.sec.id}`)} /></p>}
                {(g.subs.length > 0 || g.polls.length > 0) && (
                  <ol className="odj-l1">
                    {g.subs.map((s) =>
                      s.label ? (
                        <li key={s.key}>
                          {s.label}
                          <ul className="odj-l2">{s.tasks.map((t) => <li key={t.id}>{pvTask(t)}</li>)}</ul>
                        </li>
                      ) : (
                        s.tasks.map((t) => <li key={t.id}>{pvTask(t)}</li>)
                      ),
                    )}
                    {g.polls.map((p) => (
                      <li key={p.id}>
                        <span className="odj-poll">Sondage : {p.question} — {pollSummary(p)}</span>
                        {noteOf(`poll:${p.id}`) && <p className="min-pv-note"><AvecLiens texte={noteOf(`poll:${p.id}`)} /></p>}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
            {others.map((p) => (
              <li key={p.id}><span className="odj-sec">Sondage : {p.question}</span> — {pollSummary(p)}</li>
            ))}
            {noteOf('divers') && (
              <li><span className="odj-sec">Divers</span><p className="min-pv-note"><AvecLiens texte={noteOf('divers')} /></p></li>
            )}
          </ol>
        )}
      </section>
      {newTasks.length > 0 && (
        <section className="pv-part">
          <h2>Nouvelles tâches décidées</h2>
          <ul className="odj-l2">
            {newTasks.map((t) => (
              <li key={t.id}>
                {t.titre} <span className="odj-meta">({nouvelleInfo(t)})</span>
                {opts.documents && !!t.documents?.length && <p className="min-pv-docs"><DocsTache t={t} annexes={joints} /></p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {deleted.length > 0 && <p><b>Tâches supprimées :</b> {deleted.join(', ')}</p>}
      {s2 && (
        <p className="pv-next"><b>Prochaine séance :</b> {s2.titre}, {longDate(s2.date)}{s2.heure && ` à ${hm(s2.heure)}`} – Lieu : {s2.lieu || 'à définir'}</p>
      )}
      {opts.annexes && <ListeAnnexes annexes={annexes} />}
      <footer className="pv-foot">
        PV établi par {fullName(secretaire ?? user ?? undefined)} le {fmtDate(today())}
        {m.valideLe && !m.enCorrection && ` · version ${version} validée le ${fmtDate(m.valideLe.slice(0, 10))}`} · {nomAppli()}
      </footer>
      {/* Fichiers joints : à la suite du PV, sur des pages à part à l'impression. */}
      {opts.annexes && <PagesAnnexes annexes={annexes} parPage={opts.annexesParPage} />}
    </div>
  );

  if (!s1) return <p className="muted">Aucune séance de comité. Crée d’abord une séance dans la liste des séances.</p>;

  const statusBanner = m.valideLe && (
    <div className={`min-banner no-print ${m.enCorrection ? 'editing' : 'locked'}`}>
      {m.enCorrection ? (
        <>
          <span>✏️ <b>Correction en cours</b> – la validation créera la <b>version {version + 1}</b> (la version {version} reste archivée).</span>
          <span className="grow" />
          {m.derniereValidee && <button className="btn small" onClick={cancelCorrection}>Annuler la correction</button>}
          <button className="btn small primary" onClick={() => setView('pv')}>Voir et valider</button>
        </>
      ) : (
        <>
          <span>✅ <b>PV validé</b> (version {version}) le {fmtDateTime(m.valideLe)} – lecture seule.</span>
          <span className="grow" />
          {can('tab.minutes') && <button className="btn small primary" onClick={startCorrection}><Icone n="modifier" /> Corriger le PV</button>}
        </>
      )}
    </div>
  );

  return (
    <div className="minutes-page">
      <div className="page-head no-print">
        <h1>PV</h1>
        <div className="actions">
          <select value={meetingId} onChange={(e) => { setMeetingId(e.target.value); setMsg(''); setOpenNotes({}); }} aria-label="Séance">
            {meetings.map((x) => (
              <option key={x.id} value={x.id}>
                {x.titre} – {fmtDate(x.date)}{x.minutes?.valideLe ? ` ✓${(x.minutes.version ?? 1) > 1 ? ` v${x.minutes.version}` : ''}` : ''}
              </option>
            ))}
          </select>
          <div className="seg">
            <button className={view === 'saisie' ? 'on' : ''} onClick={() => setView('saisie')}><Icone n="notes" /> Prise de notes</button>
            <button className={view === 'pv' ? 'on' : ''} onClick={() => setView('pv')}><Icone n="pdf" /> PV</button>
          </div>
        </div>
      </div>
      <PageIntro />
      {statusBanner}
      {msg && <p className="pv-msg no-print">{msg}</p>}
      {depot && locked && depotEtat?.seance === s1.id && (
        <p className="pv-msg pv-depot no-print">
          📤 {depotEtat.ouverte ? 'Page de dépôt ouverte dans une nouvelle fenêtre' : 'Le navigateur a bloqué la nouvelle fenêtre'} (
          <a href={depot} target="_blank" rel="noopener noreferrer">{depotEtat.ouverte ? 'la rouvrir' : 'ouvrir la page de dépôt'}</a>).{' '}
          {depotEtat.pdf === 'encours'
            ? '⏳ Création du PDF du PV…'
            : depotEtat.pdf === 'ok'
              ? '📄 PDF du PV créé (dans tes téléchargements) : dépose-le sur cette page.'
              : '⚠️ Le PDF n’a pas pu être créé : « PDF » ou « Imprimer », puis dépose le fichier sur la page.'}
        </p>
      )}

      {view === 'saisie' ? (
        <div className="min-layout">
          <div className="min-main">
            <section className="panel min-session">
              <div className="min-session-row">
                <strong>{s1.titre} · {longDate(s1.date)}</strong>
                <span className="muted">Lieu : {s1.lieu || 'à définir'}</span>
              </div>
              <div className="min-session-row">
                <label className="inline">Début <input type="time" value={m.heureDebut ?? ''} disabled={!editable} onChange={(e) => setMinutes((x) => { x.heureDebut = e.target.value || undefined; })} /></label>
                <label className="inline">Fin <input type="time" value={m.heureFin ?? ''} disabled={!editable} onChange={(e) => setMinutes((x) => { x.heureFin = e.target.value || undefined; })} /></label>
                {editable && !m.valideLe && (!m.demarreLe ? (
                  <button className="btn primary" onClick={start}><Icone n="demarrer" /> Démarrer la séance</button>
                ) : !m.heureFin ? (
                  <button className="btn" onClick={() => setMinutes((x) => { x.heureFin = nowHM(); })}><Icone n="terminer" /> Terminer la séance</button>
                ) : (
                  <span className="pbadge closed">Séance terminée – notes et points encore modifiables</span>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2 className="min-h2">Présences</h2>
              <div className="min-presence">
                {committee.map((p) => (
                  <div key={p.id} className="min-person">
                    <span>{fullName(p)} <span className="muted">({initials(p)})</span></span>
                    <span className="seg small">
                      <button disabled={!editable} className={m.presents.includes(p.id) ? 'on present' : ''} onClick={() => setPresence(p.id, 'present')}>Présent</button>
                      <button disabled={!editable} className={m.excuses.includes(p.id) ? 'on excuse' : ''} onClick={() => setPresence(p.id, 'excuse')}>Excusé</button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="row">
                {editable && <button className="btn small" onClick={() => setMinutes((x) => { x.presents = committee.map((p) => p.id).filter((id) => !x.excuses.includes(id)); })}>Tous présents (sauf excusés)</button>}
                <input className="grow" placeholder="Invités / autres personnes présentes" value={m.invites ?? ''} readOnly={!editable} onChange={(e) => setMinutes((x) => { x.invites = e.target.value; })} />
              </div>
            </section>

            <section className="min-agenda">
              {bySection.map((g, i) => (
                <div key={g.sec.id} className="panel min-section">
                  <h3>{i + 1}. {g.sec.nom}</h3>
                  {(editable || noteOf(`sec:${g.sec.id}`)) && (
                    <NoteField value={m.notes[`sec:${g.sec.id}`] ?? ''} onCommit={(v) => setNote(`sec:${g.sec.id}`, v)} placeholder={`Notes pour « ${g.sec.nom} »…`} readOnly={!editable} />
                  )}
                  {g.subs.map((s, j) => (
                    <div key={s.key} className="min-sub">
                      {s.label ? <div className="min-sub-title">{letter(j)}. {s.label}</div> : null}
                      {s.tasks.map(taskRow)}
                    </div>
                  ))}
                  {g.polls.map(pollRow)}
                  {editable && can('tasks.createAny', g.sec.id) && <button className="btn small link" onClick={() => addTask(g.sec.id)}>+ Nouvelle tâche décidée</button>}
                </div>
              ))}
              {orphanPolls.length > 0 && (
                <div className="panel min-section">
                  <h3>Sondages</h3>
                  {orphanPolls.map(pollRow)}
                </div>
              )}
              <div className="panel min-section">
                <h3>Divers</h3>
                <NoteField value={m.notes.divers ?? ''} onCommit={(v) => setNote('divers', v)} placeholder="Points divers, informations, prochaine séance…" readOnly={!editable} />
              </div>
            </section>
          </div>
          <aside className="min-side">
            <div className="panel">
              <h2 className="min-h2">Suivi de la séance</h2>
              <p>{m.presents.length} présent(s) · {m.excuses.length} excusé(s)</p>
              <p>{Object.keys(m.notes).length} note(s)</p>
              <p>{new Set(journal.map((j) => j.taskId)).size} tâche(s) mise(s) à jour</p>
              <p>{newTasks.length} nouvelle(s) tâche(s)</p>
              <button className="btn primary" onClick={() => setView('pv')}><Icone n="pdf" /> Voir le PV</button>
              <small className="muted">{editable ? 'Les notes s’enregistrent automatiquement. Seules les modifications de tâches faites ici figurent dans le PV.' : 'PV validé : lecture seule.'}</small>
            </div>
          </aside>
        </div>
      ) : (
        <>
          <div className="panel min-pv-options no-print">
            <strong>Options du PV</strong>
            <label className="inline"><input type="checkbox" checked={!!m.tousLesPoints} disabled={!editable} onChange={(e) => setMinutes((x) => { x.tousLesPoints = e.target.checked; })} /> Inclure tous les points de l’ordre du jour</label>
            <label className="inline"><input type="checkbox" checked={opts.details} disabled={!editable} onChange={(e) => setOpt({ details: e.target.checked })} /> Responsables, délais et échéances</label>
            <label className="inline"><input type="checkbox" checked={opts.misesAJour} disabled={!editable} onChange={(e) => setOpt({ misesAJour: e.target.checked })} /> Mises à jour des tâches (↻)</label>
            <label className="inline" title="Fichiers et liens de chaque point, nommés ; un clic les ouvre">
              <input type="checkbox" checked={opts.documents} disabled={!editable} onChange={(e) => setOpt({ documents: e.target.checked })} /> 📎 Documents des points
            </label>
            <label className="inline" title="Les fichiers et liens des tâches du PV : liste des annexes, puis les photos et les pages des PDF (1, 2 ou 4 par page)">
              <input type="checkbox" checked={opts.annexes} disabled={!editable} onChange={(e) => setOpt({ annexes: e.target.checked })} /> 📎 Joindre les fichiers liés en fin de PV
              <span className="muted">{annexes.length ? ` (${annexes.length})` : annexesDe(tachesPv).length ? ' (aucun choisi)' : ' (aucun pour l’instant)'}</span>
            </label>
            {opts.annexes && (
              <label className="inline" title="Photos ou pages de PDF sur une même page imprimée">
                Par page
                <select value={opts.annexesParPage} disabled={!editable} onChange={(e) => setOpt({ annexesParPage: Number(e.target.value) as PvOptions['annexesParPage'] })}>
                  {PAR_PAGE.map((n) => <option key={n} value={n}>{n === 1 ? '1 fichier (pleine page)' : `${n} fichiers`}</option>)}
                </select>
              </label>
            )}
            {opts.annexes && (
              <ChoixAnnexes
                tasks={tachesPv}
                exclues={exclues}
                onChange={(ids) => setMinutes((x) => { x.annexesExclues = ids; })}
                disabled={!editable}
                note={m.annexesExclues ? undefined : s1?.odjAnnexesExclues?.length ? 'Choix repris de l’ordre du jour de la séance.' : undefined}
              />
            )}
            <label className="inline">
              Taille du texte
              <select value={opts.taille} disabled={!editable} onChange={(e) => setOpt({ taille: e.target.value as PvOptions['taille'] })}>
                <option value="petite">Petite</option>
                <option value="normale">Normale</option>
                <option value="grande">Grande</option>
              </select>
            </label>
            {can('tab.minutes') && (
              <details className="min-pv-mef">
                <summary><Icone n="miseEnForme" /> Mise en forme</summary>
                <MiseEnForme disabled={!editable} />
              </details>
            )}
            {!editable && can('tab.minutes') && <small className="muted">PV validé : « Corriger le PV » pour changer ses options.</small>}
            {can('tab.minutes') && (
              <details className="min-pv-mef min-pv-depot">
                <summary><Icone n="televerser" /> Dépôt du PV validé{depot ? <span className="muted"> : {hote(depot)}</span> : null}</summary>
                <ReglageDepot />
              </details>
            )}
          </div>
          <div className="actions no-print min-pv-actions">
            <span className="grow" />
            <LienEntete className="btn" />
            <BoutonPdf feuille={sheetRef} titre={`PV ${titre}${draftVersion > 1 ? ` v${draftVersion}` : ''}`} margesMm={margesMm(data.reglagesOdj?.style)} police={data.reglagesOdj?.style?.police} />
            <button className="btn" onClick={() => window.print()}><Icone n="imprimer" /> Imprimer</button>
            <button className="btn" onClick={copy}><Icone n="copier" /> Copier le texte</button>
            <button className="btn" onClick={email}><Icone n="email" /> Envoyer par email</button>
            {depot && locked && (
              <a className="btn" href={depot} target="_blank" rel="noopener noreferrer" title="Page où déposer le PDF du PV validé"><Icone n="televerser" /> Page de dépôt</a>
            )}
            {can('tab.minutes') && (locked ? (
              <button className="btn primary" onClick={startCorrection}><Icone n="modifier" /> Corriger le PV</button>
            ) : (
              <button className="btn primary" onClick={validate}><Icone n="valider" /> {m.enCorrection ? `Valider la version ${version + 1}` : 'Valider et archiver'}</button>
            ))}
          </div>
          <style>{`@page { size: A4 portrait; margin: ${margesMm(data.reglagesOdj?.style)}mm; }`}</style>
          <div className="pv-preview">{pvDoc}</div>
        </>
      )}

      {edit && <TaskModal task={edit.task} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** Réglage de l'entité : page web où déposer le PV validé, ouverte par « Valider et archiver ». */
function ReglageDepot() {
  const { data, update } = useStore();
  const actuel = data.reglagesOdj?.depotPv ?? '';
  const [val, setVal] = useState(actuel);
  const [err, setErr] = useState('');
  useEffect(() => setVal(actuel), [actuel]);
  const enregistrer = (brut: string) => {
    const url = brut.trim() ? urlDepot(brut) : '';
    if (url === null) return setErr('Adresse invalide : une page web, ex. https://drive.google.com/…');
    setErr('');
    setVal(url);
    if (url === actuel) return;
    update((d) => {
      const { depotPv: _old, ...reste } = d.reglagesOdj ?? {};
      void _old;
      d.reglagesOdj = url ? { ...reste, depotPv: url } : reste;
    }, url ? `PV : page de dépôt « ${hote(url)} » enregistrée` : 'PV : page de dépôt retirée');
  };
  return (
    <div className="depot-pv">
      <p className="muted">
        Adresse de la page où déposer le PV (dossier partagé du club, formulaire d’envoi…). « Valider et archiver » l’ouvre dans une nouvelle fenêtre
        et crée le PDF du PV, à y déposer. Commune à tous les PV de l’entité.
      </p>
      <form className="row wrap" onSubmit={(e) => { e.preventDefault(); enregistrer(val); }}>
        <input className="grow" type="text" inputMode="url" autoComplete="url" placeholder="https://…" value={val} onChange={(e) => { setVal(e.target.value); setErr(''); }} aria-label="Adresse de la page de dépôt du PV" />
        <button className="btn small primary" type="submit" disabled={val.trim() === actuel}>Enregistrer</button>
        {actuel && <button className="btn small" type="button" onClick={() => enregistrer('')}>Retirer</button>}
        {actuel && urlDepot(actuel) && <a className="btn small" href={urlDepot(actuel)!} target="_blank" rel="noopener noreferrer">Ouvrir</a>}
      </form>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
