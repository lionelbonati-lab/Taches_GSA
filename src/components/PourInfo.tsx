import { useMemo, useState } from 'react';
import { nonLus } from '../data/commentaires';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { ciblesPourInfo, clesVu, termineeChezElle, vusDeLEntite } from '../data/pourInfo';
import type { TachePartagee } from '../data/types';
import { daysUntil, fmtDate } from '../data/utils';
import { AvecLiens, Lien } from './Liens';
import { Modal } from './ui';
import { Icone } from './icones';
import { Discussion } from './tache/Discussion';
import { Historique } from './tache/Historique';

// Tâches d'autres entités du club mises « pour info » de l'entité ouverte (ses admins, « Voir toutes les tâches ») ou de
// la personne connectée : à suivre ici, en lecture seule ; elles se modifient dans leur entité.

export const clePourInfo = (x: TachePartagee) => `${x.uniteId}:${x.task.id}`;

/** Délai d'une tâche reçue, avec le retard s'il y en a. */
export function delaiRecu(x: TachePartagee) {
  if (!x.task.delai) return 'sans délai';
  const n = daysUntil(x.task.delai);
  return `${fmtDate(x.task.delai)}${!termineeChezElle(x) && n < 0 ? ` (${-n} j de retard)` : ''}`;
}

