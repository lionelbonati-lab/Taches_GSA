import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
import { nbPourInfo, pourMoi, recoiventDe, vuAvantModif } from '../data/pourInfo';
import { useSuiviPourInfo } from '../data/suiviPourInfo';
import { ailleurs, aPrendreOuverte, auteurAPrendre, pasDispo as aDecline, peutPrendre } from '../data/aPrendre';
import { auComiteEntier, parentDans, reglageTaches } from '../data/units';
import { attributionDe, attributions, entitesDependantes, sectionChez } from '../data/externes';
import type { OrgMember, Person, Task, VuPourInfo } from '../data/types';
import { applyDelaiRef, childrenOf, fmtDate, fmtDateTime, fullName, isDone, nomPoste, parentOf, uid } from '../data/utils';
import { finAnticipee, motSeance } from '../data/seances';
import { Modal } from './ui';
import { Icone, type IconeNom } from './icones';
import { Deroulante } from './Deroulante';
import { IconeEntite, PastilleEntite } from './IconesEntite';
import { EnvoyerLien } from './EnvoyerLien';
import { lienAppli, texteTache } from '../data/lienPartage';
import { ZoneTexte } from './ZoneTexte';
import { DelaiField } from './tache/Quand';
import { APrendreChamp, placesAPrendre } from './tache/APrendre';
import { PourInfoChamp } from './tache/PourInfo';
import { Checklist } from './tache/Checklist';
import { Repetition } from './tache/Repetition';
import { Rattachements } from './tache/Rattachements';
import { Discussion } from './tache/Discussion';
import { nonLus } from '../data/commentaires';
import { Historique } from './tache/Historique';

/** `ouvrirDiscussion` : la fenêtre de discussion ouverte d'emblée (notification 💬). */
export type TaskModalProps = { task: Task; isNew: boolean; onClose: () => void; openEmailId?: string; ouvrirDiscussion?: boolean };

/** Fenêtre d'une tâche ; un remboursement ou un paiement de facture s'ouvre dans la sienne (circuit caisse → visa → virement). */
export function TaskModal(props: TaskModalProps) {
  if (!props.isNew && props.task.paiement) return <TicketModal task={props.task} onClose={props.onClose} />;
  return <TaskEditor {...props} />;
}

/** Parties facultatives : affichées si elles sont remplies, sinon ajoutées à la demande (« Ajouter : »). */
type Extra = 'checklist' | 'docs' | 'repetition' | 'liens' | 'emails' | 'partage' | 'info' | 'prendre';

