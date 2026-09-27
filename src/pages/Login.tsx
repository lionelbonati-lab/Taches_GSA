import { useStore } from '../data/store';
import { roleLabel } from '../data/permissions';
import { Avatar } from '../components/ui';

export function Login() {
  const { data, login, reset } = useStore();
  return (
    <div className="login">
      <div className="login-card">
        <img src="./icon.svg" alt="" width={56} height={56} />
        <h1>Tâches GSA</h1>
        <p className="muted">Démonstration – choisis un membre du comité pour te connecter.<br />Aucun mot de passe, aucune donnée réelle.</p>
        <div className="login-list">
          {data.people.map((p) => (
            <button key={p.id} className="login-user" disabled={!p.actif} onClick={() => login(p.id)}>
              <Avatar id={p.id} size={40} />
              <span>
                <strong>{p.prenom} {p.nom}</strong>
                <small>{p.poste}</small>
              </span>
              <span className={`role-pill r-${p.role}`}>{p.actif ? roleLabel(p.role) : 'Désactivé'}</span>
            </button>
          ))}
        </div>
        <button className="btn link" onClick={() => confirm('Réinitialiser toutes les données de démonstration ?') && reset()}>Réinitialiser la démo</button>
      </div>
    </div>
  );
}
