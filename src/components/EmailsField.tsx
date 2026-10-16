import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import type { ScheduledEmail, Task } from '../data/types';
import {
  EMAIL_DELAIS, PLACEHOLDERS, STATE_LABEL, dueAt, emailState, emailsOf, fillTemplate, localNow, mailtoHref, newEmail, whenLabel,
  type EmailState,
} from '../data/emails';
import { EMAIL_RE, ajouter, candidats, chercher, choisis, nomsDestinataires, recipients, retirer, type Destinataire } from '../data/destinataires';
import { fmtDate, fmtDateTime, fullName } from '../data/utils';
import { Modal } from './ui';

const STATE_ICON: Record<EmailState, string> = { programme: '🕓', aEnvoyer: '📨', envoye: '✅', annule: '⛔', sansObjet: '✔️', sansDate: '⏸️' };

/** Emails programmés d'une tâche (dans la fenêtre de la tâche). */
/** « nouveau » : la fenêtre d'un nouvel email s'ouvre tout de suite (bouton « Ajouter : 📧 Email » de la tâche). */
export function EmailsField({ task, isNew, openEmailId, nouveau }: { task: Task; isNew: boolean; openEmailId?: string; nouveau?: boolean }) {
  const { data, user, canEditTask, setEmailStatus, deleteEmail } = useStore();
  const club = useClubOptional();
  const [edit, setEdit] = useState<{ e: ScheduledEmail; isNew: boolean } | null>(() =>
    nouveau && user && !isNew ? { e: newEmail(data.tasks.find((t) => t.id === task.id) ?? task, user.id), isNew: true } : null,
  );
  const [send, setSend] = useState<string | null>(openEmailId ?? null);
  if (!user) return null;
  const list = emailsOf(data, task.id);
  const current = data.tasks.find((t) => t.id === task.id) ?? task;
  const canManage = (e: ScheduledEmail) => e.creePar === user.id || canEditTask(current);
  const names = (e: ScheduledEmail) => nomsDestinataires(data, e, club?.units ?? [], club?.current.id).join(', ') || '—';
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
      {edit && <EmailEditor task={current} email={edit.e} isNew={edit.isNew} onClose={() => setEdit(null)} />}
      {sending && <EmailSend task={current} email={sending} onClose={() => setSend(null)} />}
    </fieldset>
  );
}