function TaskEditor({ task, isNew, onClose, openEmailId, ouvrirDiscussion }: TaskModalProps) {
  const { data, user, can, canEditTask, canDeleteTask, canAssignOthers: canAssign, creatableSections, saveTask, attribuerTache, prendreTache, pasDispo, vuPourInfo, update, autresResp, externes, setToast, discussionLueLe } = useStore();
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
  // Tâche liée (ou principale) ouverte par-dessus cette fenêtre.
  const [other, setOther] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const track = useRef<DocTracking>({ added: [], removed: [] });
  const [chat, setChat] = useState(!!ouvrirDiscussion && !isNew);
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
  // Pour info : « ✓ Vu » de la personne connectée (la tâche quitte son accueil ; l'auteur voit qu'elle l'a vue).
  const [vuIci, setVuIci] = useState<VuPourInfo | null>(null);
  // Entités mentionnées en entier : les personnes qui reçoivent la tâche (entité → fiches ; null : pas encore connues).
  const [recoivent, setRecoivent] = useState<Record<string, string[]> | null>(null);
  const entitesInfo = isNew || task.paiement ? '' : (task.pourInfo?.unites ?? []).join(',');
  useEffect(() => {
    if (!club || !entitesInfo) return;
    let fini = false;
    club.destinatairesPourInfo(task.source?.uniteId ?? club.current.id, task.source?.id ?? task.id).then((r) => !fini && setRecoivent(r), () => {});
    return () => { fini = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relu quand la tâche ou ses entités changent
  }, [club?.current.id, entitesInfo, task.id, task.source?.id, task.source?.uniteId]);
  // Suivi (052) : les personnes attendues (avec un compte ; entités : qui les reçoit). Sans 052 : `recoivent` (046).
  const attendus = useSuiviPourInfo(isNew ? [] : [task])[task.id] ?? null;
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

  // Tâches liées : un seul niveau (une tâche principale n'est pas elle-même liée à une autre).
  const kids = isNew ? [] : childrenOf(data, task.id).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  const parent = parentOf(data, t);
  const secName = (id: string) => data.sections.find((s) => s.id === id)?.nom ?? '';

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
  const marquerVu = async () => {
    setBusy(true);
    setErr('');
    try {
      await vuPourInfo(task.id, task.source?.id ?? task.id, task.source?.uniteId);
      const le = new Date().toISOString();
      const avant = task.pourInfoVus?.[`p:${user!.id}`];
      setVuIci(avant ? { ...avant, revu: le } : { le });
      setToast(`« ${task.titre} » : ton « ✓ Vu » est noté ; son auteur le voit.`);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  // Discussion de la tâche enregistrée (relue en direct, pas celle de la fenêtre), dans sa propre fenêtre : la bulle en
  // haut l'ouvre et compte les messages pas encore lus.
  const commentaires = (data.tasks.find((x) => x.id === task.id) ?? task).commentaires ?? [];
  const nl = user ? nonLus(commentaires, discussionLueLe(task.id), user.id, club?.current.id ?? '', task.source?.uniteId ?? club?.current.id ?? '', club?.mesFiches) : 0;

  // Dupliquer : une nouvelle tâche pré-remplie d'après la tâche enregistrée, à compléter puis créer (« À faire », checklist
  // décochée). Ses fichiers restent communs avec l'original (gardés tant que l'une des deux les utilise) ; emails et
  // sondages ne suivent pas.
  const peutDupliquer = !isNew && !task.source && !task.paiement && creatableSections().some((s) => s.id === task.sectionId);
  const dupliquer = () => {
    const ouvert = data.statuses.find((s) => !s.done) ?? data.statuses[0];
    const { suivanteId, termineeLe, proposee, parCentral, copieDe, attribueePar, modifiePar, aPrendre, respPartage, postesResp, pieces, pourInfoVus, contenuLe, commentaires, ...reste } = task;
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
  // Répétition : « à chaque comité » (le mot des séances de l'entité).
  const mot = motSeance(club?.current.type).toLowerCase();
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
  // Pour info : « ✓ Vu » enregistrés sur la tâche (046), avec celui que la personne vient de donner ici.
  const vus: Record<string, VuPourInfo> = isNew ? {} : { ...task.pourInfoVus, ...(vuIci ? { [`p:${user.id}`]: vuIci } : {}) };
  // Pas encore vue, ou modifiée depuis mon « ✓ Vu » (052).
  const monVu = vus[`p:${user.id}`];
  const infoPourMoi = !isNew && pourMoi(task, user.id) && (!monVu || vuAvantModif(monVu, task));
  const auteurInfo = data.people.find((p) => p.id === task.createdBy && p.id !== user.id);
  // À prendre : places prises (bandeau de la personne à qui la tâche est proposée).
  const { nPrendre, nPris, quiPrend } = placesAPrendre(data, t);
  const auteur = data.people.find((p) => p.id === auteurAPrendre(task));
  const pourMoiAPrendre = !isNew && peutPrendre(task, user.id) && !isDone(data, task);
  // Tâche partagée : ce qui se gère dans son entité, et de quoi l'y ouvrir si on en fait partie.
  const chezSource = t.source && club?.units.find((u) => u.id === t.source!.uniteId && u.moi && !u.archive);
  const jeDecline = aDecline(task, user.id);

  return (
    <Modal
      title={isNew ? 'Nouvelle tâche' : editable ? 'Modifier la tâche' : 'Détail de la tâche'}
      onClose={cancel}
      wide
      actions={
        !isNew && (
          <>
          <button
            type="button"
            className="icon-btn discussion-btn"
            onClick={() => setChat(true)}
            title={commentaires.length ? `Discussion : ${commentaires.length} message${commentaires.length > 1 ? 's' : ''}${nl ? `, ${nl} non lu${nl > 1 ? 's' : ''}` : ''}` : 'Discussion : écrire un message'}
            aria-label={`Discussion${nl ? ` (${nl} non lu${nl > 1 ? 's' : ''})` : ''}`}
          >
            <Icone n="message" />
            {nl > 0 && <span className="discussion-nb">{nl}</span>}
          </button>
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
        {infoPourMoi && (
          <div className="full pour-info-banner">
            {monVu ? (
              <span>✏️ Elle a changé depuis ton « ✓ Vu » (modifiée le {fmtDateTime(task.contenuLe!)}) : tu as vu la nouvelle version ?</span>
            ) : (
              <span>👁 Pour info{auteurInfo ? <> de <b>{fullName(auteurInfo)}</b></> : ''} : tu es au courant de cette tâche, sans t’en occuper. Tu l’as vue ?</span>
            )}
            <button type="button" className="btn" disabled={busy} onClick={marquerVu} title="Je suis au courant : son auteur le voit, et elle quitte mon accueil">
              <Icone n="ok" /> Vu
            </button>
          </div>
        )}
        <label className="full">
          Tâche
          <input autoFocus={isNew} value={t.titre} disabled={dis} onChange={(e) => set('titre', e.target.value)} placeholder="Que faut-il faire ?" />
        </label>
        {/* Section, Sous-section et Statut l'un sous l'autre, « Pour quand ? » à côté ; sur téléphone (une colonne), après eux. */}
        <div className="tache-colonne">
          <label>
            Section
            <select value={t.sectionId} disabled={dis} onChange={(e) => changerSection(e.target.value)}>
              <option value="">— Choisir —</option>
              {sectionChoices.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </label>
          {(sousSections.length > 0 || att.choix.length > 0 || attendSections) && (
            <label>
              Sous-section
              <Deroulante
                value={attribuee?.cle ?? (t.sousSection ? `s:${t.sousSection}` : '')}
                disabled={dis || !section}
                onChange={changerSous}
                options={[
                  { value: '', label: '—' },
                  ...sousSections.map((s) => ({ value: `s:${s}`, label: s })),
                  {
                    groupe: att.unite ? `Sections de « ${att.unite.nom} »` : `Événements qui dépendent de « ${club?.current.nom ?? ''} »`,
                    icone: <Icone n="partage" />,
                    options: att.choix.map((c) => (c.sectionId ? { value: c.cle, label: c.sousSection } : { value: c.cle, label: c.unite.nom, icone: <PastilleEntite u={c.unite} /> })),
                  },
                ]}
              />
              {attribuee && (
                <small className="muted attribuee-note">
                  📦 À l’enregistrement, la tâche {isNew ? 'sera créée' : 'passera'} dans « {attribuee.unite.nom} »
                  {secChez && `, section « ${sectionsChez.find((x) => x.id === secChez)?.nom ?? attribuee.sousSection} »`}, qui la gérera comme ses
                  tâches ; ici, elle apparaîtra partagée <Icone n="partage" /> et restera modifiable.{(t.documents ?? []).some((d) => d.kind === 'fichier') && !cacheChez && ' Ses fichiers joints la suivent.'}
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
          {/* Statut : ce qu'on change le plus souvent ; le champ prend la couleur du statut choisi, chaque choix a sa pastille. */}
          <label className="statut-choix" style={{ '--c': data.statuses.find((s) => s.id === t.statusId)?.couleur } as CSSProperties}>
            Statut
            <Deroulante
              aria-label="Statut"
              value={t.statusId}
              disabled={dis}
              onChange={(v) => set('statusId', v)}
              options={data.statuses.map((s) => ({ value: s.id, label: s.label, icone: <span className="statut-jeton" style={{ background: s.couleur }} /> }))}
            />
          </label>
        </div>
        <DelaiField t={t} setT={setT} disabled={dis} dateSeule={!!t.source} />
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
                <IconeEntite u={entite!} /> {m.prenom} {m.nom}
                {!dis && canAssignOthers && <button type="button" className="chip-x" aria-label={`Retirer ${m.prenom} ${m.nom}`} onClick={() => toggleChez(m.id)}>✕</button>}
              </span>
            ))}
            {!t.responsables.length && !choisisChez.length && <span className="muted">Personne pour l’instant{aPrendreOuverte(t) ? ' : 🙋 à prendre' : ''}.</span>}
            {!dis && (aAjouter.length > 0 || membresChez.length > 0) && (
              <Deroulante
                puce
                value=""
                libelle="＋ Ajouter…"
                aria-label="Ajouter une personne"
                onChange={(v) => v && (v.startsWith('chez:') ? toggleChez(v.slice(5)) : toggleResp(v))}
                options={[
                  ...(entite
                    ? [
                        { groupe: entite.nom, icone: <PastilleEntite u={entite} />, options: membresChez.map((m) => ({ value: `chez:${m.id}`, label: nomPoste(m) })) },
                        { groupe: club?.current.nom ?? 'Ici', options: aAjouter.map((p) => ({ value: p.id, label: nomPoste(p, user.id) })) },
                      ]
                    : aAjouter.map((p) => ({ value: p.id, label: nomPoste(p, user.id) }))),
                ]}
              />
            )}
          </div>
          {entite && canAssignOthers && !dis && !entite.membres.length && <small className="muted">« {entite.nom} » n’a encore personne dans l’appli : ajoute ses membres dans l’organigramme pour leur confier la tâche.</small>}
          {autres && <small className="muted autres-resp">Aussi : {autres}</small>}
          {!canAssignOthers && <small className="muted">Ton rôle ne permet d’assigner des tâches qu’à toi-même{t.sectionId ? ' dans cette section' : ''}.</small>}
        </div>
        {!t.paiement && voit('prendre') && <APrendreChamp t={t} setT={setT} dis={dis} canAssignOthers={canAssignOthers} />}
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
        {!t.paiement && voit('info') && <PourInfoChamp t={t} setT={setT} isNew={isNew} dis={dis} vus={vus} recoivent={attendus ? recoiventDe(attendus, task.pourInfo?.unites) : recoivent} attendus={attendus} enregistree={isNew ? null : task} />}

        {voit('checklist') && <Checklist t={t} setT={setT} dis={dis} />}
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
        <Repetition t={t} setT={setT} task={task} isNew={isNew} dis={dis} complet={complet} ouverte={voit('repetition')} />
        {voit('liens') && <Rattachements t={t} setT={setT} task={task} isNew={isNew} dis={dis} editable={editable} complet={complet} kids={kids} ouvrir={(x, nouvelle) => setOther({ task: x, isNew: nouvelle })} />}
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
        {!isNew && <Historique className="full" tacheId={task.source?.id ?? task.id} uniteId={task.source?.uniteId} version={(data.tasks.find((x) => x.id === task.id) ?? task).updatedAt} />}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && canDeleteTask(task) && <button className="btn danger" onClick={remove} title="Supprimer la tâche" aria-label="Supprimer la tâche"><Icone n="supprimer" /></button>}
        <span className="grow" />
        <button className="btn" onClick={cancel}>{editable ? 'Annuler' : 'Fermer'}</button>
        {editable && <button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Enregistrement…' : isNew ? 'Créer' : 'Enregistrer'}</button>}
      </div>
      {newPoll && <PollEditor taskId={task.id} onClose={() => setNewPoll(false)} />}
      {chat && !isNew && (
        <Discussion titre={task.titre} liste={commentaires} cle={task.id} tacheId={task.source?.id ?? task.id} uniteId={task.source?.uniteId} onClose={() => setChat(false)} />
      )}
      {other && <TaskModal task={other.task} isNew={other.isNew} onClose={() => setOther(null)} />}
    </Modal>
  );
}
