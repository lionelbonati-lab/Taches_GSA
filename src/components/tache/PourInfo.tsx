import { useState } from 'react';
import { useStore } from '../../data/store';
import { ciblesPourInfo, cleVu, dernierVu, vuAvantModif, type Attendus } from '../../data/pourInfo';
import { personnesDuRole } from '../../data/permissions';
import type { Task, VuPourInfo } from '../../data/types';
import { nomPoste } from '../../data/utils';
import { Icone } from '../icones';
import { Deroulante } from '../Deroulante';
import type { SetT } from './Quand';

// Fiche d'une tâche : « 👁 Pour info », des personnes mises au courant sans s'en occuper, et qui l'a vue.

type Props = {
  t: Task;
  setT: SetT;
  isNew: boolean;
  dis: boolean;
  /** « ✓ Vu » enregistrés (clé de la mention → date). */
  vus: Record<string, VuPourInfo>;
  /** Personnes attendues (052 : avec un compte ; null : pas connues). */
  attendus: Attendus | null;
  /** La tâche telle qu'enregistrée (relance, personnes sans compte) ; null : nouvelle. */
  enregistree: Task | null;
};

export function PourInfoChamp({ t, setT, isNew, dis, vus, attendus, enregistree }: Props) {
  const { data, user, peutRelancer, relancerPourInfo, setToast } = useStore();
  // Relance (052) : en cours, puis ce qu'elle a donné.
  const [relance, setRelance] = useState('');
  if (!user) return null;
  // Pour info : des personnes (sauf responsables).
  const cibles = ciblesPourInfo(t.pourInfo, data.people).filter((c) => !t.responsables.includes(c.id));
  // Personnes sans compte (052) : mentionnées dans la tâche enregistrée, mais pas attendues ; elles ne reçoivent rien et ne
  // comptent pas.
  const mentionnees = new Set(enregistree?.pourInfo?.personnes ?? []);
  const sansCompte = (c: (typeof cibles)[number]) => !isNew && !!attendus && mentionnees.has(c.id) && !attendus.includes(c.cle);
  const comptees = cibles.filter((c) => !sansCompte(c));
  const nbSansCompte = cibles.length - comptees.length;
  const nbVus = comptees.filter((c) => vus[c.cle]).length;
  const toutVu = comptees.length > 0 && nbVus === comptees.length;
  // Vue avant la dernière modification de la tâche (052).
  const nbAvantModif = isNew ? 0 : comptees.filter((c) => vuAvantModif(vus[c.cle], t)).length;
  const aRelancer = !isNew && !!enregistree && peutRelancer(enregistree) && nbVus < comptees.length;
  const relancer = async () => {
    if (!enregistree) return;
    setRelance('…');
    try {
      const n = await relancerPourInfo(enregistree);
      setRelance(n ? `🔔 ${n} personne${n > 1 ? 's' : ''} relancée${n > 1 ? 's' : ''}.` : 'Personne à relancer.');
    } catch (e) {
      setRelance('');
      setToast(`⚠️ ${e instanceof Error ? e.message : e}`);
    }
  };
  const jourCourt = (s: string) => new Date(s).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' });
  const date = (s: string) => {
    const d = new Date(s);
    return `${d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })} à ${d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const quandVu = (v: VuPourInfo) => `Vu le ${date(v.le)}${v.revu ? `, revu le ${date(v.revu)}` : ''}`;
  const infoIci = data.people.filter((p) => p.actif && !t.responsables.includes(p.id) && !t.pourInfo?.personnes?.includes(p.id));
  // Tout un groupe d'un coup : toutes les personnes, celles d'un rôle (« Comité »…), les membres d'une étiquette.
  const infoRoles = data.roles.map((r) => ({ r, l: personnesDuRole(data.roles, infoIci, r) })).filter((g) => g.l.length > 1);
  const infoEtiquettes = (data.etiquettes ?? []).map((e) => ({ e, l: infoIci.filter((p) => e.membres?.includes(p.id)) })).filter((g) => g.l.length > 1);
  const changerInfo = (v: string, oui: boolean) =>
    setT((x) => {
      // Groupes : chacune de leurs personnes, ajoutée comme si on l'avait choisie (et retirable une à une).
      const ids =
        v === 'tous' ? infoIci.map((y) => y.id)
        : v.startsWith('r:') ? (infoRoles.find((g) => g.r.id === v.slice(2))?.l ?? []).map((y) => y.id)
        : v.startsWith('e:') ? (infoEtiquettes.find((g) => g.e.id === v.slice(2))?.l ?? []).map((y) => y.id)
        : [v.slice(2)];
      const avant = x.pourInfo?.personnes ?? [];
      const personnes = oui ? [...new Set([...avant, ...ids])] : avant.filter((y) => !ids.includes(y));
      return { ...x, pourInfo: { personnes } };
    });
  if (dis && !cibles.length) return null;
  return (
    <div className="full pour-info">
      <span className="field-label">👁 Pour info</span>
      <div className="chips">
        {cibles.map((c) => {
          const v = vus[c.cle];
          const gris = sansCompte(c);
          const revoir = !isNew && !!v && vuAvantModif(v, t);
          const titre = isNew ? undefined
            : gris ? 'Sans compte (ou fiche inactive) : ne reçoit pas le point et ne compte pas dans « Vu par… »'
            : v ? `${quandVu(v)}${revoir ? ` ; avant la dernière modification (${date(t.contenuLe!)})` : ''}`
            : 'Pas encore « ✓ Vu »';
          return (
            <span key={c.cle} className={`chip on ${dis ? 'locked' : ''} ${isNew ? '' : gris ? 'sans-compte' : revoir ? 'revoir' : v ? 'vu' : 'pas-vu'}`} title={titre}>
              {!isNew && !gris && !revoir && v && <Icone n="ok" />}
              {revoir && <span aria-hidden="true">✏️</span>}
              {c.texte}
              {gris && <small className="chip-vu">sans compte</small>}
              {v && <small className="chip-vu"><span className="sr-only">{titre} : </span>{jourCourt(dernierVu(v))}</small>}
              {!dis && <button type="button" className="chip-x" aria-label={`Retirer ${c.texte}`} onClick={() => changerInfo(c.cle, false)}>✕</button>}
            </span>
          );
        })}
        {!cibles.length && <span className="muted">Personne pour l’instant.</span>}
        {!dis && infoIci.length > 0 && (
          <Deroulante
            puce
            value=""
            libelle="＋ Ajouter…"
            aria-label="Mettre au courant"
            onChange={(v) => v && changerInfo(v, true)}
            options={[
              {
                groupe: 'Tout un groupe d’un coup',
                options: [
                  ...(infoIci.length > 1 ? [{ value: 'tous', label: `Toutes les personnes (${infoIci.length})`, icone: <Icone n="personnes" /> }] : []),
                  ...infoRoles.map(({ r, l }) => ({ value: `r:${r.id}`, label: `${r.label} (${l.length})`, icone: <Icone n="personnes" /> })),
                  ...infoEtiquettes.map(({ e, l }) => ({ value: `e:${e.id}`, label: `Membres de « ${e.nom} » (${l.length})`, icone: <Icone n="etiquette" /> })),
                ],
              },
              { groupe: 'Personnes', options: infoIci.map((p) => ({ value: cleVu(p.id), label: nomPoste(p, user.id) })) },
            ]}
          />
        )}
      </div>
      {!isNew && cibles.length > 0 && (
        <div className="pour-info-suivi">
          <small className="pour-info-bilan">
            {!comptees.length
              ? 'Personne ne la reçoit : les personnes mentionnées n’ont pas de compte.'
              : toutVu
                ? '✓ Vu par tout le monde.'
                : nbVus === 0
                  ? 'Personne ne l’a encore marquée « ✓ Vu ».'
                  : `✓ Vu par ${nbVus} personne${nbVus > 1 ? 's' : ''} sur ${comptees.length}.`}
            {nbAvantModif > 0 && ` ✏️ ${nbAvantModif} l’${nbAvantModif > 1 ? 'ont' : 'a'} vu avant sa dernière modification.`}
            {nbSansCompte > 0 && comptees.length > 0 && ` ${nbSansCompte} sans compte, pas comptée${nbSansCompte > 1 ? 's' : ''}.`}
          </small>
          {aRelancer && (
            <button type="button" className="btn small" disabled={relance === '…'} onClick={relancer} title="Renvoyer une notification 🔔 aux personnes qui ne l’ont pas encore vu (une fois par heure)">
              🔔 Relancer
            </button>
          )}
          {relance && relance !== '…' && <small className="muted" role="status">{relance}</small>}
        </div>
      )}
      <small className="muted">
        Elles voient le point sans s’en occuper : dans « Mes points » (👁) et à l’accueil, avec une notification 🔔. Quand elles le marquent « ✓ Vu »,
        leur pastille passe du rouge au vert (✓ et la date). ✏️ : vu avant sa dernière modification. En gris : sans compte, elle ne reçoit rien.
        🔔 Relancer renvoie une notification à celles qui ne l’ont pas encore vu.
      </small>
    </div>
  );
}