/** Création / modification d'un email programmé. */
function EmailEditor({ task, email, isNew, onClose }: { task: Task; email: ScheduledEmail; isNew: boolean; onClose: () => void }) {
  const { data, saveEmail } = useStore();
  const club = useClubOptional();
  const [e, setE] = useState<ScheduledEmail>(email);
  const [err, setErr] = useState('');
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof ScheduledEmail>(k: K, v: ScheduledEmail[K]) => setE((x) => ({ ...x, [k]: v }));
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
    if (!recipients(data, e, club?.units, club?.current.id).length) return setErr('Choisis au moins un destinataire avec une adresse email.');
    if (!e.objet.trim()) return setErr('L’objet est obligatoire.');
    if (e.quand.type === 'date' && !e.quand.date) return setErr('Choisis la date d’envoi.');
    saveEmail({ ...e, objet: e.objet.trim(), statut: 'programme' }, isNew);
    onClose();
  };

  return (
    <Modal title={isNew ? 'Programmer un email' : 'Modifier l’email programmé'} onClose={onClose} wide>
      <div className="form">
        <p className="full muted" style={{ margin: 0 }}>Au sujet de la tâche <b>« {task.titre} »</b>{task.delai ? ` · délai ${fmtDate(task.delai)}` : ''}</p>
        <ChoixDestinataires task={task} email={e} onChange={(x) => setE(x)} />
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
          <p><b>Objet :</b> {fillTemplate(data, task, e, e.objet, club?.current.id)}</p>
          <pre>{fillTemplate(data, task, e, e.message, club?.current.id)}</pre>
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

/**
 * Destinataires : les choix en puces (✕ pour retirer) et un champ de recherche — une personne d'ici, une entité du club
 * (toutes ses personnes) ou une personne d'une autre entité ; une adresse tapée s'ajoute aussi (Entrée, virgule).
 */
function ChoixDestinataires({ task, email, onChange }: { task: Task; email: ScheduledEmail; onChange: (e: ScheduledEmail) => void }) {
  const { data } = useStore();
  const club = useClubOptional();
  const units = club?.units;
  const courante = club?.current.id;
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const tous = useMemo(() => candidats(data.people, units ?? [], courante), [data.people, units, courante]);
  const liste = choisis(data, email, units ?? [], courante);
  const exclus = new Set(liste.map((d) => d.cle));
  const nb = recipients(data, email, units, courante).length;
  const adresse = q.trim();
  const nouvelleAdresse = EMAIL_RE.test(adresse) && !liste.some((d) => d.email?.toLowerCase() === adresse.toLowerCase());
  // Champ vide : les responsables de la tâche pas encore choisis.
  const resultats: Destinataire[] = q.trim()
    ? chercher(tous, q, exclus)
    : tous.filter((c) => c.genre === 'personne' && task.responsables.includes(c.id) && !exclus.has(c.cle));
  const options: (Destinataire & { etiquette?: string })[] = [
    ...(nouvelleAdresse ? [{ cle: `m:${adresse}`, genre: 'adresse' as const, id: adresse, texte: adresse, etiquette: `✉ ${adresse}`, detail: 'Ajouter cette adresse' }] : []),
    ...resultats,
  ];
  const i = Math.min(actif, Math.max(options.length - 1, 0));
  const montre = ouvert && (options.length > 0 || !!adresse);

  const choisir = (d?: Destinataire) => {
    if (!d || (d.alerte && d.genre !== 'adresse')) return;
    onChange(ajouter(email, d));
    setQ('');
    setActif(0);
  };
  // Adresses collées ou tapées avant une virgule : ajoutées tout de suite ; le reste reste à chercher.
  const saisir = (v: string) => {
    const morceaux = v.split(/[,;]/);
    let x = email;
    if (morceaux.length > 1) {
      const reste = morceaux.pop() ?? '';
      const autres = morceaux.map((m) => m.trim()).filter(Boolean);
      for (const m of autres.filter((m) => EMAIL_RE.test(m))) x = ajouter(x, { genre: 'adresse', id: m });
      if (x !== email) onChange(x);
      v = [...autres.filter((m) => !EMAIL_RE.test(m)), reste.trim()].filter(Boolean).join(' ');
    }
    setQ(v);
    setActif(0);
    setOuvert(true);
  };
  const touche = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      setOuvert(true);
      if (options.length) setActif((i + (ev.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (montre) choisir(options[i]);
    } else if (ev.key === 'Escape' && montre) {
      ev.stopPropagation();
      setOuvert(false);
    }
  };

  return (
    <fieldset className="full destinataires">
      <legend>Destinataires</legend>
      {liste.length > 0 && (
        <div className="chips">
          {liste.map((d) => (
            <span key={d.cle} className={`chip dest dest-${d.genre} ${d.alerte ? 'alerte' : ''}`} title={[d.detail, d.genre === 'personne' ? d.email : '', d.alerte].filter(Boolean).join(' · ')}>
              {d.texte}
              {d.genre === 'personne' && task.responsables.includes(d.id) && ' ★'}
              {d.genre === 'unite' && <small className="muted"> · {d.detail}</small>}
              {d.alerte && <small className="dest-alerte"> ⚠ {d.alerte}</small>}
              <button type="button" className="chip-x" aria-label={`Retirer ${d.texte}`} onClick={() => onChange(retirer(email, d))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="dest-recherche">
        <input
          type="text"
          role="combobox"
          aria-label="Ajouter un destinataire"
          aria-expanded={montre}
          aria-controls="dest-options"
          aria-autocomplete="list"
          aria-activedescendant={montre && options.length ? `dest-opt-${i}` : undefined}
          autoComplete="off"
          value={q}
          placeholder={club ? '🔍 Une personne, une entité ou une adresse email' : '🔍 Une personne ou une adresse email'}
          onChange={(ev) => saisir(ev.target.value)}
          onFocus={() => setOuvert(true)}
          onBlur={() => {
            setOuvert(false);
            if (nouvelleAdresse) choisir(options[0]);
          }}
          onKeyDown={touche}
        />
        {montre && (
          <ul id="dest-options" role="listbox" className="dest-options">
            {!q.trim() && <li className="dest-titre" role="presentation">Responsables de la tâche</li>}
            {options.map((o, k) => (
              <li
                key={o.cle}
                id={`dest-opt-${k}`}
                role="option"
                aria-selected={k === i}
                aria-disabled={!!o.alerte && o.genre !== 'adresse'}
                className={`${k === i ? 'on' : ''} ${o.alerte ? 'off' : ''}`}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  choisir(o);
                }}
                onMouseEnter={() => setActif(k)}
              >
                <span>{o.etiquette ?? o.texte}{o.genre === 'personne' && task.responsables.includes(o.id) && ' ★'}</span>
                <small className="muted">{[o.detail, o.alerte].filter(Boolean).join(' · ')}</small>
              </li>
            ))}
            {!options.length && <li className="dest-titre" role="presentation">Aucun résultat{adresse.includes('@') ? ' (adresse incomplète ?)' : ''}</li>}
          </ul>
        )}
      </div>
      <small className="muted">
        {nb ? `${nb} adresse${nb > 1 ? 's' : ''} email` : 'Aucune adresse pour l’instant'}
        {club ? ' · une entité envoie à toutes ses personnes' : ''} · ★ responsable de la tâche
      </small>
    </fieldset>
  );
}

/** Envoi : ouvre l'email déjà rempli dans la messagerie, puis le marque comme envoyé. */
export function EmailSend({ task, email, onClose }: { task: Task; email: ScheduledEmail; onClose: () => void }) {
  const { data, setEmailStatus } = useStore();
  const club = useClubOptional();
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState(false);
  const to = recipients(data, email, club?.units, club?.current.id);
  const objet = fillTemplate(data, task, email, email.objet, club?.current.id);
  const body = fillTemplate(data, task, email, email.message, club?.current.id);
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
        <a className={`btn ${opened ? '' : 'primary'}`} href={mailtoHref(data, task, email, to, club?.current.id)} onClick={() => setOpened(true)}>📧 Ouvrir dans ma messagerie</a>
        <button className={`btn ${opened ? 'primary' : ''}`} onClick={done}>✓ Marquer comme envoyé</button>
      </div>
    </Modal>
  );
}
