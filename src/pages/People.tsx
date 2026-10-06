import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { ADMIN_ROLE_ID } from '../data/permissions';
import { accessAction, type AccessInfo } from '../data/cloud';
import { emailKey, nomMembre } from '../data/membres';
import { norm } from '../data/csv';
import { defaultRoleId, directory, personKey, UNIT_TYPES } from '../data/units';
import type { Person } from '../data/types';
import { fullName, isDone, uid } from '../data/utils';
import { Avatar, Initials, Modal } from '../components/ui';
import { AccessCell, CredentialsModal, type Shown } from '../components/Acces';
import { PageIntro } from '../components/Nav';

// Responsables (comité central) ou membres (autres entités) : un seul écran pour les personnes de l'entité,
// leur poste, leurs rôles et leur accès à l'appli. Les coordonnées viennent du registre « Membres du club ».

export function People() {
  const { data, can, update, cloud } = useStore();
  const club = useClubOptional();
  const [edit, setEdit] = useState<Person | null>(null);
  const [ajout, setAjout] = useState(false);
  const [anciens, setAnciens] = useState(false);
  const manage = can('people.manage');
  const admin = can('admin.access');
  const people = data.people.filter((p) => p.actif);
  const inactifs = data.people.filter((p) => !p.actif);
  const central = !club || club.current.type === 'central';
  const blank = (): Person => ({ id: uid('p'), poste: '', nom: '', prenom: '', email: '', telephone: '', roles: [defaultRoleId(data.roles)], actif: true, couleur: '#0f766e' });

  // Version réelle : comptes rattachés aux fiches (adresse, dernière connexion), pour les admins.
  const [access, setAccess] = useState<AccessInfo[] | null>(null);
  const [accessErr, setAccessErr] = useState('');
  const [shown, setShown] = useState<Shown | null>(null);
  const committeeId = admin ? cloud?.membership.committeeId : undefined;
  const loadAccess = useCallback(() => {
    if (!committeeId) return;
    accessAction<{ acces: AccessInfo[] }>({ action: 'liste', committeeId })
      .then((r) => {
        setAccess(r.acces);
        setAccessErr('');
      })
      .catch((e: Error) => setAccessErr(`Accès : ${e.message}`));
  }, [committeeId]);
  useEffect(loadAccess, [loadAccess]);

  // Postes de chaque personne dans les autres entités du club (même adresse email).
  const elsewhere = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!club) return map;
    for (const e of directory(club.units.filter((u) => !u.archive))) {
      const other = e.postes.filter((x) => x.unit.id !== club.current.id).map((x) => `${x.unit.nom}${x.member.poste ? ` (${x.member.poste})` : ''}`);
      if (other.length) map.set(e.key, other);
    }
    return map;
  }, [club]);

  const rolesDe = (p: Person) => data.roles.filter((r) => p.roles.includes(r.id));

  return (
    <div>
      <div className="page-head">
        <h1>{central ? 'Responsables' : 'Membres'}</h1>
        {manage && <button className="btn primary" onClick={() => (club ? setAjout(true) : setEdit(blank()))}>+ Ajouter une personne</button>}
      </div>
      <PageIntro />
      <div className="people">
        {people.map((p) => {
          const open = data.tasks.filter((t) => t.responsables.includes(p.id) && !isDone(data, t)).length;
          const also = club ? elsewhere.get(personKey(p, club.current.id)) : undefined;
          const acces = access?.find((a) => a.personId === p.id);
          return (
            <article key={p.id} className="panel person">
              <Avatar id={p.id} size={48} />
              <div className="grow">
                <small className="muted">{p.poste}{p.autresPostes && ` · ${p.autresPostes}`}</small>
                <strong>{p.prenom} {p.nom}</strong>
                {p.email && <a href={`mailto:${p.email}`}>✉ {p.email}</a>}
                {p.telephone && <a href={`tel:${p.telephone.replace(/\s/g, '')}`}>📱 {p.telephone}</a>}
                <span className="person-roles">
                  {rolesDe(p).map((r) => <span key={r.id} className="badge" style={{ background: r.couleur }}>{r.label}</span>)}
                  {access && <small className="muted">{acces ? '🔑 accès à l’appli' : 'sans accès à l’appli'}</small>}
                </span>
                {also && <small className="muted also">Aussi : {also.join(' · ')}</small>}
                <Link to={`/taches?resp=${p.id}`} className="muted">{open} tâche(s) ouverte(s) →</Link>
              </div>
              {(manage || admin) && <button className="btn small" onClick={() => setEdit(p)}>Modifier</button>}
            </article>
          );
        })}
      </div>
      {inactifs.length > 0 && (manage || admin) && (
        <div className="anciens">
          <button className="btn link" onClick={() => setAnciens((x) => !x)}>{anciens ? '▾' : '▸'} Personnes retirées ({inactifs.length})</button>
          {anciens && (
            <ul>
              {inactifs.map((p) => (
                <li key={p.id}>
                  {fullName(p)} <small className="muted">{p.poste}</small>{' '}
                  <button className="btn small" onClick={() => setEdit({ ...p, actif: true })}>Réactiver…</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {manage && (
        <p className="muted">
          Chaque personne a un poste et un ou plusieurs rôles (ce qu’elle peut voir et faire){cloud && admin ? ', et éventuellement un accès à l’appli' : ''}.
          {club && ' Ses coordonnées sont communes à tout le club : les changer ici les change dans toutes les entités.'}
        </p>
      )}
      {accessErr && <p className="error">{accessErr}</p>}
      {edit && (
        <PersonModal
          person={edit}
          central={central}
          access={access}
          onAccessChange={loadAccess}
          onShow={setShown}
          onSave={(p, action) => {
            const isNew = !data.people.some((x) => x.id === p.id);
            update((d) => {
              d.people = isNew ? [...d.people, p] : d.people.map((x) => (x.id === p.id ? p : x));
            }, action);
          }}
          onClose={() => setEdit(null)}
        />
      )}
      {ajout && club && (
        <AjouterPersonne
          onPick={(p) => {
            setAjout(false);
            setEdit(p ?? blank());
          }}
          onClose={() => setAjout(false)}
        />
      )}
      {shown && <CredentialsModal {...shown} onClose={() => setShown(null)} />}
    </div>
  );
}

/** Fiche d'une personne de l'entité : coordonnées, poste, rôles, accès à l'appli, retrait. */
function PersonModal({ person, central, access, onAccessChange, onShow, onSave, onClose }: {
  person: Person;
  central: boolean;
  access: AccessInfo[] | null;
  onAccessChange: () => void;
  onShow: (s: Shown) => void;
  onSave: (p: Person, action: string) => void;
  onClose: () => void;
}) {
  const { data, can, user, cloud } = useStore();
  const club = useClubOptional();
  const [v, setV] = useState<Person>(person);
  const [err, setErr] = useState('');
  const manage = can('people.manage');
  const admin = can('admin.access');
  const before = data.people.find((x) => x.id === person.id);
  const isNew = !before;
  const reactiver = !!before && !before.actif;
  const self = person.id === user?.id;
  const activeAdmins = data.people.filter((p) => p.actif && p.roles.includes(ADMIN_ROLE_ID));
  const lastAdmin = !!before?.roles.includes(ADMIN_ROLE_ID) && activeAdmins.length <= 1 && before.actif;
  const set = (patch: Partial<Person>) => setV((x) => ({ ...x, ...patch }));
  const label = central ? 'responsable' : 'membre';

  const valider = () => {
    if (!nomMembre(v)) return 'Indique au moins un prénom ou un nom.';
    if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return 'Adresse email invalide.';
    const autre = v.email.trim() && data.people.find((x) => x.id !== v.id && x.actif && emailKey(x.email) === emailKey(v.email));
    if (autre) return `Cette adresse est déjà celle de ${fullName(autre)} dans cette entité.`;
    if (!v.roles.length) return 'Choisis au moins un rôle.';
  };
  const submit = () => {
    const bad = valider();
    if (bad) return setErr(bad);
    const p = { ...v, prenom: v.prenom.trim(), nom: v.nom.trim(), email: v.email.trim(), telephone: v.telephone.trim(), poste: v.poste.trim() };
    onSave(p, `${isNew ? 'Ajout' : reactiver ? 'Réactivation' : 'Modification'} du ${label} ${fullName(p)}`);
    onClose();
  };
  const retirer = () => {
    if (!before || !confirm(`Retirer ${fullName(before)} de l’entité ?${cloud ? ' Son accès à l’appli est aussi coupé.' : ''} Ses tâches restent ; tu pourras le réactiver.`)) return;
    onSave({ ...before, actif: false }, `${fullName(before)} retiré de l’entité`);
    onClose();
  };

  return (
    <Modal title={isNew ? `Nouveau ${label}` : fullName(person)} onClose={onClose}>
      <div className="form">
        <label>Poste<input value={v.poste} disabled={!manage} onChange={(e) => set({ poste: e.target.value })} /></label>
        <label>Autres fonctions<input value={v.autresPostes ?? ''} disabled={!manage} placeholder="séparées par des virgules" onChange={(e) => set({ autresPostes: e.target.value || undefined })} /></label>
        <label>Prénom<input value={v.prenom} disabled={!manage} onChange={(e) => set({ prenom: e.target.value })} /></label>
        <label>Nom<input value={v.nom} disabled={!manage} onChange={(e) => set({ nom: e.target.value })} /></label>
        <label>Adresse email<input type="email" value={v.email} disabled={!manage} onChange={(e) => set({ email: e.target.value })} /></label>
        <label>Téléphone portable<input type="tel" value={v.telephone} disabled={!manage} onChange={(e) => set({ telephone: e.target.value })} /></label>
        <div className="full">
          <span className="field-label">Rôles (cumulables : la personne a les droits de tous ses rôles)</span>
          <div className="chips">
            {data.roles.map((r) => {
              const on = v.roles.includes(r.id);
              // Garde-fous : le rôle Admin ne se retire ni à soi-même ni au dernier admin, et seul un admin le donne.
              const locked = !admin || (r.id === ADMIN_ROLE_ID && ((on && (self || lastAdmin)) || (!on && !user?.roles.includes(ADMIN_ROLE_ID))));
              return (
                <button key={r.id} type="button" className={`chip role-chip ${on ? 'on' : ''}`} style={on ? { background: r.couleur, borderColor: r.couleur } : {}} disabled={locked} onClick={() => set({ roles: on ? v.roles.filter((x) => x !== r.id) : [...v.roles, r.id] })}>
                  {r.label}
                </button>
              );
            })}
          </div>
          {!admin && <small className="muted">Les rôles se changent par un admin de l’entité.</small>}
        </div>
      </div>
      {cloud && admin && !isNew && !reactiver && (
        <div className="person-acces">
          <span className="field-label">Accès à l’appli</span>
          <AccessCell person={before!} access={access} onChange={onAccessChange} onShow={onShow} />
        </div>
      )}
      {cloud && admin && (isNew || reactiver) && <p className="muted small-note">Accès à l’appli : à créer une fois la fiche enregistrée (bouton « Modifier »).</p>}
      {club && <p className="muted small-note">Prénom, nom, email et téléphone sont communs à tout le club (registre « Membres du club ») : modifiés ici, ils changent dans toutes les entités.</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {admin && !isNew && !reactiver && (
          <button className="btn danger" disabled={self || lastAdmin} title={self ? 'Pas toi-même' : lastAdmin ? 'Il reste toujours au moins un admin' : ''} onClick={retirer}>Retirer de l’entité</button>
        )}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        {(manage || admin) && <button className="btn primary" onClick={submit}>{reactiver ? 'Réactiver' : 'Enregistrer'}</button>}
      </div>
    </Modal>
  );
}

interface Candidat {
  key: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  couleur: string;
  membreId?: string;
  info: string;
}

/** Ajouter une personne : quelqu'un du club (registre « Membres du club », sinon annuaire des entités) ou une nouvelle personne. */
function AjouterPersonne({ onPick, onClose }: { onPick: (p: Person | null) => void; onClose: () => void }) {
  const { data } = useStore();
  const club = useClubOptional()!;
  const [q, setQ] = useState('');
  const [registre, setRegistre] = useState<Candidat[] | null>(null);
  const acces = club.membresAcces;
  const { membres, units } = club;
  useEffect(() => {
    if (!acces) return;
    membres()
      .then((l) =>
        setRegistre(
          l.map((m) => ({
            key: m.id,
            prenom: m.prenom,
            nom: m.nom,
            email: m.email,
            telephone: m.telephone,
            couleur: m.couleur,
            membreId: m.id,
            info: m.groupes.map((g) => units.find((u) => u.id === g)?.nom).filter(Boolean).join(', '),
          })),
        ),
      )
      .catch(() => setRegistre(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acces]);
  const annuaire: Candidat[] = directory(units.filter((u) => !u.archive)).map((e) => ({
    key: e.key,
    prenom: e.prenom,
    nom: e.nom,
    email: e.email,
    telephone: e.telephone ?? '',
    couleur: e.couleur,
    membreId: e.postes.find((x) => x.member.membreId)?.member.membreId,
    info: e.postes.map((p) => `${UNIT_TYPES[p.unit.type].icon} ${p.unit.nom}${p.member.poste ? ` · ${p.member.poste}` : ''}`).join('  '),
  }));
  const fiche = (c: Candidat) =>
    data.people.find((p) => (c.membreId && p.membreId === c.membreId) || (c.email && emailKey(p.email) === emailKey(c.email)));
  const needle = norm(q);
  const list = (registre ?? annuaire)
    .filter((c) => !fiche(c)?.actif)
    .filter((c) => !needle || norm(`${c.prenom} ${c.nom} ${c.email} ${c.info}`).includes(needle))
    .sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr'));
  const choisir = (c: Candidat) => {
    const ancienne = fiche(c);
    if (ancienne) return onPick({ ...ancienne, actif: true });
    onPick({
      id: uid('p'),
      poste: '',
      prenom: c.prenom,
      nom: c.nom,
      email: c.email,
      telephone: c.telephone,
      roles: [defaultRoleId(data.roles)],
      actif: true,
      couleur: c.couleur,
      ...(c.membreId ? { membreId: c.membreId } : {}),
    });
  };
  return (
    <Modal title="Ajouter une personne" onClose={onClose}>
      <p className="muted">{registre ? 'Choisis un membre du club' : 'Choisis une personne qui a déjà un poste dans le club'}, ou crée une nouvelle personne. Tu indiques ensuite son poste et son rôle.</p>
      <div className="row wrap">
        <input className="login-search grow" type="search" autoFocus placeholder="Rechercher un nom, un email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => onPick(null)}>+ Nouvelle personne</button>
      </div>
      <div className="login-list">
        {list.slice(0, 200).map((c) => (
          <button key={c.key} className="login-user" onClick={() => choisir(c)}>
            <Initials prenom={c.prenom} nom={c.nom} couleur={c.couleur} size={36} />
            <span>
              <strong>{nomMembre(c)}{fiche(c) && <small className="muted"> · retiré, à réactiver</small>}</strong>
              <small>{[c.email, c.info].filter(Boolean).join(' · ')}</small>
            </span>
          </button>
        ))}
        {!list.length && <p className="muted">{needle ? `Personne ne correspond à « ${q} ».` : 'Tout le monde fait déjà partie de cette entité.'}</p>}
      </div>
    </Modal>
  );
}
