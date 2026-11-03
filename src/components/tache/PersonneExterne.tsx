import { useEffect, useState, type FormEvent } from 'react';
import { useClubOptional } from '../../data/club';
import { useStore } from '../../data/store';
import { ficheDe, nomMembre, nouveauMembre, trouverMembre } from '../../data/membres';
import { norm } from '../../data/csv';
import type { ClubMembre, PersonneHors } from '../../data/types';
import { uid } from '../../data/utils';
import { Initials, Modal } from '../ui';

// Tâche : une personne qui n'a pas de fiche dans l'appli (une personne du club sans accès, ou quelqu'un d'extérieur) :
// son nom est noté sur la tâche (respHors). Liste unique : une nouvelle personne entre dans « Personnes du club » pour
// qui gère les personnes. Sans accès à l'appli, elle ne voit pas la tâche.

/** Choisir ou écrire la personne ; `deja` : celles déjà sur la tâche. */
export function PersonneExterne({ deja, onAjoutee, onClose }: { deja: PersonneHors[]; onAjoutee: (p: PersonneHors) => void; onClose: () => void }) {
  const club = useClubOptional();
  const { data } = useStore();
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

  // Personnes du club sans fiche active dans l'appli (celles qui en ont une sont proposées dans la tâche, sous leur nom).
  const aUneFiche = (m: ClubMembre) => !!ficheDe(m, data.people)?.actif;
  const needle = norm(q);
  const sansFiche = registre
    .filter((m) => !aUneFiche(m) && !deja.some((p) => p.membreId === m.id))
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
    // Déjà au club : elle-même (avec une fiche dans l'appli : à choisir dans la liste « Ajouter… »).
    const connue = trouverMembre(registre, p);
    if (connue && aUneFiche(connue)) return setErr(`${nomMembre(connue)} a une fiche dans l’appli : choisis-la dans la liste « Ajouter… ».`);
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
        Une personne qui n’a pas de fiche dans l’appli : son nom est noté sur la tâche
        {gerer ? ' ; une nouvelle personne entre aussi dans « Personnes du club »' : ''}. Sans accès à l’appli, elle ne la voit pas.
      </p>
      {registre.length > 0 && (
        <section className="externe-registre">
          <h3>Personnes du club sans fiche dans l’appli</h3>
          <input className="login-search" type="search" placeholder="Rechercher un nom, un email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un membre du club" />
          <div className="login-list">
            {sansFiche.slice(0, 50).map((m) => (
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
            {!sansFiche.length && <p className="muted">{needle ? `Personne ne correspond à « ${q} ».` : 'Toutes les personnes du club ont déjà une fiche dans l’appli.'}</p>}
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
