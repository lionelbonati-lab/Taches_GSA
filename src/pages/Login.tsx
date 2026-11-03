import { useState } from 'react';
import { InstallButton } from '../components/InstallButton';
import { switchMode } from '../data/mode';
import type { AppData } from '../data/types';
import { AppLogo, Initials } from '../components/ui';
import { fullName, posteBesideName } from '../data/utils';
import { userRoles, ADMIN_ROLE_ID } from '../data/permissions';
import { nomAppli } from '../data/nomAppli';
import { Icone } from '../components/icones';

/** Démo : connexion en choisissant une personne du club (sans mot de passe). */
export function Login({ data, logo, onPick, onReset }: { data: AppData; logo?: string; onPick: (id: string) => void; onReset: () => void }) {
  const [q, setQ] = useState('');
  const etiquettes = data.etiquettes ?? [];
  // Les admins d'abord, puis le comité (droit « Séances »), puis les autres ; personnes fictives, avec leurs postes.
  const rang = (id: string) => {
    const p = data.people.find((x) => x.id === id)!;
    return p.roles.includes(ADMIN_ROLE_ID) ? 0 : userRoles(data.roles, p).some((r) => r.permissions.includes('tab.meetings')) ? 1 : 2;
  };
  const people = data.people
    .filter((p) => p.actif)
    .map((p) => ({ p, roles: userRoles(data.roles, p), siennes: etiquettes.filter((e) => e.membres.includes(p.id)) }))
    .filter(({ p, roles, siennes }) => `${fullName(p)} ${p.poste} ${p.autresPostes ?? ''} ${roles.map((r) => r.label).join(' ')} ${siennes.map((e) => e.nom).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => rang(a.p.id) - rang(b.p.id));
  return (
    <div className="login">
      <div className="login-card wide">
        <AppLogo src={logo ?? null} size={56} />
        <h1>{nomAppli()}</h1>
        <p className="muted">
          Démonstration – choisis une personne pour te connecter : son poste, ses rôles et ses étiquettes sont indiqués.
          <br />
          Personnes fictives, aucun mot de passe, aucune donnée réelle.
        </p>
        <input className="login-search" type="search" placeholder="Rechercher une personne, un poste, un rôle, une étiquette…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="login-list">
          {people.map(({ p, roles, siennes }) => (
            <button key={p.id} className="login-user" onClick={() => onPick(p.id)}>
              <Initials prenom={p.prenom} nom={p.nom} couleur={p.couleur} size={40} />
              <span>
                <strong>{fullName(p)}</strong>
                <small>{[posteBesideName(fullName(p), p.poste), roles.map((r) => r.label).join(' + ')].filter(Boolean).join(' · ')}</small>
              </span>
              <span className="role-pills">
                {siennes.map((e) => (
                  <span key={e.id} className="role-pill" style={{ background: e.couleur }} title={`${e.type === 'evenement' ? 'Événement' : 'Groupe'} · ${e.nom}`}>
                    {e.nom}
                  </span>
                ))}
              </span>
            </button>
          ))}
          {!people.length && <p className="muted">Personne ne correspond à « {q} ».</p>}
        </div>
        <p className="muted small-note">Pastilles : les étiquettes (événements, groupes) dont la personne est membre ; elle en voit les points.</p>
        <InstallButton variant="compact" hideWhenUnavailable />
        <div className="login-foot">
          <button className="btn link" onClick={() => switchMode('reel')}><Icone n="verrou" /> Version réelle (membres du comité)</button>
          <button className="btn link" onClick={() => confirm('Réinitialiser toutes les données de démonstration ?') && onReset()}>Réinitialiser la démo</button>
        </div>
      </div>
    </div>
  );
}
