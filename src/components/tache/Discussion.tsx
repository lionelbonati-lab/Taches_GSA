import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from '../../data/store';
import { COMMENTAIRE_MAX, dernierMessage, parMoi, type ActionCommentaire } from '../../data/commentaires';
import { etiquettesDe } from '../../data/permissions';
import type { Commentaire } from '../../data/types';
import { addDays, fmtDate, fmtDateTime, localNow } from '../../data/utils';
import { AvecLiens } from '../Liens';
import { ZoneTexte } from '../ZoneTexte';
import { Modal } from '../ui';
import { Icone } from '../icones';

const p2 = (n: number) => String(n).padStart(2, '0');
/** Jour local d'un message (AAAA-MM-JJ), pour les séparateurs « Aujourd'hui », « Hier », « 12.10.2026 ». */
const jourDe = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const heureDe = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const nomDuJour = (jour: string) => {
  const auj = localNow().slice(0, 10);
  return jour === auj ? 'Aujourd’hui' : jour === addDays(auj, -1) ? 'Hier' : fmtDate(jour);
};
/** Moment d'un message dans une liste : l'heure aujourd'hui, sinon « Hier » ou la date. */
export const quandMessage = (iso: string) => {
  const jour = jourDe(iso);
  return jour === localNow().slice(0, 10) ? heureDe(iso) : nomDuJour(jour);
};

/**
 * Discussion sur une tâche (049), dans sa propre fenêtre, comme une messagerie : les messages en bulles (les miens à
 * droite), du plus ancien au plus récent, ouverte sur le dernier, et le champ de saisie en bas. Chacun corrige ou retire
 * les siens ; un admin retire n'importe lequel. Les personnes concernées sont prévenues (🔔).
 * Ouverte, elle est lue (pastille des cartes) ; les messages arrivés depuis la dernière lecture suivent un repère.
 * `actions` : boutons de plus dans l'en-tête (ex. ouvrir la tâche).
 * Tâche étiquetée (062) : réservée aux membres de ses étiquettes, rappelé en tête.
 */
