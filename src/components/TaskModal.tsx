import { useRef, useState } from 'react';
import { DocsField, type DocTracking } from './DocsField';
import { PollCard } from './PollCard';
import { PollEditor } from './PollEditor';
import { EmailsField } from './EmailsField';
import { emailsOf } from '../data/emails';
import { deleteFiles } from '../data/files';
import { TicketModal } from './Tickets';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { avecPartage, libellePlace, memePersonne, partageDe, TACHES_DEPENDANCE } from '../data/partage';
import { ciblesPourInfo, nbPourInfo } from '../data/pourInfo';
import { personnesDuRole } from '../data/permissions';
import { ailleurs, aPrendreOuverte, auteurAPrendre, nombreAPrendre, pasDispo as aDecline, peutPrendre, plusPersonne, prisAilleurs, reponsesAilleurs, volontaires } from '../data/aPrendre';
import { auComiteEntier, parentDans, reglageTaches, UNIT_TYPES } from '../data/units';
import { attributionDe, attributions, choixEvenements, choixSeances, entitesDependantes, evenementsDependants, memeEvenement, memeSeance, sectionChez } from '../data/externes';
import type { DelaiUnite, EvenementEntite, OrgMember, OrgUnit, Person, PourInfo, Recurrence, SeanceComite, Task } from '../data/types';
import { aLaDate, derniereOccurrence, horaire, libelleRegle, occurrenceDu, occurrencesEntre } from '../data/repetition';
import { DELAI_MAX, RECURRENCES, addDays, applyDelaiRef, childrenOf, endOf, fmtRange, fmtDate, fmtDateTime, fullName, isDone, isLate, makeDelai, nextDate, nextOccurrence, nomPoste, offsetLabel, parentOf, nextResponsables, postesFor, splitDelai, today, uid } from '../data/utils';
import { finAnticipee, motSeance, seanceApres, seancePourSuivante } from '../data/seances';
import { Avatar, Modal, StatusBadge } from './ui';
import { Icone, type IconeNom } from './icones';
import { EnvoyerLien } from './EnvoyerLien';
import { lienAppli, texteTache } from '../data/lienPartage';
import { ZoneTexte } from './ZoneTexte';

export function newTask(userId: string, defaults: Partial<Task> = {}): Task {
  return {
    id: uid('t'),
    sectionId: '',
    sousSection: '',
    titre: '',
    responsables: [userId],
    statusId: 's1',
    delai: today(),
    remarque: '',
    checklist: [],
    createdBy: userId,
    updatedAt: new Date().toISOString(),
    ...defaults,
  };
}

type TaskModalProps = { task: Task; isNew: boolean; onClose: () => void; openEmailId?: string };

/** Fenêtre d'une tâche ; un remboursement ou un paiement de facture s'ouvre dans la sienne (circuit caisse → visa → virement). */
export function TaskModal(props: TaskModalProps) {
  if (!props.isNew && props.task.paiement) return <TicketModal task={props.task} onClose={props.onClose} />;
  return <TaskEditor {...props} />;
}

/** Parties facultatives : affichées si elles sont remplies, sinon ajoutées à la demande (« Ajouter : »). */
type Extra = 'checklist' | 'docs' | 'repetition' | 'liens' | 'emails' | 'partage' | 'info' | 'prendre';

