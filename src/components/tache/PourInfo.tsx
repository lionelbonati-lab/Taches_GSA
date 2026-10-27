import { useState } from 'react';
import { useStore } from '../../data/store';
import { useClubOptional } from '../../data/club';
import { memePersonne } from '../../data/partage';
import { ciblesPourInfo, dernierVu, etatVu, vuAvantModif, vusDeLEntite, type Attendus } from '../../data/pourInfo';
import { personnesDuRole } from '../../data/permissions';
import type { PourInfo, Task, VuPourInfo } from '../../data/types';
import { nomPoste } from '../../data/utils';
import { Icone } from '../icones';
import { Deroulante } from '../Deroulante';
import { IconeEntite, PastilleEntite } from '../IconesEntite';
import type { SetT } from './Quand';

// Fiche d'une tâche : « 👁 Pour info », des personnes ou des entités mises au courant sans s'en occuper, et qui l'a vue.

type Props = {
  t: Task;
  setT: SetT;
  isNew: boolean;
  dis: boolean;
  /** « ✓ Vu » enregistrés (clé de la mention → date). */
  vus: Record<string, VuPourInfo>;
  /** Entités mentionnées en entier : les personnes qui reçoivent la tâche (null : pas encore connues). */
  recoivent: Record<string, string[]> | null;
  /** Personnes attendues (052 : avec un compte ; null : pas connues). */
  attendus: Attendus | null;
  /** La tâche telle qu'enregistrée (relance, personnes sans compte) ; null : nouvelle. */
  enregistree: Task | null;
};

