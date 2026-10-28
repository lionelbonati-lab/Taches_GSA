import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../../data/store';
import { useClubOptional } from '../../data/club';
import { nomMembre } from '../../data/membres';
import { norm } from '../../data/csv';
import { directory, EXTERNE_COULEUR } from '../../data/units';
import { memePersonne } from '../../data/partage';
import type { ClubMembre, Person } from '../../data/types';
import { fullName, uid } from '../../data/utils';
import { Initials, Modal } from '../ui';

// Tâche : une personne qui n'est dans aucune entité du club (un membre du registre « Membres du club », ou quelqu'un
// d'extérieur). Elle reçoit une fiche dans l'entité de la tâche, sans poste (bénévoles dans l'organigramme), avec le rôle
// « Externe » s'il existe : si elle reçoit un accès à l'appli, elle n'y voit que ses tâches.

const ROLE_EXTERNE = 'externe';

type Candidat = Pick<Person, 'prenom' | 'nom' | 'email' | 'telephone' | 'couleur' | 'membreId'>;

/** Choisir ou créer la personne ; `onAjoutee` : sa fiche dans l'entité (créée, réactivée, ou déjà là). */
export function PersonneExterne({ onAjoutee, onClose }: { onAjoutee: (id: string) => void; onClose: () => void }) {
  const { data, update } = useStore();
  const club = useClubOptional();
  const [registre, setRegistre] = useState<ClubMembre[]>([]);
  const [q, setQ] = useState('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!club?.membresAcces) return;
    club
      .membres()
      .then(setRegistre)
      .catch(() => setRegistre([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.membresAcces]);
  const externe = data.roles.some((r) => r.id === ROLE_EXTERNE);
  const nomEntite = club?.current.nom;

  // Membres du registre qui ne sont dans aucune entité (ceux des entités sont proposés dans la tâche, sous leur nom).
  const annuaire = club ? directory(club.units.filter((u) => !u.archive)) : [];
  const needle = norm(q);
  const cle = (m: ClubMembre) => ({ membreId: m.id, email: m.email });
  const sansEntite = registre
    .filter((m) => !annuaire.some((e) => e.postes.some((x) => memePersonne(cle(m), x.member))) && !data.people.some((p) => p.actif && memePersonne(p, cle(m))))
    .filter((m) => !needle || norm(`${m.prenom} ${m.nom} ${m.email}`).includes(needle))
    .sort((a, b) => nomMembre(a).localeCompare(nomMembre(b), 'fr'));

  const ajouter = (c: Candidat) => {
    // Déjà une fiche ici (même fiche du registre, même email ; sans email : même nom) : elle, réactivée au besoin.
    const memeNom = (p: Person) => !c.email.trim() && !c.membreId && norm(fullName(p)) === norm(nomMembre(c));
    const deja = data.people.filter((p) => memePersonne(p, c) || memeNom(p));
    const fiche = deja.find((p) => p.actif) ?? deja[0];
    if (fiche?.actif) return onAjoutee(fiche.id);
    const p: Person = fiche
      ? { ...fiche, actif: true }
      : {
          id: uid('p'),
          poste: '',
          prenom: c.prenom.trim(),
          nom: c.nom.trim(),
          email: c.email.trim(),
          telephone: c.telephone,
          roles: externe ? [ROLE_EXTERNE] : [],
          actif: true,
          couleur: c.couleur || EXTERNE_COULEUR,
          ...(c.membreId ? { membreId: c.membreId } : {}),
        };
    update((d) => {
      d.people = fiche ? d.people.map((x) => (x.id === p.id ? p : x)) : [...d.people, p];
    }, fiche ? `Personne réactivée : ${fullName(p)}` : `Personne ajoutée${externe ? ' (externe)' : ''} : ${fullName(p)}`);
    onAjoutee(p.id);
  };
  const creer = (e: FormEvent) => {
    e.preventDefault();
    if (!prenom.trim() && !nom.trim()) return setErr('Indique au moins son prénom ou son nom.');
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Adresse email invalide.');
    ajouter({ prenom, nom, email, telephone: '', couleur: '' });
  };

  return (
    <Modal title="Quelqu’un d’autre" onClose={onClose}>
      <p className="muted">
        Une personne qui n’est dans aucune entité du club. Elle est ajoutée {nomEntite ? `à « ${nomEntite} »` : 'ici'} sans poste (bénévoles de l’organigramme)
        {externe ? ', avec le rôle « Externe » : si un admin lui donne accès à l’appli, elle n’y verra que ses tâches' : ''}.
      </p>
      {registre.length > 0 && (
        <section className="externe-registre">
          <h3>Membres du club sans entité</h3>
          <input className="login-search" type="search" placeholder="Rechercher un nom, un email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un membre du club" />
          <div className="login-list">
            {sansEntite.slice(0, 50).map((m) => (
              <button key={m.id} type="button" className="login-user" onClick={() => ajouter({ ...m, membreId: m.id })}>
                <Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={32} />
                <span>
                  <strong>{nomMembre(m)}</strong>
                  {m.email && <small>{m.email}</small>}
                </span>
              </button>
            ))}
            {!sansEntite.length && <p className="muted">{needle ? `Personne ne correspond à « ${q} ».` : 'Tous les membres du club sont déjà dans une entité.'}</p>}
          </div>
        </section>
      )}
      <form className="form" onSubmit={creer}>
        <h3 className="full">Nouvelle personne</h3>
        <label>
          Prénom
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} autoFocus />
        </label>
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>
        <label className="full">
          Email (facultatif)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Pour lui donner plus tard un accès à l’appli" />
        </label>
        {err && <p className="error full">{err}</p>}
        <div className="modal-foot full">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn primary">Ajouter à la tâche</button>
        </div>
      </form>
    </Modal>
  );
}
