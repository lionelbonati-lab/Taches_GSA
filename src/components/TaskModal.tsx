import { useRef, useState, type CSSProperties } from 'react';
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
import type { PersonneHors, Task, VuPourInfo } from '../data/types';
import { childrenOf, fmtDateTime, fullName, isDone, nomPoste, parentOf, uid } from '../data/utils';
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

/** `ouvrirDiscussion` : la fenêtre de discussion ouverte d'emblée (notification 💬). */
export type TaskModalProps = { task: Task; isNew: boolean; onClose: () => void; openEmailId?: string; ouvrirDiscussion?: boolean };

/** « Qui s'en occupe ? » › « ＋ Ajouter… » : quelqu'un qui n'a pas de fiche dans l'appli. */
const AUTRE_PERSONNE = 'autre:';

/** Fenêtre d'une tâche ; un remboursement ou un paiement de facture s'ouvre dans la sienne (circuit caisse → visa → virement). */
export function TaskModal(props: TaskModalProps) {
  if (!props.isNew && props.task.paiement) return <TicketModal task={props.task} onClose={props.onClose} />;
  return <TaskEditor {...props} />;
}

/** Parties facultatives : affichées si elles sont remplies, sinon ajoutées à la demande (« Ajouter : »). */
type Extra = 'checklist' | 'docs' | 'repetition' | 'liens' | 'emails' | 'info' | 'prendre';

