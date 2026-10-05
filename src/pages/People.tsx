import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { defaultRoleId, directory, personKey, UNIT_TYPES } from '../data/units';
import type { Person } from '../data/types';
import { isDone, uid } from '../data/utils';
import { Avatar, Initials, Modal } from '../components/ui';
import { ItemModal } from './Agenda';

export function People() {
  const { data, can, update } = useStore();
  const club = useClubOptional();
  const [edit, setEdit] = useState<Person | null>(null);
  const [picking, setPicking] = useState(false);
  const manage = can('people.manage');
  const people = data.people.filter((p) => p.actif);
  const central = !club || club.current.type === 'central';
  const save = (p: Person) => {
    const isNew = !data.people.some((x) => x.id === p.id);
    update((d) => { d.people = isNew ? [...d.people, p] : d.people.map((x) => (x.id === p.id ? p : x)); }, `${isNew ? 'Ajout' : 'Modification'} ${central ? 'du responsable' : 'du membre'} ${p.prenom} ${p.nom}`);
  };
  const blank = (): Person => ({ id: uid('p'), poste: '', nom: '', prenom: '', email: '', telephone: '', roles: [defaultRoleId(data.roles)], actif: true, couleur: '#0f766e' });

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

  return (
    <div>
      <div className="page-head">
        <h1>{central ? 'Responsables' : 'Membres'}</h1>
        {manage && (
          <span className="row wrap">
            {club && <button className="btn" onClick={() => setPicking(true)}>📇 Depuis l’annuaire du club</button>}
            <button className="btn primary" onClick={() => setEdit(blank())}>+ {central ? 'Nouveau responsable' : 'Nouveau membre'}</button>
          </span>
        )}
      </div>
      <div className="people">
        {people.map((p) => {
          const open = data.tasks.filter((t) => t.responsables.includes(p.id) && !isDone(data, t)).length;
          const also = club ? elsewhere.get(personKey(p, club.current.id)) : undefined;
          return (
            <article key={p.id} className="panel person">
              <Avatar id={p.id} size={48} />
              <div className="grow">
                <small className="muted">{p.poste}{p.autresPostes && ` · ${p.autresPostes}`}</small>
                <strong>{p.prenom} {p.nom}</strong>
                <a href={`mailto:${p.email}`}>✉ {p.email}</a>
                {p.telephone && <a href={`tel:${p.telephone.replace(/\s/g, '')}`}>📱 {p.telephone}</a>}
                {also && <small className="muted also">Aussi : {also.join(' · ')}</small>}
                <Link to={`/taches?resp=${p.id}`} className="muted">{open} tâche(s) ouverte(s) →</Link>
              </div>
              {manage && <button className="btn small" onClick={() => setEdit(p)}>Modifier</button>}
            </article>
          );
        })}
      </div>
      {edit && (
        <ItemModal
          title={central ? 'Responsable' : 'Membre'}
          item={edit}
          fields={[['poste', 'Poste', 'text'], ['autresPostes', 'Autres fonctions (séparées par des virgules)', 'text'], ['nom', 'Nom', 'text'], ['prenom', 'Prénom', 'text'], ['email', 'Adresse email', 'email'], ['telephone', 'Téléphone portable', 'tel']]}
          onSave={save}
          onClose={() => setEdit(null)}
        />
      )}
      {picking && club && (
        <PickFromDirectory
          exclude={new Set(data.people.map((p) => personKey(p, club.current.id)))}
          onPick={(e) => {
            setPicking(false);
            setEdit({ ...blank(), prenom: e.prenom, nom: e.nom, email: e.email, telephone: e.telephone ?? '', couleur: e.couleur });
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {manage && (
        <p className="muted">
          Les rôles d'accès et la désactivation des comptes se gèrent dans la console admin.
          {club && ` Une personne déjà active ailleurs dans le club se reprend avec « Depuis l’annuaire du club » : même adresse email, même compte.`}
        </p>
      )}
    </div>
  );
}

/** Choisir une personne déjà présente dans une autre entité du club. */
function PickFromDirectory({ exclude, onPick, onClose }: { exclude: Set<string>; onPick: (e: ReturnType<typeof directory>[number]) => void; onClose: () => void }) {
  const club = useClubOptional()!;
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = directory(club.units.filter((u) => !u.archive))
    .filter((e) => !exclude.has(e.key))
    .filter((e) => `${e.prenom} ${e.nom} ${e.postes.map((p) => p.unit.nom).join(' ')}`.toLowerCase().includes(needle));
  return (
    <Modal title="Annuaire du club" onClose={onClose}>
      <input className="login-search" type="search" autoFocus placeholder="Rechercher un nom, une entité…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="login-list">
        {list.map((e) => (
          <button key={e.key} className="login-user" onClick={() => onPick(e)}>
            <Initials prenom={e.prenom} nom={e.nom} couleur={e.couleur} size={36} />
            <span>
              <strong>{e.prenom} {e.nom}</strong>
              <small>{e.postes.map((p) => `${UNIT_TYPES[p.unit.type].icon} ${p.unit.nom}${p.member.poste ? ` · ${p.member.poste}` : ''}`).join('  ')}</small>
            </span>
          </button>
        ))}
        {!list.length && <p className="muted">{needle ? `Personne ne correspond à « ${q} ».` : 'Tout l’annuaire fait déjà partie de cette entité.'}</p>}
      </div>
      <p className="muted small-note">Tu complètes ensuite son poste ici ; ses rôles et son accès se règlent dans la console admin.</p>
    </Modal>
  );
}
