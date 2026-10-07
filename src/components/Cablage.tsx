import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useClub } from '../data/club';
import { emailKey } from '../data/membres';
import { norm } from '../data/csv';
import { directory, personKey, UNIT_TYPES } from '../data/units';
import type { ClubMembre, OrgMember, OrgUnit } from '../data/types';
import { Initials, Modal } from './ui';

// Organigramme câblé : on tire une personne (d'une entité, ou de la liste « Personnes du club ») sur une entité
// pour en faire son responsable. Sur téléphone (pas de glisser-déposer) : mode « Câbler », on touche la personne,
// puis « ★ Responsable » sous l'entité. Une personne peut ne faire partie d'aucune entité : registre, ou nouvelle.

/** Une personne du club qu'on peut désigner : présente dans une entité, ou seulement au registre « Membres du club ». */
export interface Candidat {
  key: string;
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  couleur: string;
  membreId?: string;
  /** Où elle est déjà : « École de cyclisme (Moniteur), … » ; vide : dans aucune entité. */
  ou: string;
}

/** Ce qu'on a tiré ou choisi : une personne du club, ou une personne à ajouter. */
export type Source = Candidat | 'nouvelle';

export const nomCandidat = (c: Pick<Candidat, 'prenom' | 'nom' | 'email'>) => `${c.prenom} ${c.nom}`.trim() || c.email || '?';

/** Toutes les personnes du club : celles des entités (organigramme), puis celles du registre qui ne sont dans aucune. */
export function useCandidats(units: OrgUnit[], actif: boolean) {
  const club = useClub();
  const [registre, setRegistre] = useState<ClubMembre[]>([]);
  useEffect(() => {
    if (!actif || !club.membresAcces) return;
    let vivant = true;
    club
      .membres()
      .then((l) => vivant && setRegistre(l))
      .catch(() => {});
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, club.membresAcces]);
  return useMemo(() => {
    const dir = directory(units.filter((u) => !u.archive));
    const liste: Candidat[] = dir.map((e) => {
      const membreId = e.postes.find((x) => x.member.membreId)?.member.membreId ?? registre.find((m) => emailKey(m.email) && emailKey(m.email) === emailKey(e.email))?.id;
      return {
        key: e.key,
        prenom: e.prenom,
        nom: e.nom,
        email: e.email,
        telephone: e.telephone,
        couleur: e.couleur,
        membreId,
        ou: e.postes.map((x) => `${x.unit.nom}${x.member.poste ? ` (${x.member.poste})` : ''}`).join(', '),
      };
    });
    const pris = new Set(liste.flatMap((c) => [c.membreId, emailKey(c.email)].filter(Boolean)));
    for (const m of registre) {
      if (pris.has(m.id) || (emailKey(m.email) && pris.has(emailKey(m.email)))) continue;
      liste.push({ key: `m:${m.id}`, prenom: m.prenom, nom: m.nom, email: m.email, telephone: m.telephone, couleur: m.couleur, membreId: m.id, ou: '' });
    }
    return liste.sort((a, b) => nomCandidat(a).localeCompare(nomCandidat(b), 'fr'));
  }, [units, registre]);
}

/** La personne d'une ligne de l'organigramme, telle qu'on la désigne ailleurs. */
export const candidatDe = (candidats: Candidat[], u: OrgUnit, m: OrgMember): Candidat =>
  candidats.find((c) => c.key === personKey(m, u.id)) ?? {
    key: personKey(m, u.id),
    prenom: m.prenom,
    nom: m.nom,
    email: m.email,
    telephone: m.telephone,
    couleur: m.couleur,
    membreId: m.membreId,
    ou: u.nom,
  };

/** Entités où l'on peut désigner le responsable : pas le comité central (console admin), ni une entité archivée. */
export function useCablable() {
  const club = useClub();
  return (u: OrgUnit) => !u.archive && u.type !== 'central' && (club.canManage || u.moiAdmin);
}

