import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClub } from '../data/club';
import type { DemandeMdp } from '../data/cloud';
import { fmtDateTime, fullName } from '../data/utils';
import { CredentialsModal, type Shown } from '../components/Acces';
import { PageIntro } from '../components/Nav';
import { Empty } from '../components/ui';

// Mots de passe oubliés : les membres de l'entité qui n'ont pas reçu (ou pas pu utiliser) le lien par e-mail demandent un
// mot de passe provisoire. La demande arrive chez les admins de chacune de leurs entités ; une seule validation suffit.
// Garde-fou du serveur (migration 025) : le compte d'un admin d'une autre entité se valide par un admin de cette entité,
// du comité central ou un super-admin.

export function MotsDePasse() {
  const club = useClub();
  const { data } = useStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [shown, setShown] = useState<(Shown & { intro: string }) | null>(null);
  const [fait, setFait] = useState('');
  const fiche = (d: DemandeMdp) => data.people.find((p) => p.id === d.personId);
  const nom = (d: DemandeMdp) => fullName(fiche(d)) || d.email;

  const valider = async (d: DemandeMdp) => {
    if (!confirm(`As-tu bien vérifié que la demande vient de ${nom(d)} (de vive voix, par téléphone, par message) ?\n\nUn mot de passe provisoire va lui être donné : l’actuel ne fonctionnera plus.`)) return;
    setBusy(d.id);
    setErr('');
    try {
      const r = await club.approuverMdp(d.id);
      const p = fiche(d);
      setShown({
        person: { prenom: p?.prenom ?? '', nom: p?.nom ?? r.email },
        email: r.email || d.email,
        password: r.password,
        intro: `Demande validée. Transmets ce mot de passe provisoire à ${nom(d)} : il choisira le sien à la connexion.`,
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const refuser = async (d: DemandeMdp) => {
    if (!confirm(`Refuser la demande de ${nom(d)} ? (Par exemple si elle ne vient pas de cette personne.)`)) return;
    setBusy(d.id);
    setErr('');
    try {
      await club.refuserMdp(d.id);
      setFait(`Demande de ${nom(d)} refusée.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="narrow">
      <p className="admin-retour no-print">
        <Link to="/reglages">‹ Réglages</Link>
      </p>
      <h1>Mots de passe oubliés</h1>
      <PageIntro />
      {err && <p className="error">{err}</p>}
      {fait && <p className="panel" role="status">{fait}</p>}
      {!club.demandesMdp.length && <Empty>Aucune demande en attente.</Empty>}
      {club.demandesMdp.map((d) => (
        <div key={d.id} className="panel demande-mdp">
          <span>
            🔑 <b>{nom(d)}</b> <small className="muted">· {d.email}</small>
          </span>
          <small className="muted">Demande du {fmtDateTime(d.le)}</small>
          {d.peut ? (
            <div className="row wrap">
              <button className="btn small primary" disabled={!!busy} onClick={() => valider(d)}>{busy === d.id ? '…' : 'Donner un mot de passe provisoire'}</button>
              <button className="btn small" disabled={!!busy} onClick={() => refuser(d)}>Refuser</button>
            </div>
          ) : (
            <small className="muted">
              Compte d’un admin d’une autre entité du club (ou de son propriétaire) : un admin de cette entité, du comité central ou un super-admin du club doit valider la
              demande.
            </small>
          )}
        </div>
      ))}
      {shown && (
        <CredentialsModal
          {...shown}
          onClose={() => {
            setShown(null);
            if (!club.demandesMdp.length) navigate('/');
          }}
        />
      )}
    </div>
  );
}
