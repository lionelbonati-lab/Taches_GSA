import { useRef, useState } from 'react';
import { useStore } from '../data/store';
import type { ScheduledEmail, Task } from '../data/types';
import {
  EMAIL_DELAIS, PLACEHOLDERS, STATE_LABEL, dueAt, emailState, emailsOf, fillTemplate, localNow, mailtoHref, newEmail, recipients, whenLabel,
  type EmailState,
} from '../data/emails';
import { fmtDate, fmtDateTime, fullName, shortName } from '../data/utils';
import { Modal } from './ui';

const STATE_ICON: Record<EmailState, string> = { programme: '🕓', aEnvoyer: '📨', envoye: '✅', annule: '⛔', sansObjet: '✔️', sansDate: '⏸️' };

/** Emails programmés d'une tâche (dans la fenêtre de la tâche). */
/** « nouveau » : la fenêtre d'un nouvel email s'ouvre tout de suite (bouton « Ajouter : 📧 Email » de la tâche). */
export function EmailsField({ task, isNew, openEmailId, nouveau }: { task: Task; isNew: boolean; openEmailId?: string; nouveau?: boolean }) {
  const { data, user, canEditTask, setEmailStatus, deleteEmail } = useStore();
  const [edit, setEdit] = useState<{ e: ScheduledEmail; isNew: boolean } | null>(() =>
    nouveau && user && !isNew ? { e: newEmail(data.tasks.find((t) => t.id === task.id) ?? task, user.id), isNew: true } : null,
  );
  const [send, setSend] = useState<string | null>(openEmailId ?? null);
  if (!user) return null;
  const list = emailsOf(data, task.id);
  const current = data.tasks.find((t) => t.id === task.id) ?? task;
  const canManage = (e: ScheduledEmail) => e.creePar === user.id || canEditTask(current);
  const names = (e: ScheduledEmail) =>
    [...e.destinataires.map((id) => shortName(data.people.find((p) => p.id === id))), ...(e.autres ? [e.autres] : [])].join(', ') || '—';
  const sending = list.find((e) => e.id === send);

  return (
    <fieldset className="full">
      <legend>📧 Emails programmés</legend>
      {list.length === 0 && !isNew && <small className="muted">Aucun email programmé pour cette tâche.</small>}
      {list.map((e) => {
        const st = emailState(data, current, e);
        const manage = canManage(e);
        return (
          <div key={e.id} className={`email-row st-${st}`}>
            <div className="email-main">
              <span className="email-state" title={STATE_LABEL[st]}>{STATE_ICON[st]}</span>
              <div>
                <strong>{fillTemplate(data, current, e, e.objet)}</strong>
                <small className="muted">
                  à {names(e)} · {st === 'envoye' && e.envoyeLe ? `envoyé le ${fmtDateTime(e.envoyeLe)}` : whenLabel(current, e.quand)}
                </small>
                <small className={`email-badge b-${st}`}>{STATE_LABEL[st]}{e.siNonTerminee && st === 'programme' ? ' · sauf si la tâche est terminée' : ''}</small>
              </div>
            </div>
            {manage && (
              <div className="email-actions">
                {(st === 'aEnvoyer' || st === 'programme' || st === 'sansDate' || st === 'sansObjet') && (
                  <button type="button" className={`btn small ${st === 'aEnvoyer' ? 'primary' : ''}`} onClick={() => setSend(e.id)}>
                    ✉ {st === 'aEnvoyer' ? 'Envoyer' : 'Envoyer maintenant'}
                  </button>
                )}
                {e.statut === 'programme' && <button type="button" className="btn small" onClick={() => setEdit({ e, isNew: false })}>Modifier</button>}
                {e.statut === 'programme' && <button type="button" className="btn small" onClick={() => setEmailStatus(e.id, 'annule')}>Annuler</button>}
                {e.statut !== 'programme' && (
                  <button type="button" className="btn small" onClick={() => setEdit({ e: { ...e, statut: 'programme', envoyeLe: undefined, envoyePar: undefined }, isNew: false })}>
                    Reprogrammer
                  </button>
                )}
                {e.statut !== 'programme' && (
                  <button type="button" className="btn small danger" onClick={() => confirm('Supprimer cet email programmé ?') && deleteEmail(e.id)}>Supprimer</button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {isNew ? (
        <small className="muted">Enregistre d’abord la tâche pour programmer un email.</small>
      ) : (
        canEditTask(current) && (
          <button type="button" className="btn small" onClick={() => setEdit({ e: newEmail(current, user.id), isNew: true })}>📧 Programmer un email</button>
        )
      )}
      {!isNew && <small className="muted demo-note">Démo : à l’heure prévue, l’auteur reçoit une notification 🔔 et l’email s’ouvre, déjà rempli, dans sa messagerie. La version réelle l’enverra automatiquement.</small>}
      {edit && <EmailEditor task={current} email={edit.e} isNew={edit.isNew} onClose={() => setEdit(null)} />}
      {sending && <EmailSend task={current} email={sending} onClose={() => setSend(null)} />}
    </fieldset>
  );
}

/** Création / modification d'un email programmé. */
function EmailEditor({ task, email, isNew, onClose }: { task: Task; email: ScheduledEmail; isNew: boolean; onClose: () => void }) {
  const { data, saveEmail } = useStore();
  const [e, setE] = useState<ScheduledEmail>(email);
  const [err, setErr] = useState('');
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof ScheduledEmail>(k: K, v: ScheduledEmail[K]) => setE((x) => ({ ...x, [k]: v }));
  const people = data.people.filter((p) => p.actif && p.email);
  const toggle = (id: string) => set('destinataires', e.destinataires.includes(id) ? e.destinataires.filter((x) => x !== id) : [...e.destinataires, id]);
  const at = dueAt(task, e.quand);
  const past = !!at && at <= localNow();

  const insert = (ph: string) => {
    const el = msgRef.current;
    const pos = el ? el.selectionStart : e.message.length;
    set('message', e.message.slice(0, pos) + ph + e.message.slice(pos));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + ph.length, pos + ph.length);
    });
  };

  const submit = () => {
    if (!recipients(data, e).length) return setErr('Choisis au moins un destinataire.');
    if (!e.objet.trim()) return setErr('L’objet est obligatoire.');
    if (e.quand.type === 'date' && !e.quand.date) return setErr('Choisis la date d’envoi.');
    saveEmail({ ...e, objet: e.objet.trim(), statut: 'programme' }, isNew);
    onClose();
  };

  return (
    <Modal title={isNew ? 'Programmer un email' : 'Modifier l’email programmé'} onClose={onClose} wide>
      <div className="form">
        <p className="full muted" style={{ margin: 0 }}>Au sujet de la tâche <b>« {task.titre} »</b>{task.delai ? ` · délai ${fmtDate(task.delai)}` : ''}</p>
        <fieldset className="full">
          <legend>Destinataires</legend>
          <div className="chips">
            {people.map((p) => (
              <button type="button" key={p.id} className={`chip ${e.destinataires.includes(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)} title={p.email}>
                {shortName(p)}{task.responsables.includes(p.id) ? ' ★' : ''}
              </button>
            ))}
          </div>
          <small className="muted">★ responsable de la tâche</small>
          <label className="full">
            Autres adresses
            <input value={e.autres ?? ''} placeholder="ex. sponsor@exemple.ch, …" onChange={(ev) => set('autres', ev.target.value)} />
          </label>
        </fieldset>
        <label>
          Envoi
          <select
            value={e.quand.type === 'date' ? 'date' : String(e.quand.jours)}
            onChange={(ev) => {
              const v = ev.target.value;
              const heure = e.quand.heure;
              set('quand', v === 'date'
                ? { type: 'date', date: at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), heure }
                : { type: 'delai', jours: Number(v), heure });
            }}
          >
            <optgroup label="Selon le délai de la tâche">
              {EMAIL_DELAIS.map((o) => <option key={o.jours} value={o.jours}>{o.label}</option>)}
            </optgroup>
            <option value="date">📆 Date précise</option>
          </select>
        </label>
        <div className="row email-when">
          {e.quand.type === 'date' && (
            <label>
              Date
              <input type="date" value={e.quand.date} onChange={(ev) => set('quand', { ...e.quand, date: ev.target.value } as ScheduledEmail['quand'])} />
            </label>
          )}
          <label>
            Heure
            <input type="time" value={e.quand.heure} onChange={(ev) => set('quand', { ...e.quand, heure: ev.target.value })} />
          </label>
        </div>
        <p className={`full email-calc ${past ? 'warn' : ''}`}>
          {at
            ? <>→ Envoi {whenLabel(task, e.quand)}{e.quand.type === 'delai' && ' · suit le délai s’il change'}{past && ' · heure déjà passée : l’email sera à envoyer tout de suite'}</>
            : '→ La tâche n’a pas de délai : l’email partira dès qu’un délai sera fixé.'}
        </p>
        <label className="inline full">
          <input type="checkbox" checked={e.siNonTerminee} onChange={(ev) => set('siNonTerminee', ev.target.checked)} /> Ne pas envoyer si la tâche est déjà terminée
        </label>
        <label className="full">
          Objet
          <input value={e.objet} onChange={(ev) => set('objet', ev.target.value)} />
        </label>
        <label className="full">
          Message
          <textarea ref={msgRef} rows={8} value={e.message} onChange={(ev) => set('message', ev.target.value)} />
        </label>
        <div className="full placeholders">
          <small className="muted">Insérer :</small>
          {PLACEHOLDERS.map((ph) => <button type="button" key={ph} className="chip small" onClick={() => insert(ph)}>{ph}</button>)}
        </div>
        <details className="full email-preview">
          <summary>Aperçu</summary>
          <p><b>Objet :</b> {fillTemplate(data, task, e, e.objet)}</p>
          <pre>{fillTemplate(data, task, e, e.message)}</pre>
        </details>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>{isNew ? 'Programmer' : 'Enregistrer'}</button>
      </div>
    </Modal>
  );
}

/** Envoi (démo) : ouvre l'email déjà rempli dans la messagerie, puis le marque comme envoyé. */
export function EmailSend({ task, email, onClose }: { task: Task; email: ScheduledEmail; onClose: () => void }) {
  const { data, setEmailStatus } = useStore();
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState(false);
  const to = recipients(data, email);
  const objet = fillTemplate(data, task, email, email.objet);
  const body = fillTemplate(data, task, email, email.message);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`À : ${to.join(', ')}\nObjet : ${objet}\n\n${body}`);
      setCopied(true);
    } catch {
      /* presse-papiers indisponible */
    }
  };
  const done = () => {
    setEmailStatus(email.id, 'envoye');
    onClose();
  };

  return (
    <Modal title="Envoyer l’email" onClose={onClose} wide>
      <div className="email-sheet">
        <p><b>À :</b> {to.join(', ')}</p>
        <p><b>Objet :</b> {objet}</p>
        <pre>{body}</pre>
        <small className="muted">
          Programmé par {fullName(data.people.find((p) => p.id === email.creePar))} · {whenLabel(task, email.quand)}
        </small>
      </div>
      <div className="modal-foot wrap">
        <button className="btn" onClick={copy}>{copied ? '✓ Copié' : 'Copier le texte'}</button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Plus tard</button>
        <a className={`btn ${opened ? '' : 'primary'}`} href={mailtoHref(data, task, email)} onClick={() => setOpened(true)}>📧 Ouvrir dans ma messagerie</a>
        <button className={`btn ${opened ? 'primary' : ''}`} onClick={done}>✓ Marquer comme envoyé</button>
      </div>
    </Modal>
  );
}