/** Mode câblage : explication, et les personnes du club à tirer (celles qui ne sont dans aucune entité d'abord). */
export function CablagePanel({ candidats, choisi, onChoisir, onTirer, onFin }: {
  candidats: Candidat[];
  choisi: Source | null;
  onChoisir: (s: Source | null) => void;
  onTirer: (s: Source | null) => void;
  onFin: () => void;
}) {
  const [q, setQ] = useState('');
  const hors = candidats.filter((c) => !c.ou);
  const liste = q.trim() ? candidats.filter((c) => norm(`${nomCandidat(c)} ${c.email} ${c.ou}`).includes(norm(q.trim()))).slice(0, 40) : hors;
  const puce = (s: Source, label: string, title: string, k: string) => {
    const on = choisi === s || (choisi !== 'nouvelle' && s !== 'nouvelle' && choisi?.key === s.key);
    return (
      <button
        key={k}
        type="button"
        className={`chip cablage-puce ${on ? 'on' : ''}`}
        draggable
        title={title}
        aria-pressed={on}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', label);
          e.dataTransfer.effectAllowed = 'copy';
          onTirer(s);
        }}
        onDragEnd={() => onTirer(null)}
        onClick={() => onChoisir(on ? null : s)}
      >
        {label}
      </button>
    );
  };
  return (
    <section className="panel cablage-panel">
      <div className="cablage-tete">
        <p>
          🔌 <b>Câblage</b> : tire une personne sur une entité pour en faire son <b>responsable</b> (★). Sur téléphone : touche la personne, puis « ★ Responsable » sous l’entité.
        </p>
        <button type="button" className="btn primary small" onClick={onFin}>Terminé</button>
      </div>
      <label className="cablage-cherche">
        <span>{q.trim() ? 'Personnes du club' : `Personnes du club dans aucune entité (${hors.length})`}</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher quelqu’un du club…" />
      </label>
      <div className="cablage-personnes">
        {liste.map((c) => puce(c, nomCandidat(c), c.ou ? `Déjà : ${c.ou}` : 'Dans aucune entité (registre « Membres du club »)', c.key))}
        {!liste.length && <span className="muted small-note">{q.trim() ? 'Personne de ce nom au club.' : 'Tout le monde a déjà sa place dans une entité.'}</span>}
        {puce('nouvelle', '＋ Nouvelle personne', 'Pas encore au club : son nom et son adresse dans la fenêtre suivante', 'nouvelle')}
      </div>
      {choisi && (
        <p className="cablage-choisi">
          Choisi : <b>{choisi === 'nouvelle' ? 'une nouvelle personne' : nomCandidat(choisi)}</b> — touche « ★ Responsable » sous l’entité.{' '}
          <button type="button" className="btn link small" onClick={() => onChoisir(null)}>Annuler</button>
        </p>
      )}
    </section>
  );
}

