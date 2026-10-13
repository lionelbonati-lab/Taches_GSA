import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { copieAncienne, dateCourte, placeAuto } from '../data/partage';
import type { TachePartagee } from '../data/types';
import { fmtDate, today } from '../data/utils';
import { Modal } from './ui';

// Anciennes tâches : quand une entité (groupe, événement) se met à dépendre de l'entité ouverte, rien n'est déplacé ni
// copié automatiquement. L'entité ouverte peut consulter les tâches qu'elle avait avant (sans les modifier) et en copier
// une, plusieurs ou toutes : la copie est une tâche à elle, indépendante, avec la mention « copiée depuis le comité … ».
// Le droit dure tant que l'entité dépend d'elle ; ses admins peuvent le retirer (fiche de l'entité, organigramme).

/** Anciennes tâches lues pour l'entité ouverte (rechargées quand elle change) ; null : pas de serveur à jour (030). */
export function useAnciennesTaches() {
  const club = useClubOptional();
  const [list, setList] = useState<TachePartagee[] | null>(null);
  useEffect(() => {
    if (!club) return;
    let actif = true;
    club
      .anciennesTaches()
      .then((l) => actif && setList(l))
      .catch(() => actif && setList(null));
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.current.id, club?.units]);
  return list;
}

export function AnciennesTaches({ list, onClose }: { list: TachePartagee[]; onClose: () => void }) {
  const { data, user, update, creatableSections, setToast } = useStore();
  const club = useClubOptional();
  const ici = club?.current.nom ?? 'cette entité';
  const sections = creatableSections();
  // Déjà copiées ici (même original) : décochées d'office.
  const copiees = useMemo(() => new Set(data.tasks.filter((t) => t.copieDe?.tache).map((t) => `${t.copieDe!.uniteId}:${t.copieDe!.tache}`)), [data.tasks]);
  const cle = (x: TachePartagee) => `${x.uniteId}:${x.task.id}`;
  const [choix, setChoix] = useState<Set<string>>(() => new Set(list.filter((x) => !copiees.has(cle(x))).map(cle)));
  const [ouverte, setOuverte] = useState<string | null>(null);
  const premiere = list[0];
  const auto = premiere ? placeAuto(sections, { nom: premiere.unite, type: premiere.type }).section : undefined;
  const [sectionId, setSectionId] = useState(auto?.id ?? sections[0]?.id ?? '');
  const groupes = useMemo(() => {
    const m = new Map<string, TachePartagee[]>();
    for (const x of list) m.set(x.uniteId, [...(m.get(x.uniteId) ?? []), x]);
    return [...m.values()];
  }, [list]);

  const copier = (l: TachePartagee[]) => {
    if (!user || !club || !l.length || !sectionId) return;
    const copies = l.map((x) => copieAncienne(x, data, { units: club.units, moi: club.current.id, sectionId, sousSection: '', par: user.id, aujourdhui: today() }));
    const nom = sections.find((s) => s.id === sectionId)?.nom ?? '';
    update((d) => {
      d.tasks.unshift(...copies);
    }, copies.length === 1 ? `Copie de l’ancienne tâche « ${copies[0].titre} » (${l[0].unite})` : `Copie de ${copies.length} anciennes tâches (${[...new Set(l.map((x) => x.unite))].join(', ')})`);
    setToast(`📋 ${copies.length === 1 ? '1 tâche copiée' : `${copies.length} tâches copiées`} dans « ${nom} »`);
    onClose();
  };
  const choisies = list.filter((x) => choix.has(cle(x)));
  const basculer = (k: string) =>
    setChoix((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <Modal title="📜 Anciennes tâches" onClose={onClose} wide>
      {groupes.map((g) => {
        const a = g[0].ancienne;
        return (
          <section key={g[0].uniteId} className="anciennes">
            <p className="muted">
              Tâches de <b>{g[0].unite}</b> d’avant qu’elle dépende de « {ici} »{a?.comite ? <> (elle dépendait du comité « {a.comite} »{a.jusqua ? `, jusqu’au ${dateCourte(a.jusqua)}` : ''})</> : ''}.
              Elles restent chez {g[0].unite} et ne se modifient pas d’ici ; tu peux les consulter et les copier dans « {ici} ».
            </p>
            <ul className="anciennes-liste">
              {g.map((x) => {
                const t = x.task;
                const k = cle(x);
                const st = x.statuts.find((s) => s.id === t.statusId);
                const liste = Array.isArray(t.checklist) ? t.checklist : [];
                return (
                  <li key={k}>
                    <label className="check">
                      <input type="checkbox" checked={choix.has(k)} disabled={!sections.length} onChange={() => basculer(k)} />
                      <span>
                        <strong>{t.titre || '(sans titre)'}</strong>
                        <small className="muted">
                          {' '}· {st?.label ?? '?'}{t.delai ? ` · ${fmtDate(t.delai)}` : ''}
                          {liste.length > 0 && ` · ☑ ${liste.filter((c) => c.done).length}/${liste.length}`}
                          {t.pieces ? ` · 📎 ${t.pieces}` : ''}
                          {copiees.has(k) && ' · ✓ déjà copiée'}
                        </small>
                      </span>
                    </label>
                    <button type="button" className="btn link small" onClick={() => setOuverte(ouverte === k ? null : k)}>{ouverte === k ? 'Masquer' : 'Voir'}</button>
                    {ouverte === k && (
                      <div className="ancienne-detail">
                        {t.remarque ? <p>{t.remarque}</p> : <p className="muted">Pas de remarque.</p>}
                        {liste.length > 0 && (
                          <ul>
                            {liste.map((c) => <li key={c.id}>{c.done ? '☑' : '☐'} {c.label}</li>)}
                          </ul>
                        )}
                        {!!t.pieces && <p className="muted small">📎 {t.pieces} pièce(s) jointe(s), consultables chez {x.unite} seulement (pas copiées).</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {sections.length ? (
        <label className="full">
          Copier dans la section
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
          <small className="muted">La copie est une tâche de « {ici} », indépendante : titre, remarque, sous-tâches, délai, statut et responsables (ceux qui ont une fiche ici), sans pièces jointes. Elle porte la mention « copiée depuis le comité … ».</small>
        </label>
      ) : (
        <p className="muted">Tu peux consulter ces tâches ; les copier demande le droit d’ajouter des tâches ici.</p>
      )}
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Fermer</button>
        {sections.length > 0 && <button className="btn" disabled={!list.length} onClick={() => copier(list)}>Tout copier ({list.length})</button>}
        {sections.length > 0 && <button className="btn primary" disabled={!choisies.length} onClick={() => copier(choisies)}>Copier la sélection ({choisies.length})</button>}
      </div>
    </Modal>
  );
}
