import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { ADMIN_ROLE_ID } from '../data/permissions';
import { accessAction, type AccessInfo } from '../data/cloud';
import { emailKey, nomMembre } from '../data/membres';
import { norm } from '../data/csv';
import { defaultRoleId, directory, personKey, UNIT_TYPES } from '../data/units';
import type { OrgMember, OrgUnit, Person } from '../data/types';
import { fullName, isDone, uid } from '../data/utils';
import { Avatar, Initials, Modal } from './ui';
import { AccessCell, CredentialsModal, type Shown } from './Acces';

// Les personnes d'une entité, ouvertes depuis l'organigramme : ajouter quelqu'un (« + » sous l'entité),
// voir ou modifier sa fiche (clic sur son nom) : poste, rôles, accès à l'appli, retrait.
// Les coordonnées viennent du registre « Membres du club ».

/** Postes de la personne dans les autres entités du club (même adresse email). */
function useAussi(key: string | undefined, exclure: string | undefined) {
  const club = useClubOptional();
  return useMemo(() => {
    if (!club || !key) return [];
    const e = directory(club.units.filter((u) => !u.archive)).find((x) => x.key === key);
    return (e?.postes ?? []).filter((x) => x.unit.id !== exclure).map((x) => `${x.unit.nom}${x.member.poste ? ` (${x.member.poste})` : ''}`);
  }, [club, key, exclure]);
}

