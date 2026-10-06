import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClub, type CreatedUnit, type NewMember, type NewUnit } from '../data/club';
import { arbreEntites, CENTRAL_ACCESS, centralAccess, directory, orgMembers, parentDans, postesEntite, sousEntites, SUB_TYPES, UNIT_COLORS, UNIT_TYPES, visitLevel, type Branche, type DirectoryEntry } from '../data/units';
import type { CentralAccess, OrgMember, OrgUnit, Unit, UnitType } from '../data/types';
import { fmtRange, posteBesideName } from '../data/utils';
import { Empty, Initials, Modal, UnitMark } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { CredentialsModal } from '../components/Acces';
import { CentralAccessChoice } from '../components/CentralAccess';
import { NouvellePersonne } from './People';

// Organigramme du club : un arbre (comité central en haut), chaque entité reliée par un trait à celle dont elle dépend.
// Un clic sur une entité affiche ses membres et permet de l'ouvrir. Sous chaque entité : ses postes (sans les noms),
// et un bouton « + » pour y ajouter une personne (entité ouverte, ou entité dont on est admin : on l'ouvre d'abord).
// Visible de tous les membres du club ; seul le comité central crée et modifie les entités,
// chaque président / responsable peut modifier la fiche de la sienne et choisir ce que le comité central
// peut faire de ses données (rien voir, consulter, ou aussi modifier / ajouter des tâches).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dated = (t: UnitType) => t === 'sous-comite' || t === 'equipe';

