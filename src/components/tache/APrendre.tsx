import { useStore } from '../../data/store';
import { personnesDuRole } from '../../data/permissions';
import { aPrendreOuverte, nombreAPrendre, plusPersonne, volontaires } from '../../data/aPrendre';
import type { AppData, Task } from '../../data/types';
import { fullName, nomPoste } from '../../data/utils';
import type { SetT } from './Quand';

// Fiche d'une tâche : « 🙋 À prendre », la tâche proposée à quelques personnes dont l'une s'en charge elle-même.

const nomsDe = (data: AppData, ids: string[]) => ids.map((id) => fullName(data.people.find((p) => p.id === id))).join(', ');

/** Places d'une tâche à prendre : combien il en faut, combien sont prises et par qui. */
export function placesAPrendre(data: AppData, t: Task) {
  const vol = volontaires(t);
  return { nPrendre: nombreAPrendre(t.aPrendre), nPris: vol.length, quiPrend: nomsDe(data, vol) };
}

export function APrendreChamp({ t, setT, dis, canAssignOthers }: { t: Task; setT: SetT; dis: boolean; canAssignOthers: boolean }) {
  const { data, user } = useStore();
  if (!user) return null;
  const { nPrendre, nPris, quiPrend } = placesAPrendre(data, t);
  // À prendre : personnes à qui la tâche est proposée (ajoutées une à une, par rôle ou toutes) ; places prises.
  const candidats = t.aPrendre?.personnes ?? [];
  const proposable = !dis && canAssignOthers;
  const prendreIci = data.people.filter((p) => p.actif && !t.responsables.includes(p.id) && !candidats.includes(p.id));
  // « Comité » : tout le comité, président et secrétaire compris (personnesDuRole).
  const prendreRoles = data.roles
    .map((r) => ({ r, l: personnesDuRole(data.roles, prendreIci, r) }))
    .filter((g) => g.l.length > 1);
  const proposer = (v: string) =>
    setT((x) => {
      const ids = v === 'tous' ? prendreIci.map((p) => p.id) : v.startsWith('r:') ? (prendreRoles.find((g) => g.r.id === v.slice(2))?.l ?? []).map((p) => p.id) : [v.slice(2)];
      return { ...x, aPrendre: { ...x.aPrendre, personnes: [...(x.aPrendre?.personnes ?? []), ...ids] } };
    });
  const retirerPropose = (id: string) => setT((x) => ({ ...x, aPrendre: x.aPrendre && { ...x.aPrendre, personnes: x.aPrendre.personnes.filter((y) => y !== id) } }));
  const setNombre = (n: number) => setT((x) => ({ ...x, aPrendre: { ...x.aPrendre, personnes: x.aPrendre?.personnes ?? [], nombre: n > 1 ? n : undefined } }));
  // « Pas dispo » (encore proposées, pas responsables) ; personnes qui n'ont pas encore répondu.
  const refusIci = (t.aPrendre?.refus ?? []).filter((id) => candidats.includes(id) && !t.responsables.includes(id));
  if (!proposable && !candidats.length) return null;
  return (
    <div className="full a-prendre">
      <span className="field-label">🙋 À prendre</span>
      <div className="chips">
        {candidats.map((id) => {
          const p = data.people.find((x) => x.id === id);
          const non = refusIci.includes(id);
          return (
            <span key={id} className={`chip on ${proposable ? '' : 'locked'} ${non ? 'refus' : ''}`} title={non ? 'Pas dispo' : t.responsables.includes(id) ? 'S’en charge' : 'Pas encore de réponse'}>
              {fullName(p)}{t.responsables.includes(id) && ' ✓'}{non && ' 🙅'}
              {proposable && <button type="button" className="chip-x" aria-label={`Ne plus proposer à ${fullName(p)}`} onClick={() => retirerPropose(id)}>✕</button>}
            </span>
          );
        })}
        {!candidats.length && <span className="muted">Personne pour l’instant.</span>}
        {proposable && prendreIci.length > 0 && (
          <select className="chip-add" value="" aria-label="Proposer à" onChange={(e) => e.target.value && proposer(e.target.value)}>
            <option value="">＋ Proposer à…</option>
            {prendreIci.length > 1 && <option value="tous">Tout le monde ({prendreIci.length})</option>}
            {prendreRoles.length > 0 && (
              <optgroup label="Tout un rôle">
                {prendreRoles.map(({ r, l }) => <option key={r.id} value={`r:${r.id}`}>{r.label} ({l.length})</option>)}
              </optgroup>
            )}
            <optgroup label="Personnes">
              {prendreIci.map((p) => <option key={p.id} value={`p:${p.id}`}>{nomPoste(p, user.id)}</option>)}
            </optgroup>
          </select>
        )}
      </div>
      {(nPrendre > 1 || (proposable && candidats.length > 1)) && (
        <label className="inline a-prendre-nombre">
          Il faut
          <select value={nPrendre} disabled={!proposable} onChange={(e) => setNombre(Number(e.target.value))}>
            {Array.from({ length: Math.max(10, nPrendre) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {nPrendre > 1 ? 'personnes' : 'personne'}
        </label>
      )}
      <small className="muted">
        {!candidats.length
          ? 'Choisis à qui la proposer : '
          : aPrendreOuverte(t)
            ? `${nPris ? `${quiPrend} s’en charge${nPris > 1 ? 'nt' : ''} ; encore ${nPrendre - nPris} place${nPrendre - nPris > 1 ? 's' : ''}. ` : 'Personne ne s’en charge encore. '}`
            : `✓ ${quiPrend} s’en charge${nPris > 1 ? 'nt' : ''} : elle n’est plus proposée. `}
        {refusIci.length > 0 && `🙅 Pas dispo : ${nomsDe(data, refusIci)}. `}
        {candidats.length > 0 && aPrendreOuverte(t) && plusPersonne(t) && <b>Toutes les personnes proposées ont répondu : propose-la à d’autres. </b>}
        {(!candidats.length || aPrendreOuverte(t)) &&
          'Ces personnes la voient dans « Mes tâches » et à l’accueil, avec une notification 🔔 ; la première qui clique « 🙋 Je m’en charge » en devient responsable ; « 🙅 Pas dispo » prévient qui la propose.'}
      </small>
    </div>
  );
}
