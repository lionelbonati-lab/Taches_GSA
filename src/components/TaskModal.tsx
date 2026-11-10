import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { DocsField, type DocTracking } from './DocsField';
import { PollCard } from './PollCard';
import { PollEditor } from './PollEditor';
import { EmailsField } from './EmailsField';
import { emailsOf } from '../data/emails';
import { deleteFiles } from '../data/files';
import { TicketModal } from './Tickets';
import { useStore } from '../data/store';
import { cleVu, nbPourInfo, pourMoi, vuAvantModif } from '../data/pourInfo';
import { useSuiviPourInfo } from '../data/suiviPourInfo';
import { aPrendreOuverte, auteurAPrendre, pasDispo as aDecline, peutPrendre } from '../data/aPrendre';
import type { AppData, PersonneHors, Task, VuPourInfo } from '../data/types';
import { childrenOf, fmtDateTime, fullName, isDone, nomPoste, parentOf, recurrenceLabel, uid } from '../data/utils';
import { finAnticipee, motSeance } from '../data/seances';
import { Modal } from './ui';
import { Icone, type IconeNom } from './icones';
import { Deroulante } from './Deroulante';
import { EnvoyerLien } from './EnvoyerLien';
import { lienAppli, texteTache } from '../data/lienPartage';
import { ZoneTexte } from './ZoneTexte';
import { DelaiField } from './tache/Quand';
import { APrendreChamp, placesAPrendre } from './tache/APrendre';
import { PourInfoChamp } from './tache/PourInfo';
import { PersonneExterne } from './tache/PersonneExterne';
import { Checklist } from './tache/Checklist';
import { Repetition } from './tache/Repetition';
import { Rattachements } from './tache/Rattachements';
import { Discussion } from './tache/Discussion';
import { commentairesDe, nonLus } from '../data/commentaires';
import { Historique } from './tache/Historique';
import { NotesSeances } from './tache/NotesSeances';
import { clePlace, etiquettePassee, etiquettesDesLieux, nomLieu, placesPassees, recaler } from '../data/etiquettes';
import { etiquettesDe } from '../data/permissions';
import { titreAvecEtiquettes } from '../data/discussions';
import { IconeEtiquette } from './IconesEtiquette';

/** `ouvrirDiscussion` : la fenêtre de discussion ouverte d'emblée (notification 💬). */
export type TaskModalProps = { task: Task; isNew: boolean; onClose: () => void; openEmailId?: string; ouvrirDiscussion?: boolean };

/** « Qui s'en occupe ? » › « ＋ Ajouter… » : quelqu'un qui n'a pas de fiche dans l'appli. */
const AUTRE_PERSONNE = 'autre:';

/** Fenêtre d'une tâche ; un remboursement ou un paiement de facture s'ouvre dans la sienne (circuit caisse → visa → virement). */
export function TaskModal(props: TaskModalProps) {
  if (!props.isNew && props.task.paiement) return <TicketModal task={props.task} onClose={props.onClose} />;
  return <TaskEditor {...props} />;
}

/** Parties facultatives de la fiche : à la suite, chacune à déplier ; celles qui sont remplies s'ouvrent d'office. */
const PARTIES = ['checklist', 'docs', 'repetition', 'liens', 'prendre', 'info', 'sondages', 'emails'] as const;
type Partie = (typeof PARTIES)[number];

/** Parties remplies d'un point. */
function remplies(data: AppData, t: Task, isNew: boolean): Record<Partie, boolean> {
  return {
    checklist: t.checklist.length > 0,
    docs: (t.documents ?? []).length > 0,
    repetition: !!t.recurrence,
    liens: !!(t.eventId || t.meetingId || t.parentId) || (!isNew && childrenOf(data, t.id).length > 0),
    prendre: !!t.aPrendre?.personnes.length,
    info: nbPourInfo(t.pourInfo) > 0,
    sondages: !isNew && (data.polls ?? []).some((p) => p.taskId === t.id),
    emails: !isNew && emailsOf(data, t.id).length > 0,
  };
}