export function Org() {
  const club = useClub();
  const { data, can } = useStore();
  const [view, setView] = useState<'entites' | 'personnes'>('entites');
  const [edit, setEdit] = useState<{ unit?: OrgUnit } | null>(null);
  const [created, setCreated] = useState<{ c: CreatedUnit; n: NewUnit } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  // Arrivée depuis le « + » d'une autre entité (?ajouter=<entité>) : ajout ouvert une fois l'entité chargée.
  const [params, setParams] = useSearchParams();
  const demande = params.get('ajouter');
  const peutAjouter = can('people.manage');
  useEffect(() => {
    if (!demande || demande !== club.current.id) return;
    setParams({}, { replace: true });
    if (peutAjouter) setAjout(true);
  }, [demande, club.current.id, peutAjouter, setParams]);
  // Relire l'organigramme à l'ouverture (changements faits dans d'autres entités).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    club.refresh();
  }, []);

  // L'entité ouverte : ses membres tels qu'ils sont maintenant (modifications pas encore relues).
  const units = useMemo(() => club.units.map((u) => (u.id === club.current.id ? { ...u, membres: orgMembers(data) } : u)), [club.units, club.current.id, data]);
  const active = units.filter((u) => !u.archive);
  const archived = units.filter((u) => u.archive);
  const people = useMemo(() => directory(active), [active]);
  const canEdit = (u: OrgUnit) => club.canManage || u.moiAdmin;
  const detail = units.find((u) => u.id === detailId);
  const ajouter = (u: OrgUnit): (() => void) | undefined => {
    if (u.archive) return undefined;
    if (u.id === club.current.id) return peutAjouter ? () => setAjout(true) : undefined;
    return u.moiAdmin && club.mine.some((x) => x.id === u.id) ? () => club.switchUnit(u.id, `#/organigramme?ajouter=${u.id}`) : undefined;
  };

  return (
    <div>
      <div className="page-head">
        <h1>🏛️ Organigramme du club</h1>
        {club.canManage && <button className="btn primary" onClick={() => setEdit({})}>+ Nouvelle entité</button>}
      </div>
      <p className="muted small-note">
        Les traits relient chaque entité à celle dont elle dépend. Clique sur une entité pour voir ses membres et l’ouvrir.
        {club.error && <span className="error"> {club.error}</span>}
      </p>
      <div className="seg wrap org-seg">
        <button className={view === 'entites' ? 'on' : ''} onClick={() => setView('entites')}>Entités <span className="count">{active.length}</span></button>
        <button className={view === 'personnes' ? 'on' : ''} onClick={() => setView('personnes')}>Personnes <span className="count">{people.length}</span></button>
      </div>

      {view === 'entites' ? (
        <>
          {active.length ? <Arbre units={active} onOpen={(u) => setDetailId(u.id)} ajouter={ajouter} /> : <Empty>Aucune entité.</Empty>}
          <p className="arbre-legende muted small-note">
            {(['central', ...SUB_TYPES] as UnitType[]).map((t) => <span key={t}>{UNIT_TYPES[t].icon} {UNIT_TYPES[t].label}</span>)}
            <span>★ {UNIT_TYPES.central.chef} / responsable</span>
            <span title={CENTRAL_ACCESS.lecture.aide}>👁 / ✏️ le comité central peut consulter / modifier ses tâches</span>
          </p>
          {archived.length > 0 && (
            <details className="org-archives">
              <summary>🗄️ Entités archivées ({archived.length})</summary>
              <div className="arbre-archives">{archived.map((u) => <Noeud key={u.id} u={u} onOpen={() => setDetailId(u.id)} />)}</div>
            </details>
          )}
        </>
      ) : (
        <Directory people={people} />
      )}

      {detail && (
        <Modal title={detail.nom} onClose={() => setDetailId(null)}>
          <UnitCard u={detail} onEdit={canEdit(detail) ? () => { setDetailId(null); setEdit({ unit: detail }); } : undefined} />
        </Modal>
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
      {ajout && <NouvellePersonne onClose={() => setAjout(false)} />}
    </div>
  );
}

// Largeur d'une colonne de l'arbre (carte + marges) : en dessous, l'arbre se présente de haut en bas, décalé à droite.
const COLONNE = 216;

/** L'arbre : de haut en bas comme un arbre généalogique, ou en liste décalée (téléphone, ou trop d'entités côte à côte). */
function Arbre({ units, onOpen, ajouter }: { units: OrgUnit[]; onOpen: (u: OrgUnit) => void; ajouter: (u: OrgUnit) => (() => void) | undefined }) {
  const racines = useMemo(() => arbreEntites(units), [units]);
  const cadre = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return;
    setLargeur(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const feuilles = (b: Branche<OrgUnit>): number => (b.enfants.length ? b.enfants.reduce((n, x) => n + feuilles(x), 0) : 1);
  const vertical = largeur < racines.reduce((n, b) => n + feuilles(b), 0) * COLONNE;
  const branche = (b: Branche<OrgUnit>) => (
    <li key={b.u.id}>
      <Noeud u={b.u} onOpen={() => onOpen(b.u)} onAjouter={ajouter(b.u)} />
      {b.enfants.length > 0 && <ul>{b.enfants.map(branche)}</ul>}
    </li>
  );
  return (
    <div ref={cadre} className="arbre-cadre">
      <ul className={`arbre ${vertical ? 'vertical' : 'haut'}`}>{racines.map(branche)}</ul>
    </div>
  );
}

/** Une entité dans l'arbre : nom, type, nombre de membres, puis ses postes (sans les noms des personnes),
 *  et le bouton « + » pour y ajouter une personne quand on en a le droit. */
function Noeud({ u, onOpen, onAjouter }: { u: OrgUnit; onOpen: () => void; onAjouter?: () => void }) {
  const club = useClub();
  const t = UNIT_TYPES[u.type];
  const postes = postesEntite(u.membres, t.chef);
  const access = centralAccess(u);
  const ouverte = u.id === club.current.id;
  return (
    <div className={`arbre-noeud ${ouverte ? 'ouverte' : ''} ${u.archive ? 'archived' : ''}`} style={{ borderTopColor: u.couleur }}>
      <button type="button" className="arbre-ouvrir" onClick={onOpen}>
        <span className="arbre-tete">
          <UnitMark className="org-icon" logo={u.logo} couleur={u.couleur} icon={t.icon} />
          <span className="arbre-texte">
            <strong>{u.nom}</strong>
            <small>{t.label}{u.date && ` · ${fmtRange(u.date, u.dateFin)}`}</small>
            <small>
              {u.membres.length} membre{u.membres.length > 1 ? 's' : ''}
              {ouverte ? ' · ouverte' : u.moi ? ' · tu en fais partie' : ''}
            </small>
          </span>
        </span>
        <span className="arbre-postes">
          {!postes.some((p) => p.chef) && <span className="poste muted">★ {t.chef} : à désigner</span>}
          {postes.map((p) => (
            <span key={p.label} className={`poste ${p.chef ? 'chef' : ''}`}>
              {p.chef && <span className="org-star">★ </span>}
              {p.label}
              {p.n > 1 && <span className="muted"> ×{p.n}</span>}
            </span>
          ))}
        </span>
      </button>
      {onAjouter && (
        <button type="button" className="arbre-ajout" title={ouverte ? `Ajouter une personne à « ${u.nom} »` : `Ouvrir « ${u.nom} » et y ajouter une personne`} onClick={onAjouter}>
          + Ajouter une personne
        </button>
      )}
      {access !== 'aucun' && <span className="arbre-acces" title={`Comité central : ${CENTRAL_ACCESS[access].label.toLowerCase()}`}>{CENTRAL_ACCESS[access].icon}</span>}
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
            {u.date && ` · ${fmtRange(u.date, u.dateFin)}`}
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
  const [dateFin, setDateFin] = useState(unit?.dateFin ?? '');
  const [description, setDescription] = useState(unit?.description ?? '');
  const [archive, setArchive] = useState(!!unit?.archive);
  const [logo, setLogo] = useState(unit?.logo);
  // Dans l'organigramme : l'entité dont elle dépend (pas elle-même, ni une entité qui dépend d'elle).
  const actives = club.units.filter((u) => !u.archive);
  const centralUnit = actives.find((u) => u.type === 'central');
  const exclus = unit ? [unit.id, ...sousEntites(actives, unit.id)] : [];
  const possibles = actives.filter((u) => !exclus.includes(u.id));
  const [dependDe, setDependDe] = useState(() => (unit ? parentDans(actives, unit)?.id : undefined) ?? centralUnit?.id ?? '');
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
    if (dated(type) && dateFin && (!date || dateFin < date)) return setErr('Le dernier jour de l’événement ne peut pas précéder le premier.');
    const jour = dated(type) && date ? date : undefined;
    const base: Partial<Unit> = { nom: nom.trim(), couleur, description: description.trim() || undefined, date: jour, dateFin: jour && dateFin > jour ? dateFin : undefined };
    const lien = dependDe && dependDe !== centralUnit?.id ? dependDe : undefined;
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
          ...(base as Pick<Unit, 'nom' | 'couleur' | 'description' | 'date' | 'dateFin'>),
          type,
          dependDe: lien,
          chef,
          membres: membres.map((k) => dir.find((e) => e.key === k)).filter((e): e is DirectoryEntry => !!e && e.key !== chefKey).map((e) => fromDirectory(e, '')),
        };
        onCreated(await club.createUnit(n), n);
      } else {
        const access = ownsAccess ? { central } : {};
        const image = logo !== unit.logo ? { logo } : {};
        await club.updateUnit(unit.id, manage ? { ...base, type, archive, dependDe: lien, ...access, ...image } : { ...base, ...access, ...image });
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
        {!isCentral && (isNew || manage) && possibles.length > 1 && (
          <label>
            Dépend de <small className="muted">(trait dans l’organigramme)</small>
            <select value={dependDe} onChange={(e) => setDependDe(e.target.value)}>
              {possibles.map((u) => <option key={u.id} value={u.id}>{UNIT_TYPES[u.type].icon} {u.nom}</option>)}
            </select>
          </label>
        )}
        {dated(type) && (
          <>
            <label>
              Date de l’événement (prochaine édition)
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Dernier jour <small className="muted">(si plusieurs jours)</small>
              <input type="date" value={dateFin} min={date || undefined} onChange={(e) => setDateFin(e.target.value)} />
            </label>
          </>
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
                Facultatif : le {info.chef.toLowerCase()} pourra ajouter ensuite les autres membres, régler leurs rôles et créer leurs accès depuis Personnes › Membres de l’entité.
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