export function Discussion({ titre, liste = [], tacheId, actions, onClose }: { titre: string; liste?: Commentaire[]; tacheId: string; actions?: ReactNode; onClose: () => void }) {
  const { data, user, can, commenter, discussionLue, discussionLueLe } = useStore();
  const cle = tacheId;
  const [texte, setTexte] = useState('');
  const [corrige, setCorrige] = useState<{ id: string; texte: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fil = useRef<HTMLDivElement>(null);
  const repere = useRef<HTMLLIElement>(null);
  const tache = data.tasks.find((t) => t.id === tacheId);
  const reservee = tache ? etiquettesDe(tache, data.etiquettes) : [];
  // Messages des autres arrivés depuis la dernière lecture, à l'ouverture : le premier est repéré.
  const [nonLus] = useState(() => {
    const lu = discussionLueLe(cle);
    const l = user ? liste.filter((c) => !parMoi(c, user.id) && (!lu || c.le > lu)) : [];
    return { premier: l[0]?.id, nombre: l.length };
  });
  const dernier = dernierMessage(liste);
  useEffect(() => {
    if (dernier) discussionLue(cle, dernier);
  }, [cle, dernier, discussionLue]);
  // Ouverte sur le premier message non lu (sinon le dernier), puis suit les nouveaux.
  const ouverte = useRef(false);
  useLayoutEffect(() => {
    const f = fil.current;
    if (!f) return;
    if (!ouverte.current && repere.current) f.scrollTop = Math.max(0, repere.current.offsetTop - 8);
    else f.scrollTop = f.scrollHeight;
    ouverte.current = true;
  }, [liste.length]);
  if (!user) return null;
  const moderer = can('admin.access');
  const tactile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const agir = async (a: ActionCommentaire, ensuite?: () => void) => {
    setBusy(true);
    setErr('');
    try {
      await commenter(tacheId, a);
      ensuite?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  const envoyer = () => {
    if (texte.trim() && !busy) void agir({ texte }, () => setTexte(''));
  };
  // Entrée envoie, Maj+Entrée passe à la ligne ; sur écran tactile, Entrée passe à la ligne (le bouton envoie).
  // Ctrl+Entrée (⌘+Entrée) envoie partout.
  const raccourci = (e: KeyboardEvent, faire: () => void) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (e.ctrlKey || e.metaKey || (!tactile && !e.shiftKey)) {
      e.preventDefault();
      faire();
    }
  };

  return (
    <Modal title={titre} icone="message" onClose={onClose} className="chat" actions={actions}>
      <section className="discussion" aria-label="Discussion">
        {reservee.length > 0 && (
          <p className="discussion-reservee">
            🔒 Réservée aux membres de {reservee.length > 1 ? 'ses étiquettes' : 'l’étiquette'} {reservee.map((e) => `« ${e.nom} »`).join(', ')}
          </p>
        )}
        <div ref={fil} className="discussion-fil">
          {!liste.length && <p className="discussion-vide">Aucun message. Une question, une info ? Les personnes concernées par le point sont prévenues 🔔.</p>}
          <ul className="discussion-liste">
            {liste.map((c, i) => {
              // De personne à personne : les miens à droite ; les autres avec le nom de leur auteur.
              const mien = parMoi(c, user.id);
              const jour = jourDe(c.le);
              return (
                <Fragment key={c.id}>
                  {(i === 0 || jourDe(liste[i - 1].le) !== jour) && <li className="discussion-jour" role="separator">{nomDuJour(jour)}</li>}
                  {c.id === nonLus.premier && (
                    <li ref={repere} className="discussion-nouveaux" role="separator">
                      {nonLus.nombre > 1 ? `${nonLus.nombre} nouveaux messages` : 'Nouveau message'}
                    </li>
                  )}
                  <li className={`discussion-message${mien ? ' mien' : ''}`}>
                    <div className="discussion-bulle">
                      {!mien && (
                        <div className="discussion-auteur">{c.nom}</div>
                      )}
                      {corrige?.id === c.id ? (
                        <div className="discussion-correction">
                          <ZoneTexte
                            value={corrige.texte}
                            maxLength={COMMENTAIRE_MAX}
                            aria-label="Corriger le commentaire"
                            autoFocus
                            onChange={(e) => setCorrige({ id: c.id, texte: e.target.value })}
                            onKeyDown={(e) => raccourci(e, () => corrige.texte.trim() && void agir({ cle: c.id, texte: corrige.texte }, () => setCorrige(null)))}
                          />
                          <span className="row">
                            <button type="button" className="btn small" onClick={() => setCorrige(null)}>Annuler</button>
                            <button type="button" className="btn small primary" disabled={busy || !corrige.texte.trim()} onClick={() => void agir({ cle: c.id, texte: corrige.texte }, () => setCorrige(null))}>
                              Enregistrer
                            </button>
                          </span>
                        </div>
                      ) : (
                        <p className="discussion-texte"><AvecLiens texte={c.texte} /></p>
                      )}
                      <div className="discussion-pied">
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
                        <small title={fmtDateTime(c.le)}>{c.modifieLe ? 'corrigé · ' : ''}{heureDe(c.le)}</small>
                      </div>
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="discussion-saisie">
          <ZoneTexte
            rows={1}
            value={texte}
            maxLength={COMMENTAIRE_MAX}
            placeholder="Écrire un message…"
            aria-label="Nouveau commentaire"
            autoFocus={!tactile}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => raccourci(e, envoyer)}
          />
          <button type="button" className="discussion-envoyer" disabled={busy || !texte.trim()} onClick={envoyer} aria-label="Envoyer" title={tactile ? 'Envoyer' : 'Envoyer (Entrée ; Maj+Entrée : à la ligne)'}>
            <Icone n="envoyer" />
          </button>
        </div>
      </section>
    </Modal>
  );
}