/** Confirmation : qui devient responsable, sa fonction, et ce que deviennent les responsables actuels. */
export function ResponsableModal({ u, source, candidats, onClose }: { u: OrgUnit; source: Source | null; candidats: Candidat[]; onClose: () => void }) {
  const club = useClub();
  const { setToast, user } = useStore();
  const chef = UNIT_TYPES[u.type].chef;
  const [key, setKey] = useState(source === 'nouvelle' ? 'nouvelle' : source?.key ?? '');
  const [neuf, setNeuf] = useState({ prenom: '', nom: '', email: '' });
  const [poste, setPoste] = useState(chef);
  const [garder, setGarder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Personne tirée depuis une ligne d'entité, mais absente de la liste (cas limite) : on la garde.
  const tous = source && source !== 'nouvelle' && !candidats.some((c) => c.key === source.key) ? [source, ...candidats] : candidats;
  const c = key === 'nouvelle' ? null : tous.find((x) => x.key === key) ?? null;
  const actuels = u.membres.filter((m) => m.admin);
  // Sa fiche dans l'entité, s'il en fait déjà partie (même règle que data/cablage.ts : fiche du registre, puis adresse).
  const cible = c ? { email: emailKey(c.email), membreId: c.membreId } : { email: emailKey(neuf.email), membreId: undefined };
  const fiche = u.membres.find((m) => (!!cible.membreId && m.membreId === cible.membreId) || (!!cible.email && emailKey(m.email) === cible.email));
  const deja = !!fiche && actuels.some((m) => m.id === fiche.id);
  const autres = actuels.filter((m) => m.id !== fiche?.id);
  const moiPerds = !garder && !club.canManage && autres.some((m) => user && emailKey(m.email) && emailKey(m.email) === emailKey(user.email));
  const nomChoisi = c ? nomCandidat(c) : nomCandidat(neuf);

  const go = async () => {
    setErr('');
    if (!c && key !== 'nouvelle') return setErr('Choisis la personne.');
    if (key === 'nouvelle' && !neuf.prenom.trim() && !neuf.nom.trim()) return setErr('Indique au moins son prénom ou son nom.');
    if (key === 'nouvelle' && neuf.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(neuf.email.trim())) return setErr('Adresse email invalide.');
    if (deja && poste.trim() === (fiche?.poste || chef) && (garder || !autres.length)) return setErr(`${nomChoisi} est déjà ${chef.toLowerCase()} de « ${u.nom} ».`);
    setBusy(true);
    try {
      const p = c ?? { ...neuf, couleur: '#0f766e', telephone: '' };
      const res = await club.definirResponsable(u.id, {
        prenom: p.prenom.trim(),
        nom: p.nom.trim(),
        email: p.email.trim(),
        telephone: p.telephone,
        couleur: p.couleur,
        membreId: c?.membreId,
        poste: poste.trim() || chef,
        garder,
      });
      setToast(`★ ${nomChoisi} : ${(poste.trim() || chef).toLowerCase()} de « ${u.nom} »${res.compte ? ' ; son compte lui ouvre l’entité' : ''}`);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`★ ${chef} de « ${u.nom} »`} onClose={onClose}>
      <div className="form">
        <label className="full">
          Personne
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="">Choisis…</option>
            {tous.map((x) => (
              <option key={x.key} value={x.key}>{nomCandidat(x)}{x.ou ? ` · ${x.ou}` : ' · dans aucune entité'}</option>
            ))}
            <option value="nouvelle">＋ Nouvelle personne (pas encore au club)</option>
          </select>
        </label>
        {key === 'nouvelle' && (
          <>
            <label>
              Prénom
              <input autoFocus value={neuf.prenom} onChange={(e) => setNeuf({ ...neuf, prenom: e.target.value })} />
            </label>
            <label>
              Nom
              <input value={neuf.nom} onChange={(e) => setNeuf({ ...neuf, nom: e.target.value })} />
            </label>
            <label className="full">
              Email <small className="muted">(pour lui ouvrir l’appli ensuite)</small>
              <input type="email" value={neuf.email} onChange={(e) => setNeuf({ ...neuf, email: e.target.value })} />
            </label>
          </>
        )}
        {c && (
          <p className="full cablage-qui">
            <Initials prenom={c.prenom} nom={c.nom} couleur={c.couleur} size={36} />
            <span>
              <b>{nomChoisi}</b>
              <small className="muted">{c.ou ? `Déjà : ${c.ou}` : 'Dans aucune entité du club (registre « Membres du club »)'}</small>
            </span>
          </p>
        )}
        <label className="full">
          Sa fonction dans « {u.nom} »
          <input value={poste} onChange={(e) => setPoste(e.target.value)} placeholder={chef} />
        </label>
        {autres.length > 0 && (
          <fieldset className="full cablage-actuels">
            <legend>{autres.length > 1 ? 'Responsables actuels' : 'Responsable actuel'} : {autres.map((m) => `${m.prenom} ${m.nom}`.trim() || m.poste).join(', ')}</legend>
            <label className="inline">
              <input type="radio" checked={!garder} onChange={() => setGarder(false)} /> Remplacer : {autres.length > 1 ? 'ils restent membres' : 'reste membre'}, sans ★
            </label>
            <label className="inline">
              <input type="radio" checked={garder} onChange={() => setGarder(true)} /> {autres.length > 1 ? 'Ils restent' : 'Reste'} aussi responsable{autres.length > 1 ? 's' : ''}
            </label>
          </fieldset>
        )}
      </div>
      {moiPerds && <p className="error">⚠ Tu ne seras plus admin de « {u.nom} ».</p>}
      <p className="muted small-note">
        {fiche ? 'Sa fiche dans l’entité est reprise' : 'Une fiche est créée dans l’entité'}, avec le rôle Admin. S’il a déjà un compte dans le club, il ouvre aussi « {u.nom} » ; sinon, crée son accès depuis sa fiche (clic sur son nom).
      </p>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy || (!c && key !== 'nouvelle')} onClick={go}>{busy ? 'Enregistrement…' : `★ Désigner ${chef.toLowerCase()}`}</button>
      </div>
    </Modal>
  );
}
