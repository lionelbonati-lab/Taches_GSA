import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { Person } from '../data/types';
import { isDone, uid } from '../data/utils';
import { Avatar } from '../components/ui';
import { ItemModal } from './Agenda';

export function People() {
  const { data, can, update } = useStore();
  const [edit, setEdit] = useState<Person | null>(null);
  const manage = can('people.manage');
  const people = data.people.filter((p) => p.actif);
  const save = (p: Person) => {
    const isNew = !data.people.some((x) => x.id === p.id);
    update((d) => { d.people = isNew ? [...d.people, p] : d.people.map((x) => (x.id === p.id ? p : x)); }, `${isNew ? 'Ajout' : 'Modification'} du responsable ${p.prenom} ${p.nom}`);
  };

  return (
    <div>
      <div className="page-head">
        <h1>Responsables</h1>
        {manage && <button className="btn primary" onClick={() => setEdit({ id: uid('p'), poste: '', nom: '', prenom: '', email: '', telephone: '', roles: ['comite'], actif: true, couleur: '#0f766e' })}>+ Nouveau responsable</button>}
      </div>
      <div className="people">
        {people.map((p) => {
          const open = data.tasks.filter((t) => t.responsables.includes(p.id) && !isDone(data, t)).length;
          return (
            <article key={p.id} className="panel person">
              <Avatar id={p.id} size={48} />
              <div className="grow">
                <small className="muted">{p.poste}</small>
                <strong>{p.prenom} {p.nom}</strong>
                <a href={`mailto:${p.email}`}>✉ {p.email}</a>
                <a href={`tel:${p.telephone.replace(/\s/g, '')}`}>📱 {p.telephone}</a>
                <Link to={`/taches?resp=${p.id}`} className="muted">{open} tâche(s) ouverte(s) →</Link>
              </div>
              {manage && <button className="btn small" onClick={() => setEdit(p)}>Modifier</button>}
            </article>
          );
        })}
      </div>
      {edit && (
        <ItemModal
          title="Responsable"
          item={edit}
          fields={[['poste', 'Poste', 'text'], ['nom', 'Nom', 'text'], ['prenom', 'Prénom', 'text'], ['email', 'Adresse email', 'email'], ['telephone', 'Téléphone portable', 'tel']]}
          onSave={save}
          onClose={() => setEdit(null)}
        />
      )}
      {manage && <p className="muted">Les rôles d'accès et la désactivation des comptes se gèrent dans la console admin.</p>}
    </div>
  );
}
