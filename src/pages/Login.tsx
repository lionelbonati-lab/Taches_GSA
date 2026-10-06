import { useState } from 'react';
import { InstallButton } from '../components/InstallButton';
import { switchMode } from '../data/mode';
import { directory } from '../data/units';
import type { OrgUnit } from '../data/types';
import { AppLogo, Initials } from '../components/ui';
import { posteBesideName } from '../data/utils';
import { nomAppli } from '../data/nomAppli';

/** Démo : connexion en choisissant une personne de l'annuaire du club (sans mot de passe). */
export function Login({ units, onPick, onReset }: { units: OrgUnit[]; onPick: (key: string) => void; onReset: () => void }) {
  const [q, setQ] = useState('');
  // Dans l'ordre de l'organigramme (président d'abord) : en démo, les personnes sont désignées par leur poste.
  const people = directory(units.filter((u) => !u.archive), false).filter((e) => `${e.prenom} ${e.nom} ${e.postes.map((p) => `${p.unit.nom} ${p.member.poste}`).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="login">
      <div className="login-card wide">
        <AppLogo src={units.find((u) => u.type === 'central')?.logo ?? null} size={56} />
        <h1>{nomAppli()}</h1>
        <p className="muted">
          Démonstration – choisis un poste du club pour te connecter.
          <br />
          Aucun mot de passe, aucune donnée réelle.
        </p>
        <input className="login-search" type="search" placeholder="Rechercher un poste, une entité…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="login-list">
          {people.map((e) => (
            <button key={e.key} className="login-user" onClick={() => onPick(e.key)}>
              <Initials prenom={e.prenom} nom={e.nom} couleur={e.couleur} size={40} />
              <span>
                <strong>{e.prenom} {e.nom}</strong>
                <small>{e.postes.map((p) => posteBesideName(`${e.prenom} ${e.nom}`, p.member.poste)).filter(Boolean).join(' · ')}</small>
              </span>
              <span className="role-pills">
                {e.postes.map((p) => (
                  <span key={p.unit.id} className="role-pill" style={{ background: p.unit.couleur }} title={`${p.unit.nom} · ${p.member.roles.join(' + ')}`}>
                    {p.unit.nom}{p.member.admin ? ' ★' : ''}
                  </span>
                ))}
              </span>
            </button>
          ))}
          {!people.length && <p className="muted">Personne ne correspond à « {q} ».</p>}
        </div>
        <p className="muted small-note">★ = président ou responsable de l’entité. Chaque comité, groupe ou équipe a ses propres tâches, invisibles des autres.</p>
        <InstallButton variant="compact" hideWhenUnavailable />
        <div className="login-foot">
          <button className="btn link" onClick={() => switchMode('reel')}>🔐 Version réelle (membres du comité)</button>
          <button className="btn link" onClick={() => confirm('Réinitialiser toutes les données de démonstration (toutes les entités) ?') && onReset()}>Réinitialiser la démo</button>
        </div>
      </div>
    </div>
  );
}