function TaskEditor({ task, isNew, onClose, openEmailId }: TaskModalProps) {
  const { data, user, can, canEditTask, canDeleteTask, canAssignOthers: canAssign, creatableSections, saveTask, attribuerTache, prendreTache, pasDispo, update, linkTask, autresResp, externes, setToast } = useStore();
  // Nouvelle tâche : seules les personnes actives de l'entité peuvent en être responsables.
  // Statut inconnu de l'entité (statuts personnalisés) : le premier statut ouvert.
  const [t, setT] = useState<Task>(() =>
    isNew
      ? {
          ...task,
          responsables: task.responsables.filter((id) => data.people.some((p) => p.id === id && p.actif)),
          statusId: data.statuses.some((s) => s.id === task.statusId) ? task.statusId : (data.statuses.find((s) => !s.done) ?? data.statuses[0])?.id ?? task.statusId,
        }
      : task,
  );
  const [newItem, setNewItem] = useState('');
  // Tâche liée (ou principale) ouverte par-dessus cette fenêtre.
  const [other, setOther] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const track = useRef<DocTracking>({ added: [], removed: [] });
  const [newPoll, setNewPoll] = useState(false);
  // Liens et partage déjà remplis : ils restent affichés si on les vide (ex. partage retiré : plus de séance du comité).
  const [ouverts, setOuverts] = useState<Extra[]>(() => [
    ...(task.eventId || task.evenementEntite || (task.meetingId && !task.source) || task.seanceComite || task.parentId ? ['liens' as const] : []),
    ...((task.partage?.length || task.auCentral) && !task.source ? ['partage' as const] : []),
    ...(task.pourInfo ? ['info' as const] : []),
    ...(task.aPrendre ? ['prendre' as const] : []),
  ]);
  const [nouvelEmail, setNouvelEmail] = useState(false);
  const club = useClubOptional();
  if (!user) return null;
  // Partage avec d'autres entités du club (tâche de l'entité ouverte) ; tâche partagée par une autre entité : t.source.
  // Serveur à jour (041) : documents, répétition, séance d'ici et partage se modifient aussi depuis une entité du partage.
  const complet = !t.source || !!t.source.complet;
  const partage = partageDe(t, club?.central?.id);
  const partageables = club && !t.paiement && complet ? club.units.filter((u) => u.id !== club.current.id && u.id !== t.source?.uniteId && (!u.archive || partage.includes(u.id))) : [];
  // Tâche partagée : avec d'autres entités que celle-ci (et que la sienne).
  const partageAutres = partage.filter((id) => id !== club?.current.id && id !== t.source?.uniteId);
  // (Sans l'entité à qui la tâche est attribuée : elle en devient l'entité ; voir plus bas.)
  const nomUnite = (id: string) => club?.units.find((u) => u.id === id)?.nom ?? '';
  // Rangée au comité central selon son entité (celle de la tâche partagée par une autre entité).
  const chez = t.source ? club?.units.find((u) => u.id === t.source!.uniteId) : club?.current;
  const versCentral = club?.central && chez && chez.type !== 'central' && club.current.type !== 'central' && partage.includes(club.central.id) ? libellePlace(club.central.sections ?? [], chez) : '';
  // Réglage de l'entité : ses tâches toutes affichées (ou aucune) dans le comité dont elle dépend ; un événement dont tout
  // le comité est responsable : toutes.
  const reglage = club ? reglageTaches(club.units, club.current) : undefined;
  const comiteEntier = !!club && auComiteEntier(club.units, club.current);
  const parentIci = club && reglage && reglage !== 'partagees' && !t.source ? parentDans(club.units.filter((u) => !u.archive), club.current) : undefined;
  // Plus partagée avec le comité : plus à l'ordre du jour de sa séance (ni de délai selon elle).
  const togglePartage = (id: string) => setT((x) => applyDelaiRef(data, avecPartage(x, id, !partageDe(x, club?.central?.id).includes(id), club?.central?.id)));

  const editable = isNew ? true : canEditTask(task);
  const canAssignOthers = t.sectionId ? canAssign(t.sectionId) : creatableSections().some((s) => canAssign(s.id));
  const section = data.sections.find((s) => s.id === t.sectionId);
  // Sections proposées : celles où le rôle permet de créer (+ la section actuelle en modification).
  const sectionChoices = data.sections.filter((s) => creatableSections().some((c) => c.id === s.id) || s.id === task.sectionId);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));
  // Sous-section : aussi les événements qui dépendent du comité (section des événements), ou les sections de l'entité qui
  // dépend de lui et dont la section porte le nom ; la tâche lui est alors attribuée (partagée, rangée chez elle).
  const centralId = club?.central?.id;
  const att = attributions(section, club && !t.source && !t.paiement ? entitesDependantes(club.units, club.current) : [], externes.sections);
  const attribuee = attributionDe(t, att.choix, partage);
  const attendSections = !!att.unite && !att.lues && externes.sections === null;
  // Tâche attribuée : enregistrée dans l'entité choisie (à l'enregistrement), dans l'une de ses sections ; ici, partagée.
  const sectionsChez = attribuee ? (externes.sections?.[attribuee.unite.id] ?? []) : [];
  const secChez = attribuee && club ? sectionChez(attribuee, t, externes.sections, club.current) : '';
  const choisirSectionChez = (sectionId: string) =>
    attribuee && setT((x) => ({ ...x, placePartage: { ...x.placePartage, [attribuee.unite.id]: { sectionId, sousSection: '' } } }));
  const cacheChez = !!attribuee && !!club && reglageTaches(club.units, attribuee.unite) === 'rien';
  const partageVisible = attribuee ? partage.filter((id) => id !== attribuee.unite.id) : partage;
  const sousSections = [...(section?.sousSections ?? [])];
  if (t.sousSection && !attribuee && !sousSections.includes(t.sousSection)) sousSections.push(t.sousSection);
  /** Autre section ou sous-section : l'entité à qui la tâche était attribuée ne la partage plus. */
  const sansAttribution = (x: Task, garde?: string) => {
    const avant = attributionDe(x, att.choix, partageDe(x, centralId));
    return avant && avant.unite.id !== garde ? avecPartage(x, avant.unite.id, false, centralId) : x;
  };
  const changerSection = (sectionId: string) => setT((x) => applyDelaiRef(data, { ...sansAttribution(x), sectionId, sousSection: '' }));
  const changerSous = (v: string) =>
    setT((x) => {
      const c = att.choix.find((y) => y.cle === v);
      if (!c) return applyDelaiRef(data, { ...sansAttribution(x), sousSection: v.replace(/^s:/, '') });
      const y = avecPartage(sansAttribution(x, c.unite.id), c.unite.id, true, centralId);
      const placePartage = c.sectionId ? { ...y.placePartage, [c.unite.id]: { sectionId: c.sectionId, sousSection: '' } } : y.placePartage;
      return applyDelaiRef(data, { ...y, sousSection: c.sousSection, placePartage });
    });
  const assignable = data.people.filter((p) => p.actif && (canAssignOthers || p.id === user.id));
  // Responsables choisis aussi parmi les personnes de l'entité de la tâche : celle à qui elle est attribuée (choisies :
  // respPartage, enregistrées chez elle), ou celle d'une tâche partagée (ses responsables sans fiche ici :
  // source.responsables). Les personnes d'ici sans fiche chez elle la suivent d'ici.
  const entite = attribuee?.unite ?? (t.source ? club?.units.find((u) => u.id === t.source!.uniteId) : undefined);
  const chezId = entite?.id ?? '';
  const ficheIci = (m: OrgMember) => data.people.find((p) => p.actif && memePersonne(p, m));
  const choisisChez = (!entite ? [] : attribuee ? (t.respPartage?.[chezId] ?? []) : t.source!.responsables)
    .map((id) => entite?.membres.find((m) => m.id === id))
    .filter((m): m is OrgMember => !!m && (!!attribuee || !ficheIci(m)));
  const respIci = t.responsables.map((id) => data.people.find((p) => p.id === id)).filter((p): p is Person => !!p);
  const membresChez = entite && canAssignOthers
    ? entite.membres
        .filter((m) => !choisisChez.includes(m) && !respIci.some((p) => memePersonne(p, m)))
        .sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`))
    : [];
  const toggleChez = (id: string) => {
    // Tâche partagée : une personne qui a aussi une fiche ici en est responsable d'ici (elle passe à sa fiche de l'entité).
    const m = entite?.membres.find((x) => x.id === id);
    const p = !attribuee && m ? ficheIci(m) : undefined;
    if (p) return toggleResp(p.id);
    setT((x) => {
      if (!attribuee && x.source) {
        const l = x.source.responsables;
        return { ...x, source: { ...x.source, responsables: l.includes(id) ? l.filter((y) => y !== id) : [...l, id] } };
      }
      const l = x.respPartage?.[chezId] ?? [];
      const respPartage = { ...x.respPartage, [chezId]: l.includes(id) ? l.filter((y) => y !== id) : [...l, id] };
      if (!respPartage[chezId].length) delete respPartage[chezId];
      return { ...x, respPartage: Object.keys(respPartage).length ? respPartage : undefined };
    });
  };
  // Responsables des autres entités (tâche partagée), sauf ceux de l'entité de la tâche (choisis ci-dessus).
  const autres = autresResp(!entite ? t : attribuee ? { ...t, respPartage: { ...t.respPartage, [chezId]: [] } } : { ...t, source: { ...t.source!, responsables: [] } });

  const addItem = () => {
    if (!newItem.trim()) return;
    set('checklist', [...t.checklist, { id: uid('c'), label: newItem.trim(), done: false }]);
    setNewItem('');
  };

  // Tâches liées : un seul niveau (une tâche principale n'est pas elle-même liée à une autre).
  const kids = isNew ? [] : childrenOf(data, task.id).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  const parent = parentOf(data, t);
  const parentChoices = data.tasks
    .filter((x) => !x.source && (x.id === t.parentId || (x.id !== task.id && !x.parentId && !isDone(data, x))))
    .sort((a, b) => a.titre.localeCompare(b.titre));
  const linkable = data.tasks.filter((x) => !x.source && x.id !== task.id && !x.parentId && !childrenOf(data, x.id).length && !isDone(data, x));
  const secName = (id: string) => data.sections.find((s) => s.id === id)?.nom ?? '';
  const bySection = <T extends Task>(list: T[]) =>
    data.sections.map((sec) => ({ sec, list: list.filter((x) => x.sectionId === sec.id) })).filter((g) => g.list.length);

  const toggleResp = (id: string) =>
    set('responsables', t.responsables.includes(id) ? t.responsables.filter((x) => x !== id) : [...t.responsables, id]);

  // Fichiers encore joints à une autre tâche (occurrences d'une tâche répétée, qui les reprennent) : gardés.
  const libres = (ids: string[]) => ids.filter((id) => !data.tasks.some((x) => x.id !== task.id && x.documents?.some((d) => d.id === id)));
  // Fichiers retirés : effacés une fois la tâche enregistrée (tâche partagée : chez son entité, qui ne les référence plus).
  const enregistrer = (x: Task) => {
    const retires = libres(track.current.removed);
    void Promise.resolve(saveTask(x, isNew)).then(() => deleteFiles(retires));
  };

  const submit = async () => {
    if (!t.titre.trim()) return setErr('Le titre de la tâche est obligatoire.');
    if (!t.sectionId) return setErr('Choisis une section.');
    if (!canAssign(t.sectionId) && t.responsables.some((id) => id !== user.id) && JSON.stringify(t.responsables) !== JSON.stringify(task.responsables))
      return setErr('Ton rôle ne permet pas d’assigner d’autres personnes dans cette section.');
    const fin = finAnticipee(data, isNew ? undefined : task, t);
    if (fin && !confirm(fin)) return;
    if (attribuee) {
      const u = attribuee.unite;
      if (!secChez) return setErr(`Choisis la section de « ${u.nom} » où ranger la tâche.`);
      if (cacheChez && (t.documents ?? []).some((d) => d.kind === 'fichier'))
        return setErr(`« ${u.nom} » n’affiche aucune de ses tâches au comité : les fichiers joints ne peuvent pas y suivre la tâche d’ici. Retire-les avant de l’enregistrer (« ${u.nom} » pourra les y ajouter). Les liens suivent la tâche.`);
      if (!isNew && emailsOf(data, task.id).length)
        return setErr(`Cette tâche a des emails programmés ici : supprime-les avant de l’enregistrer dans « ${u.nom} » (elle pourra les y programmer).`);
      if (!isNew && !confirm(`Enregistrer la tâche dans « ${u.nom} » ?\n\nElle sera à « ${u.nom} », qui la gérera comme les siennes ; ici, elle restera visible et modifiable comme tâche partagée.${kids.length ? '\nSes tâches rattachées restent ici, sans tâche principale.' : ''}`))
        return;
      setBusy(true);
      setErr('');
      let r: { fichiers: number; erreur?: string };
      try {
        r = await attribuerTache({ ...t, titre: t.titre.trim() }, u, secChez, isNew);
      } catch (e) {
        setBusy(false);
        return setErr((e as Error).message);
      }
      // Fichiers copiés chez l'entité : ceux d'ici ne servent plus (sauf à une autre tâche).
      const ici = r.erreur ? [] : (t.documents ?? []).filter((d) => d.kind === 'fichier' && !d.id.includes('/')).map((d) => d.id);
      setToast(r.erreur
        ? `⚠️ Tâche enregistrée dans « ${u.nom} », mais pas ses fichiers (${r.erreur}) : ajoute-les depuis la tâche.`
        : `✅ Tâche enregistrée dans « ${u.nom} »${r.fichiers ? ` avec ${r.fichiers > 1 ? `ses ${r.fichiers} fichiers` : 'son fichier'}` : ''} : elle apparaît ici partagée.`);
      deleteFiles(libres([...track.current.removed, ...ici]));
      onClose();
      return;
    }
    enregistrer({ ...t, titre: t.titre.trim() });
    onClose();
  };

  // Tâche à prendre proposée à la personne connectée : « 🙋 Je m'en charge » ou « Pas dispo ».
  const repondre = async (prend: boolean) => {
    setBusy(true);
    setErr('');
    try {
      await (prend ? prendreTache : pasDispo)(task);
    } catch (e) {
      setBusy(false);
      return setErr((e as Error).message);
    }
    setToast(prend ? '✅ Tu t’en charges : la tâche est dans « Mes tâches ».' : '🙅 C’est noté : la personne qui te l’a proposée est prévenue. Tu peux encore t’en charger depuis « Mes tâches ».');
    deleteFiles(track.current.added);
    onClose();
  };

  // Dupliquer : une nouvelle tâche pré-remplie d'après la tâche enregistrée, à compléter puis créer (« À faire », checklist
  // décochée). Ses fichiers restent communs avec l'original (gardés tant que l'une des deux les utilise) ; emails et
  // sondages ne suivent pas.
  const peutDupliquer = !isNew && !task.source && !task.paiement && creatableSections().some((s) => s.id === task.sectionId);
  const dupliquer = () => {
    const ouvert = data.statuses.find((s) => !s.done) ?? data.statuses[0];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { suivanteId, termineeLe, proposee, parCentral, copieDe, attribueePar, modifiePar, aPrendre, respPartage, postesResp, pieces, ...reste } = task;
    setOther({
      task: {
        ...reste,
        id: uid('t'),
        titre: `${task.titre} (copie)`,
        statusId: ouvert?.id ?? task.statusId,
        checklist: task.checklist.map((c) => ({ ...c, id: uid('c'), done: false })),
        createdBy: user.id,
        updatedAt: new Date().toISOString(),
      },
      isNew: true,
    });
  };

  // Annuler : on efface les fichiers ajoutés pendant cette édition.
  const cancel = () => {
    deleteFiles(track.current.added);
    onClose();
  };

  const remove = () => {
    if (!confirm(`Supprimer la tâche « ${task.titre} » ?`)) return;
    update((d) => {
      d.tasks = d.tasks.filter((x) => x.id !== task.id);
      // Ses tâches liées restent, sans tâche principale.
      d.tasks.forEach((x) => { if (x.parentId === task.id) x.parentId = undefined; });
      d.emails = (d.emails ?? []).filter((e) => e.taskId !== task.id);
      // Les sondages liés restent, rattachés à la section de la tâche.
      (d.polls ?? []).forEach((p) => {
        if (p.taskId === task.id) {
          p.taskId = undefined;
          p.sectionId = p.sectionId ?? task.sectionId;
        }
      });
    }, `Suppression de la tâche « ${task.titre} »`);
    deleteFiles([...libres((task.documents ?? []).filter((d) => d.kind === 'fichier').map((d) => d.id)), ...track.current.added]);
    onClose();
  };

  const dis = !editable;
  const seanceIci = t.source && t.meetingId ? data.meetings.find((m) => m.id === t.meetingId) : undefined;
  const postes = postesFor(data, t, isNew ? undefined : task) ?? [];
  // Répétition : « à chaque comité » (le mot des séances de l'entité) ; séance et délai de l'occurrence suivante.
  const mot = motSeance(club?.current.type).toLowerCase();
  // Tâche partagée : c'est son entité qui crée l'occurrence suivante (selon ses séances, ses postes).
  const prochaine = t.recurrence && !t.source ? seancePourSuivante(data, t) : undefined;
  const seanceLiee = data.meetings.find((m) => m.id === t.meetingId);
  const delaiSuivant = t.recurrence && !t.source ? nextOccurrence(data, t, prochaine?.meeting).delai : t.recurrence && t.recurrence !== 'seance' && t.delai ? nextDate(t.delai, t.recurrence) : '';
  const repeter = (r: Recurrence | undefined) =>
    setT((x) => {
      if (r !== 'seance' || x.source || x.meetingId || x.seanceComite) return { ...x, recurrence: r };
      // À chaque séance : la tâche va d'abord à la prochaine séance prévue.
      const s = seanceApres(data.meetings, addDays(today(), -1));
      return s && !s.nouvelle ? applyDelaiRef(data, { ...x, recurrence: r, meetingId: s.meeting.id }) : { ...x, recurrence: r };
    });
  const polls = (data.polls ?? []).filter((p) => p.taskId === task.id);
  const rempli: Record<Extra, boolean> = {
    checklist: t.checklist.length > 0,
    docs: (t.documents ?? []).length > 0,
    repetition: !!t.recurrence,
    // Tâche partagée par une autre entité : sa séance d'ici (ou celle d'ailleurs, en lecture) ; serveur pas à jour : dans le bandeau.
    liens: !!(t.eventId || t.evenementEntite || t.seanceComite || t.parentId || kids.length || (complet && (t.meetingId || t.source?.seanceAilleurs))),
    emails: !isNew && emailsOf(data, task.id).length > 0,
    partage: (t.source ? partageAutres : partage).length > 0,
    info: nbPourInfo(t.pourInfo) > 0,
    prendre: !!t.aPrendre?.personnes.length || ailleurs(t).length > 0,
  };
  const voit = (x: Extra) => rempli[x] || ouverts.includes(x);
  const ouvrir = (x: Extra) => setOuverts((o) => [...o, x]);
  const ajouts: { label: string; icone: IconeNom; aide: string; run: () => void; si: boolean; partagee?: boolean }[] = [
    { label: 'Checklist', icone: 'checklist' as const, aide: 'Une liste de petites étapes à cocher', run: () => ouvrir('checklist'), si: !voit('checklist'), partagee: true },
    { label: 'Document', icone: 'fichier' as const, aide: 'Un fichier, une photo ou un lien', run: () => ouvrir('docs'), si: !voit('docs'), partagee: complet },
    {
      label: 'Répétition',
      icone: 'repetition' as const,
      aide: t.source ? 'La tâche revient chaque semaine, chaque mois… (son entité crée la suivante)' : `La tâche revient chaque semaine, chaque mois, à chaque ${mot}…`,
      run: () => ouvrir('repetition'),
      si: !voit('repetition'),
      partagee: complet,
    },
    {
      label: 'Rattacher à…',
      icone: 'rattacher' as const,
      aide: t.source ? `Une séance de « ${club?.current.nom ?? 'cette entité'} » : la tâche figure à son ordre du jour et à son PV` : 'Un événement, une séance de comité ou une autre tâche',
      run: () => ouvrir('liens'),
      si: !voit('liens') && (!t.source || data.meetings.length > 0),
      partagee: complet,
    },
    { label: 'Partager', icone: 'partage' as const, aide: 'Avec d’autres entités du club : elles la voient et la modifient comme les leurs', run: () => ouvrir('partage'), si: !voit('partage') && partageables.length > 0, partagee: true },
    {
      label: 'À prendre',
      icone: 'main' as const,
      aide: 'Proposer la tâche à quelques personnes : l’une d’elles s’en charge elle-même',
      run: () => {
        ouvrir('prendre');
        // Nouvelle tâche : on n'en reste pas responsable par défaut (la personne qui se propose s'en chargera).
        if (isNew && t.responsables.length === 1 && t.responsables[0] === user.id) set('responsables', []);
      },
      si: !voit('prendre') && !t.paiement && canAssignOthers,
      partagee: true,
    },
    { label: 'Pour info', icone: 'voir' as const, aide: 'Des personnes ou des entités qui la voient, sans s’en occuper', run: () => ouvrir('info'), si: !voit('info') && !t.paiement, partagee: true },
    { label: 'Sondage', icone: 'sondage' as const, aide: 'Demander l’avis des membres', run: () => setNewPoll(true), si: !isNew && can('polls.create'), partagee: true },
    {
      label: 'Email',
      icone: 'email' as const,
      aide: 'Un email envoyé à une date choisie',
      run: () => {
        setNouvelEmail(true);
        ouvrir('emails');
      },
      si: !isNew && !voit('emails'),
      partagee: true,
    },
    // Tâche d'une autre entité : sondages et emails restent ici ; documents, répétition, séance et partage vont chez elle
    // (serveur à jour : 041).
  ].filter((a) => a.si && (!t.source || a.partagee));
  // Personnes à ajouter : soi-même d'abord.
  // (Personne aussi chez l'entité de la tâche, ou à qui elle est attribuée : proposée seulement avec elle.)
  const aAjouter = assignable
    .filter((p) => !t.responsables.includes(p.id) && ![...choisisChez, ...membresChez].some((m) => memePersonne(p, m)))
    .sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  // Pour info : personnes d'ici (sauf responsables), autres entités du club, personnes d'autres entités (« a:entité:fiche »).
  const info = t.pourInfo ?? {};
  const cibles = ciblesPourInfo(t.pourInfo, data.people, club?.units ?? []).filter((c) => c.genre !== 'personne' || !t.responsables.includes(c.id));
  const infoIci = data.people.filter((p) => p.actif && !t.responsables.includes(p.id) && !info.personnes?.includes(p.id));
  const autresUnites = club ? club.units.filter((u) => u.id !== club.current.id && !u.archive) : [];
  const iconeUnite = (id: string) => { const u = club?.units.find((x) => x.id === id); return u ? `${UNIT_TYPES[u.type].icon} ` : ''; };
  // Tâche partagée : son entité la voit déjà.
  const infoUnites = autresUnites.filter((u) => !info.unites?.includes(u.id) && u.id !== t.source?.uniteId);
  const infoAutres = autresUnites
    .map((u) => ({ u, l: u.membres.filter((m) => !m.viaEntite && !info.autres?.[u.id]?.includes(m.id) && !data.people.some((p) => p.actif && memePersonne(p, m))) }))
    .filter((g) => g.l.length);
  // Tout un groupe d'un coup : les personnes d'ici, celles d'un rôle (« Comité »…), celles d'une autre entité.
  const infoRoles = data.roles.map((r) => ({ r, l: personnesDuRole(data.roles, infoIci, r) })).filter((g) => g.l.length > 1);
  // À prendre : personnes d'ici à qui la tâche est proposée (ajoutées une à une, par rôle ou toutes) ; places prises.
  const candidats = t.aPrendre?.personnes ?? [];
  const proposable = !dis && canAssignOthers;
  const prendreIci = data.people.filter((p) => p.actif && !t.responsables.includes(p.id) && !candidats.includes(p.id));
  // « Comité » : tout le comité, président et secrétaire compris (personnesDuRole).
  const prendreRoles = data.roles
    .map((r) => ({ r, l: personnesDuRole(data.roles, prendreIci, r) }))
    .filter((g) => g.l.length > 1);
  const nPrendre = nombreAPrendre(t.aPrendre);
  const vol = volontaires(t);
  const nomsDe = (ids: string[]) => ids.map((id) => fullName(data.people.find((p) => p.id === id))).join(', ');
  // Tâche partagée ou partagée avec d'autres entités : proposée aussi à leurs personnes (040), places comptées ensemble.
  const prisLa = prisAilleurs(t);
  const nPris = vol.length + prisLa;
  const quiPrend = [vol.length ? nomsDe(vol) : '', prisLa ? `${prisLa} personne${prisLa > 1 ? 's' : ''} d’une autre entité` : ''].filter(Boolean).join(' et ');
  const nomAilleurs = (u: string, id: string) => {
    const m = club?.units.find((x) => x.id === u)?.membres.find((x) => x.id === id);
    return m ? `${m.prenom} ${m.nom}`.trim() : '?';
  };
  const propAilleurs = reponsesAilleurs(t);
  const proposer = (v: string) =>
    setT((x) => {
      const ids = v === 'tous' ? prendreIci.map((p) => p.id) : v.startsWith('r:') ? (prendreRoles.find((g) => g.r.id === v.slice(2))?.l ?? []).map((p) => p.id) : [v.slice(2)];
      return { ...x, aPrendre: { ...x.aPrendre, personnes: [...(x.aPrendre?.personnes ?? []), ...ids] } };
    });
  const retirerPropose = (id: string) => setT((x) => ({ ...x, aPrendre: x.aPrendre && { ...x.aPrendre, personnes: x.aPrendre.personnes.filter((y) => y !== id) } }));
  const setNombre = (n: number) => setT((x) => ({ ...x, aPrendre: { ...x.aPrendre, personnes: x.aPrendre?.personnes ?? [], nombre: n > 1 ? n : undefined } }));
  // « Pas dispo » (encore proposées, pas responsables) ; personnes qui n'ont pas encore répondu.
  const refusIci = (t.aPrendre?.refus ?? []).filter((id) => candidats.includes(id) && !t.responsables.includes(id));
  const auteur = data.people.find((p) => p.id === auteurAPrendre(task));
  const pourMoiAPrendre = !isNew && peutPrendre(task, user.id) && !isDone(data, task);
  // Tâche partagée : ce qui se gère dans son entité, et de quoi l'y ouvrir si on en fait partie.
  const chezSource = t.source && club?.units.find((u) => u.id === t.source!.uniteId && u.moi && !u.archive);
  const jeDecline = aDecline(task, user.id);

  const changerInfo = (v: string, oui: boolean) =>
    setT((x) => {
      const p: PourInfo = { ...x.pourInfo };
      // Groupes : chacune de leurs personnes, ajoutée comme si on l'avait choisie (et retirable une à une).
      const cles =
        v === 'tous' ? infoIci.map((y) => `p:${y.id}`)
        : v.startsWith('r:') ? (infoRoles.find((g) => g.r.id === v.slice(2))?.l ?? []).map((y) => `p:${y.id}`)
        : v.startsWith('ta:') ? (infoAutres.find((g) => g.u.id === v.slice(3))?.l ?? []).map((m) => `a:${v.slice(3)}:${m.id}`)
        : [v];
      for (const c of cles) {
        const [g, a, b] = c.split(':');
        const maj = (l: string[] | undefined, id: string) => (oui ? [...new Set([...(l ?? []), id])] : (l ?? []).filter((y) => y !== id));
        if (g === 'p') p.personnes = maj(p.personnes, a);
        else if (g === 'u') p.unites = maj(p.unites, a);
        else p.autres = { ...p.autres, [a]: maj(p.autres?.[a], b) };
      }
      return { ...x, pourInfo: p };
    });

  return (
    <Modal
      title={isNew ? 'Nouvelle tâche' : editable ? 'Modifier la tâche' : 'Détail de la tâche'}
      onClose={cancel}
      wide
      actions={
        !isNew && (
          <>
          {peutDupliquer && (
            <button type="button" className="icon-btn dupliquer" onClick={dupliquer} title="Dupliquer : créer une nouvelle tâche à partir de celle-ci" aria-label="Dupliquer la tâche">
              <Icone n="dupliquer" />
            </button>
          )}
          <EnvoyerLien
            titre={`Tâche « ${task.titre} »`}
            texte={texteTache(task, data.people, task.source?.unite ?? club?.current.nom, isDone(data, task))}
            lien={lienAppli(`/taches?tache=${encodeURIComponent(task.id)}`, club?.current.id)}
            acces={`Le lien ne donne aucun accès : il faut un compte de l’appli et voir cette tâche${club ? ` dans « ${club.current.nom} »` : ''}.`}
          />
          </>
        )
      }
    >
      <div className="form">
        {parent && (
          <button type="button" className="full parent-banner" onClick={() => setOther({ task: parent, isNew: false })}>
            ↳ Tâche rattachée à <b>{parent.titre}</b> <span className="muted">({secName(parent.sectionId)}) · ouvrir</span>
          </button>
        )}
        {t.source && (
          <p className="full partage-banner">
            🤝 Tâche de <b>{t.source.unite}</b>, partagée avec {club?.current.nom ?? 'cette entité'} : tu peux la modifier comme les tiennes, elle reste enregistrée chez elle.
            {partage.filter((id) => id !== club?.current.id).length > 0 && (
              <span className="muted"> Partagée aussi avec : {partage.filter((id) => id !== club?.current.id).map(nomUnite).filter(Boolean).join(', ')}.</span>
            )}
            {seanceIci && <span> 🗓️ À l’ordre du jour de « {seanceIci.titre} » ({fmtDate(seanceIci.date)}).</span>}
          </p>
        )}
        {t.attribueePar && !t.source && (
          <p className="full proposal-banner">
            📥 Attribuée par <b>{t.attribueePar.unite}</b>{t.attribueePar.par ? ` (${t.attribueePar.par})` : ''}, le {fmtDate(t.attribueePar.le)} : une tâche de{' '}
            {club?.current.nom ?? 'cette entité'}, partagée avec {t.attribueePar.unite}, qui la voit et peut la modifier.
          </p>
        )}
        {t.copieDe && (
          <p className="full proposal-banner">
            📋 Copiée depuis le comité <b>{t.copieDe.comite || '?'}</b>, le {fmtDate(t.copieDe.le)} (ancienne tâche de « {t.copieDe.entite} ») : une tâche à part entière de {club?.current.nom ?? 'cette entité'} ; l’original n’est pas modifié.
          </p>
        )}
        {t.proposee && (
          <p className="full proposal-banner">
            📨 Demande de <b>{t.proposee.unite}</b>, envoyée par {t.proposee.par} le {fmtDate(t.proposee.le.slice(0, 10))}.
            <span className="muted"> L’entité suit l’avancement (statut, délai, responsables) depuis son accueil.</span>
          </p>
        )}
        {pourMoiAPrendre && (
          <div className="full a-prendre-banner">
            <span>
              🙋 {auteur ? <b>{fullName(auteur)}</b> : 'On'} te propose cette tâche
              {nPrendre > 1 ? ` (il faut ${nPrendre} personnes${nPris ? `, déjà : ${quiPrend}` : ''})` : ''}
              {jeDecline ? '. Tu as répondu « Pas dispo ».' : ' : tu t’en charges ?'}
            </span>
            <span className="a-prendre-boutons">
              <button type="button" className="btn primary" disabled={busy} onClick={() => repondre(true)}><Icone n="main" /> Je m’en charge{jeDecline ? ' quand même' : ''}</button>
              {!jeDecline && <button type="button" className="btn" disabled={busy} onClick={() => repondre(false)}><Icone n="refuser" /> Pas dispo</button>}
            </span>
          </div>
        )}
        <label className="full">
          Tâche
          <input autoFocus={isNew} value={t.titre} disabled={dis} onChange={(e) => set('titre', e.target.value)} placeholder="Que faut-il faire ?" />
        </label>
        <label>
          Section
          <select value={t.sectionId} disabled={dis} onChange={(e) => changerSection(e.target.value)}>
            <option value="">— Choisir —</option>
            {sectionChoices.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </label>
        <DelaiField t={t} setT={setT} disabled={dis} dateSeule={!!t.source} />
        {(sousSections.length > 0 || att.choix.length > 0 || attendSections) && (
          <label>
            Sous-section
            <select value={attribuee?.cle ?? (t.sousSection && `s:${t.sousSection}`)} disabled={dis || !section} onChange={(e) => changerSous(e.target.value)}>
              <option value="">—</option>
              {sousSections.map((s) => <option key={s} value={`s:${s}`}>{s}</option>)}
              {att.choix.length > 0 && (
                <optgroup label={att.unite ? `🤝 Sections de « ${att.unite.nom} »` : `🤝 Événements qui dépendent de « ${club?.current.nom ?? ''} »`}>
                  {att.choix.map((c) => <option key={c.cle} value={c.cle}>{c.sectionId ? c.sousSection : `${UNIT_TYPES[c.unite.type].icon} ${c.unite.nom}`}</option>)}
                </optgroup>
              )}
            </select>
            {attribuee && (
              <small className="muted attribuee-note">
                📦 À l’enregistrement, la tâche {isNew ? 'sera créée' : 'passera'} dans « {attribuee.unite.nom} »
                {secChez && `, section « ${sectionsChez.find((x) => x.id === secChez)?.nom ?? attribuee.sousSection} »`}, qui la gérera comme ses
                tâches ; ici, elle apparaîtra partagée 🤝 et restera modifiable.{(t.documents ?? []).some((d) => d.kind === 'fichier') && !cacheChez && ' Ses fichiers joints la suivent.'}
                {cacheChez && <b> « {attribuee.unite.nom} » n’affiche aucune de ses tâches au comité (réglage « Ne rien afficher ») : elle n’apparaîtra pas ici.</b>}
              </small>
            )}
            {attendSections && <small className="muted">Les sections de « {att.unite?.nom} » seront proposées ici après la mise à jour du serveur (migration 033).</small>}
          </label>
        )}
        {attribuee && !attribuee.sectionId && (
          <label>
            Section chez « {attribuee.unite.nom} »
            <select value={secChez} disabled={dis} onChange={(e) => choisirSectionChez(e.target.value)}>
              {!secChez && <option value="">—</option>}
              {sectionsChez.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
            </select>
            {!sectionsChez.length && (
              <small className="muted">
                {externes.sections === null
                  ? `Les sections de « ${attribuee.unite.nom} » seront lues après la mise à jour du serveur (migration 033).`
                  : externes.sections ? `« ${attribuee.unite.nom} » n’a encore aucune section : demande-lui d’en créer une.` : 'Lecture de ses sections…'}
              </small>
            )}
          </label>
        )}
        <label>
          Statut
          <select value={t.statusId} disabled={dis} onChange={(e) => set('statusId', e.target.value)}>
            {data.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <div className="full qui">
          <span className="field-label">Qui s’en occupe ?</span>
          <div className="chips">
            {t.responsables.map((id) => {
              const p = data.people.find((x) => x.id === id);
              const retirable = !dis && assignable.some((x) => x.id === id);
              return (
                <span key={id} className={`chip on ${retirable ? '' : 'locked'}`}>
                  {fullName(p)}
                  {retirable && <button type="button" className="chip-x" aria-label={`Retirer ${fullName(p)}`} onClick={() => toggleResp(id)}>✕</button>}
                </span>
              );
            })}
            {choisisChez.map((m) => (
              <span key={m.id} className="chip on" title={`Personne de « ${entite!.nom} »`}>
                {UNIT_TYPES[entite!.type].icon} {m.prenom} {m.nom}
                {!dis && canAssignOthers && <button type="button" className="chip-x" aria-label={`Retirer ${m.prenom} ${m.nom}`} onClick={() => toggleChez(m.id)}>✕</button>}
              </span>
            ))}
            {!t.responsables.length && !choisisChez.length && <span className="muted">Personne pour l’instant{aPrendreOuverte(t) ? ' : 🙋 à prendre' : ''}.</span>}
            {!dis && (aAjouter.length > 0 || membresChez.length > 0) && (
              <select className="chip-add" value="" aria-label="Ajouter une personne" onChange={(e) => e.target.value && (e.target.value.startsWith('chez:') ? toggleChez(e.target.value.slice(5)) : toggleResp(e.target.value))}>
                <option value="">＋ Ajouter…</option>
                {entite ? (
                  <>
                    {membresChez.length > 0 && (
                      <optgroup label={`${UNIT_TYPES[entite.type].icon} ${entite.nom}`}>
                        {membresChez.map((m) => <option key={m.id} value={`chez:${m.id}`}>{nomPoste(m)}</option>)}
                      </optgroup>
                    )}
                    {aAjouter.length > 0 && (
                      <optgroup label={club?.current.nom ?? 'Ici'}>
                        {aAjouter.map((p) => <option key={p.id} value={p.id}>{nomPoste(p, user.id)}</option>)}
                      </optgroup>
                    )}
                  </>
                ) : (
                  aAjouter.map((p) => <option key={p.id} value={p.id}>{nomPoste(p, user.id)}</option>)
                )}
              </select>
            )}
          </div>
          {entite && canAssignOthers && !dis && !entite.membres.length && <small className="muted">« {entite.nom} » n’a encore personne dans l’appli : ajoute ses membres dans l’organigramme pour leur confier la tâche.</small>}
          {autres && <small className="muted autres-resp">Aussi : {autres}</small>}
          {!canAssignOthers && <small className="muted">Ton rôle ne permet d’assigner des tâches qu’à toi-même{t.sectionId ? ' dans cette section' : ''}.</small>}
        </div>
        {!t.paiement && voit('prendre') && (proposable || candidats.length > 0 || propAilleurs.length > 0) && (
          <div className="full a-prendre">
            <span className="field-label">🙋 À prendre</span>
            <div className="chips">
              {candidats.map((id) => {
                const p = data.people.find((x) => x.id === id);
                const non = refusIci.includes(id);
                return (
                  <span key={id} className={`chip on ${proposable ? '' : 'locked'} ${non ? 'refus' : ''}`} title={non ? 'Pas dispo' : t.responsables.includes(id) ? 'S’en charge' : 'Pas encore de réponse'}>
                    {fullName(p)}{t.responsables.includes(id) && ' ✓'}{non && ' 🙅'}
                    {proposable && <button type="button" className="chip-x" aria-label={`Ne plus proposer à ${fullName(p)}`} onClick={() => retirerPropose(id)}>✕</button>}
                  </span>
                );
              })}
              {!candidats.length && <span className="muted">{propAilleurs.length ? `Personne de « ${club?.current.nom ?? 'cette entité'} » pour l’instant.` : 'Personne pour l’instant.'}</span>}
              {proposable && prendreIci.length > 0 && (
                <select className="chip-add" value="" aria-label="Proposer à" onChange={(e) => e.target.value && proposer(e.target.value)}>
                  <option value="">＋ Proposer à…</option>
                  {prendreIci.length > 1 && <option value="tous">Tout le monde ({prendreIci.length})</option>}
                  {prendreRoles.length > 0 && (
                    <optgroup label="Tout un rôle">
                      {prendreRoles.map(({ r, l }) => <option key={r.id} value={`r:${r.id}`}>{r.label} ({l.length})</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Personnes">
                    {prendreIci.map((p) => <option key={p.id} value={`p:${p.id}`}>{nomPoste(p, user.id)}</option>)}
                  </optgroup>
                </select>
              )}
            </div>
            {propAilleurs.length > 0 && (
              <small className="muted a-prendre-ailleurs">
                Aussi proposée à :{' '}
                {propAilleurs.map((g, i) => (
                  <span key={g.unite}>
                    {i > 0 && ' · '}
                    {g.personnes.map((x) => `${nomAilleurs(g.unite, x.id)}${x.pris ? ' ✓' : x.refus ? ' 🙅' : ''}`).join(', ')} ({nomUnite(g.unite) || '?'})
                  </span>
                ))}
              </small>
            )}
            {(nPrendre > 1 || (proposable && candidats.length + propAilleurs.reduce((n, g) => n + g.personnes.length, 0) > 1)) && (
              <label className="inline a-prendre-nombre">
                Il faut
                <select value={nPrendre} disabled={!proposable} onChange={(e) => setNombre(Number(e.target.value))}>
                  {Array.from({ length: Math.max(10, nPrendre) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {nPrendre > 1 ? 'personnes' : 'personne'}
              </label>
            )}
            <small className="muted">
              {!candidats.length && !propAilleurs.length
                ? 'Choisis à qui la proposer : '
                : aPrendreOuverte(t)
                  ? `${nPris ? `${quiPrend} s’en charge${nPris > 1 ? 'nt' : ''} ; encore ${nPrendre - nPris} place${nPrendre - nPris > 1 ? 's' : ''}. ` : 'Personne ne s’en charge encore. '}`
                  : `✓ ${quiPrend} s’en charge${nPris > 1 ? 'nt' : ''} : elle n’est plus proposée. `}
              {refusIci.length > 0 && `🙅 Pas dispo : ${nomsDe(refusIci)}. `}
              {(candidats.length > 0 || propAilleurs.length > 0) && aPrendreOuverte(t) && plusPersonne(t) && <b>Toutes les personnes proposées ont répondu : propose-la à d’autres. </b>}
              {(!candidats.length || aPrendreOuverte(t)) &&
                'Ces personnes la voient dans « Mes tâches » et à l’accueil, avec une notification 🔔 ; la première qui clique « 🙋 Je m’en charge » en devient responsable ; « 🙅 Pas dispo » prévient qui la propose.'}
              {t.source && ' Chaque entité du partage la propose à ses personnes ; les places se comptent ensemble.'}
            </small>
          </div>
        )}
        {(!dis || !!t.remarque) && (
          <label className="full">
            Remarque
            <ZoneTexte rows={2} value={t.remarque} disabled={dis} onChange={(e) => set('remarque', e.target.value)} placeholder="Détails utiles (facultatif)" />
          </label>
        )}
        {partageables.length > 0 && voit('partage') && (!dis || (t.source ? partageAutres : partage).length > 0) && (
          <div className="full partage">
            <span className="field-label">🤝 Partager avec d’autres entités</span>
            <div className="chips">
              {partageables
                .filter((u) => u.id !== attribuee?.unite.id && (!dis || partage.includes(u.id)))
                .map((u) => (
                  <button key={u.id} type="button" className={`chip ${partage.includes(u.id) ? 'on' : ''}`} disabled={dis} aria-pressed={partage.includes(u.id)} onClick={() => togglePartage(u.id)}>
                    {u.type === 'central' ? '🏛️ ' : ''}{u.nom}
                  </button>
                ))}
            </div>
            <small className="muted">
              {t.source
                ? `La tâche reste dans « ${t.source.unite} » ; les entités choisies la voient aussi dans leurs tâches et leur ordre du jour, et la modifient comme les leurs${versCentral ? ` (comité central : ${versCentral})` : ''}.`
                : partageVisible.length
                ? `Elles la voient dans leurs tâches et leur ordre du jour, et la modifient comme les leurs${versCentral ? ` (comité central : ${versCentral})` : ''}.`
                : 'La tâche reste ici ; les entités choisies la voient dans leurs tâches et leur ordre du jour, et peuvent la modifier.'}
            </small>
            {parentIci && reglage && (
              <small className="muted">
                {TACHES_DEPENDANCE[reglage].aide(parentIci.nom)} ({comiteEntier ? 'tout le comité est responsable de l’événement' : 'réglage de l’entité'})
              </small>
            )}
          </div>
        )}
        {!t.paiement && voit('info') && (!dis || cibles.length > 0) && (
          <div className="full pour-info">
            <span className="field-label">👁 Pour info</span>
            <div className="chips">
              {cibles.map((c) => (
                <span key={c.cle} className={`chip on ${dis ? 'locked' : ''}`}>
                  {c.genre === 'unite' && iconeUnite(c.id)}{c.texte}
                  {!dis && <button type="button" className="chip-x" aria-label={`Retirer ${c.texte}`} onClick={() => changerInfo(c.cle, false)}>✕</button>}
                </span>
              ))}
              {!cibles.length && <span className="muted">Personne pour l’instant.</span>}
              {!dis && (infoIci.length > 0 || infoUnites.length > 0 || infoAutres.length > 0) && (
                <select className="chip-add" value="" aria-label="Mettre au courant" onChange={(e) => e.target.value && changerInfo(e.target.value, true)}>
                  <option value="">＋ Ajouter…</option>
                  {(infoIci.length > 1 || infoRoles.length > 0 || infoAutres.some((g) => g.l.length > 1)) && (
                    <optgroup label="Tout un groupe d’un coup">
                      {infoIci.length > 1 && <option value="tous">👥 Toutes les personnes{club ? ` de « ${club.current.nom} »` : ''} ({infoIci.length})</option>}
                      {infoRoles.map(({ r, l }) => <option key={r.id} value={`r:${r.id}`}>👥 {r.label} ({l.length})</option>)}
                      {infoAutres.filter((g) => g.l.length > 1).map(({ u, l }) => <option key={u.id} value={`ta:${u.id}`}>👥 Toutes les personnes de « {u.nom} » ({l.length})</option>)}
                    </optgroup>
                  )}
                  {infoIci.length > 0 && (
                    <optgroup label={`Personnes${club ? ` de « ${club.current.nom} »` : ''}`}>
                      {infoIci.map((p) => <option key={p.id} value={`p:${p.id}`}>{nomPoste(p, user.id)}</option>)}
                    </optgroup>
                  )}
                  {infoUnites.length > 0 && (
                    <optgroup label="Entités du club">
                      {infoUnites.map((u) => <option key={u.id} value={`u:${u.id}`}>{UNIT_TYPES[u.type].icon} {u.nom}</option>)}
                    </optgroup>
                  )}
                  {infoAutres.map(({ u, l }) => (
                    <optgroup key={u.id} label={`Personnes de « ${u.nom} »`}>
                      {l.map((m) => <option key={m.id} value={`a:${u.id}:${m.id}`}>{`${m.prenom} ${m.nom}`.trim()}{m.poste ? ` · ${m.poste}` : ''}</option>)}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
            <small className="muted">
              Elles voient la tâche sans s’en occuper : les personnes d’ici dans « Mes tâches » (👁) avec une notification 🔔 ; les autres entités (leurs
              admins et les rôles « Voir toutes les tâches ») et leurs personnes, en lecture seule, à l’accueil et dans Tâches › 👁 Pour info.
            </small>
          </div>
        )}

        {voit('checklist') && (
          <fieldset className="full">
            <legend>☑️ Checklist{t.checklist.length > 0 && ` · ${t.checklist.filter((c) => c.done).length}/${t.checklist.length}`}</legend>
            {t.checklist.map((c) => (
              <div key={c.id} className="check-row">
                <label className="inline">
                  <input type="checkbox" checked={c.done} disabled={dis} onChange={() => set('checklist', t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
                  <span className={c.done ? 'strike' : ''}>{c.label}</span>
                </label>
                {!dis && <button type="button" className="icon-btn" onClick={() => set('checklist', t.checklist.filter((x) => x.id !== c.id))} aria-label="Retirer">✕</button>}
              </div>
            ))}
            {!dis && (
              <div className="row">
                <input
                  autoFocus={!t.checklist.length}
                  value={newItem}
                  placeholder="Ajouter une étape…"
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newItem.trim()) {
                      e.preventDefault();
                      addItem();
                    }
                  }}
                />
                <button type="button" className="btn" onClick={addItem}>Ajouter</button>
              </div>
            )}
          </fieldset>
        )}
        {voit('docs') && (
          <DocsField
            docs={t.documents ?? []}
            setDocs={(fn) => setT((x) => ({ ...x, documents: fn(x.documents ?? []) }))}
            disabled={dis || !complet}
            track={track.current}
            // Tâche partagée (041) : fichiers déposés dans le dossier de son entité.
            idPrefix={t.source ? `${t.source.uniteId}/pt-` : undefined}
            liens
          />
        )}
        {voit('repetition') && (
          <label className="full">
            🔁 Répétition
            <select value={t.recurrence ?? ''} disabled={dis || !complet} onChange={(e) => repeter((e.target.value || undefined) as Recurrence | undefined)}>
              <option value="">Aucune (tâche unique)</option>
              {/* Tâche partagée : « à chaque séance » (celles de son entité), seulement si elle l'est déjà. */}
              {RECURRENCES.filter((r) => r.id !== 'seance' || !t.source || t.recurrence === 'seance').map((r) => (
                <option key={r.id} value={r.id}>🔁 {r.id !== 'seance' ? r.label : t.source ? `À chaque séance de « ${t.source.unite} »` : `À chaque ${mot}`}</option>
              ))}
            </select>
          </label>
        )}
        {t.recurrence && t.source && (
          <p className="full recur-note">
            🔁 Quand cette tâche sera terminée, « {t.source.unite} » créera automatiquement la suivante
            {delaiSuivant ? <> pour le <b>{fmtDate(delaiSuivant)}</b></> : t.recurrence === 'seance' ? ' pour sa séance suivante' : ' (sans délai)'}, dès que l’un de ses membres ouvrira l’appli.
          </p>
        )}
        {t.recurrence && !t.source && (
          <p className="full recur-note">
            🔁 Quand cette tâche sera terminée, la suivante sera créée automatiquement
            {t.recurrence !== 'seance' ? (
              delaiSuivant ? <> pour le <b>{fmtDate(delaiSuivant)}</b></> : ' (sans délai)'
            ) : prochaine ? (
              <>
                {' '}pour la séance suivante, <b>{prochaine.meeting.titre}</b> ({fmtDate(prochaine.meeting.date)}{prochaine.nouvelle ? ', ajoutée à l’agenda à ce moment-là' : ''})
                {delaiSuivant && <>, délai le <b>{fmtDate(delaiSuivant)}</b></>}
              </>
            ) : (
              <>, sans séance ni délai : aucune séance n’est prévue après {seanceLiee ? `« ${seanceLiee.titre} »` : 'aujourd’hui'} (si une séance est ajoutée dans l’Agenda d’ici là, la suivante y sera rattachée)</>
            )}
            {postes.length > 0 && <> et attribuée au poste <b>{postes.join(', ')}</b></>}
            {' '}(aujourd’hui : {nextResponsables(data, { ...t, postesResp: postes }).map((id) => fullName(data.people.find((p) => p.id === id))).join(', ')}).
            {task.suivanteId && <><br />Occurrence suivante déjà créée.</>}
          </p>
        )}
        {voit('liens') && (
          <fieldset className="full liens">
            <legend>🧩 Rattachements</legend>
            <div className="form">
              {t.source && <SeanceIci t={t} setT={setT} disabled={dis || !complet} />}
              {!t.source && <EvenementLie t={t} setT={setT} disabled={dis} />}
              {!t.source && <SeanceLiee t={t} setT={setT} disabled={dis} />}
              {!t.source && !kids.length && (
                <label className="full">
                  Tâche principale
                  <select
                    value={t.parentId ?? ''}
                    disabled={dis}
                    onChange={(e) => {
                      const p = data.tasks.find((x) => x.id === e.target.value);
                      setT((x) => ({ ...x, parentId: p?.id, ...(p && !x.sectionId ? { sectionId: p.sectionId, sousSection: p.sousSection } : {}) }));
                    }}
                  >
                    <option value="">Aucune (tâche indépendante)</option>
                    {bySection(parentChoices).map((g) => (
                      <optgroup key={g.sec.id} label={g.sec.nom}>
                        {g.list.map((x) => <option key={x.id} value={x.id}>{x.titre}{x.delai ? ` (${fmtDate(x.delai)})` : ''}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
              {!t.source && !t.parentId && !isNew && (
                <div className="full linked">
                  <span className="field-label">Tâches rattachées{kids.length > 0 && ` · ${kids.filter((k) => isDone(data, k)).length}/${kids.length} terminées`}</span>
                  {kids.length > 0 && (
                    <>
                      <div className="progress"><div style={{ width: `${Math.round((kids.filter((k) => isDone(data, k)).length / kids.length) * 100)}%` }} /></div>
                      <ul className="linked-list">
                        {kids.map((k) => (
                          <li key={k.id} className={isDone(data, k) ? 'done' : ''}>
                            <button type="button" className="linked-row" onClick={() => setOther({ task: k, isNew: false })}>
                              <span className="linked-title">{k.titre}</span>
                              <span className="avatars">{k.responsables.slice(0, 3).map((id) => <Avatar key={id} id={id} size={20} />)}</span>
                              <span className={`linked-date ${isLate(data, k) ? 'late-text' : 'muted'}`}>{k.delai ? fmtDate(k.delai) : '—'}</span>
                              <StatusBadge task={k} />
                            </button>
                            {editable && <button type="button" className="icon-btn" title="Détacher (la tâche reste, sans tâche principale)" onClick={() => linkTask(k.id, undefined)}>✕</button>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {!kids.length && <small className="muted">Aucune. Une tâche rattachée a son propre responsable, délai et statut.</small>}
                  {editable && (
                    <div className="row wrap">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => setOther({ task: newTask(user.id, { parentId: task.id, sectionId: task.sectionId, sousSection: task.sousSection, delai: task.delai }), isNew: true })}
                      >
                        + Nouvelle tâche rattachée
                      </button>
                      {!linking ? (
                        linkable.length > 0 && <button type="button" className="btn small" onClick={() => setLinking(true)}><Icone n="rattacher" /> Rattacher une tâche existante</button>
                      ) : (
                        <select autoFocus defaultValue="" onChange={(e) => { if (e.target.value) linkTask(e.target.value, task.id); setLinking(false); }} onBlur={() => setLinking(false)}>
                          <option value="">— Choisir la tâche à rattacher —</option>
                          {bySection(linkable).map((g) => (
                            <optgroup key={g.sec.id} label={g.sec.nom}>
                              {g.list.map((x) => <option key={x.id} value={x.id}>{x.titre}{x.delai ? ` (${fmtDate(x.delai)})` : ''}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      )}
                      {kids.length > 0 && <a className="small-link" href={`#/taches?parent=${task.id}`}>Voir dans la liste →</a>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </fieldset>
        )}
        {polls.length > 0 && (
          <fieldset className="full">
            <legend>📊 Sondages</legend>
            {polls.map((p) => <PollCard key={p.id} poll={p} compact />)}
            <a className="small-link" href="#/sondages">Voir tous les sondages →</a>
          </fieldset>
        )}
        {voit('emails') && <EmailsField task={task} isNew={isNew} openEmailId={openEmailId} nouveau={nouvelEmail} />}
        {editable && ajouts.length > 0 && (
          <div className="full task-plus">
            <span>Ajouter :</span>
            {ajouts.map((a) => <button key={a.label} type="button" className="chip" title={a.aide} onClick={a.run}><Icone n={a.icone} /> {a.label}</button>)}
          </div>
        )}
        {editable && t.source && (
          <small className="muted full task-ailleurs">
            {complet
              ? `🗑️ Supprimer la tâche, la rattacher à un événement ou à une autre tâche : dans « ${t.source.unite} », l’entité de la tâche.`
              : `📎 Documents, 🔁 répétition, 🧩 séance et 🤝 partage : dans « ${t.source.unite} », l’entité de la tâche (d’ici aussi après la mise à jour 041 du serveur).`}
            {chezSource && (
              <>
                {' '}
                <button type="button" className="link-btn" onClick={() => { cancel(); club!.switchUnit(chezSource.id, `#/taches?tache=${t.source!.id}`); }}>
                  Ouvrir dans « {chezSource.nom} »
                </button>
              </>
            )}
          </small>
        )}
        {!isNew && (
          <small className="muted full">
            Dernière modification : {fmtDateTime(task.updatedAt)}{task.modifiePar ? ` par ${task.modifiePar}` : ''} ·{' '}
            {task.source ? `tâche de ${task.source.unite}` : `créée par ${task.parCentral ? `${task.parCentral} (comité central)` : fullName(data.people.find((p) => p.id === task.createdBy))}`}
          </small>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && canDeleteTask(task) && <button className="btn danger" onClick={remove} title="Supprimer la tâche" aria-label="Supprimer la tâche"><Icone n="supprimer" /></button>}
        <span className="grow" />
        <button className="btn" onClick={cancel}>{editable ? 'Annuler' : 'Fermer'}</button>
        {editable && <button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Enregistrement…' : isNew ? 'Créer' : 'Enregistrer'}</button>}
      </div>
      {newPoll && <PollEditor taskId={task.id} onClose={() => setNewPoll(false)} />}
      {other && <TaskModal task={other.task} isNew={other.isNew} onClose={() => setOther(null)} />}
    </Modal>
  );
}