export function PourInfoChamp({ t, setT, isNew, dis, vus, recoivent, attendus, enregistree }: Props) {
  const { data, user, peutRelancer, relancerPourInfo, setToast } = useStore();
  const club = useClubOptional();
  // Relance (052) : en cours, puis ce qu'elle a donné.
  const [relance, setRelance] = useState('');
  if (!user) return null;
  // Pour info : personnes d'ici (sauf responsables), autres entités du club, personnes d'autres entités (« a:entité:fiche »).
  const info = t.pourInfo ?? {};
  const cibles = ciblesPourInfo(t.pourInfo, data.people, club?.units ?? []).filter((c) => c.genre !== 'personne' || !t.responsables.includes(c.id));
  // « ✓ Vu » (046) sur les pastilles, avec leur date ; une entité mentionnée en entier est vue quand chacune des personnes
  // qui la reçoivent (`recoivent`) l'a vue.
  const etats = Object.fromEntries(cibles.map((c) => [c.cle, etatVu(c.cle, vus, c.genre === 'unite' ? recoivent?.[c.id] : undefined)]));
  // Personnes sans compte (052) : mentionnées dans la tâche enregistrée, mais pas attendues ; elles ne reçoivent rien et ne
  // comptent pas.
  const mentionnees = new Set(ciblesPourInfo(enregistree?.pourInfo, [], []).map((c) => c.cle));
  const sansCompte = (c: (typeof cibles)[number]) => !isNew && !!attendus && c.genre !== 'unite' && mentionnees.has(c.cle) && !attendus.includes(c.cle);
  const comptees = cibles.filter((c) => !sansCompte(c));
  const nbSansCompte = cibles.length - comptees.length;
  // Bilan en personnes : une entité compte celles qui la reçoivent.
  const toutVu = comptees.length > 0 && comptees.every((c) => etats[c.cle].etat === 'vu');
  const nbVus = comptees.reduce((n, c) => n + etats[c.cle].n, 0);
  const nbRecoivent = comptees.reduce((n, c) => n + etats[c.cle].total, 0);
  // Vue avant la dernière modification de la tâche (052) : une personne, ou des personnes d'une entité.
  const avantModif = (c: (typeof cibles)[number]) =>
    c.genre === 'unite' ? Object.values(vusDeLEntite(vus, c.id)).filter((v) => vuAvantModif(v, t)).length : vuAvantModif(vus[c.cle], t) ? 1 : 0;
  const nbAvantModif = isNew ? 0 : comptees.reduce((n, c) => n + avantModif(c), 0);
  const aRelancer = !isNew && !!enregistree && peutRelancer(enregistree) && nbVus < nbRecoivent;
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
  const quandVu = (v: VuPourInfo) => `Vu le ${date(v.le)}${v.revu ? `, revue le ${date(v.revu)}` : ''}`;
  // Entité mentionnée en entier : qui l'a vue (avec la date), qui pas encore.
  const vusEntite = (id: string) => {
    const membres = club?.units.find((u) => u.id === id)?.membres ?? [];
    const nomDe = (f: string) => { const m = membres.find((x) => x.id === f); return m ? `${m.prenom} ${m.nom}`.trim() : '?'; };
    const v = vusDeLEntite(vus, id);
    return {
      vues: Object.entries(v).sort((a, b) => a[1].le.localeCompare(b[1].le)).map(([f, x]) => `${nomDe(f)} (${jourCourt(x.le)})`),
      pasEncore: (recoivent?.[id] ?? []).filter((f) => !v[f]).map(nomDe).sort((a, b) => a.localeCompare(b, 'fr')),
      connu: !!recoivent?.[id],
    };
  };
  const infoIci = data.people.filter((p) => p.actif && !t.responsables.includes(p.id) && !info.personnes?.includes(p.id));
  const autresUnites = club ? club.units.filter((u) => u.id !== club.current.id && !u.archive) : [];
  const iconeUnite = (id: string) => { const u = club?.units.find((x) => x.id === id); return u ? <><IconeEntite u={u} />{' '}</> : null; };
  // Tâche partagée : son entité la voit déjà.
  const infoUnites = autresUnites.filter((u) => !info.unites?.includes(u.id) && u.id !== t.source?.uniteId);
  const infoAutres = autresUnites
    .map((u) => ({ u, l: u.membres.filter((m) => !m.viaEntite && !info.autres?.[u.id]?.includes(m.id) && !data.people.some((p) => p.actif && memePersonne(p, m))) }))
    .filter((g) => g.l.length);
  // Tout un groupe d'un coup : les personnes d'ici, celles d'un rôle (« Comité »…), celles d'une autre entité.
  const infoRoles = data.roles.map((r) => ({ r, l: personnesDuRole(data.roles, infoIci, r) })).filter((g) => g.l.length > 1);
  const changerInfo = (v: string, oui: boolean) =>
    setT((x) => {
      const p: PourInfo = { ...x.pourInfo };
      // Groupes : chacune de leurs personnes, ajoutée comme si on l'avait choisie (et retirable une à une).
      const cles =
        v === 'tous' ? infoIci.map((y) => `p:${y.id}`)
        : v.startsWith('r:') ? (infoRoles.find((g) => g.r.id === v.slice(2))?.l ?? []).map((y) => `p:${y.id}`)
        : v.startsWith('ta:') ? (infoAutres.find((g) => g.u.id === v.slice(3))?.l ?? []).map((m) => `a:${v.slice(3)}:${m.id}`)
        : [v];
      for (const c of cles) {
        const [g, a, b] = c.split(':');
        const maj = (l: string[] | undefined, id: string) => (oui ? [...new Set([...(l ?? []), id])] : (l ?? []).filter((y) => y !== id));
        if (g === 'p') p.personnes = maj(p.personnes, a);
        else if (g === 'u') p.unites = maj(p.unites, a);
        else p.autres = { ...p.autres, [a]: maj(p.autres?.[a], b) };
      }
      return { ...x, pourInfo: p };
    });
  if (dis && !cibles.length) return null;
  return (
    <div className="full pour-info">
      <span className="field-label">👁 Pour info</span>
      <div className="chips">
        {cibles.map((c) => {
          const e = etats[c.cle];
          const v = c.genre === 'unite' ? undefined : vus[c.cle];
          const ve = !isNew && c.genre === 'unite' ? vusEntite(c.id) : undefined;
          const gris = sansCompte(c);
          const revoir = !isNew && !!v && vuAvantModif(v, t);
          const nAvant = ve ? avantModif(c) : 0;
          const titre = isNew ? undefined
            : gris ? 'Sans compte (ou fiche inactive) : ne reçoit pas la tâche et ne compte pas dans « Vue par… »'
            : v ? `${quandVu(v)}${revoir ? ` ; avant la dernière modification (${date(t.contenuLe!)})` : ''}`
            : ve ? `Vue par ${e.n}${ve.connu ? ` sur ${e.total}` : ''}${ve.pasEncore.length ? ` ; pas encore : ${ve.pasEncore.join(', ')}` : ''}${nAvant ? ` ; ${nAvant} avant la dernière modification` : ''}`
            : 'Pas encore « ✓ Vu »';
          return (
            <span key={c.cle} className={`chip on ${dis ? 'locked' : ''} ${isNew ? '' : gris ? 'sans-compte' : revoir ? 'revoir' : e.etat}`} title={titre}>
              {!isNew && !gris && !revoir && e.etat === 'vu' && <Icone n="ok" />}
              {revoir && <span aria-hidden="true">✏️</span>}
              {c.genre === 'unite' && iconeUnite(c.id)}{c.texte}
              {gris && <small className="chip-vu">sans compte</small>}
              {v && <small className="chip-vu"><span className="sr-only">{titre} : </span>{jourCourt(dernierVu(v))}</small>}
              {ve && (ve.connu || e.n > 0) && <small className="chip-vu"><span className="sr-only">{titre} : </span>{ve.connu ? `${e.n}/${e.total}` : `✓ ${e.n}`}</small>}
              {!dis && <button type="button" className="chip-x" aria-label={`Retirer ${c.texte}`} onClick={() => changerInfo(c.cle, false)}>✕</button>}
            </span>
          );
        })}
        {!cibles.length && <span className="muted">Personne pour l’instant.</span>}
        {!dis && (infoIci.length > 0 || infoUnites.length > 0 || infoAutres.length > 0) && (
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
                  ...(infoIci.length > 1 ? [{ value: 'tous', label: `Toutes les personnes${club ? ` de « ${club.current.nom} »` : ''} (${infoIci.length})`, icone: <Icone n="personnes" /> }] : []),
                  ...infoRoles.map(({ r, l }) => ({ value: `r:${r.id}`, label: `${r.label} (${l.length})`, icone: <Icone n="personnes" /> })),
                  ...infoAutres.filter((g) => g.l.length > 1).map(({ u, l }) => ({ value: `ta:${u.id}`, label: `Toutes les personnes de « ${u.nom} » (${l.length})`, icone: <PastilleEntite u={u} /> })),
                ],
              },
              { groupe: `Personnes${club ? ` de « ${club.current.nom} »` : ''}`, options: infoIci.map((p) => ({ value: `p:${p.id}`, label: nomPoste(p, user.id) })) },
              { groupe: 'Entités du club', options: infoUnites.map((u) => ({ value: `u:${u.id}`, label: u.nom, icone: <PastilleEntite u={u} /> })) },
              ...infoAutres.map(({ u, l }) => ({
                groupe: `Personnes de « ${u.nom} »`,
                icone: <PastilleEntite u={u} />,
                options: l.map((m) => ({ value: `a:${u.id}:${m.id}`, label: `${`${m.prenom} ${m.nom}`.trim()}${m.poste ? ` · ${m.poste}` : ''}` })),
              })),
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
                ? '✓ Vue par tout le monde.'
                : nbVus === 0
                  ? 'Personne ne l’a encore marquée « ✓ Vu ».'
                  : `✓ Vue par ${nbVus} personne${nbVus > 1 ? 's' : ''} sur ${nbRecoivent}.`}
            {nbAvantModif > 0 && ` ✏️ ${nbAvantModif} l’${nbAvantModif > 1 ? 'ont' : 'a'} vue avant sa dernière modification.`}
            {nbSansCompte > 0 && comptees.length > 0 && ` ${nbSansCompte} sans compte, pas comptée${nbSansCompte > 1 ? 's' : ''}.`}
          </small>
          {aRelancer && (
            <button type="button" className="btn small" disabled={relance === '…'} onClick={relancer} title="Renvoyer une notification 🔔 aux personnes qui ne l’ont pas encore vue (une fois par heure)">
              🔔 Relancer
            </button>
          )}
          {relance && relance !== '…' && <small className="muted" role="status">{relance}</small>}
        </div>
      )}
      {!isNew &&
        cibles
          .filter((c) => c.genre === 'unite')
          .map((c) => {
            const ve = vusEntite(c.id);
            return (
              <small key={c.cle} className="pour-info-entite-vus">
                {iconeUnite(c.id)}<b>{c.texte}</b> :{' '}
                {ve.connu && !ve.vues.length && !ve.pasEncore.length
                  ? 'personne ne la reçoit (ni admin ni rôle « Voir toutes les tâches » avec un compte).'
                  : <>
                      {ve.vues.length > 0 && <span className="vu-oui">✓ {ve.vues.join(', ')}</span>}
                      {ve.vues.length > 0 && ve.pasEncore.length > 0 && ' · '}
                      {ve.pasEncore.length > 0 && <span className="vu-non">pas encore : {ve.pasEncore.join(', ')}</span>}
                      {!ve.vues.length && !ve.pasEncore.length && 'personne ne l’a encore vue.'}
                    </>}
              </small>
            );
          })}
      <small className="muted">
        Elles voient la tâche sans s’en occuper : les personnes d’ici dans « Mes tâches » (👁) avec une notification 🔔 ; les autres entités (leurs
        admins et les rôles « Voir toutes les tâches ») et leurs personnes, en lecture seule, à l’accueil et dans Tâches › 👁 Pour info. Quand
        elles la marquent « ✓ Vu », leur pastille passe du rouge au vert (✓ et la date) ; une entité compte chacune des personnes qui la reçoivent (orange : une partie l’a vue).
        ✏️ : vue avant sa dernière modification. En gris : sans compte, elle ne reçoit rien. 🔔 Relancer renvoie une notification à celles qui ne l’ont pas encore vue.
      </small>
    </div>
  );
}