/** Ajouter une personne à l'entité ouverte : choisir quelqu'un du club (sinon nouvelle personne), puis sa fiche. */
export function NouvellePersonne({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const club = useClubOptional();
  const blank = (): Person => ({ id: uid('p'), poste: '', nom: '', prenom: '', email: '', telephone: '', roles: [defaultRoleId(data.roles)], actif: true, couleur: '#0f766e' });
  const [fiche, setFiche] = useState<Person | null>(() => (club ? null : blank()));
  if (!fiche) return <AjouterPersonne onPick={(p) => setFiche(p ?? blank())} onClose={onClose} />;
  return <ModifierPersonne person={fiche} onClose={onClose} />;
}

/** Fiche d'une personne de l'entité ouverte : modifiable par ceux qui gèrent les personnes, sinon en lecture. */
export function FichePersonne({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, can } = useStore();
  const club = useClubOptional();
  const p = data.people.find((x) => x.id === id);
  const aussi = useAussi(p && club ? personKey(p, club.current.id) : undefined, club?.current.id);
  if (!p) return null;
  if (can('people.manage') || can('admin.access')) return <ModifierPersonne person={p} onClose={onClose} />;
  // Coordonnées : pour qui a le droit de les voir (rôle), comme l'ancienne page des responsables.
  const contact = can('tab.people');
  const open = data.tasks.filter((t) => t.responsables.includes(p.id) && !isDone(data, t)).length;
  return (
    <FicheLecture
      titre={fullName(p)}
      avatar={<Avatar id={p.id} size={56} />}
      poste={p.poste}
      autresPostes={p.autresPostes}
      email={contact ? p.email : undefined}
      telephone={contact ? p.telephone : undefined}
      roles={data.roles.filter((r) => p.roles.includes(r.id)).map((r) => ({ label: r.label, couleur: r.couleur }))}
      aussi={aussi}
      taches={{ id: p.id, n: open }}
      onClose={onClose}
    />
  );
}

/** Fiche d'une personne d'une autre entité (organigramme) : en lecture ; un admin de l'entité l'y ouvre pour la modifier. */
export function FicheMembre({ u, m, onModifier, onClose }: { u: OrgUnit; m: OrgMember; onModifier?: () => void; onClose: () => void }) {
  const aussi = useAussi(personKey(m, u.id), u.id);
  return (
    <FicheLecture
      titre={nomMembre(m) || m.poste}
      avatar={<Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={56} />}
      entite={`${UNIT_TYPES[u.type].icon} ${u.nom}`}
      poste={m.poste || (m.admin ? UNIT_TYPES[u.type].chef : '')}
      autresPostes={m.autresPostes}
      email={m.email}
      roles={m.roles.map((label) => ({ label, couleur: u.couleur }))}
      aussi={aussi}
      action={onModifier && <button className="btn primary" onClick={onModifier}>Modifier dans « {u.nom} »</button>}
      onClose={onClose}
    />
  );
}

function FicheLecture(f: {
  titre: string;
  avatar: ReactNode;
  entite?: string;
  poste: string;
  autresPostes?: string;
  email?: string;
  telephone?: string;
  roles: { label: string; couleur: string }[];
  aussi: string[];
  taches?: { id: string; n: number };
  action?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal title={f.titre} onClose={f.onClose}>
      <div className="person fiche-personne">
        {f.avatar}
        <div className="grow">
          {f.entite && <small className="muted">{f.entite}</small>}
          {(f.poste || f.autresPostes) && <strong>{[f.poste, f.autresPostes].filter(Boolean).join(' · ')}</strong>}
          {f.email && <a href={`mailto:${f.email}`}>✉ {f.email}</a>}
          {f.telephone && <a href={`tel:${f.telephone.replace(/\s/g, '')}`}>📱 {f.telephone}</a>}
          {f.roles.length > 0 && (
            <span className="person-roles">
              {f.roles.map((r) => <span key={r.label} className="badge" style={{ background: r.couleur }}>{r.label}</span>)}
            </span>
          )}
          {f.aussi.length > 0 && <small className="muted also">Aussi : {f.aussi.join(' · ')}</small>}
          {f.taches && <Link to={`/taches?resp=${f.taches.id}`} className="muted">{f.taches.n} tâche(s) ouverte(s) →</Link>}
        </div>
      </div>
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={f.onClose}>Fermer</button>
        {f.action}
      </div>
    </Modal>
  );
}

/** Fiche modifiable, avec l'accès à l'appli (version réelle, admins de l'entité). */
function ModifierPersonne({ person, onClose }: { person: Person; onClose: () => void }) {
  const { data, can, update, cloud } = useStore();
  const club = useClubOptional();
  const [access, setAccess] = useState<AccessInfo[] | null>(null);
  const [accessErr, setAccessErr] = useState('');
  const [shown, setShown] = useState<Shown | null>(null);
  const committeeId = can('admin.access') && data.people.some((x) => x.id === person.id) ? cloud?.membership.committeeId : undefined;
  const loadAccess = () => {
    if (!committeeId) return;
    accessAction<{ acces: AccessInfo[] }>({ action: 'liste', committeeId })
      .then((r) => {
        setAccess(r.acces);
        setAccessErr('');
      })
      .catch((e: Error) => setAccessErr(`Accès : ${e.message}`));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadAccess, [committeeId]);
  return (
    <>
    <PersonModal
      person={person}
      central={!club || club.current.type === 'central'}
      access={access}
      accessErr={accessErr}
      onAccessChange={loadAccess}
      onShow={setShown}
      onSave={(p, action) => {
        const isNew = !data.people.some((x) => x.id === p.id);
        update((d) => {
          d.people = isNew ? [...d.people, p] : d.people.map((x) => (x.id === p.id ? p : x));
        }, action);
      }}
      onClose={onClose}
    />
    {shown && <CredentialsModal {...shown} onClose={() => setShown(null)} />}
    </>
  );
}

/** Fiche d'une personne de l'entité : coordonnées, poste, rôles, accès à l'appli, retrait. */
function PersonModal({ person, central, access, accessErr, onAccessChange, onShow, onSave, onClose }: {
  person: Person;
  central: boolean;
  access: AccessInfo[] | null;
  accessErr?: string;
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
  const aussi = useAussi(before && club ? personKey(before, club.current.id) : undefined, club?.current.id);
  const open = before ? data.tasks.filter((t) => t.responsables.includes(before.id) && !isDone(data, t)).length : 0;

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
      {before?.actif && (
        <p className="fiche-infos muted">
          {aussi.length > 0 && <span>Aussi : {aussi.join(' · ')}</span>}
          <Link to={`/taches?resp=${before.id}`} onClick={onClose}>{open} tâche(s) ouverte(s) →</Link>
        </p>
      )}
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
      {cloud && admin && (isNew || reactiver) && <p className="muted small-note">Accès à l’appli : à créer une fois la fiche enregistrée (clic sur son nom dans l’organigramme).</p>}
      {accessErr && <p className="error">{accessErr}</p>}
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
  /** Personne retirée de l'entité (à réactiver). */
  personId?: string;
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
    data.people.find((p) => (c.personId && p.id === c.personId) || (c.membreId && p.membreId === c.membreId) || (c.email && emailKey(p.email) === emailKey(c.email)));
  const candidats = registre ?? annuaire;
  // Personnes retirées de l'entité qui ne sont plus ailleurs dans le club : elles restent à réactiver.
  const retirees: Candidat[] = data.people
    .filter((p) => !p.actif && !candidats.some((c) => fiche(c)?.id === p.id))
    .map((p) => ({ key: `ret:${p.id}`, prenom: p.prenom, nom: p.nom, email: p.email, telephone: p.telephone, couleur: p.couleur, membreId: p.membreId, personId: p.id, info: p.poste }));
  const needle = norm(q);
  const list = [...candidats, ...retirees]
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