type SetT = (fn: (x: Task) => Task) => void;

/** Sans l'occurrence suivie (autre événement : sa prochaine occurrence, s'il se répète). */
const sansOccurrence = (t: Task): Task => {
  if (!t.delaiRef?.occurrence) return t;
  const { occurrence: _, ...ref } = t.delaiRef;
  return { ...t, delaiRef: ref };
};

/** Tâche liée à une séance du comité dont l'entité dépend : partagée avec ce comité (ses tâches, son ordre du jour, son PV). */
function avecSeance(x: Task, s: SeanceComite, centralId?: string): Task {
  const l = partageDe(x, centralId);
  return {
    ...x,
    meetingId: undefined,
    seanceComite: { uniteId: s.uniteId, id: s.id, titre: s.titre, date: s.date },
    partage: l.includes(s.uniteId) ? l : [...l, s.uniteId],
    auCentral: undefined,
  };
}

/**
 * « Soirée (28.11.2026) · prochaine édition » : édition d'un événement du club (distincte d'un événement du comité du même
 * nom), ou l'un de ses événements (avec le nom de l'entité).
 */
function libelleEvenement(x: EvenementEntite, u?: OrgUnit) {
  if (x.id) return `🎉 ${x.nom} (${fmtRange(x.date, x.dateFin)})${u ? ` · ${u.nom}` : ''}`;
  return `${u ? UNIT_TYPES[u.type].icon : '🎉'} ${x.nom} (${x.date ? fmtRange(x.date, x.dateFin) : 'date à fixer'}) · prochaine édition`;
}