/** `ouverte` : la tâche dépliée d'emblée (lien d'une notification), avec sa discussion si `discussion`. */
export function PourInfoRecues({ list, ouverte, discussion, onClose }: { list: TachePartagee[]; ouverte?: string; discussion?: boolean; onClose: () => void }) {
  const { data, user, can, vuPourInfo, setToast } = useStore();
  // « ✓ Vu » noté pendant que la fenêtre est ouverte (la liste se relit ensuite).
  const [vuIci, setVuIci] = useState<string[]>([]);
  const club = useClubOptional();
  const ici = club?.current.nom ?? 'cette entité';
  const [vue, setVue] = useState<string | null>(() => ouverte ?? (list.length === 1 ? clePourInfo(list[0]) : null));
  // Discussion ouverte (sa fenêtre) : clé de la tâche.
  const [chat, setChat] = useState<string | null>(() => (discussion && ouverte) || null);
  // Par entité ; en cours d'abord, par délai.
  const groupes = useMemo(() => {
    const m = new Map<string, TachePartagee[]>();
    const tri = [...list].sort((a, b) => Number(termineeChezElle(a)) - Number(termineeChezElle(b)) || (a.task.delai || '9999').localeCompare(b.task.delai || '9999'));
    for (const x of tri) m.set(x.uniteId, [...(m.get(x.uniteId) ?? []), x]);
    return [...m.values()];
  }, [list]);

  return (
    <Modal title="👁 Pour info" onClose={onClose} wide>
      <p className="muted">
        Des tâches d’autres entités du club, pour que tu sois au courant, sans t’en occuper. Elles se modifient dans leur entité ; ici, tu les consultes.
      </p>
      {!list.length && <p className="muted">Aucune tâche pour info en ce moment.</p>}
      {groupes.map((g) => {
        const u = club?.units.find((y) => y.id === g[0].uniteId);
        const membres = u?.membres ?? [];
        return (
          <section key={g[0].uniteId} className="anciennes">
            <h3 className="pour-info-entite">{g[0].unite}</h3>
            <ul className="anciennes-liste">
              {g.map((x) => {
                const t = x.task;
                const k = clePourInfo(x);
                const st = x.statuts.find((s) => s.id === t.statusId);
                const liste = Array.isArray(t.checklist) ? t.checklist : [];
                const liens = (t.documents ?? []).filter((d) => d.kind === 'lien' && d.url);
                const resp = (t.responsables ?? []).map((id) => membres.find((m) => m.id === id)).filter((m) => !!m).map((m) => `${m.prenom} ${m.nom}`.trim());
                const pourToi = !!user && !!t.pourInfo?.autres?.[club?.current.id ?? '']?.includes(user.id);
                // « ✓ Vu » enregistrés sur la tâche (046) : à côté des noms (entité : combien de ses personnes) ; le mien, à donner s'il manque.
                const aussi = ciblesPourInfo(t.pourInfo, membres, club?.units ?? []).map((c) => {
                  const n = c.genre === 'unite' ? Object.keys(vusDeLEntite(t.pourInfoVus, c.id)).length : 0;
                  return `${c.texte}${c.genre === 'unite' ? (n ? ` (✓ ${n})` : '') : t.pourInfoVus?.[c.cle] ? ' ✓' : ''}`;
                });
                const miennes = user && club ? clesVu(t, x.uniteId, club.current.id, user.id, can('tasks.viewAll')) : [];
                const aVoir = miennes.length > 0 && !vuIci.includes(k) && miennes.some((c) => !t.pourInfoVus?.[c]);
                // Comme les notifications : la tâche vue d'ici (« x:<entité>:<tâche> »).
                const cle = `x:${k}`;
                const msgs = t.commentaires?.length ?? 0;
                const nl = user ? nonLus(t.commentaires, data.discussionsLues?.[user.id]?.[cle], user.id, club?.current.id ?? '', x.uniteId) : 0;
                return (
                  <li key={k} className={termineeChezElle(x) ? 'pour-info-finie' : ''}>
                    <span className="pour-info-titre">
                      <strong>{t.titre || '(sans titre)'}</strong>
                      <small className="muted">
                        {' '}· {termineeChezElle(x) ? '✓ ' : ''}{st?.label ?? '?'} · {delaiRecu(x)}
                        {liste.length > 0 && ` · ☑ ${liste.filter((c) => c.done).length}/${liste.length}`}
                        {pourToi ? ' · pour toi' : ` · pour « ${ici} »`}
                        {nl > 0 && ` · 💬 ${nl} non lu${nl > 1 ? 's' : ''}`}
                      </small>
                    </span>
                    <button type="button" className="btn link small" aria-expanded={vue === k} onClick={() => setVue(vue === k ? null : k)}>{vue === k ? 'Masquer' : 'Voir'}</button>
                    {vue === k && (
                      <div className="ancienne-detail">
                        <p>
                          <b>Qui s’en occupe :</b> {resp.length ? resp.join(', ') : t.responsables?.length ? `${t.responsables.length} personne(s) de ${x.unite}` : 'personne pour l’instant'}
                        </p>
                        {t.remarque ? <p><AvecLiens texte={t.remarque} /></p> : <p className="muted">Pas de remarque.</p>}
                        {liste.length > 0 && (
                          <ul>
                            {liste.map((c) => <li key={c.id}>{c.done ? '☑' : '☐'} <AvecLiens texte={c.label} /></li>)}
                          </ul>
                        )}
                        {liens.length > 0 && (
                          <p>
                            🔗 {liens.map((d, i) => <span key={d.id}>{i > 0 && ', '}<Lien href={d.url!}>{d.nom || d.url}</Lien></span>)}
                          </p>
                        )}
                        {!!t.pieces && <p className="muted small">📎 {t.pieces} fichier(s) joint(s), consultables chez {x.unite} seulement.</p>}
                        {aussi.length > 0 && <p className="muted small">👁 Pour info : {aussi.join(', ')}</p>}
                        <p>
                          <button type="button" className="btn small" onClick={() => setChat(k)}>
                            <Icone n="message" /> Discussion{msgs ? ` (${msgs} message${msgs > 1 ? 's' : ''}${nl ? `, ${nl} non lu${nl > 1 ? 's' : ''}` : ''})` : ''}
                          </button>
                        </p>
                        {chat === k && <Discussion titre={t.titre || '(sans titre)'} liste={t.commentaires} cle={cle} tacheId={t.id} uniteId={x.uniteId} onClose={() => setChat(null)} />}
                        <Historique tacheId={t.id} uniteId={x.uniteId} version={t.updatedAt} />
                        {aVoir && (
                          <p>
                            <button
                              type="button"
                              className="btn small"
                              title="Je suis au courant : son auteur le voit, et elle quitte mon accueil"
                              onClick={() => {
                                setVuIci([...vuIci, k]);
                                vuPourInfo(k, t.id, x.uniteId)
                                  .then(() => setToast(`« ${t.titre || '(sans titre)'} » : ton « ✓ Vu » est noté ; son auteur le voit.`))
                                  .catch((e) => {
                                    setVuIci((l) => l.filter((y) => y !== k));
                                    setToast(`⚠️ ${e instanceof Error ? e.message : e}`);
                                  });
                              }}
                            >
                              ✓ Vu
                            </button>
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
