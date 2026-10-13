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
import { avecPartage, libellePlace, partageDe, TACHES_DEPENDANCE } from '../data/partage';
import { auComiteEntier, parentDans, reglageTaches, UNIT_TYPES } from '../data/units';
import { attributionDe, attributions, choixEvenements, choixSeances, entitesDependantes, evenementsDependants, memeEvenement, memeSeance } from '../data/externes';
import type { DelaiUnite, EvenementEntite, OrgUnit, Recurrence, SeanceComite, Task } from '../data/types';
import { DELAI_MAX, RECURRENCES, applyDelaiRef, childrenOf, endOf, fmtRange, fmtDate, fmtDateTime, fullName, isDone, isLate, makeDelai, nextDate, nomPoste, offsetLabel, parentOf, nextResponsables, postesFor, splitDelai, today, uid } from '../data/utils';
import { Avatar, Modal, StatusBadge } from './ui';

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
type Extra = 'checklist' | 'docs' | 'repetition' | 'liens' | 'emails' | 'partage';

function TaskEditor({ task, isNew, onClose, openEmailId }: TaskModalProps) {
  const { data, user, can, canEditTask, canDeleteTask, canAssignOthers: canAssign, creatableSections, saveTask, update, linkTask, autresResp, externes } = useStore();
  // Nouvelle tâche : seules les personnes actives de l'entité peuvent en être responsables.
  const [t, setT] = useState<Task>(() => (isNew ? { ...task, responsables: task.responsables.filter((id) => data.people.some((p) => p.id === id && p.actif)) } : task));
  const [newItem, setNewItem] = useState('');
  // Tâche liée (ou principale) ouverte par-dessus cette fenêtre.
  const [other, setOther] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [err, setErr] = useState('');
  const track = useRef<DocTracking>({ added: [], removed: [] });
  const [newPoll, setNewPoll] = useState(false);
  // Liens et partage déjà remplis : ils restent affichés si on les vide (ex. partage retiré : plus de séance du comité).
  const [ouverts, setOuverts] = useState<Extra[]>(() => [
    ...(task.eventId || task.evenementEntite || (task.meetingId && !task.source) || task.seanceComite || task.parentId ? ['liens' as const] : []),
    ...(task.partage?.length || task.auCentral ? ['partage' as const] : []),
  ]);
  const [nouvelEmail, setNouvelEmail] = useState(false);
  const club = useClubOptional();
  if (!user) return null;
  // Partage avec d'autres entités du club (tâche de l'entité ouverte) ; tâche partagée par une autre entité : t.source.
  const partage = partageDe(t, club?.central?.id);
  const partageables = club && !t.paiement && !t.source ? club.units.filter((u) => u.id !== club.current.id && (!u.archive || partage.includes(u.id))) : [];
  const nomUnite = (id: string) => club?.units.find((u) => u.id === id)?.nom ?? '';
  const versCentral = club?.central && club.current.type !== 'central' && partage.includes(club.central.id) ? libellePlace(club.central.sections ?? [], club.current) : '';
  // Réglage de l'entité : ses tâches toutes affichées (ou aucune) dans le comité dont elle dépend ; un événement dont tout
  // le comité est responsable : toutes.
  const reglage = club ? reglageTaches(club.units, club.current) : undefined;
  const comiteEntier = !!club && auComiteEntier(club.units, club.current);
  const parentIci = club && reglage && reglage !== 'partagees' && !t.source ? parentDans(club.units.filter((u) => !u.archive), club.current) : undefined;
  // Plus partagée avec le comité : plus à l'ordre du jour de sa séance (ni de délai selon elle).
  const togglePartage = (id: string) => setT((x) => applyDelaiRef(data, avecPartage(x, id, !partageDe(x, club?.central?.id).includes(id), club?.central?.id)));
  const autres = autresResp(t);

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

  const submit = () => {
    if (!t.titre.trim()) return setErr('Le titre de la tâche est obligatoire.');
    if (!t.sectionId) return setErr('Choisis une section.');
    if (!canAssign(t.sectionId) && t.responsables.some((id) => id !== user.id) && JSON.stringify(t.responsables) !== JSON.stringify(task.responsables))
      return setErr('Ton rôle ne permet pas d’assigner d’autres personnes dans cette section.');
    saveTask({ ...t, titre: t.titre.trim() }, isNew);
    deleteFiles(track.current.removed); // fichiers retirés : effacés seulement une fois la tâche enregistrée
    onClose();
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
    deleteFiles([...(task.documents ?? []).filter((d) => d.kind === 'fichier').map((d) => d.id), ...track.current.added]);
    onClose();
  };

  const dis = !editable;
  const seanceIci = t.source && t.meetingId ? data.meetings.find((m) => m.id === t.meetingId) : undefined;
  const postes = postesFor(data, t, isNew ? undefined : task) ?? [];
  const polls = (data.polls ?? []).filter((p) => p.taskId === task.id);
  const rempli: Record<Extra, boolean> = {
    checklist: t.checklist.length > 0,
    docs: (t.documents ?? []).length > 0,
    repetition: !!t.recurrence,
    // Tâche partagée par une autre entité : sa séance ici s'affiche dans le bandeau.
    liens: !!(t.eventId || t.evenementEntite || (t.meetingId && !t.source) || t.seanceComite || t.parentId || kids.length),
    emails: !isNew && emailsOf(data, task.id).length > 0,
    partage: partage.length > 0,
  };
  const voit = (x: Extra) => rempli[x] || ouverts.includes(x);
  const ouvrir = (x: Extra) => setOuverts((o) => [...o, x]);
  const ajouts: { label: string; aide: string; run: () => void; si: boolean; partagee?: boolean }[] = [
    { label: '☑️ Checklist', aide: 'Une liste de petites étapes à cocher', run: () => ouvrir('checklist'), si: !voit('checklist'), partagee: true },
    { label: '📎 Document', aide: 'Un fichier, une photo ou un lien', run: () => ouvrir('docs'), si: !voit('docs') },
    { label: '🔁 Répétition', aide: 'La tâche revient chaque semaine, chaque mois, chaque année…', run: () => ouvrir('repetition'), si: !voit('repetition') },
    { label: '🔗 Lier à…', aide: 'Un événement, une séance de comité ou une autre tâche', run: () => ouvrir('liens'), si: !voit('liens') },
    { label: '🤝 Partager', aide: 'Avec d’autres entités du club : elles la voient et la modifient comme les leurs', run: () => ouvrir('partage'), si: !voit('partage') && partageables.length > 0 },
    { label: '📊 Sondage', aide: 'Demander l’avis des membres', run: () => setNewPoll(true), si: !isNew && can('polls.create') },
    {
      label: '📧 Email',
      aide: 'Un email envoyé à une date choisie',
      run: () => {
        setNouvelEmail(true);
        ouvrir('emails');
      },
      si: !isNew && !voit('emails'),
    },
    // Tâche d'une autre entité : documents, liens, répétition, sondages et emails restent les siens.
  ].filter((a) => a.si && (!t.source || a.partagee));
  // Personnes à ajouter : soi-même d'abord.
  const aAjouter = assignable.filter((p) => !t.responsables.includes(p.id)).sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));

  return (
    <Modal title={isNew ? 'Nouvelle tâche' : editable ? 'Modifier la tâche' : 'Détail de la tâche'} onClose={cancel} wide>
      <div className="form">
        {parent && (
          <button type="button" className="full parent-banner" onClick={() => setOther({ task: parent, isNew: false })}>
            ↳ Tâche liée à <b>{parent.titre}</b> <span className="muted">({secName(parent.sectionId)}) · ouvrir</span>
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
              <small className="muted">
                🤝 Partagée avec « {attribuee.unite.nom} » : elle apparaît dans ses tâches{attribuee.sectionId ? `, sous « ${attribuee.sousSection} »` : ''}.
              </small>
            )}
            {attendSections && <small className="muted">Les sections de « {att.unite?.nom} » seront proposées ici après la mise à jour du serveur (migration 033).</small>}
          </label>
        )}
        {!isNew && (
          <label>
            Statut
            <select value={t.statusId} disabled={dis} onChange={(e) => set('statusId', e.target.value)}>
              {data.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        )}
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
            {!t.responsables.length && <span className="muted">Personne pour l’instant.</span>}
            {!dis && aAjouter.length > 0 && (
              <select className="chip-add" value="" aria-label="Ajouter une personne" onChange={(e) => e.target.value && toggleResp(e.target.value)}>
                <option value="">＋ Ajouter…</option>
                {aAjouter.map((p) => <option key={p.id} value={p.id}>{nomPoste(p, user.id)}</option>)}
              </select>
            )}
          </div>
          {autres && <small className="muted autres-resp">Aussi : {autres}</small>}
          {!canAssignOthers && <small className="muted">Ton rôle ne permet d’assigner des tâches qu’à toi-même{t.sectionId ? ' dans cette section' : ''}.</small>}
        </div>
        {(!dis || !!t.remarque) && (
          <label className="full">
            Remarque
            <textarea rows={2} value={t.remarque} disabled={dis} onChange={(e) => set('remarque', e.target.value)} placeholder="Détails utiles (facultatif)" />
          </label>
        )}
        {partageables.length > 0 && voit('partage') && (!dis || partage.length > 0) && (
          <div className="full partage">
            <span className="field-label">🤝 Partager avec d’autres entités</span>
            <div className="chips">
              {partageables
                .filter((u) => !dis || partage.includes(u.id))
                .map((u) => (
                  <button key={u.id} type="button" className={`chip ${partage.includes(u.id) ? 'on' : ''}`} disabled={dis} aria-pressed={partage.includes(u.id)} onClick={() => togglePartage(u.id)}>
                    {u.type === 'central' ? '🏛️ ' : ''}{u.nom}
                  </button>
                ))}
            </div>
            <small className="muted">
              {partage.length
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
        {voit('docs') && <DocsField docs={t.documents ?? []} setDocs={(fn) => setT((x) => ({ ...x, documents: fn(x.documents ?? []) }))} disabled={dis} track={track.current} />}
        {voit('repetition') && (
          <label className="full">
            🔁 Répétition
            <select value={t.recurrence ?? ''} disabled={dis} onChange={(e) => set('recurrence', (e.target.value || undefined) as Recurrence | undefined)}>
              <option value="">Aucune (tâche unique)</option>
              {RECURRENCES.map((r) => <option key={r.id} value={r.id}>🔁 {r.label}</option>)}
            </select>
          </label>
        )}
        {t.recurrence && (
          <p className="full recur-note">
            🔁 Quand cette tâche sera terminée, la suivante sera créée automatiquement{t.delai ? <> pour le <b>{fmtDate(nextDate(t.delai, t.recurrence))}</b></> : ' (sans délai)'}
            {postes.length > 0 && <> et attribuée au poste <b>{postes.join(', ')}</b></>}
            {' '}(aujourd’hui : {nextResponsables(data, { ...t, postesResp: postes }).map((id) => fullName(data.people.find((p) => p.id === id))).join(', ')}).
            {task.suivanteId && <><br />Occurrence suivante déjà créée.</>}
          </p>
        )}
        {voit('liens') && (
          <fieldset className="full liens">
            <legend>🔗 Liens</legend>
            <div className="form">
              <EvenementLie t={t} setT={setT} disabled={dis} />
              <SeanceLiee t={t} setT={setT} disabled={dis} />
              {!kids.length && (
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
              {!t.parentId && !isNew && (
                <div className="full linked">
                  <span className="field-label">Tâches liées{kids.length > 0 && ` · ${kids.filter((k) => isDone(data, k)).length}/${kids.length} terminées`}</span>
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
                            {editable && <button type="button" className="icon-btn" title="Délier (la tâche reste, sans tâche principale)" onClick={() => linkTask(k.id, undefined)}>✕</button>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {!kids.length && <small className="muted">Aucune. Une tâche liée a son propre responsable, délai et statut.</small>}
                  {editable && (
                    <div className="row wrap">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => setOther({ task: newTask(user.id, { parentId: task.id, sectionId: task.sectionId, sousSection: task.sousSection, delai: task.delai }), isNew: true })}
                      >
                        + Nouvelle tâche liée
                      </button>
                      {!linking ? (
                        linkable.length > 0 && <button type="button" className="btn small" onClick={() => setLinking(true)}>🔗 Lier une tâche existante</button>
                      ) : (
                        <select autoFocus defaultValue="" onChange={(e) => { if (e.target.value) linkTask(e.target.value, task.id); setLinking(false); }} onBlur={() => setLinking(false)}>
                          <option value="">— Choisir la tâche à lier —</option>
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
            {ajouts.map((a) => <button key={a.label} type="button" className="chip" title={a.aide} onClick={a.run}>{a.label}</button>)}
          </div>
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
        {!isNew && canDeleteTask(task) && <button className="btn danger" onClick={remove}>Supprimer</button>}
        <span className="grow" />
        <button className="btn" onClick={cancel}>{editable ? 'Annuler' : 'Fermer'}</button>
        {editable && <button className="btn primary" onClick={submit}>{isNew ? 'Créer' : 'Enregistrer'}</button>}
      </div>
      {newPoll && <PollEditor taskId={task.id} onClose={() => setNewPoll(false)} />}
      {other && <TaskModal task={other.task} isNew={other.isNew} onClose={() => setOther(null)} />}
    </Modal>
  );
}

type SetT = (fn: (x: Task) => Task) => void;

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
      applyDelaiRef(data, v.startsWith('x:') ? { ...x, eventId: undefined, evenementEntite: evenements[Number(v.slice(2))] } : { ...x, eventId: v || undefined, evenementEntite: undefined }),
    );
  const locales = data.events.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>);
  const u = lie && unite(lie.uniteId);
  const partagee = !!lie && partageDe(t, club?.central?.id).includes(lie.uniteId);
  return (
    <label className={evenements.length ? 'full' : undefined}>
      Événement lié
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
          {u ? UNIT_TYPES[u.type].icon : '🎉'} {lie.id ? `Événement de « ${u?.nom ?? '?'} »` : 'Prochaine édition'}, qui dépend de « {ici} » : son nom et sa date sont suivis (délai lié compris).
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
      Séance de comité liée
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
  const events = upcoming(data.events, t.eventId);
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
      return applyDelaiRef(data, { ...y, delaiRef: { ...(x.delaiRef ?? makeDelai(1, 'semaines', false)), type } });
    });
  };

  const choix = (
    <select value={mode} disabled={disabled} aria-label="Date fixe, ou selon un événement / une séance" onChange={(e) => onMode(e.target.value)}>
      <option value="fixe">📆 Date fixe</option>
      {events.length > 0 && (
        <optgroup label="Selon un événement">
          {events.map((e) => <option key={e.id} value={`event:${e.id}`}>🎉 {e.nom} ({fmtRange(e.date, e.dateFin)})</option>)}
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
          {choisir
            ? choix
            : !disabled && !dateSeule && events.length + meetings.length + xe.length + xm.length > 0 && (
                <button type="button" className="link-btn" onClick={() => setChoisir(true)}>📌 ou selon un événement / une séance</button>
              )}
        </>
      ) : (
        <>
          {choix}
          <QuandField t={t} setT={setT} disabled={disabled} />
        </>
      )}
    </div>
  );
}

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
    setT((x) => applyDelaiRef(data, { ...x, delaiRef: { type: x.delaiRef!.type, ...makeDelai(next.n, next.unite, next.apres) } }));
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
