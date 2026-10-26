import { useState, type KeyboardEvent, type Ref } from 'react';
import { useStore } from '../../data/store';
import { useClubOptional } from '../../data/club';
import { COMMENTAIRE_MAX, deMoi, type ActionCommentaire } from '../../data/commentaires';
import { ago } from '../../data/notifs';
import type { Commentaire } from '../../data/types';
import { fmtDateTime } from '../../data/utils';
import { AvecLiens } from '../Liens';
import { ZoneTexte } from '../ZoneTexte';

/** Moment d'un commentaire : « il y a 2 h » la première semaine, puis la date. */
const quand = (iso: string) => (Date.now() - Date.parse(iso) < 6 * 864e5 ? ago(iso) : fmtDateTime(iso));

/**
 * Discussion sur une tâche (049) : ses commentaires, du plus ancien au plus récent, et un champ pour en écrire un. Chacun
 * corrige ou retire les siens ; un admin de l'entité de la tâche retire n'importe lequel. Les personnes concernées sont
 * prévenues (🔔). `uniteId` : entité de la tâche quand ce n'est pas l'entité ouverte (`tacheId` : son identifiant là-bas).
 * `ancre` : pour y mener depuis la bulle en haut de la fiche.
 */
export function Discussion({ liste = [], tacheId, uniteId, className = '', ancre }: { liste?: Commentaire[]; tacheId: string; uniteId?: string; className?: string; ancre?: Ref<HTMLElement> }) {
  const { user, can, commenter } = useStore();
  const club = useClubOptional();
  const [texte, setTexte] = useState('');
  const [corrige, setCorrige] = useState<{ id: string; texte: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!user) return null;
  const ici = club?.current.id ?? '';
  const unite = uniteId ?? ici;
  const moderer = unite === ici && can('admin.access');
  const entite = (c: Commentaire) => {
    const e = c.u ?? unite;
    return e !== ici ? (club?.units.find((u) => u.id === e)?.nom ?? 'autre entité') : '';
  };
  const agir = async (a: ActionCommentaire, ensuite?: () => void) => {
    setBusy(true);
    setErr('');
    try {
      await commenter(tacheId, a, uniteId);
      ensuite?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  const envoyer = () => {
    if (texte.trim() && !busy) void agir({ texte }, () => setTexte(''));
  };
  // Ctrl+Entrée (⌘+Entrée) envoie ; Entrée seule passe à la ligne.
  const raccourci = (e: KeyboardEvent, faire: () => void) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      faire();
    }
  };

  return (
    <section ref={ancre} className={`discussion ${className}`} aria-label="Discussion">
      <span className="field-label">💬 Discussion{liste.length ? ` (${liste.length})` : ''}</span>
      {liste.length > 0 && (
        <ul className="discussion-liste">
          {liste.map((c) => {
            const mien = deMoi(c, user.id, ici, unite);
            const ent = entite(c);
            return (
              <li key={c.id} className={mien ? 'discussion-mien' : undefined}>
                <div className="discussion-tete">
                  <strong>{c.nom}</strong>
                  {ent && <small className="muted"> ({ent})</small>}
                  <small className="muted" title={fmtDateTime(c.le)}> · {quand(c.le)}{c.modifieLe ? ' · corrigé' : ''}</small>
                  {mien && corrige?.id !== c.id && (
                    <button type="button" className="btn link small" disabled={busy} onClick={() => setCorrige({ id: c.id, texte: c.texte })}>Corriger</button>
                  )}
                  {(mien || moderer) && corrige?.id !== c.id && (
                    <button
                      type="button"
                      className="btn link small"
                      disabled={busy}
                      onClick={() => confirm(mien ? 'Retirer ton commentaire ?' : `Retirer le commentaire de ${c.nom} ?`) && void agir({ cle: c.id, supprimer: true })}
                    >
                      Retirer
                    </button>
                  )}
                </div>
                {corrige?.id === c.id ? (
                  <div className="discussion-saisie">
                    <ZoneTexte
                      value={corrige.texte}
                      maxLength={COMMENTAIRE_MAX}
                      aria-label="Corriger le commentaire"
                      autoFocus
                      onChange={(e) => setCorrige({ id: c.id, texte: e.target.value })}
                      onKeyDown={(e) => raccourci(e, () => corrige.texte.trim() && void agir({ cle: c.id, texte: corrige.texte }, () => setCorrige(null)))}
                    />
                    <button type="button" className="btn small" onClick={() => setCorrige(null)}>Annuler</button>
                    <button type="button" className="btn small primary" disabled={busy || !corrige.texte.trim()} onClick={() => void agir({ cle: c.id, texte: corrige.texte }, () => setCorrige(null))}>
                      Enregistrer
                    </button>
                  </div>
                ) : (
                  <p className="discussion-texte"><AvecLiens texte={c.texte} /></p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="discussion-saisie">
        <ZoneTexte
          value={texte}
          maxLength={COMMENTAIRE_MAX}
          placeholder={liste.length ? 'Répondre…' : 'Une question, une info ? Écris un commentaire…'}
          aria-label="Nouveau commentaire"
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => raccourci(e, envoyer)}
        />
        <button type="button" className="btn small primary" disabled={busy || !texte.trim()} onClick={envoyer} title="Envoyer (Ctrl+Entrée)">
          {busy ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