/**
 * Ce que la tâche peut lier hors de l'entité (lu par le store, externes.ts) : les séances du comité dont elle dépend, et
 * les événements du club qui dépendent d'elle (prochaine édition, événements de leur agenda).
 */
function useExternes(t: Task) {
  const { externes } = useStore();
  const club = useClubOptional();
  const jour = today();
  const parent = club && club.current.type !== 'central' && !t.source ? parentDans(club.units.filter((u) => !u.archive), club.current) : undefined;
  const comite = externes.seances?.comite || parent?.id || '';
  const seances = parent || t.seanceComite ? choixSeances(externes.seances, comite, t.seanceComite, jour) : [];
  const dependants = club && !t.source ? evenementsDependants(club.units, club.current) : [];
  const evenements = dependants.length || t.evenementEntite ? choixEvenements(dependants, externes.agenda ?? [], t.evenementEntite, jour) : [];
  const unite = (id: string) => club?.units.find((u) => u.id === id);
  return { club, parent, comite, lu: externes.seances, seances, evenements, unite, ici: club?.current.nom ?? '' };
}

/**
 * « Événement lié » : un événement de l'entité ; pour un comité, aussi un événement qui dépend de lui (sa prochaine
 * édition ou l'un de ses événements), dont le nom et la date suivent les changements.
 */
