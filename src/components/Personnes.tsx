import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { ADMIN_ROLE_ID } from '../data/permissions';
import { accessAction, type AccessInfo } from '../data/cloud';
import { emailKey, nomMembre } from '../data/membres';
import { norm } from '../data/csv';
import { defaultRoleId, directory, personKey, UNIT_TYPES } from '../data/units';
import { roleDuLien } from '../data/liens';
import type { OrgMember, OrgUnit, Person } from '../data/types';
import { fullName, isDone, uid } from '../data/utils';
import { Avatar, Initials, Modal, UnitMark } from './ui';
import { AccessCell, CredentialsModal, type Shown } from './Acces';

// Les personnes d'une entité, ouvertes depuis l'organigramme : ajouter quelqu'un (« + » sous l'entité),
// voir ou modifier sa fiche (clic sur son nom) : poste, rôles, accès à l'appli, retrait.
// Les coordonnées viennent du registre « Membres du club ».
// On peut aussi y ajouter toute une entité : ses membres en font partie et suivent (voir data/liens.ts).

/** Nom de l'entité par laquelle une fiche liée fait partie de l'entité. */
function useVia(id: string | undefined) {
  const club = useClubOptional();
  if (!id) return '';
  return club?.units.find((u) => u.id === id)?.nom ?? 'une autre entité';
}

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
  const via = useVia(p?.viaEntite);
  if (!p) return null;
  if (can('people.manage') || can('admin.access')) return <ModifierPersonne person={p} onClose={onClose} />;
  // Coordonnées : pour qui a le droit de les voir (rôle), comme l'ancienne page des responsables.
  const contact = can('tab.people');
  const open = data.tasks.filter((t) => t.responsables.includes(p.id) && !isDone(data, t)).length;
  return (
    <FicheLecture
      titre={fullName(p)}
      avatar={<Avatar id={p.id} size={56} />}
      entite={via ? `👥 Avec les membres de « ${via} »` : undefined}
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
  const via = useVia(m.viaEntite);
  return (
    <FicheLecture
      titre={nomMembre(m) || m.poste}
      avatar={<Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={56} />}
      entite={`${UNIT_TYPES[u.type].icon} ${u.nom}${via ? ` · avec les membres de « ${via} »` : ''}`}
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
  // Fiche liée : membre parce qu'elle fait partie d'une autre entité (lien « Membres de »).
  const via = useVia(v.viaEntite);
  const ici = club?.current.nom ?? 'l’entité';

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
    if (!before) return;
    // Fiche liée : retirée à la main, elle ne revient pas avec le lien (la personne reste dans l'autre entité).
    if (before.viaEntite) {
      if (!confirm(`Retirer ${fullName(before)} de « ${ici} » ? Elle reste membre de « ${via} », mais ne fera plus partie de « ${ici} ».${cloud ? ' Son accès à « ' + ici + ' » est aussi coupé.' : ''} Ses tâches restent ; tu pourras la réactiver.`)) return;
      onSave({ ...before, actif: false, exclu: true }, `${fullName(before)} retiré de l’entité (membre de « ${via} »)`);
      return onClose();
    }
    if (!confirm(`Retirer ${fullName(before)} de l’entité ?${cloud ? ' Son accès à l’appli est aussi coupé.' : ''} Ses tâches restent ; tu pourras le réactiver.`)) return;
    onSave({ ...before, actif: false }, `${fullName(before)} retiré de l’entité`);
    onClose();
  };

  return (
    <Modal title={isNew ? `Nouveau ${label}` : fullName(person)} onClose={onClose}>
      {before?.actif && via && (
        <p className="lien-note">👥 Fait partie de « {ici} » avec tous les membres de « {via} » : en quittant « {via} », elle quitte aussi « {ici} ».</p>
      )}
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
              // Garde-fous : le rôle Admin ne se retire ni à soi-même ni au dernier admin, et seul un admin le donne ;
              // pas à une fiche liée (membre par une autre entité).
              const locked = !admin || (r.id === ADMIN_ROLE_ID && ((on && (self || lastAdmin)) || (!on && (!user?.roles.includes(ADMIN_ROLE_ID) || !!v.viaEntite))));
              return (
                <button key={r.id} type="button" className={`chip role-chip ${on ? 'on' : ''}`} style={on ? { background: r.couleur, borderColor: r.couleur } : {}} disabled={locked} title={r.id === ADMIN_ROLE_ID && v.viaEntite && !on ? `Membre avec « ${via} » : le rôle Admin se donne à une personne ajoutée elle-même` : undefined} onClick={() => set({ roles: on ? v.roles.filter((x) => x !== r.id) : [...v.roles, r.id] })}>
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
  const { data, user } = useStore();
  const club = useClubOptional()!;
  const [q, setQ] = useState('');
  const [entite, setEntite] = useState<OrgUnit | null>(null);
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
  // Sa fiche dans l'entité (active d'abord : une fiche liée active passe avant une ancienne fiche retirée).
  const fiche = (c: Candidat) => {
    const l = data.people.filter((p) => (c.personId && p.id === c.personId) || (c.membreId && p.membreId === c.membreId) || (c.email && emailKey(p.email) === emailKey(c.email)));
    return l.find((p) => p.actif) ?? l[0];
  };
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
  // Toute une entité (admins) : ses membres en font partie et suivent.
  const deja = new Set((data.membresDe ?? []).map((l) => l.uniteId));
  const entites = club.liens && user?.roles.includes(ADMIN_ROLE_ID)
    ? units.filter((u) => !u.archive && u.id !== club.current.id && !deja.has(u.id) && (!needle || norm(u.nom).includes(needle)))
    : [];
  const choisir = (c: Candidat) => {
    const ancienne = fiche(c);
    // Ajoutée elle-même : une ancienne fiche liée devient la sienne (elle ne dépend plus de l'autre entité).
    if (ancienne) return onPick({ ...ancienne, actif: true, viaEntite: undefined, viaFiche: undefined, exclu: undefined });
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
  if (entite) return <AjouterEntite u={entite} onBack={() => setEntite(null)} onClose={onClose} />;
  return (
    <Modal title="Ajouter une personne" onClose={onClose}>
      <p className="muted">
        {registre ? 'Choisis un membre du club' : 'Choisis une personne qui a déjà un poste dans le club'}, ou crée une nouvelle personne. Tu indiques ensuite son poste et son rôle.
        {entites.length > 0 && ' Tu peux aussi ajouter toute une entité : tous ses membres en font partie et suivent.'}
      </p>
      <div className="row wrap">
        <input className="login-search grow" type="search" autoFocus placeholder="Rechercher un nom, un email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => onPick(null)}>+ Nouvelle personne</button>
      </div>
      <div className="login-list">
        {entites.map((u) => (
          <button key={u.id} className="login-user entite-choix" onClick={() => setEntite(u)}>
            <UnitMark className="org-icon" logo={u.logo} couleur={u.couleur} icon={UNIT_TYPES[u.type].icon} />
            <span>
              <strong>👥 Tous les membres de « {u.nom} »</strong>
              <small>{UNIT_TYPES[u.type].label} · {u.membres.filter((m) => !m.viaEntite).length} membre(s), qui suivent automatiquement</small>
            </span>
          </button>
        ))}
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

/** Toute une entité parmi les membres de l'entité ouverte : ses membres y arrivent avec le rôle choisi, puis suivent. */
function AjouterEntite({ u, onBack, onClose }: { u: OrgUnit; onBack: () => void; onClose: () => void }) {
  const { data, update, setToast } = useStore();
  const club = useClubOptional()!;
  const roles = data.roles.filter((r) => r.id !== ADMIN_ROLE_ID);
  const [role, setRole] = useState(() => roleDuLien(data) ?? '');
  const membres = u.membres.filter((m) => !m.viaEntite);
  const ici = club.current.nom;
  const ajouter = () => {
    update((d) => {
      d.membresDe = [...(d.membresDe ?? []).filter((l) => l.uniteId !== u.id), { uniteId: u.id, ...(role ? { role } : {}) }];
    }, `Ajout de tous les membres de « ${u.nom} »`);
    setToast(`👥 Les membres de « ${u.nom} » font maintenant partie de « ${ici} »`);
    onClose();
  };
  return (
    <Modal title={`👥 Tous les membres de « ${u.nom} »`} onClose={onClose}>
      <p>
        Les membres de « {u.nom} » font partie de « {ici} ». Qui rejoint ou quitte « {u.nom} » plus tard rejoint ou quitte aussi « {ici} », automatiquement.
        Ceux qui font déjà partie de « {ici} » eux-mêmes ne sont pas doublés ; tu peux toujours ajouter d’autres personnes.
      </p>
      <div className="chips lien-apercu">
        {membres.map((m) => <span key={m.id} className="chip">{nomMembre(m) || m.poste}</span>)}
        {!membres.length && <span className="muted">« {u.nom} » n’a pas encore de membre : ils arriveront avec lui.</span>}
      </div>
      {roles.length > 0 && (
        <label className="lien-role">
          Leur rôle dans « {ici} »
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <small className="muted">Chacun pourra ensuite en changer (clic sur son nom dans l’organigramme). Pas le rôle Admin.</small>
        </label>
      )}
      <div className="modal-foot">
        <button className="btn" onClick={onBack}>‹ Retour</button>
        <span className="grow" />
        <button className="btn primary" onClick={ajouter}>Ajouter les membres de « {u.nom} »</button>
      </div>
    </Modal>
  );
}
