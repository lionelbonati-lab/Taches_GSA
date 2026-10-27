import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from '../../data/store';
import { useClubOptional } from '../../data/club';
import { COMMENTAIRE_MAX, deMoi, dernierMessage, parMoi, type ActionCommentaire } from '../../data/commentaires';
import { decouper, mentionEnCours, mentionnables, proposer } from '../../data/mentions';
import type { Commentaire, Person } from '../../data/types';
import { addDays, fmtDate, fmtDateTime, fullName, localNow } from '../../data/utils';
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
 * les siens ; un admin de l'entité de la tâche retire n'importe lequel. Les personnes concernées sont prévenues (🔔).
 * Ouverte, elle est lue (pastille des cartes) ; les messages arrivés depuis la dernière lecture suivent un repère.
 * `cle` : la tâche vue d'ici (lecture, notifications) ; `uniteId` : entité de la tâche quand ce n'est pas l'entité
 * ouverte (`tacheId` : son identifiant là-bas). `actions` : boutons de plus dans l'en-tête (ex. ouvrir la tâche).
 * « @ » propose les personnes de l'entité qui voient la tâche (tâche d'ici) : mentionnées, elles sont prévenues 📣.
 */
export function Discussion({ titre, liste = [], cle, tacheId, uniteId, actions, onClose }: { titre: string; liste?: Commentaire[]; cle: string; tacheId: string; uniteId?: string; actions?: ReactNode; onClose: () => void }) {
  const { data, user, can, commenter, discussionLue } = useStore();
  const club = useClubOptional();
  const [texte, setTexte] = useState('');
  const [corrige, setCorrige] = useState<{ id: string; texte: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fil = useRef<HTMLDivElement>(null);
  const repere = useRef<HTMLLIElement>(null);
  const ici = club?.current.id ?? '';
  const unite = uniteId ?? ici;
  // Mentions : personnes qu'on peut nommer (tâche d'ici seulement), suggestions pendant la frappe.
  const tache = unite === ici ? data.tasks.find((t) => t.id === tacheId && !t.source) : undefined;
  const nommables = useMemo(() => (tache && user ? mentionnables(tache, data.people, data.roles, user.id) : []), [tache, data.people, data.roles, user]);
  const zone = useRef<HTMLTextAreaElement | null>(null);
  const [suggestion, setSuggestion] = useState<{ debut: number; fin: number; liste: Person[]; i: number } | null>(null);
  // Messages des autres arrivés depuis la dernière lecture, à l'ouverture : le premier est repéré.
  const [nonLus] = useState(() => {
    const lu = user ? data.discussionsLues?.[user.id]?.[cle] : undefined;
    const l = user ? liste.filter((c) => !parMoi(c, user.id, ici, unite, club?.mesFiches) && (!lu || c.le > lu)) : [];
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
  const moderer = unite === ici && can('admin.access');
  const tactile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
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
    setSuggestion(null);
  };
  // Suggestions de la mention tapée juste avant le curseur.
  const suivre = (el: HTMLTextAreaElement) => {
    zone.current = el;
    const m = nommables.length && el.selectionStart === el.selectionEnd ? mentionEnCours(el.value, el.selectionStart) : null;
    const liste = m ? proposer(nommables, m.cherche) : [];
    setSuggestion(m && liste.length ? { debut: m.debut, fin: el.selectionStart, liste, i: 0 } : null);
  };
  const choisir = (p: Person) => {
    if (!suggestion) return;
    const mot = `@${fullName(p)} `;
    const suite = texte.slice(suggestion.fin).replace(/^ /, '');
    setTexte(texte.slice(0, suggestion.debut) + mot + suite);
    setSuggestion(null);
    const curseur = suggestion.debut + mot.length;
    requestAnimationFrame(() => {
      zone.current?.focus();
      zone.current?.setSelectionRange(curseur, curseur);
    });
  };
  const clavier = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestion && !e.nativeEvent.isComposing) {
      const n = suggestion.liste.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestion({ ...suggestion, i: (suggestion.i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault();
        choisir(suggestion.liste[suggestion.i]);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSuggestion(null);
        return;
      }
    }
    raccourci(e, envoyer);
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
        <div ref={fil} className="discussion-fil">
          {!liste.length && <p className="discussion-vide">Aucun message. Une question, une info ? Les personnes concernées par la tâche sont prévenues 🔔.</p>}
          <ul className="discussion-liste">
            {liste.map((c, i) => {
              // Les miens à droite, même écrits depuis une autre de mes entités ; ceux-là se corrigent depuis celle-ci.
              const mien = parMoi(c, user.id, ici, unite, club?.mesFiches);
              const corrigeable = mien && deMoi(c, user.id, ici, unite);
              const ent = entite(c);
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
                        <div className="discussion-auteur">
                          {c.nom}
                          {ent && <small className="muted"> · {ent}</small>}
                        </div>
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
                        <p className="discussion-texte"><AvecMentions texte={c.texte} people={data.people} moi={user.id} /></p>
                      )}
                      <div className="discussion-pied">
                        {mien && !corrigeable && ent && <small className="muted" title={`Pour le corriger, ouvre « ${ent} »`}>depuis {ent}</small>}
                        {corrigeable && corrige?.id !== c.id && (
                          <button type="button" className="btn link small" disabled={busy} onClick={() => setCorrige({ id: c.id, texte: c.texte })}>Corriger</button>
                        )}
                        {(corrigeable || moderer) && corrige?.id !== c.id && (
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
        {suggestion && (
          <ul className="mention-choix" role="listbox" aria-label="Mentionner">
            {suggestion.liste.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === suggestion.i}>
                {/* Appui sans quitter la saisie (le clavier du téléphone reste ouvert). */}
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(p)}>
                  <strong>{fullName(p)}</strong>
                  {p.poste && <small className="muted"> · {p.poste}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="discussion-saisie">
          <ZoneTexte
            rows={1}
            value={texte}
            maxLength={COMMENTAIRE_MAX}
            placeholder={nommables.length ? 'Écrire un message… (@ pour mentionner)' : 'Écrire un message…'}
            aria-label="Nouveau commentaire"
            autoFocus={!tactile}
            onChange={(e) => {
              setTexte(e.target.value);
              suivre(e.target);
            }}
            onSelect={(e) => suivre(e.currentTarget)}
            onBlur={() => setSuggestion(null)}
            onKeyDown={clavier}
          />
          <button type="button" className="discussion-envoyer" disabled={busy || !texte.trim()} onClick={envoyer} aria-label="Envoyer" title={tactile ? 'Envoyer' : 'Envoyer (Entrée ; Maj+Entrée : à la ligne)'}>
            <Icone n="envoyer" />
          </button>
        </div>
      </section>
    </Modal>
  );
}

/** Texte d'un message : mentions « @Prénom Nom » des personnes d'ici en évidence (la sienne plus encore), adresses en liens. */
function AvecMentions({ texte, people, moi }: { texte: string; people: Person[]; moi: string }) {
  if (!texte.includes('@')) return <AvecLiens texte={texte} />;
  return (
    <>
      {decouper(texte, people).map((x, i) =>
        x.id ? <span key={i} className={`mention${x.id === moi ? ' moi' : ''}`}>{x.texte}</span> : <AvecLiens key={i} texte={x.texte} />,
      )}
    </>
  );
}
