import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, useSyncStatus } from '../data/store';
import { FULL_AGENDA, blocsSection, echeanceSuivante, etatTerminee, meetingContext, ordreSection, retiresDe, selectAgenda, sortedMeetings } from '../data/agenda';
import { committeeOf, isOpen, pollSection, pollSummary } from '../data/polls';
import { EMPTY_MINUTES, bilanVote, diffTask, resumerChangements, shortDate, stateOf, texteVote } from '../data/minutes';
import type { AppData, Meeting, MeetingMinutes, Poll, PvOptions, Task, TaskSnapshot, Voix } from '../data/types';
import { finLe, fmtDate, fmtDateTime, fullName, initials, isDone, newTask, today, uid } from '../data/utils';
import { NoteField, TexteNote } from '../components/NoteField';
import { texteDe } from '../data/noteRiche';
import { TaskModal } from '../components/FicheTache';
import { finAnticipee, versProchaineSeance } from '../data/seances';
import { nomAppli } from '../data/nomAppli';
import { archiveHtml } from '../data/entete';
import { DocEntete, LienEntete, useEntete, useUnitLogo } from '../components/Entete';
import { PageIntro } from '../components/Nav';
import { ChoixAnnexes, DocsTache, ListeAnnexes, PAR_PAGE, PagesAnnexes, annexeInfo, annexesDe, avecChoix, type ParPage, docsTexte, numerosDe, useOuvrirDocs } from '../components/Annexes';
import { useClubOptional } from '../data/club';
import { MiseEnForme } from '../components/MiseEnForme';
import { margesMm, styleVars } from '../data/styleDocs';
import { BoutonPdf, pdfDeFeuille, usePiedImprime } from '../components/BoutonPdf';
import { AvecLiens, LieuSeance } from '../components/Liens';
import { texteLieu } from '../data/lieux';
import { lienMailto } from '../data/lienPartage';
import { Icone } from '../components/icones';
import { revenir } from '../data/annuler';
import { BarreOutils, Pilule, type OutilPilule } from '../components/Pilule';
import { OutilsTexte } from '../components/OutilsTexte';
import { bilanVu, texteVu } from '../data/pourInfo';
import { useSuiviPourInfo } from '../data/suiviPourInfo';
import { aFiger, figerPoints, figerRemarques, remarquesAFiger, reporterChangement, vueFigee } from '../data/etatsPv';
import { PiecesJointesPoint } from '../components/PiecesJointesPoint';
import { FichePv, type ArretPv, type VotePv } from '../components/FichePv';
import type { DocTracking } from '../components/DocsField';
import { deleteFiles } from '../data/files';
import type { SetT } from '../components/tache/Quand';
import { annonceDe, avecAnnonces, reporterSurAnnonces } from '../data/presences';
import { ChampValide } from '../components/ChampValide';

// Onglet « PV » (secrétaire) : reprend l'ordre du jour de la séance, prise de notes sous chaque point,
// mise à jour des tâches (enregistrée dans le PV), génération / validation / envoi du procès-verbal,
// correction après coup avec versions successives.

const longDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const nowHMde = (d: Date) => d.toTimeString().slice(0, 5);
const nowHM = () => nowHMde(new Date());
const hm = (h?: string) => (h ? h.replace(':', 'h') : '');
/** Options du PV par défaut. */
const OPTIONS: Required<PvOptions> = { details: true, misesAJour: true, documents: true, remarques: true, annexes: false, annexesParPage: 1, annexesPdfParPage: 1, taille: 'normale' };

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

/** Options d'affichage de la prise de notes, retenues sur l'appareil : « Projection » (PV diffusé sur un beamer) et la
 *  vue en fenêtres (fiche du PV). */
const CLE_PROJECTION = 'taches-gsa-pv-projection';
const CLE_FENETRES = 'taches-gsa-pv-fenetres';
const lireOption = (cle: string) => {
  try {
    return localStorage.getItem(cle) === '1';
  } catch {
    return false;
  }
};
const ecrireOption = (cle: string, on: boolean) => {
  try {
    if (on) localStorage.setItem(cle, '1');
    else localStorage.removeItem(cle);
  } catch {
    /* navigation privée : non retenue */
  }
};
const lireProjection = () => lireOption(CLE_PROJECTION);
/** Écran de téléphone (comme les règles « max-width: 767px » de styles.css). */
const ETROIT = '(max-width: 767px)';
function useEcranEtroit() {
  const [etroit, setEtroit] = useState(() => matchMedia(ETROIT).matches);
  useEffect(() => {
    const q = matchMedia(ETROIT);
    const suivre = () => setEtroit(q.matches);
    q.addEventListener('change', suivre);
    return () => q.removeEventListener('change', suivre);
  }, []);
  return etroit;
}
const ecrireProjection = (on: boolean) => ecrireOption(CLE_PROJECTION, on);

/** Ligne de changement du PV (diffTask) → champ de la tâche qu'elle décrit. */
const CHAMP_DU_CHANGEMENT: [string, keyof Task][] = [
  ['statut', 'statusId'],
  ['délai', 'delai'],
  ['responsable', 'responsables'],
  ['intitulé', 'titre'],
  ['remarque', 'remarque'],
  ['sous-point', 'checklist'],
];

/**
 * Checklist changée depuis le PV (`modifiee`, à partir de `montree`, celle que le PV montrait) reportée sur celle de la
 * tâche (`actuelle`) : étapes retirées, cochées ou renommées depuis le PV ; les autres telles qu'elles sont (ajoutées ou
 * cochées ailleurs depuis la séance) ; les nouvelles à la fin.
 */
function fusionChecklist(actuelle: Task['checklist'], montree: Task['checklist'], modifiee: Task['checklist']): Task['checklist'] {
  const avant = new Map(montree.map((c) => [c.id, c]));
  const apres = new Map(modifiee.map((c) => [c.id, c]));
  const gardees = actuelle
    .filter((c) => !avant.has(c.id) || apres.has(c.id))
    .map((c) => {
      const a = avant.get(c.id);
      const b = apres.get(c.id);
      return a && b && JSON.stringify(a) !== JSON.stringify(b) ? b : c;
    });
  return [...gardees, ...modifiee.filter((c) => !avant.has(c.id) && !actuelle.some((x) => x.id === c.id))];
}

const letter = (i: number) => {
  let r = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) r = String.fromCharCode(97 + ((n - 1) % 26)) + r;
  return r;
};