function EvenementLie({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  const { club, evenements, unite, ici } = useExternes(t);
  const lie = t.evenementEntite;
  const value = lie ? `x:${evenements.findIndex((x) => memeEvenement(x, lie))}` : (t.eventId ?? '');
  const choisir = (v: string) =>
    setT((x) =>
      applyDelaiRef(data, sansOccurrence(v.startsWith('x:') ? { ...x, eventId: undefined, evenementEntite: evenements[Number(v.slice(2))] } : { ...x, eventId: v || undefined, evenementEntite: undefined })),
    );
  const locales = data.events.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.repetition ? ' 🔁' : ''}</option>);
  const u = lie && unite(lie.uniteId);
  const partagee = !!lie && partageDe(t, club?.central?.id).includes(lie.uniteId);
  return (
    <label className={evenements.length ? 'full' : undefined}>
      Événement
      <select value={value} disabled={disabled} onChange={(e) => choisir(e.target.value)}>
        <option value="">—</option>
        {evenements.length > 0 ? (
          <>
            {locales.length > 0 && <optgroup label={`Événements de « ${ici} »`}>{locales}</optgroup>}
            <optgroup label={`Événements qui dépendent de « ${ici} »`}>
              {evenements.map((x, i) => <option key={`${x.uniteId}:${x.id ?? ''}:${x.date}`} value={`x:${i}`}>{libelleEvenement(x, unite(x.uniteId))}</option>)}
            </optgroup>
          </>
        ) : locales}
      </select>
      {lie && (
        <small className="muted">
          {u ? UNIT_TYPES[u.type].icon : '🎉'} {lie.id ? `Événement de « ${u?.nom ?? '?'} »` : 'Prochaine édition'}, qui dépend de « {ici} » : son nom et sa date sont suivis (délai calé dessus compris).
          {!partagee && !disabled && u && ` Pour que « ${u.nom} » voie aussi la tâche : 🤝 Partager.`}
        </small>
      )}
    </label>
  );
}