/** Une partie facultative : son titre (et en bref ce qu'elle contient), à cliquer pour la déplier ou la replier. */
function Depliable({ icone, titre, resume, ouverte, plier, children }: {
  icone: IconeNom;
  titre: string;
  resume?: string;
  ouverte: boolean;
  plier: (ouverte: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details className="tache-partie" open={ouverte} onToggle={(e) => plier(e.currentTarget.open)}>
      <summary>
        <Icone n={icone} />
        <span className="tache-partie-titre">{titre}</span>
        {resume && <> <span className="tache-partie-resume">· {resume}</span></>}
        <ChevronDown className="tache-partie-fleche" size="1.1em" aria-hidden="true" />
      </summary>
      {/* Repliée : son contenu n'est pas affiché (ni son champ qui prend le curseur à l'ouverture). */}
      {ouverte && <div className="tache-partie-corps">{children}</div>}
    </details>
  );
}

function TaskEditor({ task, isNew, onClose, openEmailId, ouvrirDiscussion }: TaskModalProps) {
  const { data, user, can, canEditTask, canDeleteTask, canAssignOthers: canAssign, creatableSections, peutRanger, peutEtiqueter, saveTask, prendreTache, pasDispo, vuPourInfo, update, setToast, discussionLueLe, canReadDiscussion } = useStore();
  // Étiquettes d'office selon la place du point (etiquettes.ts).
  const autoDe = etiquettesDesLieux(data);
  // Nouvelle tâche : seules les personnes actives peuvent en être responsables.
  // Statut inconnu (statuts personnalisés) : le premier statut ouvert.
  // Place qu'on ne peut pas prendre, ou pas encore de place quand on ne peut ranger ses points que dans certaines sections
  // (membre d'une étiquette : la sienne) : la première permise.
  const [t, setT] = useState<Task>(() => {
    if (!isNew) return task;
    const restreint = creatableSections().length < data.sections.length;
    const premiere = () =>
      data.sections.flatMap((s) => ['', ...s.sousSections].map((ss) => ({ sectionId: s.id, sousSection: ss }))).find((l) => peutRanger(l.sectionId, l.sousSection));
    const place = task.sectionId ? (peutRanger(task.sectionId, task.sousSection) ? null : premiere()) : restreint ? premiere() : null;
    return {
      ...task,
      ...(place ? { sectionId: place.sectionId, sousSection: place.sousSection } : {}),
      responsables: task.responsables.filter((id) => data.people.some((p) => p.id === id && p.actif)),
      statusId: data.statuses.some((s) => s.id === task.statusId) ? task.statusId : (data.statuses.find((s) => !s.done) ?? data.statuses[0])?.id ?? task.statusId,
    };
  });
  // Tâche liée (ou principale) ouverte par-dessus cette fenêtre.
  const [other, setOther] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const track = useRef<DocTracking>({ added: [], removed: [] });
  // « Quelqu'un d'autre » : une personne qui n'a pas de fiche dans l'appli (son nom, sur la tâche).
  const [externe, setExterne] = useState(false);
  const [chat, setChat] = useState(!!ouvrirDiscussion && !isNew);
  const [newPoll, setNewPoll] = useState(false);
  // Parties dépliées : à l'ouverture de la fiche, celles qui sont remplies ; ensuite, comme on les laisse.
  const [ouvertes, setOuvertes] = useState<Partie[]>(() => {
    const r = remplies(data, task, isNew);
    return PARTIES.filter((x) => r[x]);
  });
  // Pour info : « ✓ Vu » de la personne connectée (la tâche quitte son accueil ; l'auteur voit qu'elle l'a vue).
  const [vuIci, setVuIci] = useState<VuPourInfo | null>(null);
  // Suivi (052) : les personnes attendues (avec un compte).
  const attendus = useSuiviPourInfo(isNew ? [] : [task])[task.id] ?? null;
  if (!user) return null;

  const editable = isNew ? true : canEditTask(task);
  const canAssignOthers = t.sectionId ? canAssign(t.sectionId) : creatableSections().some((s) => canAssign(s.id));
  const section = data.sections.find((s) => s.id === t.sectionId);
  // Place d'origine (en modification) : toujours proposée, même si on ne pourrait pas y ranger un nouveau point.
  const ici = (sectionId: string, sousSection = '') => !isNew && sectionId === task.sectionId && sousSection === (task.sousSection ?? '');
  const permise = (sectionId: string, sousSection = '') => peutRanger(sectionId, sousSection) || ici(sectionId, sousSection);
  // Sections proposées : celles où l'on peut ranger le point (+ la section actuelle en modification).
  const sectionChoices = data.sections.filter((s) => creatableSections().some((c) => c.id === s.id) || s.id === task.sectionId);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));
  const sousSections = (section?.sousSections ?? []).filter((x) => permise(t.sectionId, x));
  if (t.sousSection && !sousSections.includes(t.sousSection)) sousSections.push(t.sousSection);
  const passees = placesPassees(data);
  // « — » (sans sous-section) : seulement si l'on peut ranger le point dans la section elle-même.
  const sansSous = !section || permise(t.sectionId, '');
  // Ranger ailleurs : les étiquettes d'office suivent (celles de l'ancienne place retirées, celles de la nouvelle ajoutées).
  const placer = (sectionId: string, sousSection: string) =>
    setT((x) => ({ ...x, sectionId, sousSection, etiquettes: recaler(x.etiquettes, autoDe(x.sectionId, x.sousSection, x.eventId), autoDe(sectionId, sousSection, x.eventId)) }));
  const choisirSection = (sectionId: string) => {
    const s = data.sections.find((x) => x.id === sectionId);
    // Section où l'on ne peut ranger le point que dans certaines sous-sections : la première d'entre elles.
    placer(sectionId, !s || permise(sectionId, '') ? '' : s.sousSections.find((x) => permise(sectionId, x)) ?? '');
  };
  const assignable = data.people.filter((p) => p.actif && (canAssignOthers || p.id === user.id));
  // Quelqu'un qui n'a pas de fiche dans l'appli : son nom, sur la tâche (respHors) ; sans accès, elle ne la voit pas.
  const peutExterne = !t.paiement && canAssignOthers;
  const ajouterExterne = (p: PersonneHors) => {
    setExterne(false);
    setT((x) => ((x.respHors ?? []).some((y) => y.id === p.id) ? x : { ...x, respHors: [...(x.respHors ?? []), p] }));
  };
  const retirerExterne = (id: string) =>
    setT((x) => {
      const l = (x.respHors ?? []).filter((y) => y.id !== id);
      return { ...x, respHors: l.length ? l : undefined };
    });

  // Tâches liées : un seul niveau (une tâche principale n'est pas elle-même liée à une autre).
  const kids = isNew ? [] : childrenOf(data, task.id).sort((a, b) => (a.delai || '9999').localeCompare(b.delai || '9999'));
  const parent = parentOf(data, t);
  const secName = (id: string) => data.sections.find((s) => s.id === id)?.nom ?? '';

  const toggleResp = (id: string) =>
    set('responsables', t.responsables.includes(id) ? t.responsables.filter((x) => x !== id) : [...t.responsables, id]);

  // Fichiers encore joints à une autre tâche (occurrences d'une tâche répétée, qui les reprennent) : gardés.
  const libres = (ids: string[]) => ids.filter((id) => !data.tasks.some((x) => x.id !== task.id && x.documents?.some((d) => d.id === id)));

  const submit = () => {
    if (!t.titre.trim()) return setErr('Le titre du point est obligatoire.');
    if (!t.sectionId) return setErr('Choisis une section.');
    if (isNew && !can('tasks.createAny', t.sectionId) && !can('tasks.editOwn', t.sectionId)) return setErr('Ton rôle ne permet pas de créer un point dans cette section.');
    if (!permise(t.sectionId, t.sousSection))
      return setErr('Tu ne peux ranger un point que dans la place de tes étiquettes (section ou sous-section de ton groupe ou de ton événement).');
    // Étiquettes : celles de sa place d'office, et à la main seulement celles dont on est membre.
    const auto = autoDe(t.sectionId, t.sousSection, t.eventId);
    const ajoutees = (t.etiquettes ?? []).filter((id) => !auto.includes(id) && !task.etiquettes?.includes(id) && !peutEtiqueter(id));
    if (ajoutees.length) return setErr(`Tu n’es pas membre de l’étiquette « ${data.etiquettes?.find((e) => e.id === ajoutees[0])?.nom ?? '?'} » : tu ne peux pas la mettre.`);
    if (!canAssign(t.sectionId) && t.responsables.some((id) => id !== user.id) && JSON.stringify(t.responsables) !== JSON.stringify(task.responsables))
      return setErr('Ton rôle ne permet pas d’assigner d’autres personnes dans cette section.');
    const fin = finAnticipee(data, isNew ? undefined : task, t);
    if (fin && !confirm(fin)) return;
    // Fichiers retirés : effacés une fois la tâche enregistrée.
    const retires = libres(track.current.removed);
    saveTask({ ...t, titre: t.titre.trim(), etiquettes: recaler(t.etiquettes, [], auto) }, isNew);
    void deleteFiles(retires);
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
    setToast(prend ? '✅ Tu t’en charges : le point est dans « Mes points ».' : '🙅 C’est noté : la personne qui te l’a proposé est prévenue. Tu peux encore t’en charger depuis « Mes points ».');
    deleteFiles(track.current.added);
    onClose();
  };
  const marquerVu = async () => {
    setBusy(true);
    setErr('');
    try {
      await vuPourInfo(task.id);
      const le = new Date().toISOString();
      const avant = task.pourInfoVus?.[cleVu(user.id)];
      setVuIci(avant ? { ...avant, revu: le } : { le });
      setToast(`« ${task.titre} » : ton « ✓ Vu » est noté ; son auteur le voit.`);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  // Discussion de la tâche enregistrée (relue en direct, pas celle de la fenêtre), dans sa propre fenêtre : la bulle en
  // haut l'ouvre et compte les messages pas encore lus. Tâche étiquetée : seulement pour les membres de ses étiquettes.
  const enregistree = data.tasks.find((x) => x.id === task.id) ?? task;
  const discussion = !isNew && canReadDiscussion(enregistree);
  const commentaires = discussion ? commentairesDe(data, enregistree) : [];
  const nl = nonLus(commentaires, discussionLueLe(task.id), user.id);

  // Dupliquer : une nouvelle tâche pré-remplie d'après la tâche enregistrée, à compléter puis créer (« À faire », checklist
  // décochée). Ses fichiers restent communs avec l'original (gardés tant que l'une des deux les utilise) ; emails et
  // sondages ne suivent pas.
  const peutDupliquer = !isNew && !task.paiement && peutRanger(task.sectionId, task.sousSection);
  const dupliquer = () => {
    const ouvert = data.statuses.find((s) => !s.done) ?? data.statuses[0];
    const { suivanteId: _a, termineeLe: _b, aPrendre: _c, postesResp: _d, pourInfoVus: _e, contenuLe: _f, commentaires: _g, ...reste } = task;
    setOther({
      task: {
        ...reste,
        id: uid('t'),
        titre: `${task.titre} (copie)`,
        // Étiquettes : celles de sa place, et celles qu'on peut mettre soi-même.
        etiquettes: task.etiquettes?.filter((id) => peutEtiqueter(id) || autoDe(task.sectionId, task.sousSection, task.eventId).includes(id)),
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
    if (!confirm(`Supprimer le point « ${task.titre} » ?`)) return;
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
    }, `Suppression du point « ${task.titre} »`);
    deleteFiles([...libres((task.documents ?? []).filter((d) => d.kind === 'fichier').map((d) => d.id)), ...track.current.added]);
    onClose();
  };

  const dis = !editable;
  // Répétition : « à chaque comité ».
  const mot = motSeance().toLowerCase();
  const polls = (data.polls ?? []).filter((p) => p.taskId === task.id);
  const rempli = remplies(data, t, isNew);
  const partie = (x: Partie) => ({
    ouverte: ouvertes.includes(x),
    plier: (oui: boolean) => setOuvertes((o) => (oui ? (o.includes(x) ? o : [...o, x]) : o.filter((y) => y !== x))),
  });
  // Parties proposées : en lecture, seulement celles qui sont remplies (rien à y ajouter).
  const montre: Record<Partie, boolean> = {
    checklist: rempli.checklist || !dis,
    docs: rempli.docs || !dis,
    repetition: rempli.repetition || !dis,
    liens: rempli.liens || !dis,
    // À prendre : le proposer à d'autres demande de pouvoir leur assigner le point.
    prendre: !t.paiement && (rempli.prendre || (!dis && canAssignOthers)),
    info: !t.paiement && (rempli.info || !dis),
    // Sondages et emails : une fois le point enregistré.
    sondages: rempli.sondages || (!isNew && editable && can('polls.create')),
    emails: rempli.emails || (!isNew && editable),
  };
  const pluriel = (n: number, nom: string) => `${n} ${nom}${n > 1 ? 's' : ''}`;
  // Ce qu'une partie contient, en bref, à côté de son titre (repliée ou non).
  const nbFaites = t.checklist.filter((c) => c.done).length;
  const rattache = [
    data.events.find((e) => e.id === t.eventId)?.nom,
    data.meetings.find((m) => m.id === t.meetingId)?.titre,
    parent && `↳ ${parent.titre}`,
    kids.length > 0 && pluriel(kids.length, 'point rattaché'),
  ].filter(Boolean).join(', ');
  const nbInfo = nbPourInfo(t.pourInfo);
  const nbProposes = t.aPrendre?.personnes.length ?? 0;
  const nbEmails = isNew ? 0 : emailsOf(data, task.id).length;
  // Personnes à ajouter : soi-même d'abord.
  const aAjouter = assignable.filter((p) => !t.responsables.includes(p.id)).sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  // Pour info : « ✓ Vu » enregistrés sur la tâche (046), avec celui que la personne vient de donner ici.
  const vus: Record<string, VuPourInfo> = isNew ? {} : { ...task.pourInfoVus, ...(vuIci ? { [cleVu(user.id)]: vuIci } : {}) };
  // Pas encore vue, ou modifiée depuis mon « ✓ Vu » (052).
  const monVu = vus[cleVu(user.id)];
  const infoPourMoi = !isNew && pourMoi(task, user.id) && (!monVu || vuAvantModif(monVu, task));
  const auteurInfo = data.people.find((p) => p.id === task.createdBy && p.id !== user.id);
  // À prendre : places prises (bandeau de la personne à qui la tâche est proposée).
  const { nPrendre, nPris, quiPrend } = placesAPrendre(data, t);
  const auteur = data.people.find((p) => p.id === auteurAPrendre(task));
  const pourMoiAPrendre = !isNew && peutPrendre(task, user.id) && !isDone(data, task);
  const jeDecline = aDecline(task, user.id);
  // Étiquettes : celles d'office (sa place ; en lecture, seulement celles que le point porte déjà), celles déjà sur le
  // point, et celles qu'on peut mettre (dont on est membre).
  // Celle d'un événement passé n'est plus proposée (elle reste sur les points qui la portent).
  const auto = dis ? [] : autoDe(t.sectionId, t.sousSection, t.eventId);
  const etiquettes = (data.etiquettes ?? []).filter(
    (e) => auto.includes(e.id) || t.etiquettes?.includes(e.id) || (!dis && peutEtiqueter(e.id) && !etiquettePassee(e, data.events)),
  );
  const placeDe = nomLieu({ sectionId: t.sectionId, sousSection: t.sousSection || undefined }, data.sections);
  return (
    <Modal
      title={isNew ? 'Nouveau point' : editable ? 'Modifier le point' : 'Détail du point'}
      onClose={cancel}
      wide
      actions={
        !isNew && (
          <>
          {discussion && (
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
          )}
          {peutDupliquer && (
            <button type="button" className="icon-btn dupliquer" onClick={dupliquer} title="Dupliquer : créer un nouveau point à partir de celui-ci" aria-label="Dupliquer le point">
              <Icone n="dupliquer" />
            </button>
          )}
          <EnvoyerLien
            titre={`Point « ${task.titre} »`}
            texte={texteTache(task, data.people, isDone(data, task))}
            lien={lienAppli(`/taches?tache=${encodeURIComponent(task.id)}`)}
            acces="Le lien ne donne aucun accès : il faut un compte de l’appli et voir ce point."
          />
          </>
        )
      }
    >
      <div className="form">
        {parent && (
          <button type="button" className="full parent-banner" onClick={() => setOther({ task: parent, isNew: false })}>
            ↳ Point rattaché à <b>{parent.titre}</b> <span className="muted">({secName(parent.sectionId)}) · ouvrir</span>
          </button>
        )}
        {pourMoiAPrendre && (
          <div className="full a-prendre-banner">
            <span>
              🙋 {auteur ? <b>{fullName(auteur)}</b> : 'On'} te propose ce point
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
              <span>✏️ Il a changé depuis ton « ✓ Vu » (modifié le {fmtDateTime(task.contenuLe!)}) : tu as vu la nouvelle version ?</span>
            ) : (
              <span>👁 Pour info{auteurInfo ? <> de <b>{fullName(auteurInfo)}</b></> : ''} : tu es au courant de ce point, sans t’en occuper. Tu l’as vu ?</span>
            )}
            <button type="button" className="btn" disabled={busy} onClick={marquerVu} title="Je suis au courant : son auteur le voit, et il quitte mon accueil">
              <Icone n="ok" /> Vu
            </button>
          </div>
        )}
        <label className="full">
          Point
          <input autoFocus={isNew} value={t.titre} disabled={dis} onChange={(e) => set('titre', e.target.value)} placeholder="Que faut-il faire ou savoir ?" />
        </label>
        {etiquettes.length > 0 && (
          <div className="full etiquettes-choix">
            <span className="field-label"><Icone n="etiquette" /> Étiquettes <small className="muted">(leurs membres voient le point ; celle de son groupe, de sa sous-section ou de son événement est mise d’office)</small></span>
            <div className="chips">
              {etiquettes.map((e) => {
                const dOffice = auto.includes(e.id);
                const on = dOffice || !!t.etiquettes?.includes(e.id);
                const fige = dis || dOffice || !peutEtiqueter(e.id);
                return (
                  <button key={e.id} type="button" className={`chip ${on ? 'on' : ''} ${dOffice ? 'd-office' : ''}`} style={on ? { background: e.couleur, borderColor: e.couleur } : { borderColor: e.couleur }} disabled={fige} aria-pressed={on}
                    title={dOffice ? `D’office : le point est rangé dans ${placeDe}${t.eventId ? ' ou rattaché à son événement' : ''}` : !dis && fige ? 'Tu n’es pas membre de cette étiquette' : undefined}
                    onClick={() => setT((x) => ({ ...x, etiquettes: on ? (x.etiquettes ?? []).filter((y) => y !== e.id) : [...(x.etiquettes ?? []), e.id] }))}>
                    <IconeEtiquette e={e} /> {e.nom}{dOffice ? ' 🔒' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Section, Sous-section et Statut l'un sous l'autre, « Pour quand ? » à côté ; sur téléphone (une colonne), après eux. */}
        <div className="tache-colonne">
          <label>
            Section
            <select value={t.sectionId} disabled={dis} onChange={(e) => choisirSection(e.target.value)}>
              <option value="">— Choisir —</option>
              {sectionChoices.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </label>
          {sousSections.length > 0 && (
            <label>
              Sous-section
              <select value={t.sousSection} disabled={dis || !section} onChange={(e) => placer(t.sectionId, e.target.value)}>
                {(sansSous || !t.sousSection) && <option value="">—</option>}
                {sousSections.filter((x) => !passees.has(clePlace(t.sectionId, x))).map((x) => <option key={x}>{x}</option>)}
                {/* Sous-sections d'événements passés : à part, après les autres. */}
                {sousSections.some((x) => passees.has(clePlace(t.sectionId, x))) && (
                  <optgroup label="Événements passés">
                    {sousSections.filter((x) => passees.has(clePlace(t.sectionId, x))).map((x) => <option key={x}>{x}</option>)}
                  </optgroup>
                )}
              </select>
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
        <DelaiField t={t} setT={setT} disabled={dis} />
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
            {(t.respHors ?? []).map((p) => (
              <span key={p.id} className="chip on" title="Pas de fiche dans l’appli : sans accès, elle ne voit pas le point">
                <Icone n="compte" /> {p.prenom} {p.nom}
                {!dis && canAssignOthers && <button type="button" className="chip-x" aria-label={`Retirer ${p.prenom} ${p.nom}`} onClick={() => retirerExterne(p.id)}>✕</button>}
              </span>
            ))}
            {!t.responsables.length && !t.respHors?.length && <span className="muted">Personne pour l’instant{aPrendreOuverte(t) ? ' : 🙋 à prendre' : ''}.</span>}
            {!dis && (aAjouter.length > 0 || peutExterne) && (
              <Deroulante
                puce
                value=""
                libelle="＋ Ajouter…"
                aria-label="Ajouter une personne"
                onChange={(v) => {
                  if (v === AUTRE_PERSONNE) setExterne(true);
                  else if (v) toggleResp(v);
                }}
                options={[
                  ...aAjouter.map((p) => ({ value: p.id, label: nomPoste(p, user.id) })),
                  peutExterne && { groupe: 'Sans fiche dans l’appli', options: [{ value: AUTRE_PERSONNE, label: '＋ Quelqu’un d’autre…' }] },
                ]}
              />
            )}
          </div>
          {!canAssignOthers && <small className="muted">Ton rôle ne permet d’assigner des points qu’à toi-même{t.sectionId ? ' dans cette section' : ''}.</small>}
        </div>
        {(!dis || !!t.remarque) && (
          <label className="full">
            Remarque
            <ZoneTexte rows={2} value={t.remarque} disabled={dis} onChange={(e) => set('remarque', e.target.value)} placeholder="Détails utiles (facultatif)" />
          </label>
        )}
        {!isNew && <NotesSeances task={task} />}

        {/* Le reste, à la suite : chaque partie se déplie quand on en a besoin. */}
        {PARTIES.some((x) => montre[x]) && (
          <div className="full tache-parties">
            {montre.checklist && (
              <Depliable icone="checklist" titre="Checklist" resume={t.checklist.length ? `${nbFaites}/${t.checklist.length}` : ''} {...partie('checklist')}>
                <Checklist t={t} setT={setT} dis={dis} />
              </Depliable>
            )}
            {montre.docs && (
              <Depliable icone="fichier" titre="Documents" resume={t.documents?.length ? String(t.documents.length) : ''} {...partie('docs')}>
                <DocsField
                  docs={t.documents ?? []}
                  setDocs={(fn) => setT((x) => ({ ...x, documents: fn(x.documents ?? []) }))}
                  disabled={dis}
                  track={track.current}
                  liens
                />
              </Depliable>
            )}
            {montre.repetition && (
              <Depliable icone="repetition" titre="Répétition" resume={t.recurrence === 'seance' ? `À chaque ${mot}` : recurrenceLabel(t.recurrence)} {...partie('repetition')}>
                <Repetition t={t} setT={setT} task={task} isNew={isNew} dis={dis} />
              </Depliable>
            )}
            {montre.liens && (
              <Depliable icone="rattacher" titre="Rattachements" resume={rattache} {...partie('liens')}>
                <Rattachements t={t} setT={setT} task={task} isNew={isNew} dis={dis} editable={editable} kids={kids} ouvrir={(x, nouvelle) => setOther({ task: x, isNew: nouvelle })} />
              </Depliable>
            )}
            {montre.prendre && (
              <Depliable icone="main" titre="À prendre" resume={nbProposes ? pluriel(nbProposes, 'personne') : ''} {...partie('prendre')}>
                <APrendreChamp t={t} setT={setT} dis={dis} canAssignOthers={canAssignOthers} isNew={isNew} />
              </Depliable>
            )}
            {montre.info && (
              <Depliable icone="voir" titre="Pour info" resume={nbInfo ? pluriel(nbInfo, 'personne') : ''} {...partie('info')}>
                <PourInfoChamp t={t} setT={setT} isNew={isNew} dis={dis} vus={vus} attendus={attendus} enregistree={isNew ? null : task} />
              </Depliable>
            )}
            {montre.sondages && (
              <Depliable icone="sondage" titre="Sondages" resume={polls.length ? String(polls.length) : ''} {...partie('sondages')}>
                {polls.map((p) => <PollCard key={p.id} poll={p} compact />)}
                {!polls.length && <small className="muted">Aucun sondage pour ce point.</small>}
                <div className="row wrap">
                  {editable && can('polls.create') && <button type="button" className="btn small" onClick={() => setNewPoll(true)}><Icone n="sondage" /> Nouveau sondage</button>}
                  {polls.length > 0 && <a className="small-link" href="#/sondages">Voir tous les sondages →</a>}
                </div>
              </Depliable>
            )}
            {montre.emails && (
              <Depliable icone="email" titre="Emails programmés" resume={nbEmails ? String(nbEmails) : ''} {...partie('emails')}>
                <EmailsField task={task} isNew={isNew} openEmailId={openEmailId} />
              </Depliable>
            )}
          </div>
        )}
        {!isNew && (
          <small className="muted full">
            Dernière modification : {fmtDateTime(task.updatedAt)} · créé par {fullName(data.people.find((p) => p.id === task.createdBy)) || '?'}
          </small>
        )}
        {!isNew && <Historique className="full" tacheId={task.id} version={(data.tasks.find((x) => x.id === task.id) ?? task).updatedAt} />}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && canDeleteTask(task) && <button className="btn danger" onClick={remove} title="Supprimer le point" aria-label="Supprimer le point"><Icone n="supprimer" /></button>}
        <span className="grow" />
        <button className="btn" onClick={cancel}>{editable ? 'Annuler' : 'Fermer'}</button>
        {editable && <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : isNew ? 'Créer' : 'Enregistrer'}</button>}
      </div>
      {newPoll && <PollEditor taskId={task.id} onClose={() => setNewPoll(false)} />}
      {externe && <PersonneExterne deja={t.respHors ?? []} onAjoutee={ajouterExterne} onClose={() => setExterne(false)} />}
      {chat && discussion && (
        <Discussion titre={titreAvecEtiquettes({ titre: task.titre, etiquettes: etiquettesDe(task, data.etiquettes) })} liste={commentaires} tacheId={task.id} onClose={() => setChat(false)} />
      )}
      {other && <TaskModal task={other.task} isNew={other.isNew} onClose={() => setOther(null)} />}
    </Modal>
  );
}
