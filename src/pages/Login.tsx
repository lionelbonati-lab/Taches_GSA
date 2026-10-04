import { useStore } from '../data/store';
import { userRoles } from '../data/permissions';
import { Avatar } from '../components/ui';
import { InstallButton } from '../components/InstallButton';
import { hasSupabase, supabase } from '../lib/supabase';
import { useState } from 'react';

export function Login() {
  const { data, login, reset } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const signIn = async () => { if (!supabase) return; const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setError(error.message); };
  return (
    <div className="login">
      <div className="login-card">
        <img src="./icon.svg" alt="" width={56} height={56} />
        <h1>Tâches GSA</h1>
        <p className="muted">{hasSupabase ? 'Connexion sécurisée par Supabase.' : <>Démonstration – choisis un membre du comité pour te connecter.<br />Aucun mot de passe, aucune donnée réelle.</>}</p>
        {hasSupabase && <div className="form"><input type="email" placeholder="Adresse email" value={email} onChange={e => setEmail(e.target.value)} /><input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} /><button className="btn primary" onClick={signIn}>Se connecter</button>{error && <p className="error">{error}</p>}</div>}
        {!hasSupabase && <div className="login-list">
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
        </div>}
        <InstallButton variant="compact" hideWhenUnavailable />
        <button className="btn link" onClick={() => confirm('Réinitialiser toutes les données de démonstration ?') && reset()}>Réinitialiser la démo</button>
      </div>
    </div>
  );
}
