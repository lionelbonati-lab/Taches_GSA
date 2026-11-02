import { useState } from 'react';
import { useStore } from '../data/store';
import { coordonnees, memesCoordonnees, type Coordonnees } from '../data/membres';

// Réglages › Mon profil : prénom, nom, email et téléphone, sur ma fiche ; « Personnes du club » les suit (démo :
// demoClub.ts ; version réelle : le serveur, 016).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MonProfil() {
  const { user, update, setToast } = useStore();
  const [f, setF] = useState<Coordonnees>(() => coordonnees(user ?? { prenom: '', nom: '', email: '', telephone: '' }));
  const [err, setErr] = useState('');
  if (!user) return null;
  const set = (k: keyof Coordonnees, v: string) => setF((x) => ({ ...x, [k]: v }));
  const change = !memesCoordonnees(f, user);

  const enregistrer = () => {
    const c = coordonnees(f);
    if (!c.prenom && !c.nom) return setErr('Indique au moins ton prénom ou ton nom.');
    if (c.email && !EMAIL.test(c.email)) return setErr('Adresse email invalide.');
    setErr('');
    update((d) => {
      const p = d.people.find((x) => x.id === user.id);
      if (p) Object.assign(p, c);
    }, 'Mon profil : prénom, nom, email et téléphone');
    setF(c);
    setToast('✅ Ton profil est à jour.');
  };

  return (
    <section className="panel form mon-profil">
      <h2 className="full">Mon profil</h2>
      <p className="full muted small-note">Ta fiche, la même dans « Personnes du club ».</p>
      <label>
        Prénom
        <input value={f.prenom} onChange={(e) => set('prenom', e.target.value)} autoComplete="given-name" />
      </label>
      <label>
        Nom
        <input value={f.nom} onChange={(e) => set('nom', e.target.value)} autoComplete="family-name" />
      </label>
      <label>
        Email
        <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
        <small className="muted">Pour te joindre ; l’adresse de connexion ne change pas.</small>
      </label>
      <label>
        Téléphone
        <input type="tel" value={f.telephone} onChange={(e) => set('telephone', e.target.value)} autoComplete="tel" />
      </label>
      {err && <p className="full error">{err}</p>}
      <div className="full row">
        <button className="btn primary" disabled={!change} onClick={enregistrer}>Enregistrer</button>
      </div>
    </section>
  );
}