function TaskEditor({ task, isNew, onClose, openEmailId, ouvrirDiscussion }: TaskModalProps) {
  const { data, user, can, canEditTask, canDeleteTask, canAssignOthers: canAssign, creatableSections, saveTask, prendreTache, pasDispo, vuPourInfo, update, setToast, discussionLueLe, canReadDiscussion } = useStore();
  // Nouvelle tâche : seules les personnes actives peuvent en être responsables.
  // Statut inconnu (statuts personnalisés) : le premier statut ouvert.
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
  // « Quelqu'un d'autre » : une personne qui n'a pas de fiche dans l'appli (son nom, sur la tâche).
  const [externe, setExterne] = useState(false);
  const [chat, setChat] = useState(!!ouvrirDiscussion && !isNew);
  const [newPoll, setNewPoll] = useState(false);
  // Liens déjà remplis : ils restent affichés si on les vide.
  const [ouverts, setOuverts] = useState<Extra[]>(() => [
    ...(task.eventId || task.meetingId || task.parentId ? ['liens' as const] : []),
    ...(task.pourInfo ? ['info' as const] : []),
    ...(task.aPrendre ? ['prendre' as const] : []),
  ]);
  const [nouvelEmail, setNouvelEmail] = useState(false);
  // Pour info : « ✓ Vu » de la personne connectée (la tâche quitte son accueil ; l'auteur voit qu'elle l'a vue).
  const [vuIci, setVuIci] = useState<VuPourInfo | null>(null);
  // Suivi (052) : les personnes attendues (avec un compte).
  const attendus = useSuiviPourInfo(isNew ? [] : [task])[task.id] ?? null;
  if (!user) return null;

  const editable = isNew ? true : canEditTask(task);
  const canAssignOthers = t.sectionId ? canAssign(t.sectionId) : creatableSections().some((s) => canAssign(s.id));
  const section = data.sections.find((s) => s.id === t.sectionId);
  // Sections proposées : celles où le rôle permet de créer (+ la section actuelle en modification).
  const sectionChoices = data.sections.filter((s) => creatableSections().some((c) => c.id === s.id) || s.id === task.sectionId);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));
  const sousSections = [...(section?.sousSections ?? [])];
  if (t.sousSection && !sousSections.includes(t.sousSection)) sousSections.push(t.sousSection);
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
    if (!canAssign(t.sectionId) && t.responsables.some((id) => id !== user.id) && JSON.stringify(t.responsables) !== JSON.stringify(task.responsables))
      return setErr('Ton rôle ne permet pas d’assigner d’autres personnes dans cette section.');
    const fin = finAnticipee(data, isNew ? undefined : task, t);
    if (fin && !confirm(fin)) return;
    // Fichiers retirés : effacés une fois la tâche enregistrée.
    const retires = libres(track.current.removed);
    saveTask({ ...t, titre: t.titre.trim() }, isNew);
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
  const peutDupliquer = !isNew && !task.paiement && creatableSections().some((s) => s.id === task.sectionId);
  const dupliquer = () => {
    const ouvert = data.statuses.find((s) => !s.done) ?? data.statuses[0];
    const { suivanteId: _a, termineeLe: _b, aPrendre: _c, postesResp: _d, pourInfoVus: _e, contenuLe: _f, commentaires: _g, ...reste } = task;
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
  const rempli: Record<Extra, boolean> = {
    checklist: t.checklist.length > 0,
    docs: (t.documents ?? []).length > 0,
    repetition: !!t.recurrence,
    liens: !!(t.eventId || t.meetingId || t.parentId || kids.length),
    emails: !isNew && emailsOf(data, task.id).length > 0,
    info: nbPourInfo(t.pourInfo) > 0,
    prendre: !!t.aPrendre?.personnes.length,
  };
  const voit = (x: Extra) => rempli[x] || ouverts.includes(x);
  const ouvrir = (x: Extra) => setOuverts((o) => [...o, x]);
  const ajouts: { label: string; icone: IconeNom; aide: string; run: () => void; si: boolean }[] = [
    { label: 'Checklist', icone: 'checklist' as const, aide: 'Une liste de petites étapes à cocher', run: () => ouvrir('checklist'), si: !voit('checklist') },
    { label: 'Document', icone: 'fichier' as const, aide: 'Un fichier, une photo ou un lien', run: () => ouvrir('docs'), si: !voit('docs') },
    { label: 'Répétition', icone: 'repetition' as const, aide: `Le point revient chaque semaine, chaque mois, à chaque ${mot}…`, run: () => ouvrir('repetition'), si: !voit('repetition') },
    { label: 'Rattacher à…', icone: 'rattacher' as const, aide: 'Un événement, une séance de comité ou un autre point', run: () => ouvrir('liens'), si: !voit('liens') },
    {
      label: 'À prendre',
      icone: 'main' as const,
      aide: 'Proposer le point à quelques personnes : l’une d’elles s’en charge elle-même',
      run: () => {
        ouvrir('prendre');
        // Nouvelle tâche : on n'en reste pas responsable par défaut (la personne qui se propose s'en chargera).
        if (isNew && t.responsables.length === 1 && t.responsables[0] === user.id) set('responsables', []);
      },
      si: !voit('prendre') && !t.paiement && canAssignOthers,
    },
    { label: 'Pour info', icone: 'voir' as const, aide: 'Des personnes qui le voient, sans s’en occuper', run: () => ouvrir('info'), si: !voit('info') && !t.paiement },
    { label: 'Sondage', icone: 'sondage' as const, aide: 'Demander l’avis des membres', run: () => setNewPoll(true), si: !isNew && can('polls.create') },
    {
      label: 'Email',
      icone: 'email' as const,
      aide: 'Un email envoyé à une date choisie',
      run: () => {
        setNouvelEmail(true);
        ouvrir('emails');
      },
      si: !isNew && !voit('emails'),
    },
  ].filter((a) => a.si);
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
  // Étiquettes : celles du club, et celles déjà sur la tâche.
  const etiquettes = data.etiquettes ?? [];
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
            <span className="field-label"><Icone n="etiquette" /> Étiquettes <small className="muted">(leurs membres voient le point)</small></span>
            <div className="chips">
              {etiquettes.map((e) => {
                const on = !!t.etiquettes?.includes(e.id);
                return (
                  <button key={e.id} type="button" className={`chip ${on ? 'on' : ''}`} style={on ? { background: e.couleur, borderColor: e.couleur } : { borderColor: e.couleur }} disabled={dis} aria-pressed={on}
                    onClick={() => setT((x) => ({ ...x, etiquettes: on ? (x.etiquettes ?? []).filter((y) => y !== e.id) : [...(x.etiquettes ?? []), e.id] }))}>
                    {e.type === 'evenement' ? '📅 ' : ''}{e.nom}
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
            <select value={t.sectionId} disabled={dis} onChange={(e) => setT((x) => ({ ...x, sectionId: e.target.value, sousSection: '' }))}>
              <option value="">— Choisir —</option>
              {sectionChoices.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </label>
          {sousSections.length > 0 && (
            <label>
              Sous-section
              <select value={t.sousSection} disabled={dis || !section} onChange={(e) => set('sousSection', e.target.value)}>
                <option value="">—</option>
                {sousSections.map((x) => <option key={x}>{x}</option>)}
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
        {!t.paiement && voit('prendre') && <APrendreChamp t={t} setT={setT} dis={dis} canAssignOthers={canAssignOthers} />}
        {(!dis || !!t.remarque) && (
          <label className="full">
            Remarque
            <ZoneTexte rows={2} value={t.remarque} disabled={dis} onChange={(e) => set('remarque', e.target.value)} placeholder="Détails utiles (facultatif)" />
          </label>
        )}
        {!t.paiement && voit('info') && <PourInfoChamp t={t} setT={setT} isNew={isNew} dis={dis} vus={vus} attendus={attendus} enregistree={isNew ? null : task} />}
        {!isNew && <NotesSeances task={task} />}

        {voit('checklist') && <Checklist t={t} setT={setT} dis={dis} />}
        {voit('docs') && (
          <DocsField
            docs={t.documents ?? []}
            setDocs={(fn) => setT((x) => ({ ...x, documents: fn(x.documents ?? []) }))}
            disabled={dis}
            track={track.current}
            liens
          />
        )}
        <Repetition t={t} setT={setT} task={task} isNew={isNew} dis={dis} ouverte={voit('repetition')} />
        {voit('liens') && <Rattachements t={t} setT={setT} task={task} isNew={isNew} dis={dis} editable={editable} kids={kids} ouvrir={(x, nouvelle) => setOther({ task: x, isNew: nouvelle })} />}
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
        <Discussion titre={task.titre} liste={commentaires} tacheId={task.id} onClose={() => setChat(false)} />
      )}
      {other && <TaskModal task={other.task} isNew={other.isNew} onClose={() => setOther(null)} />}
    </Modal>
  );
}
