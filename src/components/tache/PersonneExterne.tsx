import { useEffect, useState, type FormEvent } from 'react';
import { useClubOptional } from '../../data/club';
import { nomMembre, nouveauMembre, trouverMembre } from '../../data/membres';
import { norm } from '../../data/csv';
import { directory } from '../../data/units';
import { memePersonne } from '../../data/partage';
import type { ClubMembre, PersonneHors } from '../../data/types';
import { uid } from '../../data/utils';
import { Initials, Modal } from '../ui';

// Tâche : une personne qui n'a pas de place dans l'organigramme (une personne du club sans entité, ou quelqu'un
// d'extérieur). Ce sont les tâches qui font partie des entités, pas les personnes : son nom est noté sur la tâche
// (respHors), sans fiche dans l'entité. Liste unique (PERSONNES_DU_CLUB.md) : une nouvelle personne entre dans
// « Personnes du club » pour qui gère les personnes. Sans accès à l'appli, elle ne voit pas la tâche.

/** Choisir ou écrire la personne ; `deja` : celles déjà sur la tâche. */
export function PersonneExterne({ deja, onAjoutee, onClose }: { deja: PersonneHors[]; onAjoutee: (p: PersonneHors) => void; onClose: () => void }) {
  const club = useClubOptional();
  const [registre, setRegistre] = useState<ClubMembre[]>([]);
  const [q, setQ] = useState('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!club?.personnes.voir) return;
    club
      .membres()
      .then(setRegistre)
      .catch(() => setRegistre([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.personnes.voir]);

  // Membres du registre qui ne sont dans aucune entité (ceux des entités sont proposés dans la tâche, sous leur nom).
  const annuaire = club ? directory(club.units.filter((u) => !u.archive)) : [];
  const cle = (m: ClubMembre) => ({ membreId: m.id, email: m.email });
  const needle = norm(q);
  const sansEntite = registre
    .filter((m) => !annuaire.some((e) => e.postes.some((x) => memePersonne(cle(m), x.member))) && !deja.some((p) => p.membreId === m.id))
    .filter((m) => !needle || norm(`${m.prenom} ${m.nom} ${m.email}`).includes(needle))
    .sort((a, b) => nomMembre(a).localeCompare(nomMembre(b), 'fr'));

  const gerer = !!club?.personnes.gerer;
  const [busy, setBusy] = useState(false);
  const creer = async (e: FormEvent) => {
    e.preventDefault();
    if (!prenom.trim() && !nom.trim()) return setErr('Indique au moins son prénom ou son nom.');
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Adresse email invalide.');
    if (deja.some((p) => norm(nomMembre(p)) === norm(`${prenom} ${nom}`))) return setErr('Elle est déjà sur la tâche.');
    const p: PersonneHors = { id: uid('ph'), prenom: prenom.trim(), nom: nom.trim(), ...(email.trim() ? { email: email.trim() } : {}) };
    // Déjà au club : elle-même (avec une place dans une entité : à choisir dans la liste, sous le nom de son entité).
    const connue = trouverMembre(registre, p);
    if (connue && annuaire.some((x) => x.postes.some((y) => memePersonne(cle(connue), y.member))))
      return setErr(`${nomMembre(connue)} a une place dans l’organigramme : choisis-la dans la liste « Ajouter… », sous le nom de son entité.`);
    if (connue) return onAjoutee({ ...p, membreId: connue.id });
    if (club && gerer) {
      const m = nouveauMembre(p);
      setBusy(true);
      try {
        await club.saveMembres([m]);
      } catch (x) {
        setBusy(false);
        return setErr((x as Error).message);
      }
      return onAjoutee({ ...p, membreId: m.id });
    }
    onAjoutee(p);
  };

  return (
    <Modal title="Quelqu’un d’autre" onClose={onClose}>
      <p className="muted">
        Une personne qui n’a pas de place dans l’organigramme : son nom est noté sur la tâche, qui reste dans son entité
        {gerer ? ' ; une nouvelle personne entre aussi dans « Personnes du club »' : ''}. Sans accès à l’appli, elle ne la voit pas.
      </p>
      {registre.length > 0 && (
        <section className="externe-registre">
          <h3>Personnes du club sans entité</h3>
          <input className="login-search" type="search" placeholder="Rechercher un nom, un email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un membre du club" />
          <div className="login-list">
            {sansEntite.slice(0, 50).map((m) => (
              <button
                key={m.id}
                type="button"
                className="login-user"
                onClick={() => onAjoutee({ id: uid('ph'), prenom: m.prenom, nom: m.nom, membreId: m.id, ...(m.email ? { email: m.email } : {}) })}
              >
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
        <h3 className="full">Une autre personne</h3>
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
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {err && <p className="error full">{err}</p>}
        <div className="modal-foot full">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn primary" disabled={busy}>Ajouter à la tâche</button>
        </div>
      </form>
    </Modal>
  );
}