/**
 * « Séance de comité liée » : une séance de l'entité, ou une séance du comité dont elle dépend. Dans ce cas, la tâche
 * est partagée avec ce comité et figure à l'ordre du jour et au PV de cette séance (partage.ts : avecPartagees).
 */
function SeanceLiee({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  const { club, parent, comite, lu, seances: choix, unite, ici } = useExternes(t);
  const nomComite = (id: string) => unite(id)?.nom ?? 'comité';
  const lie = t.seanceComite;
  const value = lie ? `c:${choix.findIndex((s) => memeSeance(s, lie))}` : (t.meetingId ?? '');
  const reglage = club ? reglageTaches(club.units, club.current) : undefined;

  const choisir = (v: string) =>
    setT((x) =>
      applyDelaiRef(data, v.startsWith('c:') ? avecSeance(x, choix[Number(v.slice(2))], club?.central?.id) : { ...x, meetingId: v || undefined, seanceComite: undefined }),
    );

  const locales = data.meetings.map((m) => <option key={m.id} value={m.id}>{m.titre}</option>);
  return (
    <label className={parent ? 'full' : undefined}>
      Séance de comité
      <select value={value} disabled={disabled} onChange={(e) => choisir(e.target.value)}>
        <option value="">—</option>
        {choix.length > 0 ? (
          <>
            {locales.length > 0 && <optgroup label={`Séances de « ${ici} »`}>{locales}</optgroup>}
            <optgroup label={`Séances de « ${nomComite(comite)} » (comité dont dépend « ${ici} »)`}>
              {choix.map((s, i) => <option key={`${s.uniteId}:${s.id}`} value={`c:${i}`}>🏛️ {s.titre} ({fmtDate(s.date)}){s.uniteId !== comite ? ` · ${nomComite(s.uniteId)}` : ''}</option>)}
            </optgroup>
          </>
        ) : locales}
      </select>
      {lie ? (
        <small className="muted">
          🏛️ À l’ordre du jour et au PV de « {lie.titre} » ({nomComite(lie.uniteId)}) : la tâche est partagée avec ce comité, qui la modifie comme les siennes.
          {reglage === 'rien' && lie.uniteId === parent?.id && ` ⚠️ Réglage de « ${ici} » : « ${TACHES_DEPENDANCE.rien.label} » ; elle n’y apparaîtra pas tant qu’il reste ainsi.`}
        </small>
      ) : parent && lu === null ? (
        <small className="muted">Les séances de « {parent.nom} » seront proposées ici après la mise à jour du serveur (migration 032).</small>
      ) : null}
    </label>
  );
}

/**
 * Tâche partagée par une autre entité (041) : une séance de l'entité ouverte (son ordre du jour et son PV), si la tâche
 * n'est pas déjà liée à une séance de son entité ou d'une autre (seanceAilleurs, en lecture).
 */
function SeanceIci({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  const club = useClubOptional();
  const ailleurs = t.source?.seanceAilleurs;
  const ici = club?.current.nom ?? 'cette entité';
  return (
    <label className="full">
      Séance de comité
      {ailleurs ? (
        <input value={ailleurs.replace(/^./, (c) => c.toUpperCase())} disabled readOnly />
      ) : (
        <select value={t.meetingId ?? ''} disabled={disabled} onChange={(e) => setT((x) => ({ ...x, meetingId: e.target.value || undefined }))}>
          <option value="">—</option>
          {data.meetings.map((m) => <option key={m.id} value={m.id}>{m.titre} ({fmtDate(m.date)})</option>)}
        </select>
      )}
      <small className="muted">
        {ailleurs
          ? `Elle se change dans « ${t.source!.unite} », l’entité de la tâche.`
          : t.meetingId
            ? `🗓️ À l’ordre du jour et au PV de cette séance de « ${ici} ».`
            : `Une séance de « ${ici} » : la tâche figure alors à son ordre du jour et à son PV.`}
      </small>
    </label>
  );
}

/**
 * Pour quand ? Une date, ou une date calculée à partir d'un événement / d'une séance (« 1 semaine avant le Tournoi
 * d'automne ») qui suit ensuite ses changements de date. Aussi : une séance du comité dont l'entité dépend, un événement
 * qui dépend du comité ouvert.
 */
function DelaiField({ t, setT, disabled, dateSeule }: { t: Task; setT: SetT; disabled: boolean; dateSeule?: boolean }) {
  const { data } = useStore();
  const { club, comite, seances: xm, evenements, unite, ici } = useExternes(t);
  const [choisir, setChoisir] = useState(false);
  const upcoming = <T extends { id: string; date: string; dateFin?: string }>(list: T[], current?: string) =>
    list.filter((x) => endOf(x) >= today() || x.id === current).sort((a, b) => a.date.localeCompare(b.date));
  // Événement qui se répète : à sa prochaine occurrence (tant qu'il en reste).
  const events = upcoming(data.events.map((e) => (e.repetition ? aLaDate(e, occurrenceDu(e, today()) ?? derniereOccurrence(e) ?? e.date) : e)), t.eventId);
  const meetings = upcoming(data.meetings, t.meetingId);
  // Édition pas encore datée : pas de repère pour un délai.
  const xe = evenements.filter((x) => x.date);
  const ref = t.delaiRef;
  const mode = !ref
    ? 'fixe'
    : ref.type === 'event'
      ? t.eventId ? `event:${t.eventId}` : t.evenementEntite ? `xe:${xe.findIndex((x) => memeEvenement(x, t.evenementEntite))}` : 'fixe'
      : t.meetingId ? `meeting:${t.meetingId}` : t.seanceComite ? `xm:${xm.findIndex((s) => memeSeance(s, t.seanceComite))}` : 'fixe';

  const onMode = (v: string) => {
    if (v === 'fixe') {
      setChoisir(false);
      return setT((x) => ({ ...x, delaiRef: undefined }));
    }
    const i = v.indexOf(':');
    const cle = v.slice(0, i);
    const id = v.slice(i + 1);
    setT((x) => {
      const y =
        cle === 'event' ? { ...x, eventId: id, evenementEntite: undefined }
        : cle === 'xe' ? { ...x, eventId: undefined, evenementEntite: xe[Number(id)] }
        : cle === 'meeting' ? { ...x, meetingId: id, seanceComite: undefined }
        : avecSeance(x, xm[Number(id)], club?.central?.id);
      const type = cle === 'event' || cle === 'xe' ? 'event' : 'meeting';
      // Par défaut le jour même ; autre événement : sa prochaine occurrence (s'il se répète).
      return applyDelaiRef(data, sansOccurrence({ ...y, delaiRef: { ...(x.delaiRef ?? makeDelai(0, 'jours', false)), type } }));
    });
  };

  const choix = (
    <select value={mode} disabled={disabled} aria-label="Date fixe, ou selon un événement / une séance" title="Changer : une autre séance, un événement ou une date fixe" onChange={(e) => onMode(e.target.value)}>
      <option value="fixe">📆 Date fixe</option>
      {events.length > 0 && (
        <optgroup label="Selon un événement">
          {events.map((e) => <option key={e.id} value={`event:${e.id}`}>🎉 {e.nom} ({e.repetition ? `🔁 ${libelleRegle(e.repetition, e.date).toLowerCase()}` : fmtRange(e.date, e.dateFin)})</option>)}
        </optgroup>
      )}
      {xe.length > 0 && (
        <optgroup label={`Selon un événement qui dépend de « ${ici} »`}>
          {xe.map((x, i) => <option key={`${x.uniteId}:${x.id ?? ''}:${x.date}`} value={`xe:${i}`}>{libelleEvenement(x, unite(x.uniteId))}</option>)}
        </optgroup>
      )}
      {meetings.length > 0 && (
        <optgroup label={xm.length ? `Selon une séance de « ${ici} »` : 'Selon une séance de comité'}>
          {meetings.map((m) => <option key={m.id} value={`meeting:${m.id}`}>🗓️ {m.titre} ({fmtDate(m.date)})</option>)}
        </optgroup>
      )}
      {xm.length > 0 && (
        <optgroup label={`Selon une séance de « ${unite(comite)?.nom ?? 'comité'} » (comité dont dépend « ${ici} »)`}>
          {xm.map((s, i) => <option key={`${s.uniteId}:${s.id}`} value={`xm:${i}`}>🏛️ {s.titre} ({fmtDate(s.date)})</option>)}
        </optgroup>
      )}
    </select>
  );

  return (
    <div className="delai-field">
      <span className="field-label">Pour quand ?</span>
      {mode === 'fixe' ? (
        <>
          <input type="date" aria-label="Pour quand ?" value={t.delai} disabled={disabled} onChange={(e) => setT((x) => ({ ...x, delai: e.target.value }))} />
          {!t.delai && <small className="muted">Aucun délai</small>}
          {choisir && choix}
          {!disabled && (
            <div className="delai-liens">
              {!choisir && !dateSeule && events.length + meetings.length + xe.length + xm.length > 0 && (
                <button type="button" className="link-btn" onClick={() => setChoisir(true)}><Icone n="epingle" /> ou selon un événement / une séance</button>
              )}
              {t.delai && <button type="button" className="link-btn" onClick={() => setT((x) => ({ ...x, delai: '' }))}>✕ Aucun délai</button>}
            </div>
          )}
        </>
      ) : (
        <>
          {choix}
          <OccurrenceField t={t} setT={setT} disabled={disabled} />
          <QuandField t={t} setT={setT} disabled={disabled} />
          {!disabled && (
            <div className="delai-liens">
              <button type="button" className="link-btn" onClick={() => onMode('fixe')}><Icone n="date" /> ou une date fixe</button>
              <button type="button" className="link-btn" onClick={() => { setChoisir(false); setT((x) => ({ ...x, delaiRef: undefined, delai: '' })); }}>✕ Aucun délai</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Délai selon un événement qui se répète : l'occurrence qu'il suit (les prochaines, et celle choisie). */
function OccurrenceField({ t, setT, disabled }: { t: Task; setT: SetT; disabled: boolean }) {
  const { data } = useStore();
  const e = t.delaiRef?.type === 'event' ? data.events.find((x) => x.id === t.eventId) : undefined;
  if (!e?.repetition) return null;
  const jour = today();
  const cur = t.delaiRef?.occurrence;
  const prochaines = occurrencesEntre(e, jour, addDays(jour, 3 * 366), 12);
  const liste = [...new Set([...(cur ? [cur] : []), ...prochaines])].sort();
  return (
    <label className="occurrence-field">
      <span className="field-label">Occurrence</span>
      <select
        value={cur ?? ''}
        disabled={disabled}
        onChange={(ev) => setT((x) => applyDelaiRef(data, { ...x, delaiRef: { ...x.delaiRef!, occurrence: ev.target.value } }))}
      >
        {liste.map((o) => <option key={o} value={o}>{longDate(o)}{horaire(e) ? ` · ${horaire(e)}` : ''}</option>)}
      </select>
    </label>
  );
}

/** « jeudi 22.10.2026 ». */
const longDate = (d: string) => `${new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long' })} ${fmtDate(d)}`;

const UNITES: { id: DelaiUnite; un: string; plusieurs: string }[] = [
  { id: 'jours', un: 'jour', plusieurs: 'jours' },
  { id: 'semaines', un: 'semaine', plusieurs: 'semaines' },
  { id: 'mois', un: 'mois', plusieurs: 'mois' },
];

/** « Quand ? » : nombre libre de jours, semaines ou mois, avant ou après l'événement / la séance. */
function QuandField({ t, setT, disabled }: { t: Task; setT: (fn: (x: Task) => Task) => void; disabled: boolean }) {
  const { data } = useStore();
  const cur = splitDelai(t.delaiRef!);
  // Texte du nombre : on peut l'effacer le temps d'en écrire un autre.
  const [txt, setTxt] = useState(String(cur.n));
  const shown = txt === '' || Number(txt) === cur.n ? txt : String(cur.n);
  const change = (patch: Partial<typeof cur>) => {
    const next = { ...cur, ...patch };
    setT((x) => applyDelaiRef(data, { ...x, delaiRef: { ...x.delaiRef!, ...makeDelai(next.n, next.unite, next.apres) } }));
  };
  return (
    <div className="quand">
      <div className="quand-row">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={DELAI_MAX}
          value={shown}
          disabled={disabled}
          aria-label="Nombre"
          onChange={(e) => {
            setTxt(e.target.value);
            if (e.target.value !== '') change({ n: Number(e.target.value) });
          }}
          onBlur={() => setTxt(String(cur.n))}
        />
        <select value={cur.unite} disabled={disabled} aria-label="Unité" onChange={(e) => change({ unite: e.target.value as DelaiUnite })}>
          {UNITES.map((u) => <option key={u.id} value={u.id}>{cur.n > 1 ? u.plusieurs : u.un}</option>)}
        </select>
        <select value={cur.apres ? 'apres' : 'avant'} disabled={disabled} aria-label="Avant ou après" onChange={(e) => change({ apres: e.target.value === 'apres' })}>
          <option value="avant">avant</option>
          <option value="apres">après</option>
        </select>
      </div>
      <small className="delai-calc">→ {fmtDate(t.delai)}{cur.n === 0 || (cur.n === 1 && cur.unite === 'jours') ? ` (${offsetLabel(t.delaiRef!).toLowerCase()})` : ''} · suit la date automatiquement</small>
    </div>
  );
}
