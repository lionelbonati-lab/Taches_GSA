import { useStore } from '../data/store';
import { userRoles } from '../data/permissions';
import { Avatar } from '../components/ui';
import { InstallButton } from '../components/InstallButton';
import { switchMode } from '../data/mode';

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
              <span className="role-pills">
                {p.actif
                  ? userRoles(data.roles, p).map((r) => <span key={r.id} className="role-pill" style={{ background: r.couleur }}>{r.label}</span>)
                  : <span className="role-pill off">Désactivé</span>}
              </span>
            </button>
          ))}
        </div>
        <InstallButton variant="compact" hideWhenUnavailable />
        <div className="login-foot">
          <button className="btn link" onClick={() => switchMode('reel')}>🔐 Version réelle (membres du comité)</button>
          <button className="btn link" onClick={() => confirm('Réinitialiser toutes les données de démonstration ?') && reset()}>Réinitialiser la démo</button>
        </div>
      </div>
    </div>
  );
}