export function Minutes() {
  const { data, user, can, canEditTask, saveTask, linkTask, update, updateSilent, annulable, annuler, refaisable, refaire, cloud, setToast, prefs } = useStore();
  const sync = useSyncStatus();
  // Pour info (052) : « vue par 3 sur 4 », comme l'ordre du jour (même réglage).
  const attendus = useSuiviPourInfo(data.tasks);
  const avecVus = prefs.pv?.colonnes?.pourInfo ?? true;
  const agendaRef = useRef<HTMLElement>(null);
  const defile = useDefilement(agendaRef);
  const { section: sections, point: parPoint } = defile;
  // Projection : les pièces jointes du point en cours à côté des notes ; ce point, une fois le défilement posé.
  const [projection, setProjection] = useState(lireProjection);
  const basculerProjection = () => {
    ecrireProjection(!projection);
    setProjection(!projection);
  };
  const enCours = usePose(defile.enCours, 250);
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
  // Fiche ouverte depuis le PV ; `ids` : les tâches qui existaient à son ouverture, `enfants` : ses points rattachés d'alors
  // (pour inscrire au PV ceux créés ou rattachés depuis la fiche : « + Nouveau point rattaché », « Rattacher… »).
  const [pending, setPending] = useState<{ id: string; before?: TaskSnapshot; tache?: Task; isNew: boolean; ids?: string[]; enfants?: string[] } | null>(null);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  // Après « Valider et archiver » : page de dépôt ouverte (ou bloquée par le navigateur) et PDF en cours, créé ou raté.
  const [depotEtat, setDepotEtat] = useState<{ seance: string; ouverte: boolean; pdf: 'encours' | 'ok' | 'erreur' } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  usePiedImprime(sheetRef);
  // En-tête commun à tous les documents du club (console admin).
  const logo = useUnitLogo();
  const entete = useEntete();

  const s1 = meetings.find((m) => m.id === meetingId);
  const { s0, s2 } = meetingContext(data, s1);
  // Choix de la séance : la dernière passée (tant que son PV n'est pas validé), celles du jour et à venir, et les PV
  // commencés ou en correction ; les autres séances passées (PV validés, archivés dans Comité › Séances) dans
  // « Reprendre un ancien PV ».
  const jour = today();
  const dernierePassee = [...meetings].reverse().find((x) => x.date < jour);
  const pvEnCours = (x: Meeting) =>
    !!x.minutes && (x.minutes.valideLe ? !!x.minutes.enCorrection : !!x.minutes.demarreLe || Object.values(x.minutes.notes ?? {}).some((n) => n.trim()));
  const valide = (x: Meeting) => !!x.minutes?.valideLe && !x.minutes.enCorrection;
  const anciennes = meetings.filter((x) => x.date < jour && (x.id !== dernierePassee?.id || valide(x)) && !pvEnCours(x)).reverse();
  const courantes = meetings.filter((x) => !anciennes.includes(x) || x.id === meetingId);
  const choisirSeance = (id: string) => {
    setMeetingId(id);
    setMsg('');
    setOpenNotes({});
  };
  const optionSeance = (x: Meeting) => (
    <option key={x.id} value={x.id}>
      {x.titre} – {fmtDate(x.date)}{x.minutes?.valideLe ? ` ✓${(x.minutes.version ?? 1) > 1 ? ` v${x.minutes.version}` : ''}` : ''}
    </option>
  );
  // Excuses et retards annoncés avant la séance : excusés et motifs repris dans le PV tant qu'il n'est pas validé.
  const m: MeetingMinutes = avecAnnonces({ ...EMPTY_MINUTES, ...s1?.minutes }, s1);
  const committee = committeeOf(data);
  const person = (id: string) => data.people.find((p) => p.id === id);
  // Titre : le nom du comité (comme l'ordre du jour) ; avec la date de la séance pour nommer le PDF, l'archive et l'email.
  const nomComite = club?.espace.nom ?? 'Comité';
  const titre = s1 ? `${nomComite} ${shortDate(s1.date)}` : nomComite;
  const secretaire = data.people.find((p) => p.actif && p.roles.includes('secretaire'));
  const version = m.version ?? 0;
  const locked = !!m.valideLe && !m.enCorrection; // PV validé : lecture seule jusqu'à « Corriger »
  const editable = can('tab.minutes') && !locked;
  const draftVersion = m.enCorrection ? version + 1 : version || 1;
  // Options du PV de la séance ; non réglées : celles du PV précédent.
  const opts: Required<PvOptions> = { ...OPTIONS, ...s0?.minutes?.options, ...m.options };
  const depot = urlDepot(data.reglagesOdj?.depotPv);
  const setOpt = (patch: PvOptions) => setMinutes((x) => { x.options = { ...opts, ...patch }; }, { annulable: 'Options du PV' });

  useEffect(() => {
    if (view !== 'pv') return;
    const before = document.title;
    document.title = `PV ${titre}${draftVersion > 1 ? ` v${draftVersion}` : ''}`;
    return () => {
      document.title = before;
    };
  }, [view, titre, draftVersion]);

  // `annulable` : action que « Annuler » peut défaire (présences, début de séance…) ; pas la frappe des notes.
  const setMinutes = (fn: (x: MeetingMinutes, d: AppData) => void, o?: { annulable?: string; suite?: boolean }) =>
    s1 &&
    updateSilent((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      const avant = avecAnnonces({ ...EMPTY_MINUTES, ...x.minutes }, x);
      const mm: MeetingMinutes = structuredClone(avant);
      fn(mm, d);
      x.minutes = mm;
      // Excusé retiré (ou finalement présent) dans le PV : l'excuse annoncée tombe aussi ; motif changé : l'annonce suit.
      reporterSurAnnonces(x, avant, mm);
    }, o);
  // Tâche modifiée, créée (avant : null) ou supprimée depuis le PV : son état d'avant (la première fois) et d'après,
  // pour « Remettre à zéro » ; terminer une tâche répétée crée l'occurrence suivante, retenue comme créée.
  const retenir = (x: MeetingMinutes, d: AppData, id: string, avant: Task | null) => {
    const r = (x.tachesAvant = { ...x.tachesAvant });
    const apres = d.tasks.find((y) => y.id === id) ?? null;
    r[id] = { avant: r[id] ? r[id].avant : avant && structuredClone(avant), apres: apres && structuredClone(apres) };
    const suite = apres?.suivanteId && apres.suivanteId !== avant?.suivanteId ? d.tasks.find((y) => y.id === apres.suivanteId) : undefined;
    if (suite && !r[suite.id]) r[suite.id] = { avant: null, apres: structuredClone(suite) };
  };
  const setNote = (key: string, v: string) =>
    setMinutes((x) => {
      if (v.trim()) x.notes[key] = v;
      else delete x.notes[key];
    });
  // PV figé : le changement passe aussi dans le point tel que le PV le montre (`avant` : son état avant le changement).
  const reporter = (x: MeetingMinutes, d: AppData, id: string, avant: TaskSnapshot) => {
    const apres = d.tasks.find((y) => y.id === id);
    if (x.etats?.[id] && apres) x.etats = { ...x.etats, [id]: reporterChangement(x.etats[id], avant, apres) };
  };
  const record = (t: Task, changes: string[], avant?: Task, suite?: boolean) =>
    changes.length &&
    setMinutes((x, d) => {
      x.journal = [...(x.journal ?? []), { taskId: t.id, titre: t.titre, changes, at: new Date().toISOString() }];
      if (avant) {
        retenir(x, d, t.id, avant);
        reporter(x, d, t.id, stateOf(avant));
      }
    }, { suite });

  // Modifications faites dans la fiche tâche ouverte depuis le PV : enregistrées une fois la tâche sauvegardée.
  useEffect(() => {
    if (!pending || edit) return;
    const t = data.tasks.find((x) => x.id === pending.id);
    // Inscrit au PV avec la modification de la tâche : « Annuler » les défait ensemble.
    const tache = pending.tache;
    if (pending.isNew) {
      if (t)
        setMinutes((x, d) => {
          x.nouvelles = [...(x.nouvelles ?? []), t.id];
          retenir(x, d, t.id, null);
          if (x.etats) x.etats = { ...x.etats, [t.id]: { ...stateOf(t), rang: 'p1' } };
        }, { suite: true });
    } else if (!t && pending.before) {
      setMinutes((x, d) => { x.supprimees = [...(x.supprimees ?? []), pending.before!.titre]; if (tache) retenir(x, d, tache.id, tache); }, { suite: true });
    } else if (t && pending.before) {
      record(t, diffTask(data, pending.before, t), tache, true);
    }
    // Points rattachés depuis la fiche (sous-points) : inscrits au PV, comme une tâche décidée en séance (créés), ou avec
    // le rattachement dans le journal (points existants) ; figé : ajoutés aux points du PV.
    if (t && pending.ids) {
      const existaient = new Set(pending.ids);
      const enfants = data.tasks.filter((x) => x.parentId === t.id && !pending.enfants?.includes(x.id));
      if (enfants.length)
        setMinutes((x, d) => {
          for (const c of enfants) {
            if (existaient.has(c.id)) {
              x.journal = [...(x.journal ?? []), { taskId: c.id, titre: c.titre, changes: [`rattaché à « ${t.titre} »`], at: new Date().toISOString() }];
              retenir(x, d, c.id, { ...structuredClone(c), parentId: undefined });
            } else {
              x.nouvelles = [...(x.nouvelles ?? []), c.id];
              retenir(x, d, c.id, null);
            }
            if (x.etats && !x.etats[c.id]) x.etats = { ...x.etats, [c.id]: { ...stateOf(c), rang: 'p1' } };
          }
        }, { suite: true });
    }
    setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pending, edit]);

  // PV d'une séance passée : ses points figés à la fin de la séance, une fois (d'après l'historique des tâches), puis
  // gardés dans le PV. En attendant, ou si l'historique manque : les points tels qu'aujourd'hui.
  const [figeage, setFigeage] = useState<{ seance: string; erreur?: string } | null>(null);
  const lireHistorique = club?.historique;
  const figer = can('tab.minutes') && !!lireHistorique && aFiger(s1, today());
  useEffect(() => {
    if (!figer || !s1 || !lireHistorique) return;
    let fini = false;
    setFigeage({ seance: s1.id });
    figerPoints(data, { s0, s1, s2 }, m, lireHistorique, data.reglagesOdj?.joursApres).then(
      (e) => {
        if (fini) return;
        setMinutes((x) => {
          x.etats = x.etats ?? e;
        });
        setFigeage(null);
      },
      (err: unknown) => {
        if (!fini) setFigeage({ seance: s1.id, erreur: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => {
      fini = true;
    };
    // Une fois par séance : les données qui changent pendant la lecture ne la relancent pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figer, s1?.id]);
  // PV figé avant qu'on y garde la remarque des points : leur remarque à la fin de la séance, retrouvée une fois (sinon
  // une remarque écrite après la séance s'y affichait, à la correction du PV par exemple).
  const remarquesManquantes = can('tab.minutes') && !!lireHistorique && remarquesAFiger(m);
  useEffect(() => {
    if (!remarquesManquantes || !s1 || !lireHistorique) return;
    let fini = false;
    figerRemarques(data, s1, m, lireHistorique).then(
      (r) => {
        if (fini) return;
        setMinutes((x) => {
          if (!x.etats) return;
          x.etats = Object.fromEntries(Object.entries(x.etats).map(([id, e]) => [id, e.remarque === undefined ? { ...e, remarque: r[id] ?? '' } : e]));
        });
      },
      // Historique illisible : la remarque d'aujourd'hui, nouvel essai à la prochaine ouverture.
      (err: unknown) => console.warn('Remarques du PV à la fin de la séance introuvables', err),
    );
    return () => {
      fini = true;
    };
    // Une fois par séance, comme ci-dessus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remarquesManquantes, s1?.id]);

  // ---------- Points de la séance ----------
  // Séance passée : points figés à la fin de la séance (etats), sinon tels qu'aujourd'hui.
  const etats = m.etats;
  const sel = selectAgenda(data, s0, s1, s2, { ...FULL_AGENDA, joursApres: data.reglagesOdj?.joursApres, retires: s1?.odjRetires });
  const bucket = new Map<string, 'late' | 'p1' | 'p2' | 'bilan'>();
  if (etats) Object.entries(etats).forEach(([id, e]) => bucket.set(id, e.rang));
  else {
    sel.late.forEach((t) => bucket.set(t.id, 'late'));
    sel.avant1.forEach((t) => bucket.set(t.id, 'p1'));
    sel.avant2.forEach((t) => bucket.set(t.id, 'p2'));
    sel.bilan.forEach((t) => bucket.set(t.id, 'bilan'));
  }
  const journal = m.journal ?? [];
  const nouvelles = new Set(m.nouvelles ?? []);
  // Tâche telle que le PV la montre (figée) ; les changements se font toujours sur la tâche telle qu'elle est.
  const vue = (t: Task) => vueFigee(t, etats?.[t.id]);
  const vivante = (t: Task) => data.tasks.find((x) => x.id === t.id) ?? t;
  const newTasks = data.tasks.filter((t) => nouvelles.has(t.id)).map(vue);
  const deleted = m.supprimees ?? [];
  // Points affichés : ordre du jour (figé : celui de la fin de la séance) + points présents au début de la séance +
  // tâches modifiées ou créées depuis le PV ; sauf ceux supprimés de l'ordre du jour de la séance (même après coup).
  const retires = retiresDe(s1);
  const ids = new Set<string>([...bucket.keys(), ...(etats ? [] : (m.pointIds ?? [])), ...journal.map((j) => j.taskId), ...nouvelles]);
  const duPv = data.tasks.filter((t) => ids.has(t.id) && (!retires.has(t.id) || nouvelles.has(t.id)));
  // Points rattachés à un point du PV (sous-points) : ils le suivent, même rattachés ailleurs ou après la séance ; terminés,
  // seulement depuis la séance précédente.
  const principaux = new Set(duPv.map((t) => t.id));
  const sousPoints = data.tasks.filter(
    (c) => !!c.parentId && principaux.has(c.parentId) && !principaux.has(c.id) && !retires.has(c.id) && (!isDone(data, c) || finLe(c) >= sel.since),
  );
  const points = [...duPv, ...sousPoints].map(vue);
  const polls = (data.polls ?? []).filter((p) => !retires.has(p.id) && (isOpen(p) || (p.clotureLe ?? p.dateLimite ?? '') >= sel.since));
  // Changements faits depuis le PV, résumés : l'état du départ et celui de la fin (plusieurs changements de statut : un seul).
  const changesOf = (t: Task) => resumerChangements(journal.filter((j) => j.taskId === t.id).flatMap((j) => j.changes));
  const isNewTask = (t: Task) => nouvelles.has(t.id);

  const meta = (t: Task) => {
    const b = bucket.get(t.id);
    const vus = avecVus && t.pourInfo && !t.paiement && texteVu(bilanVu(t, attendus[t.id]));
    return [
      t.responsables.map((id) => initials(person(id))).join(', '),
      b !== 'bilan' && t.delai && shortDate(t.delai),
      b === 'late' ? '⚠ en retard' : b === 'p2' && s2 ? echeanceSuivante(t, s2) : b === 'bilan' ? etatTerminee(data, t, false) : '',
      isNewTask(t) && '🆕 nouvelle',
      // Pour info : qui l'a vue (réglage de l'ordre du jour).
      vus && `👁 ${vus}`,
    ].filter(Boolean) as string[];
  };

  // Regroupement : section → sous-section → tâches, dans l'ordre de l'ordre du jour (même tri, mêmes sous-sections,
  // tâches rattachées sous leur tâche principale : voir ordreSection et blocsSection).
  const reglagesOdj = prefs.pv;
  const bySection = data.sections.map((sec) => {
    const tasks = ordreSection(data, points.filter((t) => t.sectionId === sec.id), sec, (t) => bucket.get(t.id), reglagesOdj?.tri);
    const subs = blocsSection(tasks, reglagesOdj?.colonnes?.sousSection ?? true);
    const ici = polls.filter((p) => pollSection(data, p) === sec.id);
    const lie = (p: Poll) => !!p.taskId && tasks.some((t) => t.id === p.taskId);
    return { sec, subs, polls: ici.filter((p) => !lie(p)), lies: ici.filter(lie) };
  });
  // Sondages rattachés à une tâche : sous elle.
  const pollsDe = (t: Task) => polls.filter((p) => p.taskId === t.id && pollSection(data, p) === t.sectionId);
  const orphanPolls = polls.filter((p) => !data.sections.some((x) => x.id === pollSection(data, p)));

  // ---------- Actions de séance ----------
  const start = () =>
    setMinutes((x) => {
      x.heureDebut = x.heureDebut ?? nowHM();
      x.demarreLe = new Date().toISOString();
      x.pointIds = [...bucket.keys()];
    }, { annulable: `Séance « ${s1?.titre} » démarrée` });
  // Présent, arrivé en retard (présent aussi, avec son heure d'arrivée) ou excusé ; re-clic sur le choix en cours : retiré.
  const presenceDe = (x: MeetingMinutes, id: string) =>
    x.excuses.includes(id) ? 'excuse' : x.presents.includes(id) ? (x.retards?.[id] !== undefined ? 'retard' : 'present') : undefined;
  const setPresence = (id: string, kind: 'present' | 'retard' | 'excuse') =>
    setMinutes((x) => {
      const avant = presenceDe(x, id);
      x.presents = x.presents.filter((v) => v !== id);
      x.excuses = x.excuses.filter((v) => v !== id);
      const retards = { ...x.retards };
      delete retards[id];
      if (kind !== avant) {
        if (kind === 'excuse') x.excuses.push(id);
        else x.presents.push(id);
        // Arrivée : maintenant pendant la séance, sinon l'heure annoncée (modifiable à côté).
        if (kind === 'retard') retards[id] = x.demarreLe && !x.heureFin ? nowHM() : annonceDe(s1, id)?.vers ?? '';
      }
      if (Object.keys(retards).length) x.retards = retards;
      else delete x.retards;
    }, { annulable: `Présences : ${fullName(person(id))}` });
  const setArrivee = (id: string, h: string) =>
    setMinutes((x) => {
      if (x.retards?.[id] !== undefined) x.retards = { ...x.retards, [id]: h };
    }, { annulable: `Arrivée de ${fullName(person(id))}` });
  const setMotif = (id: string, v: string) =>
    setMinutes((x) => {
      const motifs = { ...x.motifs };
      if (v) motifs[id] = v;
      else delete motifs[id];
      if (Object.keys(motifs).length) x.motifs = motifs;
      else delete x.motifs;
    }, { annulable: `Motif de ${fullName(person(id))}` });
  // Retards annoncés pas encore arrivés : « Tous présents » les laisse de côté (« Retard » à leur arrivée).
  const retardsAttendus = new Set((s1?.retards ?? []).map((r) => r.personId).filter((id) => !m.presents.includes(id) && !m.excuses.includes(id)));

  // Vote d'un point en séance (fiche du PV, onglet « Vote ») : les voix des membres présents, gardées dans le PV.
  const presentsVote = committee.filter((p) => m.presents.includes(p.id));
  const voteDe = (t: Task) => bilanVote(m.votes?.[t.id], m.presents);
  const setVoix = (t: Task, voix: (avant: Record<string, Voix>) => Record<string, Voix>) =>
    setMinutes((x) => {
      const votes = { ...x.votes };
      const v = voix({ ...votes[t.id] });
      if (Object.keys(v).length) votes[t.id] = v;
      else delete votes[t.id];
      if (Object.keys(votes).length) x.votes = votes;
      else delete x.votes;
    }, { annulable: `Vote sur « ${t.titre} »` });
  const votePv = (t: Task): VotePv => ({
    presents: presentsVote,
    voix: m.votes?.[t.id],
    modifiable: editable,
    voter: (id, v) =>
      setVoix(t, (x) => {
        if (v) x[id] = v;
        else delete x[id];
        return x;
      }),
    tous: (v) => setVoix(t, () => (v ? Object.fromEntries(presentsVote.map((p) => [p.id, v])) : {})),
  });

  // Point changé depuis le PV (sa ligne, ou la fiche du PV) : `t` tel que le PV le montre, `patch` les champs changés.
  // Enregistré sur la tâche telle qu'elle est (un champ changé ailleurs depuis la séance est gardé) et inscrit au PV par
  // rapport à ce que le PV montrait, pour ces champs seulement. false : pas enregistré (question refusée).
  const changerPoint = (t: Task, patch: Partial<Task>) => {
    const live = vivante(t);
    const after: Task = { ...live, ...patch, ...(patch.checklist ? { checklist: fusionChecklist(live.checklist, t.checklist, patch.checklist) } : {}) };
    if (JSON.stringify(after) === JSON.stringify(live)) return true;
    const q = finAnticipee(data, live, after);
    if (q && !confirm(q)) return false;
    saveTask(after, false);
    // Étapes ajoutées ailleurs depuis la séance : déjà là (pas « ajoutées » au PV).
    const base = { ...stateOf(t), sous: { ...stateOf(live).sous, ...stateOf(t).sous } };
    const changes = diffTask(data, base, after).filter((l) => CHAMP_DU_CHANGEMENT.some(([debut, k]) => l.startsWith(debut) && k in patch));
    // Point principal changé (fiche du PV, onglet « Rattachements ») : comme « Rattacher un point existant ».
    if ('parentId' in patch && after.parentId !== live.parentId) changes.push(texteRattache(after.parentId, live.parentId));
    setMinutes((x, d) => {
      if (changes.length) x.journal = [...(x.journal ?? []), { taskId: t.id, titre: t.titre, changes, at: new Date().toISOString() }];
      retenir(x, d, t.id, live);
      reporter(x, d, t.id, stateOf(live));
    }, { suite: true });
    return true;
  };
  const quickChange = (t: Task, patch: Partial<Task>) => void changerPoint(t, patch);
  // « rattaché à « … » » / « détaché de « … » » (journal du PV).
  const texteRattache = (parentId: string | undefined, avant: string | undefined) => {
    const titre = (id?: string) => data.tasks.find((x) => x.id === id)?.titre ?? '?';
    return parentId ? `rattaché à « ${titre(parentId)} »` : `détaché de « ${titre(avant)} »`;
  };
  const openTask = (t: Task) => {
    const live = vivante(t);
    setEdit({ task: live, isNew: false });
    setPending({
      id: t.id, before: stateOf(live), tache: structuredClone(live), isNew: false,
      ids: data.tasks.map((x) => x.id), enfants: data.tasks.filter((x) => x.parentId === live.id).map((x) => x.id),
    });
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

  // ---------- Fiche du PV ----------
  // Un point à la fois, par-dessus la prise de notes (à gauche le point et ses notes, à droite la projection) : la pilule
  // passe d'un point à l'autre sans rouvrir chacun, et le point quitté est enregistré. `brouillon` : le point changé dans
  // la fiche, pas encore enregistré ; `origine` : tel que la fiche le montrait avant.
  // Vue en fenêtres : une option d'affichage (pilule), retenue sur l'appareil ; rouverte au premier point (cle '') ; pas
  // sur téléphone (le PV ne s'y tient pas).
  const telephone = useEcranEtroit();
  const [fiche, setFiche] = useState<{ cle: string; origine?: Task; brouillon?: Task } | null>(() =>
    lireOption(CLE_FENETRES) && !matchMedia(ETROIT).matches ? { cle: '' } : null,
  );
  const [ficheErreur, setFicheErreur] = useState('');
  // Fiche refermée : la prise de notes revient à son dernier point.
  const [revenirA, setRevenirA] = useState<string | null>(null);
  // Pièce jointe projetée, point par point : la même dans la prise de notes et dans la fiche.
  const choixPieces = useState<Record<string, string>>({});
  // Fichiers ajoutés ou retirés dans la fiche (onglet « Documents ») : les retirés sont effacés une fois le point enregistré.
  const docsFiche = useRef<DocTracking>({ added: [], removed: [] });
  // Arrêts de la fiche, dans l'ordre de la prise de notes : points (et leurs sondages), sondages, note de chaque section, Divers.
  const arrets: ArretPv[] = [];
  bySection.forEach((g, i) => {
    const section = `${i + 1}. ${g.sec.nom}`;
    const sectionId = g.sec.id;
    const sondage = (p: Poll, t?: Task) => arrets.push({ cle: `poll:${p.id}`, nom: `Sondage : ${p.question}`, section, sectionId, poll: p, pointDuSondage: t });
    g.subs.forEach((sub, j) =>
      sub.tasks.forEach((t) => {
        arrets.push({ cle: `task:${t.id}`, nom: t.titre, section, sous: sub.label ? `${letter(j)}. ${sub.label}` : undefined, sectionId, tache: t });
        pollsDe(t).forEach((p) => sondage(p, t));
      }),
    );
    g.polls.forEach((p) => sondage(p));
    if (editable || m.notes[`sec:${g.sec.id}`]?.trim()) arrets.push({ cle: `sec:${g.sec.id}`, nom: `Notes de « ${g.sec.nom} »`, section, sectionId });
  });
  orphanPolls.forEach((p) => arrets.push({ cle: `poll:${p.id}`, nom: `Sondage : ${p.question}`, section: 'Sondages', poll: p }));
  arrets.push({ cle: 'divers', nom: 'Notes de « Divers »', section: 'Divers' });
  const iFiche = fiche ? arrets.findIndex((a) => a.cle === fiche.cle) : -1;
  const arret = iFiche >= 0 ? arrets[iFiche] : undefined;
  const ouvrirFiche = (cle: string) => {
    ecrireOption(CLE_FENETRES, true);
    setFiche({ cle });
    setFicheErreur('');
    docsFiche.current = { added: [], removed: [] };
  };
  const setPointFiche: SetT = (fn) =>
    setFiche((f) => {
      if (!f || !arret?.tache || f.cle !== arret.cle) return f;
      const origine = f.origine ?? arret.tache;
      return { ...f, origine, brouillon: fn(f.brouillon ?? origine) };
    });
  // Point changé dans la fiche : enregistré (seulement les champs changés). false : pas enregistré (intitulé vide, question refusée).
  const sauverFiche = (): boolean => {
    const f = fiche;
    if (!f?.origine || !f.brouillon) return true;
    const { origine, brouillon } = f;
    const champs = [...new Set([...Object.keys(origine), ...Object.keys(brouillon)])] as (keyof Task)[];
    const patch = Object.fromEntries(champs.filter((k) => JSON.stringify(origine[k]) !== JSON.stringify(brouillon[k])).map((k) => [k, brouillon[k]])) as Partial<Task>;
    if (patch.titre !== undefined) {
      if (!patch.titre.trim()) {
        setFicheErreur('Le point doit avoir un intitulé.');
        return false;
      }
      patch.titre = patch.titre.trim();
    }
    if (Object.keys(patch).length && !changerPoint(origine, patch)) return false;
    // Fichiers retirés du point : effacés, s'ils ne sont joints à aucun autre point (occurrences d'un point répété…).
    const retires = docsFiche.current.removed.filter(
      (id) => !brouillon.documents?.some((d) => d.id === id) && !data.tasks.some((x) => x.id !== origine.id && x.documents?.some((d) => d.id === id)),
    );
    if (retires.length) void deleteFiles(retires);
    docsFiche.current = { added: [], removed: [] };
    setFiche((x) => (x?.cle === f.cle ? { cle: x.cle } : x));
    setFicheErreur('');
    return true;
  };
  // Vers un autre arrêt (null : fiche refermée) ; le point quitté est enregistré, sa note aussi (en quittant le champ).
  const allerFiche = (cle: string | null) => {
    const actif = document.activeElement;
    if (actif instanceof HTMLElement && actif.closest('.pv-fiche-ecran')) actif.blur();
    if (!sauverFiche()) return;
    if (cle) return ouvrirFiche(cle);
    if (fiche) setRevenirA(fiche.cle);
    ecrireOption(CLE_FENETRES, false);
    setFiche(null);
    setFicheErreur('');
  };
  useEffect(() => {
    if (!revenirA) return;
    defile.montrer(revenirA);
    setRevenirA(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenirA]);
  // Arrêt pas (ou plus) là (vue rouverte au chargement, point supprimé…) : celui à sa place, sinon le premier.
  const dernierArret = useRef(0);
  if (iFiche >= 0) dernierArret.current = iFiche;
  useEffect(() => {
    if (fiche && iFiche < 0) setFiche({ cle: arrets[Math.min(dernierArret.current, arrets.length - 1)].cle });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiche, iFiche]);
  // Pilule : la vue en fenêtres, au point en cours de la prise de notes (où l'on a cliqué ou écrit, sinon en haut de
  // l'écran) ; re-clic : retour à la prise de notes, à ce point.
  const basculerFenetres = () => {
    if (fiche) return allerFiche(null);
    if (telephone) return;
    const cle = defile.cleEnCours();
    ouvrirFiche(cle && arrets.some((a) => a.cle === cle) ? cle : arrets[0].cle);
  };
  // Écran devenu étroit (téléphone) : la vue se referme, le point enregistré ; l'option reste pour l'ordinateur.
  useEffect(() => {
    if (!telephone || !fiche) return;
    if (sauverFiche()) setFiche(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telephone]);
  // Échap : fiche refermée (pas quand une fenêtre est ouverte par-dessus, ni une liste déroulante).
  const allerFicheRef = useRef(allerFiche);
  allerFicheRef.current = allerFiche;
  const ficheOuverte = !!fiche;
  useEffect(() => {
    if (!ficheOuverte) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.modal-back')) return;
      allerFicheRef.current(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ficheOuverte]);
  // Page quittée la fiche ouverte : le point changé est enregistré.
  const sauverFicheRef = useRef(sauverFiche);
  sauverFicheRef.current = sauverFiche;
  useEffect(() => () => void sauverFicheRef.current(), []);
  // Onglet « Rattachements » de la fiche : un point existant rattaché ou détaché tout de suite, inscrit au PV (il y suit
  // son point principal) ; un nouveau point rattaché, comme une tâche décidée en séance ; un point rattaché, ouvert
  // par-dessus (ses changements inscrits au PV).
  const rattacherDepuisPv = (id: string, parentId: string | undefined) => {
    const avant = data.tasks.find((x) => x.id === id);
    if (!avant || avant.parentId === parentId) return;
    linkTask(id, parentId);
    setMinutes((x, d) => {
      x.journal = [...(x.journal ?? []), { taskId: id, titre: avant.titre, changes: [texteRattache(parentId, avant.parentId)], at: new Date().toISOString() }];
      retenir(x, d, id, avant);
      if (x.etats && parentId && !x.etats[id]) x.etats = { ...x.etats, [id]: { ...stateOf(avant), rang: 'p1' } };
    }, { suite: true });
  };
  const ouvrirDepuisFiche = (x: Task, nouvelle: boolean) => {
    if (!nouvelle) return openTask(x);
    setEdit({ task: x, isNew: true });
    setPending({ id: x.id, isNew: true });
  };
  // Pilule, fiche ouverte : d'un arrêt de la fiche à l'autre ; « section précédente » revient d'abord au début de la section.
  const debutSection = (i: number) => arrets.findIndex((a) => a.section === arrets[i].section);
  const ficheNav = arret && {
    sectionPrec: iFiche > debutSection(iFiche) ? debutSection(iFiche) : iFiche > 0 ? debutSection(iFiche - 1) : -1,
    pointPrec: iFiche - 1,
    pointSuiv: iFiche + 1 < arrets.length ? iFiche + 1 : -1,
    sectionSuiv: arrets.findIndex((a, k) => k > iFiche && a.section !== arret.section),
  };
  // Au clavier : ↑ ↓ d'un point à l'autre, comme les flèches simples de la pilule (fiche du PV ou prise de notes).
  const pointVoisin = useRef<(sens: 1 | -1) => void>(() => {});
  pointVoisin.current = (sens) => {
    if (!ficheNav) return defile.aller('point', sens);
    const i = sens > 0 ? ficheNav.pointSuiv : ficheNav.pointPrec;
    if (i >= 0) allerFiche(arrets[i].cle);
  };
  useEffect(() => {
    if (view !== 'saisie') return;
    // Dernier clic dans un document projeté : ↑ ↓ le font défiler (pas les points).
    let dansDocument = false;
    const clic = (e: PointerEvent) => {
      dansDocument = e.target instanceof Element && !!e.target.closest('.min-projection-doc');
    };
    const touche = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
      const sens = e.key === 'ArrowDown' ? 1 : -1;
      if (dansDocument || document.querySelector('.modal-back') || !flecheLibre(e.target, sens)) return;
      e.preventDefault();
      pointVoisin.current(sens);
    };
    window.addEventListener('pointerdown', clic, true);
    window.addEventListener('keydown', touche);
    return () => {
      window.removeEventListener('pointerdown', clic, true);
      window.removeEventListener('keydown', touche);
    };
  }, [view]);

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

  // Remise à zéro d'un PV pas encore validé (commencé ou modifié par erreur) : notes, présences, heures effacées ; tâches
  // modifiées, créées ou supprimées depuis le PV comme avant (sauf ce qui a changé depuis ailleurs). Excuses annoncées gardées.
  const retour = Object.entries(m.tachesAvant ?? {});
  const annoncees = new Set((s1?.excuses ?? []).map((e) => e.personId));
  const pvTouche =
    !m.valideLe &&
    !!(m.demarreLe || m.heureDebut || m.heureFin || m.presents.length || m.excuses.some((id) => !annoncees.has(id)) || m.invites?.trim() ||
      Object.values(m.notes).some((n) => n.trim()) || journal.length || nouvelles.size || deleted.length || m.tousLesPoints || m.pointIds?.length || retour.length || m.votes);
  const remettreTaches = (tasks: Task[], conflit: () => void) => {
    const out = [...tasks];
    for (const [id, { avant, apres }] of retour) {
      const i = out.findIndex((t) => t.id === id);
      const r = revenir(i >= 0 ? out[i] : undefined, avant ?? undefined, apres ?? undefined, conflit) as Task | undefined;
      // Fichiers joints retirés depuis (tâche supprimée, fichier enlevé) : effacés, pas remis.
      const gardes = new Set((i >= 0 ? out[i].documents ?? [] : []).map((x) => x.id));
      const v = r?.documents?.some((x) => x.kind === 'fichier' && !gardes.has(x.id))
        ? { ...r, documents: r.documents.filter((x) => x.kind !== 'fichier' || gardes.has(x.id)) }
        : r;
      if (!v) {
        if (i >= 0) out.splice(i, 1);
      } else if (i >= 0) out[i] = structuredClone(v);
      else out.unshift(structuredClone(v));
    }
    return out;
  };
  const remettreAZero = () => {
    if (!s1) return;
    const n = retour.length;
    const gardees = new Set<string>();
    remettreTaches(data.tasks, () => gardees.add('x'));
    if (
      !confirm(
        `Remettre le PV du ${s1.titre} à zéro ?

Notes, présences, invités, heures et début de séance sont effacés.` +
          (n ? `
Les points modifiés, créés ou supprimés depuis le PV (${n}) reviennent comme avant${gardees.size ? ' (sauf ce qui a été changé depuis ailleurs)' : ''}.` : '') +
          `
Les excuses et retards annoncés restent. « Annuler » (en haut) permet de revenir en arrière.`,
      )
    )
      return;
    update((d) => {
      const x = d.meetings.find((y) => y.id === s1.id)!;
      d.tasks = remettreTaches(d.tasks, () => {});
      x.minutes = { ...EMPTY_MINUTES, options: x.minutes?.options };
    }, `PV du ${s1.titre} remis à zéro`);
    setOpenNotes({});
    setMsg(`↺ PV remis à zéro${n ? ' : points remis comme avant' : ''}. « Annuler » (en haut) pour revenir en arrière.`);
  };

  // Pilule flottante de la prise de notes : les gestes de la séance, en icônes, toujours à portée de main.
  const terminer = () => s1 && setMinutes((x) => { x.heureFin = nowHM(); }, { annulable: `Séance « ${s1.titre} » terminée` });
  const enregistrer = () => {
    // Note en cours de frappe : enregistrée tout de suite (sinon après une courte pause), puis envoyée au serveur ; le
    // point changé dans la fiche du PV aussi.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (!sauverFiche()) return;
    if (!cloud) return setToast('✓ Tout est enregistré (démo : dans ce navigateur).');
    setTimeout(() => {
      cloud.sync
        .flushNow()
        .then(() => setToast(cloud.sync.status === 'horsLigne' ? '⚠ Hors ligne : enregistré sur cet appareil, envoyé dès le retour de la connexion.' : '✓ Tout est enregistré sur le serveur.'))
        .catch((e: Error) => setToast(`⚠️ Envoi impossible pour l’instant (${e.message}) : nouvel essai automatique.`));
    }, 50);
  };
  const etatEnvoi = !cloud ? 'ok' : sync.status === 'horsLigne' ? 'off' : sync.status === 'envoi' || sync.pending ? 'envoi' : 'ok';
  // Section à l'écran (sous l'en-tête) : nouvelle tâche décidée de la pilule rangée dedans, si on peut y en créer.
  const secActuelle = fiche ? arret?.sectionId : sections.actuelle?.id;
  const secIci = secActuelle && can('tasks.createAny', secActuelle) ? secActuelle : undefined;
  const outils: OutilPilule[] = [
    { icone: 'annuler', titre: annulable ? `Annuler : ${annulable.action}` : 'Annuler (rien à annuler)', onClick: annuler, disabled: !annulable },
    { icone: 'refaire', titre: refaisable ? `Refaire : ${refaisable.action}` : 'Refaire (rien à refaire)', onClick: refaire, disabled: !refaisable },
    // D'une section à l'autre (double chevron, à l'extérieur) ou d'un point à l'autre (simple, au milieu) ; fiche du PV
    // ouverte : d'un point de la fiche à l'autre.
    ...(ficheNav
      ? ([
          {
            icone: 'sectionPrec',
            titre: ficheNav.sectionPrec < 0 ? 'Section précédente' : arrets[ficheNav.sectionPrec].section === arret?.section ? `Début de la section : ${arrets[ficheNav.sectionPrec].nom}` : `Section précédente : ${arrets[ficheNav.sectionPrec].section}`,
            onClick: () => allerFiche(arrets[ficheNav.sectionPrec].cle),
            disabled: ficheNav.sectionPrec < 0,
            separe: true,
          },
          {
            icone: 'pointPrec',
            titre: ficheNav.pointPrec < 0 ? 'Point précédent' : `Point précédent : ${arrets[ficheNav.pointPrec].nom}`,
            onClick: () => allerFiche(arrets[ficheNav.pointPrec].cle),
            disabled: ficheNav.pointPrec < 0,
          },
          {
            icone: 'pointSuiv',
            titre: ficheNav.pointSuiv < 0 ? 'Point suivant' : `Point suivant : ${arrets[ficheNav.pointSuiv].nom}`,
            onClick: () => allerFiche(arrets[ficheNav.pointSuiv].cle),
            disabled: ficheNav.pointSuiv < 0,
          },
          {
            icone: 'sectionSuiv',
            titre: ficheNav.sectionSuiv < 0 ? 'Section suivante' : `Section suivante : ${arrets[ficheNav.sectionSuiv].section}`,
            onClick: () => allerFiche(arrets[ficheNav.sectionSuiv].cle),
            disabled: ficheNav.sectionSuiv < 0,
          },
        ] satisfies OutilPilule[])
      : ([
          {
            icone: 'sectionPrec',
            titre: !sections.prec ? 'Section précédente' : sections.prec.i < 0 ? 'Haut de la page (séance, présences)' : `Section précédente : ${sections.prec.nom}`,
            onClick: () => defile.aller('section', -1),
            disabled: !sections.prec,
            separe: true,
          },
          {
            icone: 'pointPrec',
            titre: !parPoint.prec ? 'Point précédent' : parPoint.prec.i < 0 ? 'Haut de la page (séance, présences)' : `Point précédent : ${parPoint.prec.nom}`,
            onClick: () => defile.aller('point', -1),
            disabled: !parPoint.prec,
          },
          { icone: 'pointSuiv', titre: parPoint.suiv ? `Point suivant : ${parPoint.suiv.nom}` : 'Point suivant', onClick: () => defile.aller('point', 1), disabled: !parPoint.suiv },
          { icone: 'sectionSuiv', titre: sections.suiv ? `Section suivante : ${sections.suiv.nom}` : 'Section suivante', onClick: () => defile.aller('section', 1), disabled: !sections.suiv },
        ] satisfies OutilPilule[])),
    ...(data.sections.some((x) => can('tasks.createAny', x.id))
      ? [
          {
            icone: 'ajoutTache' as const,
            titre: secIci ? `Nouveau point décidé dans « ${data.sections.find((x) => x.id === secIci)?.nom} »` : 'Nouveau point décidé (section à choisir)',
            onClick: () => addTask(secIci ?? ''),
          },
        ]
      : []),
    // Affichage : la vue en fenêtres (un point à la fois, ses notes, la projection), et la projection (beamer) comme le
    // bouton à côté de « Prise de notes | PV » (pas sur téléphone).
    {
      icone: 'colonnes',
      titre: fiche ? 'Vue en fenêtres : revenir à la prise de notes' : 'Vue en fenêtres : un point à la fois (le point, ses notes, la projection)',
      onClick: basculerFenetres,
      actif: !!fiche,
      classe: 'pilule-fenetres',
      separe: true,
    },
    {
      icone: 'projection',
      titre: projection ? 'Projection : arrêter (pièces jointes du point en grand)' : 'Projection (beamer) : les pièces jointes du point en cours en grand, à droite',
      onClick: basculerProjection,
      actif: projection,
      classe: 'pilule-projeter',
    },
    !m.demarreLe
      ? { icone: 'demarrer', titre: 'Démarrer la séance', onClick: start, separe: true }
      : { icone: 'terminer', titre: m.heureFin ? `Séance terminée à ${hm(m.heureFin)}` : 'Terminer la séance', onClick: terminer, disabled: !!m.heureFin, separe: true },
    ...(m.demarreLe ? [{ titre: m.heureFin ? 'Durée de la séance' : 'Temps écoulé depuis le début de la séance', texte: <Chrono minutes={m} /> }] : []),
    {
      icone: 'enregistrer',
      titre: etatEnvoi === 'off' ? `Hors ligne${sync.pending ? ` · ${sync.pending} en attente` : ''} : enregistrer` : etatEnvoi === 'envoi' ? 'Envoi en cours… : enregistrer maintenant' : 'Tout est enregistré : enregistrer maintenant',
      onClick: enregistrer,
      etat: etatEnvoi,
    },
  ];

  // ---------- Texte et document du PV ----------
  const noteOf = (key: string) => m.notes[key]?.trim() ?? '';
  // Texte seul (copie, email) : sans la mise en forme.
  const texteNote = (key: string) => texteDe(noteOf(key)).trim();
  const taskInPv = (t: Task) => m.tousLesPoints || !!noteOf(`task:${t.id}`) || changesOf(t).length > 0 || isNewTask(t) || !!voteDe(t);
  const pollInPv = (p: Poll) => m.tousLesPoints || !!noteOf(`poll:${p.id}`) || !isOpen(p);
  const pvSections = bySection
    .map((g) => {
      const subs = g.subs.map((s) => ({ ...s, tasks: s.tasks.filter(taskInPv) })).filter((s) => s.tasks.length);
      const montrees = new Set(subs.flatMap((s) => s.tasks.map((t) => t.id)));
      return { ...g, subs, polls: [...g.polls, ...g.lies.filter((p) => !montrees.has(p.taskId!))].filter(pollInPv) };
    })
    .filter((g) => m.tousLesPoints || noteOf(`sec:${g.sec.id}`) || g.subs.length || g.polls.length);
  const others = orphanPolls.filter(pollInPv);
  // Annexes : fichiers et liens des tâches du PV, dans l'ordre du PV (nouvelles tâches comprises).
  const tachesPv = [...new Map([...pvSections.flatMap((g) => g.subs.flatMap((s) => s.tasks)), ...newTasks].map((t) => [t.id, t])).values()];
  // Sauf ceux retirés pour ce PV ; tant que le PV n'a pas son choix, ceux retirés de l'ordre du jour de la séance.
  const exclues = m.annexesExclues ?? s1?.odjAnnexesExclues ?? [];
  const annexes = annexesDe(tachesPv, exclues);
  // Mise en page : photos et PDF selon les options du PV ; un fichier réglé à part, comme dans l'ordre du jour tant que
  // le PV n'a pas son propre choix.
  const miseEnPage = { photos: opts.annexesParPage, pdf: opts.annexesPdfParPage, fichiers: m.annexesFormats ?? s1?.odjAnnexesFormats, pages: m.annexesPages ?? s1?.odjAnnexesPages };
  const joints = opts.annexes ? annexes : [];
  // Numéros d'annexe à côté du titre, quand les documents ne sont pas nommés (sinon : avec leur nom).
  const numeros = (t: Task) => (opts.documents && t.documents?.length ? [] : numerosDe(joints, t));
  const docs = (t: Task) => (opts.documents && t.documents?.length ? ` – 📎 ${docsTexte(t, joints)}` : '');
  const presentsTxt = m.presents.map((id) => `${fullName(person(id))} (${initials(person(id))})`).join(', ') || '—';
  // Avec leur motif (et l'heure d'arrivée des retards) : « Nom (arrivée à 20h15 – motif) ».
  const avecDetails = (id: string, details: (string | undefined)[]) => {
    const d = details.filter(Boolean).join(' – ');
    return `${fullName(person(id))}${d ? ` (${d})` : ''}`;
  };
  const motifDe = (id: string) => m.motifs?.[id]?.trim();
  const retardsTxt = m.presents.filter((id) => m.retards?.[id] !== undefined).map((id) => avecDetails(id, [m.retards?.[id] && `arrivée à ${hm(m.retards[id])}`, motifDe(id)])).join(', ');
  const excusesTxt = m.excuses.map((id) => avecDetails(id, [motifDe(id)])).join(', ') || '—';
  const absents = committee.filter((p) => !m.presents.includes(p.id) && !m.excuses.includes(p.id));
  const versionLine =
    draftVersion > 1
      ? m.enCorrection
        ? `Version ${draftVersion} (corrigée, non encore validée) – remplace la version ${version}`
        : `Version ${version} – corrigée le ${fmtDate(m.valideLe!.slice(0, 10))}`
      : '';

  // Comme l'ordre du jour : sous chaque point, ses étapes de checklist (☑ / ☐, si l'ordre du jour les montre), puis ses
  // points rattachés (ceux du même bloc), un niveau plus bas.
  const etapesPv = reglagesOdj?.colonnes?.checklist ?? true;
  const etapeTexte = (c: Task['checklist'][number]) => `${c.done ? '☑' : '☐'} ${c.label}`;
  const racinesDe = (tasks: Task[]) => tasks.filter((t) => !t.parentId || !tasks.some((x) => x.id === t.parentId));
  const rattachesDe = (t: Task, tasks: Task[]) => tasks.filter((x) => x.parentId === t.id && x.id !== t.id);
  const nouvelleInfo = (t: Task) =>
    [data.sections.find((x) => x.id === t.sectionId)?.nom, ...(opts.details ? meta(t).filter((x) => x !== '🆕 nouvelle') : [])].filter(Boolean).join(' · ');
  // Remarque du point (telle qu'à la fin de la séance, PV repris après coup), si les options du PV la montrent.
  const remarqueDe = (t: Task) => (opts.remarques ? t.remarque?.trim() ?? '' : '');
  const taskLine = (t: Task) =>
    `${t.titre}${opts.details && meta(t).length ? ` (${meta(t).join(' · ')})` : ''}${numeros(t).length ? ` 📎 annexe ${numeros(t).join(', ')}` : ''}${docs(t)}`;
  const plainText = () => {
    const out: string[] = [`PROCÈS-VERBAL – ${titre}`];
    if (versionLine) out.push(versionLine);
    if (s1) out.push(`${longDate(s1.date)} · ${hm(m.heureDebut ?? s1.heure)}${m.heureFin ? ` – ${hm(m.heureFin)}` : ''} · Lieu : ${texteLieu(s1)}`);
    out.push(`Présents : ${presentsTxt}`);
    if (retardsTxt) out.push(`En retard : ${retardsTxt}`);
    out.push(`Excusés : ${excusesTxt}`);
    if (m.invites?.trim()) out.push(`Invités : ${m.invites.trim()}`);
    out.push('');
    pvSections.forEach((g, i) => {
      out.push(`${i + 1}. ${g.sec.nom}`);
      let j = 0;
      // Un point, puis (un niveau plus bas) ses étapes et ses points rattachés : a. → ■ → ◦.
      const point = (t: Task, tasks: Task[], pad: string, marque: string) => {
        out.push(`${pad}${marque} ${taskLine(t)}`);
        if (remarqueDe(t)) remarqueDe(t).split('\n').filter((l) => l.trim()).forEach((l, k) => out.push(`${pad}   ${k ? '  ' : 'Remarque : '}${l.trim()}`));
        texteNote(`task:${t.id}`).split('\n').filter(Boolean).forEach((l) => out.push(`${pad}   → ${l}`));
        if (opts.misesAJour) changesOf(t).forEach((c) => out.push(`${pad}   ↻ ${c}`));
        const vote = voteDe(t);
        if (vote) out.push(`${pad}   Vote : ${texteVote(vote)}`);
        pollsDe(t).filter(pollInPv).forEach((p) => {
          out.push(`${pad}   ◦ Sondage : ${p.question} — ${pollSummary(p)}`);
          texteNote(`poll:${p.id}`).split('\n').filter(Boolean).forEach((l) => out.push(`${pad}      → ${l}`));
        });
        const sous = marque.endsWith('.') ? '■' : '◦';
        if (etapesPv) t.checklist.forEach((c) => out.push(`${pad}   ${sous} ${etapeTexte(c)}`));
        rattachesDe(t, tasks).forEach((c) => point(c, tasks, `${pad}   `, sous));
      };
      g.subs.forEach((s) => {
        const pad = s.label ? '      ' : '   ';
        if (s.label) out.push(`   ${letter(j++)}. ${s.label}`);
        racinesDe(s.tasks).forEach((t) => point(t, s.tasks, pad, s.label ? '■' : `${letter(j++)}.`));
      });
      g.polls.forEach((p) => {
        out.push(`   ${letter(j++)}. Sondage : ${p.question} — ${pollSummary(p)}`);
        texteNote(`poll:${p.id}`).split('\n').filter(Boolean).forEach((l) => out.push(`      → ${l}`));
      });
      // Note de la section : après ses points.
      if (noteOf(`sec:${g.sec.id}`)) out.push(...texteNote(`sec:${g.sec.id}`).split('\n').map((l) => `   ${l}`));
    });
    let n = pvSections.length;
    others.forEach((p) => out.push(`${++n}. Sondage : ${p.question} — ${pollSummary(p)}`));
    if (noteOf('divers')) out.push(`${++n}. Divers`, ...texteNote('divers').split('\n').map((l) => `   ${l}`));
    if (newTasks.length) {
      out.push('', 'NOUVEAUX POINTS DÉCIDÉS');
      newTasks.forEach((t) => out.push(`   ■ ${t.titre} (${nouvelleInfo(t)})${docs(t)}`));
    }
    if (opts.annexes && annexes.length) {
      out.push('', 'ANNEXES');
      annexes.forEach((a) => out.push(`   ${a.n}. ${a.d.nom} (${annexeInfo(a, miseEnPage.pages)})`));
    }
    if (deleted.length) out.push('', `Points supprimés : ${deleted.join(', ')}`);
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
    window.location.href = lienMailto(to, subject, body);
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
      // Excusés et motifs annoncés (ordre du jour, « Je serai absent(e) / en retard ») : enregistrés dans le PV validé, comme affichés.
      const mm: MeetingMinutes = { ...avecAnnonces({ ...EMPTY_MINUTES, ...x.minutes }, x), valideLe: now, validePar: user.id, version: n, enCorrection: false };
      delete mm.tachesAvant;
      // Fichiers joints : le choix du moment est fixé (l'ordre du jour peut encore changer).
      mm.annexesExclues = mm.annexesExclues ?? x.odjAnnexesExclues ?? [];
      mm.annexesFormats = mm.annexesFormats ?? x.odjAnnexesFormats;
      mm.annexesPages = mm.annexesPages ?? x.odjAnnexesPages;
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

  // Tâche liée dont la tâche principale est aussi un point de la section : affichée en retrait sous elle.
  const isChild = (t: Task) => !!t.parentId && points.some((x) => x.id === t.parentId && x.sectionId === t.sectionId);
  const taskRow = (t: Task) => {
    const ch = changesOf(t);
    const b = bucket.get(t.id);
    const can2 = editable && canEditTask(t);
    return (
      <div key={t.id} data-point={t.titre} data-tache={t.id} data-arret={`task:${t.id}`} className={`min-task ${ch.length ? 'changed' : ''} ${isNewTask(t) ? 'new' : ''} ${b === 'late' ? 'late' : ''} ${isDone(data, t) ? 'done' : ''} ${isChild(t) ? 'child' : ''}`}>
        <div className="min-task-head">
          <span className="min-title">
            {isChild(t) && <span className="muted">↳ </span>}
            {/* Un appui sur le titre ouvre le point (le modifier, comme dans la liste des points). */}
            {editable ? (
              <button type="button" className="min-ouvrir" title="Ouvrir le point" onClick={() => openTask(t)}>{t.titre}</button>
            ) : (
              t.titre
            )}{' '}
            <span className="odj-meta">({meta(t).join(' · ')})</span>
            {t.remarque && <span className="odj-rem"> – <AvecLiens texte={t.remarque.trim()} /></span>}
          </span>
          {editable && (
            <span className="min-controls">
              <select className="min-status" value={t.statusId} disabled={!can2} onChange={(e) => quickChange(t, { statusId: e.target.value })} aria-label={`Statut de ${t.titre}`}>
                {data.statuses.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              <input type="date" className="min-date" value={t.delai} disabled={!can2} title={t.delaiRef ? 'Délai calé sur un événement, une séance ou une étiquette (le changer à la main le détache)' : 'Délai'}
                onChange={(e) => quickChange(t, { delai: e.target.value, delaiRef: undefined })} />
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
                    onChange={() => quickChange(t, { checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !c.done } : x)) })}
                  />
                  <span className={c.done ? 'strike' : ''}>{c.label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {ch.length > 0 && <div className="min-changes">↻ {ch.join(' · ')}</div>}
        {voteDe(t) && <div className="min-vote">Vote : {texteVote(voteDe(t)!)}</div>}
        {noteToggle(`task:${t.id}`, 'Note / décision sur ce point…')}
      </div>
    );
  };
  // Sondage rattaché à un point (`tache`) : ses pièces jointes sont celles du point.
  const pollRow = (p: Poll, tache?: string) => (
    <div key={p.id} className="min-task poll-row-min" data-point={`Sondage : ${p.question}`} data-tache={tache} data-arret={`poll:${p.id}`}>
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
        {/* Remarque du point : en gris, les notes de la séance ressortent. */}
        {remarqueDe(t) && <p className="odj-rem min-pv-rem"><AvecLiens texte={remarqueDe(t)} /></p>}
        {opts.documents && !!t.documents?.length && <p className="min-pv-docs"><DocsTache t={t} annexes={joints} /></p>}
        {noteOf(`task:${t.id}`) && <p className="min-pv-note">→ <TexteNote note={noteOf(`task:${t.id}`)} /></p>}
        {opts.misesAJour && changesOf(t).length > 0 && <p className="min-pv-change">↻ {changesOf(t).join(' · ')}</p>}
        {voteDe(t) && <p className="min-pv-vote"><b>Vote :</b> {texteVote(voteDe(t)!)}</p>}
        {pollsDe(t).filter(pollInPv).map((p) => (
          <p key={p.id} className="min-pv-poll">
            <span className="odj-poll">Sondage : {p.question} — {pollSummary(p)}</span>
            {noteOf(`poll:${p.id}`) && <span className="min-pv-note"> → <TexteNote note={noteOf(`poll:${p.id}`)} /></span>}
          </p>
        ))}
      </>
    );
  }

  // Un point du document, puis ses étapes et ses points rattachés dans une liste du niveau suivant (classe `cls`).
  const pvPoint = (t: Task, tasks: Task[], cls: string): ReactNode => {
    const etapes = etapesPv ? t.checklist : [];
    const rattaches = rattachesDe(t, tasks);
    return (
      <li key={t.id}>
        {pvTask(t)}
        {(etapes.length > 0 || rattaches.length > 0) && (
          <ul className={cls}>
            {etapes.map((c) => <li key={c.id}>{etapeTexte(c)}</li>)}
            {rattaches.map((c) => pvPoint(c, tasks, 'odj-l3'))}
          </ul>
        )}
      </li>
    );
  };

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
        <p><b>Lieu :</b> {s1 ? <LieuSeance m={s1} /> : 'à définir'}</p>
        <p><b>Présents :</b> {presentsTxt}</p>
        {retardsTxt && <p><b>En retard :</b> {retardsTxt}</p>}
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
                {(g.subs.length > 0 || g.polls.length > 0) && (
                  <ol className="odj-l1">
                    {g.subs.map((s) =>
                      s.label ? (
                        <li key={s.key}>
                          {s.label}
                          <ul className="odj-l2">{racinesDe(s.tasks).map((t) => pvPoint(t, s.tasks, 'odj-l3'))}</ul>
                        </li>
                      ) : (
                        racinesDe(s.tasks).map((t) => pvPoint(t, s.tasks, 'odj-l2'))
                      ),
                    )}
                    {g.polls.map((p) => (
                      <li key={p.id}>
                        <span className="odj-poll">Sondage : {p.question} — {pollSummary(p)}</span>
                        {noteOf(`poll:${p.id}`) && <p className="min-pv-note"><TexteNote note={noteOf(`poll:${p.id}`)} /></p>}
                      </li>
                    ))}
                  </ol>
                )}
                {/* Note de la section : à la fin de la section, comme dans la prise de notes. */}
                {noteOf(`sec:${g.sec.id}`) && <p className="min-pv-note min-pv-note-sec"><TexteNote note={noteOf(`sec:${g.sec.id}`)} /></p>}
              </li>
            ))}
            {others.map((p) => (
              <li key={p.id}><span className="odj-sec">Sondage : {p.question}</span> — {pollSummary(p)}</li>
            ))}
            {noteOf('divers') && (
              <li><span className="odj-sec">Divers</span><p className="min-pv-note"><TexteNote note={noteOf('divers')} /></p></li>
            )}
          </ol>
        )}
      </section>
      {newTasks.length > 0 && (
        <section className="pv-part">
          <h2>Nouveaux points décidés</h2>
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
      {deleted.length > 0 && <p><b>Points supprimés :</b> {deleted.join(', ')}</p>}
      {s2 && (
        <p className="pv-next"><b>Prochaine séance :</b> {s2.titre}, {longDate(s2.date)}{s2.heure && ` à ${hm(s2.heure)}`} – Lieu : <LieuSeance m={s2} /></p>
      )}
      {opts.annexes && <ListeAnnexes annexes={annexes} pages={miseEnPage.pages} />}
      <footer className="pv-foot">
        PV établi par {fullName(secretaire ?? user ?? undefined)} le {fmtDate(today())}
        {m.valideLe && !m.enCorrection && ` · version ${version} validée le ${fmtDate(m.valideLe.slice(0, 10))}`} · {nomAppli()}
      </footer>
      {/* Fichiers joints : à la suite du PV, sur des pages à part à l'impression. */}
      {opts.annexes && <PagesAnnexes annexes={annexes} miseEnPage={miseEnPage} />}
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
          <select value={meetingId} onChange={(e) => choisirSeance(e.target.value)} aria-label="Séance">
            {courantes.map(optionSeance)}
          </select>
          {anciennes.length > 0 && (
            <select className="pv-ancien" value={anciennes.some((x) => x.id === meetingId) ? meetingId : ''} onChange={(e) => e.target.value && choisirSeance(e.target.value)} aria-label="Reprendre un ancien PV">
              <option value="">Reprendre un ancien PV…</option>
              {anciennes.map(optionSeance)}
            </select>
          )}
          <div className="seg">
            <button className={view === 'saisie' ? 'on' : ''} onClick={() => setView('saisie')}><Icone n="notes" /> Prise de notes</button>
            <button className={view === 'pv' ? 'on' : ''} onClick={() => setView('pv')}><Icone n="pdf" /> PV</button>
          </div>
          {view === 'saisie' && (
            <button
              className={`btn min-projeter ${projection ? 'on' : ''}`}
              aria-pressed={projection}
              onClick={basculerProjection}
              title="PV diffusé sur un beamer : les pièces jointes du point en cours (celui où tu as cliqué ou écrit en dernier, sinon celui en haut de l’écran) s’affichent en grand à côté des notes"
            >
              <Icone n="projection" /> Projection
            </button>
          )}
        </div>
      </div>
      <PageIntro />
      {statusBanner}
      {msg && <p className="pv-msg no-print">{msg}</p>}
      {figeage?.seance === s1.id && (
        <p className="pv-msg no-print muted" role="status">
          {figeage.erreur
            ? `⚠️ État des points à la fin de la séance introuvable (${figeage.erreur}) : statuts et délais d’aujourd’hui affichés.`
            : '⏳ Lecture de l’état des points à la fin de la séance…'}
        </p>
      )}
      {etats && (
        <p className="pv-fige no-print muted">
          📌 Statuts, délais et responsables des points tels qu’à la fin de la séance du {fmtDate(s1.date)} ; les changements faits ici s’y ajoutent, ceux faits ailleurs depuis n’y figurent pas.
        </p>
      )}
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
        <div className={`min-layout ${projection ? 'projection' : ''}`}>
          <div className="min-main">
            <section className="panel min-session">
              <div className="min-session-row">
                <strong>{s1.titre} · {longDate(s1.date)}</strong>
                <span className="muted">Lieu : <LieuSeance m={s1} /></span>
              </div>
              <div className="min-session-row">
                <label className="inline">Début <input type="time" value={m.heureDebut ?? ''} disabled={!editable} onChange={(e) => setMinutes((x) => { x.heureDebut = e.target.value || undefined; })} /></label>
                <label className="inline">Fin <input type="time" value={m.heureFin ?? ''} disabled={!editable} onChange={(e) => setMinutes((x) => { x.heureFin = e.target.value || undefined; })} /></label>
                {editable && !m.valideLe && (!m.demarreLe ? (
                  <button className="btn primary" onClick={start}><Icone n="demarrer" /> Démarrer la séance</button>
                ) : !m.heureFin ? (
                  <button className="btn" onClick={terminer}><Icone n="terminer" /> Terminer la séance</button>
                ) : (
                  <span className="pbadge closed">Séance terminée – notes et points encore modifiables</span>
                ))}
                {editable && pvTouche && (
                  <button className="btn small" onClick={remettreAZero} title="Effacer notes, présences et heures ; points modifiés depuis le PV remis comme avant">
                    <Icone n="revenir" /> Remettre à zéro
                  </button>
                )}
              </div>
            </section>

            <section className="panel">
              <h2 className="min-h2">Présences</h2>
              <div className="min-presence">
                {committee.map((p) => {
                  const etat = presenceDe(m, p.id);
                  const annonce = annonceDe(s1, p.id);
                  return (
                    <div key={p.id} className="min-person">
                      <span>{fullName(p)} <span className="muted">({initials(p)})</span></span>
                      <span className="seg small">
                        <button disabled={!editable} className={etat === 'present' ? 'on present' : ''} onClick={() => setPresence(p.id, 'present')}>Présent</button>
                        <button disabled={!editable} className={etat === 'retard' ? 'on retard' : ''} onClick={() => setPresence(p.id, 'retard')} title="Arrivé(e) après le début de la séance">Retard</button>
                        <button disabled={!editable} className={etat === 'excuse' ? 'on excuse' : ''} onClick={() => setPresence(p.id, 'excuse')}>Excusé</button>
                      </span>
                      {retardsAttendus.has(p.id) && annonce && (
                        <small className="min-annonce muted">
                          <Icone n="horloge" /> Retard annoncé{annonce.vers ? ` (arrivée vers ${hm(annonce.vers)})` : ''}{annonce.motif ? ` – ${annonce.motif}` : ''}
                        </small>
                      )}
                      {(etat === 'retard' || etat === 'excuse') && (
                        <span className="min-motif">
                          {etat === 'retard' && (
                            <ChampValide type="time" valeur={m.retards?.[p.id] ?? ''} onValider={(v) => setArrivee(p.id, v)} readOnly={!editable} aria-label={`Arrivée de ${fullName(p)}`} title="Heure d’arrivée" />
                          )}
                          <ChampValide valeur={m.motifs?.[p.id] ?? ''} onValider={(v) => setMotif(p.id, v)} readOnly={!editable} placeholder="Motif (facultatif)" aria-label={`Motif de ${fullName(p)}`} maxLength={120} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="row">
                {editable && (
                  <button className="btn small" onClick={() => setMinutes((x) => { x.presents = committee.map((p) => p.id).filter((id) => !x.excuses.includes(id) && (x.presents.includes(id) || !retardsAttendus.has(id))); }, { annulable: 'Présences : tous présents' })}>
                    Tous présents (sauf excusés{retardsAttendus.size ? ' et retards annoncés' : ''})
                  </button>
                )}
                <input className="grow" placeholder="Invités / autres personnes présentes" value={m.invites ?? ''} readOnly={!editable} onChange={(e) => setMinutes((x) => { x.invites = e.target.value; })} />
              </div>
            </section>

            <section className="min-agenda" ref={agendaRef}>
              {bySection.map((g, i) => (
                <div key={g.sec.id} className="panel min-section" data-section={g.sec.id}>
                  <h3>{i + 1}. {g.sec.nom}</h3>
                  {g.subs.map((s, j) => (
                    <div key={s.key} className="min-sub">
                      {s.label ? <div className="min-sub-title">{letter(j)}. {s.label}</div> : null}
                      {s.tasks.map((t) => (
                        <Fragment key={t.id}>
                          {taskRow(t)}
                          {pollsDe(t).map((p) => pollRow(p, t.id))}
                        </Fragment>
                      ))}
                    </div>
                  ))}
                  {g.polls.map((p) => pollRow(p))}
                  {editable && can('tasks.createAny', g.sec.id) && <button className="btn small link" onClick={() => addTask(g.sec.id)}>+ Nouveau point décidé</button>}
                  {/* Note de la section : à la fin, après ses points (le défilement point par point y mène). */}
                  {(editable || noteOf(`sec:${g.sec.id}`)) && (
                    <div className="min-note-sec" data-point={`Notes de « ${g.sec.nom} »`} data-arret={`sec:${g.sec.id}`}>
                      <NoteField value={m.notes[`sec:${g.sec.id}`] ?? ''} onCommit={(v) => setNote(`sec:${g.sec.id}`, v)} placeholder={`Notes pour « ${g.sec.nom} »…`} readOnly={!editable} />
                    </div>
                  )}
                </div>
              ))}
              {orphanPolls.length > 0 && (
                <div className="panel min-section">
                  <h3>Sondages</h3>
                  {orphanPolls.map((p) => pollRow(p))}
                </div>
              )}
              <div className="panel min-section">
                <h3>Divers</h3>
                <div className="min-note-sec" data-point="Notes de « Divers »" data-arret="divers">
                  <NoteField value={m.notes.divers ?? ''} onCommit={(v) => setNote('divers', v)} placeholder="Points divers, informations, prochaine séance…" readOnly={!editable} />
                </div>
              </div>
              {/* Place en bas : la dernière section remonte elle aussi sous l'en-tête (titre de la pilule, section suivante). */}
              {editable && <div className="min-fin" aria-hidden />}
            </section>
          </div>
          {/* Vue en fenêtres : les outils en barre fixe, sous son bandeau ; sinon la pilule flottante. */}
          {editable && !arret && <Pilule id="pv" label="Outils de la prise de notes" titre={sections.actuelle?.nom ?? 'Séance et présences'} outils={outils} ligne2={<OutilsTexte />} />}
          {arret && (
            <FichePv
              arret={arret}
              position={{ i: iFiche, n: arrets.length }}
              point={arret.tache && (fiche?.brouillon ?? arret.tache)}
              setPoint={setPointFiche}
              modifiable={!!arret.tache && editable && canEditTask(arret.tache)}
              editable={editable}
              meta={arret.tache ? meta(arret.tache) : []}
              changes={arret.tache ? changesOf(arret.tache) : []}
              note={m.notes[arret.cle] ?? ''}
              onNote={(v) => setNote(arret.cle, v)}
              projection={projection}
              projete={arret.tache ? vivante(arret.tache) : arret.pointDuSondage && vivante(arret.pointDuSondage)}
              choixPieces={choixPieces}
              erreur={ficheErreur}
              enregistre={arret.tache && vivante(arret.tache)}
              ouvrir={ouvrirDepuisFiche}
              rattacher={rattacherDepuisPv}
              track={docsFiche.current}
              seance={s1}
              vote={votePv(arret.tache ?? ({ id: arret.cle, titre: arret.nom } as Task))}
              barre={editable ? <BarreOutils label="Outils de la prise de notes" outils={outils} ligne2={<OutilsTexte />} /> : undefined}
              entete={
                <>
                  <strong className="pv-fiche-comite">{nomComite}</strong>
                  <span>{s1.titre}</span>
                  <span>
                    {longDate(s1.date)}
                    {(m.heureDebut ?? s1.heure) && ` · ${hm(m.heureDebut ?? s1.heure)}${m.heureFin ? ` – ${hm(m.heureFin)}` : ''}`}
                  </span>
                  <span>Lieu : <LieuSeance m={s1} /></span>
                </>
              }
            />
          )}
          <aside className="min-side">
            {projection && !arret && (
              <PiecesJointesPoint point={enCours && { nom: enCours.nom, tache: enCours.id ? data.tasks.find((x) => x.id === enCours.id) : undefined }} choix={choixPieces} />
            )}
            <div className="panel min-suivi">
              <h2 className="min-h2">Suivi de la séance</h2>
              <p>{m.presents.length} présent(s){retardsTxt ? ` dont ${Object.keys(m.retards ?? {}).filter((id) => m.presents.includes(id)).length} en retard` : ''} · {m.excuses.length} excusé(s)</p>
              <p>{Object.keys(m.notes).length} note(s)</p>
              <p>{new Set(journal.map((j) => j.taskId)).size} point(s) mis à jour</p>
              <p>{newTasks.length} nouveau(x) point(s)</p>
              <button className="btn primary" onClick={() => setView('pv')}><Icone n="pdf" /> Voir le PV</button>
              <small className="muted">{editable ? 'Les notes s’enregistrent automatiquement. Seules les modifications de points faites ici figurent dans le PV.' : 'PV validé : lecture seule.'}</small>
            </div>
          </aside>
        </div>
      ) : (
        <>
          <div className="panel min-pv-options no-print">
            <strong>Options du PV</strong>
            <label className="inline"><input type="checkbox" checked={!!m.tousLesPoints} disabled={!editable} onChange={(e) => setMinutes((x) => { x.tousLesPoints = e.target.checked; }, { annulable: 'Options du PV' })} /> Inclure tous les points de l’ordre du jour</label>
            <label className="inline"><input type="checkbox" checked={opts.details} disabled={!editable} onChange={(e) => setOpt({ details: e.target.checked })} /> Responsables, délais et échéances</label>
            <label className="inline"><input type="checkbox" checked={opts.misesAJour} disabled={!editable} onChange={(e) => setOpt({ misesAJour: e.target.checked })} /> Mises à jour des points (↻)</label>
            <label className="inline" title="La remarque de chaque point, en gris sous lui : les notes de la séance ressortent">
              <input type="checkbox" checked={opts.remarques} disabled={!editable} onChange={(e) => setOpt({ remarques: e.target.checked })} /> Remarques des points
            </label>
            <label className="inline" title="Fichiers et liens de chaque point, nommés ; un clic les ouvre">
              <input type="checkbox" checked={opts.documents} disabled={!editable} onChange={(e) => setOpt({ documents: e.target.checked })} /> 📎 Documents des points
            </label>
            <label className="inline" title="Les fichiers et liens des points du PV : liste des annexes, puis les photos et les pages des PDF (photos et PDF mis en page à part)">
              <input type="checkbox" checked={opts.annexes} disabled={!editable} onChange={(e) => setOpt({ annexes: e.target.checked })} /> 📎 Joindre les fichiers liés en fin de PV
              <span className="muted">{annexes.length ? ` (${annexes.length})` : annexesDe(tachesPv).length ? ' (aucun choisi)' : ' (aucun pour l’instant)'}</span>
            </label>
            {opts.annexes && (
              <>
                <label className="inline" title="Photos (tickets, factures photographiées…) sur une même page imprimée">
                  Photos par page
                  <select value={opts.annexesParPage} disabled={!editable} onChange={(e) => setOpt({ annexesParPage: Number(e.target.value) as ParPage })}>
                    {PAR_PAGE.map((n) => <option key={n} value={n}>{n === 1 ? '1 (pleine page)' : n}</option>)}
                  </select>
                </label>
                <label className="inline" title="Pages des PDF sur une même page imprimée : en pleine page, elles restent lisibles">
                  Pages de PDF par page
                  <select value={opts.annexesPdfParPage} disabled={!editable} onChange={(e) => setOpt({ annexesPdfParPage: Number(e.target.value) as ParPage })}>
                    {PAR_PAGE.map((n) => <option key={n} value={n}>{n === 1 ? '1 (pleine page)' : n}</option>)}
                  </select>
                </label>
              </>
            )}
            {opts.annexes && (
              <ChoixAnnexes
                tasks={tachesPv}
                exclues={exclues}
                onChange={(ids) => setMinutes((x) => { x.annexesExclues = ids; })}
                miseEnPage={miseEnPage}
                onFormat={(id, n) => setMinutes((x) => { x.annexesFormats = avecChoix(x.annexesFormats ?? s1?.odjAnnexesFormats, id, n) ?? {}; })}
                onPages={(id, p) => setMinutes((x) => { x.annexesPages = avecChoix(x.annexesPages ?? s1?.odjAnnexesPages, id, p) ?? {}; })}
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

/** Réglage du club : page web où déposer le PV validé, ouverte par « Valider et archiver ». */
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
        et crée le PDF du PV, à y déposer. Commune à tous les PV du club.
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

/**
 * Chrono de la séance : temps écoulé depuis l'heure de début (celle du champ « Début », sinon le moment où elle a
 * été démarrée), arrêté à l'heure de fin.
 */
function Chrono({ minutes: m }: { minutes: MeetingMinutes }) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    if (m.heureFin) return;
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, [m.heureFin]);
  const demarre = m.demarreLe ? new Date(m.demarreLe) : new Date(maintenant);
  const aHeure = (h: string) => {
    const [hh, mm] = h.split(':').map(Number);
    return new Date(demarre.getFullYear(), demarre.getMonth(), demarre.getDate(), hh, mm).getTime();
  };
  // Heure de début corrigée à la main : elle compte ; sinon l'instant précis du démarrage (à la seconde).
  const debut = m.heureDebut && m.heureDebut !== nowHMde(demarre) ? aHeure(m.heureDebut) : demarre.getTime();
  let fin = m.heureFin ? aHeure(m.heureFin) : maintenant;
  if (m.heureFin && fin < debut) fin += 86_400_000; // fin après minuit
  const sec = Math.max(0, Math.floor((fin - debut) / 1000));
  const h = Math.floor(sec / 3600);
  const mn = Math.floor((sec % 3600) / 60);
  const deux = (n: number) => String(n).padStart(2, '0');
  const texte = m.heureFin ? (h ? `${h} h ${deux(mn)}` : `${mn} min`) : `${h ? `${h}:${deux(mn)}` : mn}:${deux(sec % 60)}`;
  const dit = `${h ? `${h} h ` : ''}${mn} min`;
  return (
    <span role="timer" className={`chrono ${m.heureFin ? 'arrete' : ''}`} aria-label={m.heureFin ? `Durée de la séance : ${dit}` : `Séance en cours depuis ${dit}`}>
      {texte}
    </span>
  );
}

type Cible = { i: number; nom: string; id?: string };
type Reperes = { prec?: Cible; suiv?: Cible; actuelle?: Cible };
type Pas = 'section' | 'point';
/** Arrêt du défilement : `ancre` vient à la ligne de lecture ; `el`, ce qu'on y trouve (point, sondage, note). `id` :
 *  la section ; pour un point (ou le sondage d'un point), la tâche. */
type Arret = { el: HTMLElement; ancre: HTMLElement; nom: string; id?: string };
/** Point en cours (projection de ses pièces jointes) : son nom et, pour un point ou son sondage, la tâche. */
type EnCours = { nom: string; id?: string };
type Nav = Record<Pas, Reperes> & { enCours?: EnCours };

/** Valeur une fois posée (`ms` sans changement) : pas chaque point traversé pendant un défilement. */
function usePose<T>(v: T, ms: number): T {
  const [pose, setPose] = useState(v);
  const cle = JSON.stringify(v);
  useEffect(() => {
    const t = setTimeout(() => setPose(v), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, ms]);
  return pose;
}

/**
 * ↑ ↓ libres pour passer d'un point à l'autre : pas dans ce qui s'en sert (liste, date, nombre, liste déroulante, barre
 * à tirer, poignée de la pilule, pièces jointes projetées) ; dans un texte (note, remarque, intitulé), seulement au bord :
 * le curseur au début (↑) ou à la fin (↓), sinon il y monte ou descend comme d'habitude.
 */
function flecheLibre(cible: EventTarget | null, sens: 1 | -1): boolean {
  if (!(cible instanceof HTMLElement)) return true;
  if (cible.closest('select, [role="combobox"], [role="listbox"], [role="option"], [role="separator"], [role="slider"], .poignee, .min-projection')) return false;
  const auBord = (debut: number | null, fin: number | null, n: number) => debut === fin && (sens > 0 ? fin === n : debut === 0);
  if (cible instanceof HTMLInputElement) {
    if (['checkbox', 'button', 'submit'].includes(cible.type)) return true;
    return ['text', 'search', 'url', 'email', 'tel'].includes(cible.type) && auBord(cible.selectionStart, cible.selectionEnd, cible.value.length);
  }
  if (cible instanceof HTMLTextAreaElement) return auBord(cible.selectionStart, cible.selectionEnd, cible.value.length);
  if (cible.isContentEditable) {
    const sel = document.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed || !sel.focusNode || !cible.contains(sel.focusNode)) return false;
    // Texte entre le curseur et le bord : aucun, il est au bord.
    const r = document.createRange();
    r.selectNodeContents(cible);
    if (sens > 0) r.setStart(sel.focusNode, sel.focusOffset);
    else r.setEnd(sel.focusNode, sel.focusOffset);
    return !r.toString().length;
  }
  return true;
}

/** Note de la section atteinte : on y écrit tout de suite, à la suite de ce qu'elle contient déjà. */
function ecrireDans(note: HTMLElement) {
  note.focus({ preventScroll: true });
  const sel = document.getSelection();
  sel?.selectAllChildren(note);
  sel?.collapseToEnd();
}

/**
 * Défilement de la prise de notes, par section (points de l'ordre du jour, sondages, Divers) ou par point (chaque point
 * et sondage d'une section, puis sa note) : l'arrêt à l'écran (`actuelle`, à la ligne de lecture juste sous l'en-tête),
 * ceux d'avant et d'après, et `aller` pour y défiler ; avant le premier : le haut de la page (-1). Le premier point
 * d'une section (ou d'une sous-section) s'arrête sur son titre ; arrivé sur la note de la section, on y écrit.
 * `enCours` : le point où l'on a placé le curseur en dernier (note, statut…), tant qu'il est à l'écran, sinon celui à la
 * ligne de lecture ; la pilule (point / section suivant…) mène au sien. Un clic hors des points (panneau des pièces
 * jointes, pilule, fenêtre) ne le change pas.
 */
function useDefilement(zone: RefObject<HTMLElement>) {
  const [nav, setNav] = useState<Nav>({ section: {}, point: {} });
  const vise = useRef<{ pas: Pas; i: number; at: number } | null>(null);
  // Point où l'on a placé le curseur en dernier (null : aucun, ou oublié quand la pilule fait défiler).
  const ecrit = useRef<HTMLElement | null>(null);
  const ligne = () => (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
  const sections = () => [...(zone.current?.querySelectorAll<HTMLElement>(':scope > .min-section') ?? [])];
  const arrets = (pas: Pas): Arret[] =>
    pas === 'section'
      ? sections().map((el) => ({ el, ancre: el, nom: el.querySelector('h3')?.textContent?.trim() ?? '', id: el.dataset.section }))
      : sections().flatMap((sec) =>
          [...sec.querySelectorAll<HTMLElement>('[data-point]')].map((el, k) => {
            const sous = el.closest<HTMLElement>('.min-sub');
            const ancre = k === 0 ? sec : sous?.querySelector('.min-sub-title') && sous.querySelector('[data-point]') === el ? sous : el;
            return { el, ancre, nom: el.dataset.point ?? '', id: el.dataset.tache };
          }),
        );
  useEffect(() => {
    let attente = 0;
    const calculer = () => {
      attente = 0;
      const l = ligne();
      const auBas = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const reperes = (pas: Pas): Reperes => {
        let prec: Cible | undefined = window.scrollY > 2 ? { i: -1, nom: '' } : undefined;
        let suiv: Cible | undefined;
        let actuelle: Cible | undefined;
        arrets(pas).forEach(({ ancre, nom, id }, i) => {
          const t = ancre.getBoundingClientRect().top;
          if (t <= l + 6) actuelle = { i, nom, id };
          if (t < l - 6) prec = { i, nom };
          else if (!suiv && t > l + 6 && !auBas) suiv = { i, nom };
        });
        return { prec, suiv, actuelle };
      };
      const point = reperes('point');
      const e = ecrit.current?.isConnected ? ecrit.current : null;
      const r = e?.getBoundingClientRect();
      const enCours: EnCours | undefined =
        e && r && r.bottom > l && r.top < window.innerHeight
          ? { nom: e.dataset.point ?? '', id: e.dataset.tache }
          : point.actuelle && { nom: point.actuelle.nom, id: point.actuelle.id };
      const n2: Nav = { section: reperes('section'), point, enCours };
      setNav((n) => (JSON.stringify(n) === JSON.stringify(n2) ? n : n2));
    };
    const planifier = () => {
      if (!attente) attente = requestAnimationFrame(calculer);
    };
    // Curseur placé dans la prise de notes (clic, Tab) : dans un point, il devient le point en cours ; ailleurs (bouton
    // « Nouveau point décidé »…), plus aucun.
    const focus = (ev: FocusEvent) => {
      if (!(ev.target instanceof Element) || !zone.current?.contains(ev.target)) return;
      ecrit.current = ev.target.closest<HTMLElement>('[data-point]');
      planifier();
    };
    calculer();
    window.addEventListener('scroll', planifier, { passive: true });
    window.addEventListener('resize', planifier);
    document.addEventListener('focusin', focus);
    // Notes qui s'allongent, vue du PV et retour : la page change de hauteur.
    const obs = new ResizeObserver(planifier);
    obs.observe(document.body);
    return () => {
      cancelAnimationFrame(attente);
      window.removeEventListener('scroll', planifier);
      window.removeEventListener('resize', planifier);
      document.removeEventListener('focusin', focus);
      obs.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const aller = (pas: Pas, sens: 1 | -1) => {
    const liste = arrets(pas);
    let i = (sens > 0 ? nav[pas].suiv : nav[pas].prec)?.i;
    // Clics rapprochés, en plein défilement : depuis l'arrêt visé juste avant.
    const v = vise.current;
    if (v?.pas === pas && Date.now() - v.at < 700) i = Math.min(liste.length - 1, Math.max(-1, v.i + sens));
    if (i === undefined) return;
    vise.current = { pas, i, at: Date.now() };
    const a = liste[i];
    const top = a ? a.ancre.getBoundingClientRect().top + window.scrollY - ligne() : 0;
    window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    ecrit.current = null;
    if (pas !== 'point') return;
    // Point par point : la note de la section, on y écrit ; ailleurs, la note quittée est enregistrée (clavier refermé).
    const note = a?.el.matches('.min-note-sec') ? a.el.querySelector<HTMLElement>('.note-riche[contenteditable="true"]') : null;
    const active = document.activeElement;
    if (note) ecrireDans(note);
    else if (active instanceof HTMLElement && active.closest('.min-agenda .note-riche')) active.blur();
  };
  /** Ligne de la prise de notes (`data-arret`, fiche du PV refermée) : à la ligne de lecture, et point en cours. */
  const montrer = (cle: string) => {
    const el = zone.current?.querySelector<HTMLElement>(`[data-arret="${CSS.escape(cle)}"]`);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - ligne(), behavior: 'auto' });
    ecrit.current = el;
  };
  /** Ligne du point en cours (`data-arret`) : où l'on a cliqué ou écrit en dernier s'il est à l'écran, sinon celui à la
   *  ligne de lecture (la vue en fenêtres s'ouvre sur lui). */
  const cleEnCours = (): string | undefined => {
    const e = ecrit.current?.isConnected ? ecrit.current : null;
    const r = e?.getBoundingClientRect();
    if (e?.dataset.arret && r && r.bottom > ligne() && r.top < window.innerHeight) return e.dataset.arret;
    const i = nav.point.actuelle?.i;
    return i === undefined ? undefined : arrets('point')[i]?.el.dataset.arret;
  };
  return { ...nav, aller, montrer, cleEnCours };
}

