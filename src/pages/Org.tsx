import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useClub, type CreatedUnit, type NewMember, type NewUnit } from '../data/club';
import { CENTRAL_ACCESS, centralAccess, directory, orgMembers, SUB_TYPES, UNIT_COLORS, UNIT_TYPES, visitLevel, type DirectoryEntry } from '../data/units';
import type { CentralAccess, OrgMember, OrgUnit, Unit, UnitType } from '../data/types';
import { fmtDate, posteBesideName } from '../data/utils';
import { Empty, Initials, Modal, UnitMark } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { CredentialsModal } from './Admin';
import { CentralAccessChoice } from '../components/CentralAccess';

// Organigramme du club : comité central, sous-comités, groupes et équipes d'événement, avec leurs membres.
// Visible de tous les membres du club ; seul le comité central crée et modifie les entités,
// chaque président / responsable peut modifier la fiche de la sienne et choisir ce que le comité central
// peut faire de ses données (rien voir, consulter, ou aussi modifier / ajouter des tâches).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dated = (t: UnitType) => t === 'sous-comite' || t === 'equipe';

export function Org() {
  const club = useClub();
  const { data } = useStore();
  const [view, setView] = useState<'entites' | 'personnes'>('entites');
  const [edit, setEdit] = useState<{ unit?: OrgUnit } | null>(null);
  const [created, setCreated] = useState<{ c: CreatedUnit; n: NewUnit } | null>(null);
  // Relire l'organigramme à l'ouverture (changements faits dans d'autres entités).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => club.refresh(), []);

  // L'entité ouverte : ses membres tels qu'ils sont maintenant (modifications pas encore relues).
  const units = useMemo(() => club.units.map((u) => (u.id === club.current.id ? { ...u, membres: orgMembers(data) } : u)), [club.units, club.current.id, data]);
  const active = units.filter((u) => !u.archive);
  const archived = units.filter((u) => u.archive);
  const central = active.find((u) => u.type === 'central');
  const people = useMemo(() => directory(active), [active]);
  const canEdit = (u: OrgUnit) => club.canManage || u.moiAdmin;
  const card = (u: OrgUnit) => <UnitCard key={u.id} u={u} onEdit={canEdit(u) ? () => setEdit({ unit: u }) : undefined} />;

  return (
    <div>
      <div className="page-head">
        <h1>🏛️ Organigramme du club</h1>
        {club.canManage && <button className="btn primary" onClick={() => setEdit({})}>+ Nouvelle entité</button>}
      </div>
      <p className="muted small-note">
        Chaque entité a ses propres tâches, rôles, sections et statuts, invisibles des autres. Chacune peut envoyer une demande au comité central
        (page d’accueil) et lui ouvrir ses données : 👁 consulter, ou ✏️ aussi modifier / ajouter des tâches (réglage de ses admins).
        {club.error && <span className="error"> {club.error}</span>}
      </p>
      <div className="seg wrap org-seg">
        <button className={view === 'entites' ? 'on' : ''} onClick={() => setView('entites')}>Entités <span className="count">{active.length}</span></button>
        <button className={view === 'personnes' ? 'on' : ''} onClick={() => setView('personnes')}>Personnes <span className="count">{people.length}</span></button>
      </div>

      {view === 'entites' ? (
        <>
          {central && <div className="org-central">{card(central)}</div>}
          {SUB_TYPES.map((type) => {
            const list = active.filter((u) => u.type === type);
            return (
              <section key={type} className="org-branch">
                <h2>{UNIT_TYPES[type].icon} {UNIT_TYPES[type].plural} <span className="count">{list.length}</span></h2>
                <p className="muted small-note">{UNIT_TYPES[type].aide}</p>
                {list.length ? <div className="org-grid">{list.map(card)}</div> : <Empty>Aucun pour l’instant.</Empty>}
              </section>
            );
          })}
          {archived.length > 0 && (
            <details className="org-archives">
              <summary>🗄️ Entités archivées ({archived.length})</summary>
              <div className="org-grid">{archived.map(card)}</div>
            </details>
          )}
        </>
      ) : (
        <Directory people={people} />
      )}

      {edit && (
        <UnitModal
          unit={edit.unit}
          onClose={() => setEdit(null)}
          onCreated={(c, n) => {
            setEdit(null);
            setCreated({ c, n });
            club.refresh();
          }}
        />
      )}
      {created && <Created {...created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function UnitCard({ u, onEdit }: { u: OrgUnit; onEdit?: () => void }) {
  const club = useClub();
  const [all, setAll] = useState(false);
  const t = UNIT_TYPES[u.type];
  const isCurrent = u.id === club.current.id;
  const access = centralAccess(u);
  // Membre du comité central : entité ouverte au comité central dont il ne fait pas partie.
  const visit = !isCurrent && visitLevel(u, club.central);
  const chefs = u.membres.filter((m) => m.admin);
  const others = u.membres.filter((m) => !m.admin);
  const shown = all ? others : others.slice(0, 6);
  return (
    <article className={`panel org-card ${u.archive ? 'archived' : ''}`} style={{ borderTopColor: u.couleur }}>
      <div className="org-card-head">
        <UnitMark className="org-icon" logo={u.logo} couleur={u.couleur} icon={t.icon} />
        <div className="grow">
          <strong>{u.nom}</strong>
          <small className="muted">
            {t.label}
            {u.date && ` · ${fmtDate(u.date)}`}
            {` · ${u.membres.length} membre${u.membres.length > 1 ? 's' : ''}`}
            {u.archive && ' · archivée'}
            {u.moi && !isCurrent && ' · tu en fais partie'}
          </small>
        </div>
        {isCurrent && <span className="badge" style={{ background: u.couleur }}>Ouverte</span>}
      </div>
      {access !== 'aucun' && (
        <span className={`badge central-access ${access}`} title={CENTRAL_ACCESS[access].aide}>
          {CENTRAL_ACCESS[access].icon} Comité central : {access === 'lecture' ? 'consulter' : 'modifier / ajouter'}
        </span>
      )}
      {u.description && <p className="org-desc">{u.description}</p>}
      <ul className="org-members">
        {chefs.map((m) => <MemberLine key={m.id} m={m} chef={t.chef} />)}
        {!chefs.length && <li className="muted">{t.chef} : à désigner</li>}
        {shown.map((m) => <MemberLine key={m.id} m={m} />)}
      </ul>
      {others.length > 6 && <button className="btn link small" onClick={() => setAll(!all)}>{all ? 'Réduire' : `+ ${others.length - 6} autres`}</button>}
      {((u.moi && !isCurrent) || visit || onEdit) && (
        <div className="org-actions">
          {u.moi && !isCurrent && <button className="btn small primary" onClick={() => club.switchUnit(u.id)}>Ouvrir</button>}
          {visit && (
            <button className="btn small primary" onClick={() => club.switchUnit(u.id)} title={CENTRAL_ACCESS[visit].aide}>
              {visit === 'lecture' ? '👁 Consulter' : '✏️ Ouvrir'}
            </button>
          )}
          {onEdit && <button className="btn small" onClick={onEdit}>Modifier</button>}
        </div>
      )}
    </article>
  );
}

function MemberLine({ m, chef }: { m: OrgMember; chef?: string }) {
  const label = m.poste ? posteBesideName(`${m.prenom} ${m.nom}`, m.poste) : m.roles.filter((r) => !r.startsWith('Admin')).join(', ') || chef || '';
  return (
    <li className={chef ? 'org-chef' : ''} title={m.roles.join(' + ')}>
      <Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={26} />
      <span className="grow">
        <b>{m.prenom} {m.nom}</b>
        {chef && <span className="org-star" title={`${chef} (admin de l’entité)`}> ★</span>}
        {label && <small className="muted"> · {label}</small>}
      </span>
    </li>
  );
}

function Directory({ people }: { people: DirectoryEntry[] }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = people.filter((e) => `${e.prenom} ${e.nom} ${e.email} ${e.postes.map((p) => `${p.unit.nom} ${p.member.poste}`).join(' ')}`.toLowerCase().includes(needle));
  return (
    <>
      <input className="login-search org-search" type="search" placeholder="Rechercher un nom, une entité, un poste…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="people">
        {list.map((e) => (
          <article key={e.key} className="panel person">
            <Initials prenom={e.prenom} nom={e.nom} couleur={e.couleur} size={44} />
            <div className="grow">
              <strong>{e.prenom} {e.nom}</strong>
              {e.email && <a href={`mailto:${e.email}`}>✉ {e.email}</a>}
              <span className="org-pills">
                {e.postes.map((p) => (
                  <span key={p.unit.id} className="role-pill" style={{ background: p.unit.couleur }} title={`${p.unit.nom} · ${p.member.roles.join(' + ')}`}>
                    {p.unit.nom}{p.member.admin ? ' ★' : ''}{posteBesideName(`${e.prenom} ${e.nom}`, p.member.poste) && ` · ${p.member.poste}`}
                  </span>
                ))}
              </span>
            </div>
          </article>
        ))}
      </div>
      {!list.length && <Empty>Personne ne correspond à « {q} ».</Empty>}
      <p className="muted small-note">★ = président ou responsable. Une même personne (même adresse email) peut avoir un poste dans plusieurs entités.</p>
    </>
  );
}

const fromDirectory = (e: DirectoryEntry, poste: string): NewMember => ({ prenom: e.prenom, nom: e.nom, email: e.email, telephone: e.telephone, couleur: e.couleur, poste });

function UnitModal({ unit, onClose, onCreated }: { unit?: OrgUnit; onClose: () => void; onCreated: (c: CreatedUnit, n: NewUnit) => void }) {
  const club = useClub();
  const isNew = !unit;
  const isCentral = unit?.type === 'central';
  // Type et archivage : réservés au comité central.
  const manage = club.canManage && !isCentral;
  const [nom, setNom] = useState(unit?.nom ?? '');
  const [type, setType] = useState<UnitType>(unit?.type ?? 'sous-comite');
  const [couleur, setCouleur] = useState(unit?.couleur ?? UNIT_COLORS[club.units.length % UNIT_COLORS.length]);
  const [date, setDate] = useState(unit?.date ?? '');
  const [description, setDescription] = useState(unit?.description ?? '');
  const [archive, setArchive] = useState(!!unit?.archive);
  const [logo, setLogo] = useState(unit?.logo);
  // Accès du comité central : réglé par les admins de l'entité seulement.
  const [central, setCentral] = useState<CentralAccess>(unit ? centralAccess(unit) : 'aucun');
  const ownsAccess = !!unit && !isCentral && unit.moiAdmin;
  const { update } = useStore();
  const dir = useMemo(() => directory(club.units.filter((u) => !u.archive)), [club.units]);
  const [chefKey, setChefKey] = useState('');
  const [chefNew, setChefNew] = useState({ prenom: '', nom: '', email: '' });
  const [chefPoste, setChefPoste] = useState('');
  const [membres, setMembres] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const info = UNIT_TYPES[type];

  const submit = async () => {
    setErr('');
    if (!nom.trim()) return setErr('Donne un nom à l’entité.');
    const base: Partial<Unit> = { nom: nom.trim(), couleur, description: description.trim() || undefined, date: dated(type) && date ? date : undefined };
    setBusy(true);
    try {
      if (isNew) {
        const entry = dir.find((e) => e.key === chefKey);
        const poste = chefPoste.trim() || info.chef;
        const chef: NewMember | null = chefKey === 'new' ? { ...chefNew, prenom: chefNew.prenom.trim(), nom: chefNew.nom.trim(), email: chefNew.email.trim(), couleur, poste } : entry ? fromDirectory(entry, poste) : null;
        if (!chef) throw new Error(`Choisis le ${info.chef.toLowerCase()} de l’entité.`);
        if (!chef.prenom) throw new Error(`Indique le prénom du ${info.chef.toLowerCase()}.`);
        if (!EMAIL.test(chef.email)) throw new Error(`Il faut une adresse email valable pour le ${info.chef.toLowerCase()} : c’est elle qui lui donne accès.`);
        const n: NewUnit = {
          ...(base as Pick<Unit, 'nom' | 'couleur' | 'description' | 'date'>),
          type,
          chef,
          membres: membres.map((k) => dir.find((e) => e.key === k)).filter((e): e is DirectoryEntry => !!e && e.key !== chefKey).map((e) => fromDirectory(e, '')),
        };
        onCreated(await club.createUnit(n), n);
      } else {
        const access = ownsAccess ? { central } : {};
        const image = logo !== unit.logo ? { logo } : {};
        await club.updateUnit(unit.id, manage ? { ...base, type, archive, ...access, ...image } : { ...base, ...access, ...image });
        if (ownsAccess && central !== centralAccess(unit) && unit.id === club.current.id) update(() => {}, `Accès du comité central : ${CENTRAL_ACCESS[central].label}`);
        onClose();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addable = dir.filter((e) => e.key !== chefKey && !membres.includes(e.key));
  return (
    <Modal title={isNew ? 'Nouvelle entité du club' : `Modifier « ${unit.nom} »`} onClose={onClose} wide>
      <div className="form">
        <label className="full">
          Nom
          <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. CO Bruntrutaine, École de cyclisme, Souper de soutien…" />
        </label>
        {!isCentral && (
          <label>
            Type
            <select value={type} disabled={!isNew && !manage} onChange={(e) => setType(e.target.value as UnitType)}>
              {SUB_TYPES.map((t) => <option key={t} value={t}>{UNIT_TYPES[t].icon} {UNIT_TYPES[t].label}</option>)}
            </select>
          </label>
        )}
        {dated(type) && (
          <label>
            Date de l’événement
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        {!isCentral && <p className="full muted small-note">{info.aide}</p>}
        <div className="full">
          <span className="field-label">Couleur</span>
          <div className="swatches">
            {UNIT_COLORS.map((c) => (
              <button key={c} type="button" className={`swatch ${c === couleur ? 'on' : ''}`} style={{ background: c }} onClick={() => setCouleur(c)} aria-label={`Couleur ${c}`} />
            ))}
          </div>
        </div>
        {!isNew && (
          <div className="full">
            <span className="field-label">{isCentral ? 'Logo du club' : 'Logo (ex. celui de la manifestation)'}</span>
            <ImagePicker kind="logo" value={logo} onChange={setLogo} empty={isCentral ? 'Pas de logo : icône de l’appli' : 'Pas de logo : celui du club'} />
            <small className="muted">Affiché en haut de l’appli et sur l’ordre du jour et le PV ; il devient aussi l’icône de l’appli.</small>
          </div>
        )}
        <label className="full">
          Description
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ce que fait l’entité (facultatif)" />
        </label>

        {isNew && (
          <>
            <h2>{info.chef} (admin de l’entité)</h2>
            <label className="full">
              Personne
              <select value={chefKey} onChange={(e) => setChefKey(e.target.value)}>
                <option value="">— Choisir dans l’annuaire du club —</option>
                {dir.map((e) => (
                  <option key={e.key} value={e.key} disabled={!e.email}>
                    {e.prenom} {e.nom}{e.email ? ` · ${e.postes.map((p) => p.unit.nom).join(', ')}` : ' (pas d’adresse email)'}
                  </option>
                ))}
                <option value="new">+ Nouvelle personne</option>
              </select>
            </label>
            {chefKey === 'new' && (
              <>
                <label>Prénom<input value={chefNew.prenom} onChange={(e) => setChefNew({ ...chefNew, prenom: e.target.value })} /></label>
                <label>Nom<input value={chefNew.nom} onChange={(e) => setChefNew({ ...chefNew, nom: e.target.value })} /></label>
                <label className="full">Adresse email<input type="email" value={chefNew.email} onChange={(e) => setChefNew({ ...chefNew, email: e.target.value })} /></label>
              </>
            )}
            <label className="full">
              Poste
              <input value={chefPoste} onChange={(e) => setChefPoste(e.target.value)} placeholder={info.chef} />
            </label>
            <h2>Membres de départ</h2>
            <div className="full">
              <div className="chips">
                {membres.map((k) => {
                  const e = dir.find((x) => x.key === k);
                  return e ? (
                    <span key={k} className="chip on">
                      {e.prenom} {e.nom}
                      <button type="button" className="chip-x" onClick={() => setMembres(membres.filter((x) => x !== k))} aria-label="Retirer">✕</button>
                    </span>
                  ) : null;
                })}
              </div>
              <select value="" onChange={(e) => e.target.value && setMembres([...membres, e.target.value])}>
                <option value="">+ Ajouter une personne de l’annuaire…</option>
                {addable.map((e) => <option key={e.key} value={e.key}>{e.prenom} {e.nom}</option>)}
              </select>
              <p className="muted small-note">
                Facultatif : le {info.chef.toLowerCase()} pourra ajouter ensuite les autres membres, régler leurs rôles et créer leurs accès depuis sa console admin.
              </p>
            </div>
          </>
        )}

        {!isNew && !isCentral && (
          <div className="full">
            <span className="field-label">Accès du comité central</span>
            <CentralAccessChoice name="central-unit" value={central} onChange={setCentral} disabled={!ownsAccess} />
            {!ownsAccess && <p className="muted small-note">Réglé par les admins (★) de l’entité.</p>}
          </div>
        )}
        {!isNew && manage && (
          <label className="full inline">
            <input type="checkbox" checked={archive} onChange={(e) => setArchive(e.target.checked)} />
            Archiver (événement passé) : l’entité disparaît des menus, ses données sont gardées.
          </label>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : isNew ? 'Créer l’entité' : 'Enregistrer'}</button>
      </div>
    </Modal>
  );
}

/** Après la création : accès du président (version réelle) ou simple confirmation (démo). */
function Created({ c, n, onClose }: { c: CreatedUnit; n: NewUnit; onClose: () => void }) {
  const club = useClub();
  const chef = UNIT_TYPES[n.type].chef.toLowerCase();
  if (c.avertissement)
    return (
      <Modal title="Entité créée" onClose={onClose}>
        <p>« {n.nom} » est créé.</p>
        <p className="error">{c.avertissement}</p>
        <div className="modal-foot"><span className="grow" /><button className="btn primary" onClick={onClose}>Fermer</button></div>
      </Modal>
    );
  if (c.email)
    return <CredentialsModal person={n.chef} email={c.email} password={c.password} existant={c.existant} intro={`« ${n.nom} » est créé. ${n.chef.prenom} en est le ${chef} : voici son accès.`} onClose={onClose} />;
  const mine = club.units.find((u) => u.id === c.unitId)?.moi;
  return (
    <Modal title="Entité créée" onClose={onClose}>
      <p>
        « {n.nom} » est créé, avec {n.chef.prenom} {n.chef.nom} comme {chef}
        {n.membres.length > 0 && ` et ${n.membres.length} membre${n.membres.length > 1 ? 's' : ''}`}.
      </p>
      <p className="muted">Démo : pour y entrer, connecte-toi en tant que {n.chef.prenom} (« Changer » en haut à droite).</p>
      <div className="modal-foot">
        <span className="grow" />
        {mine && <button className="btn" onClick={() => club.switchUnit(c.unitId)}>Ouvrir « {n.nom} »</button>}
        <button className="btn primary" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
