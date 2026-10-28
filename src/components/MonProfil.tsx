import { useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { useAutres, useRegistre } from '../data/entites';
import { coordonnees, memesCoordonnees, type Coordonnees } from '../data/membres';
import type { AppData } from '../data/types';
import { useSessionOptional } from '../data/session';

// Réglages › Mon profil (vue « moi ») : prénom, nom, email et téléphone, les mêmes dans toutes mes entités. Session du
// club (démo) : enregistrés une fois, dans ma fiche « Personnes du club », que mes places suivent ; sinon dans ma fiche de
// chacune, et le registre « Membres du club » les fait aussi suivre (serveur 016).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ma fiche de l'entité `d` (fiche `id`) avec ces coordonnées. */
const avec = (c: Coordonnees, id: string) => (d: AppData) => {
  const p = d.people.find((x) => x.id === id);
  if (p) Object.assign(p, c);
};

export function MonProfil() {
  const { user, update, setToast, mode } = useStore();
  const club = useClubOptional();
  const session = useSessionOptional();
  const registre = useRegistre();
  const autres = useAutres(!club?.arrierePlan).filter((e) => e.store.user);
  const [f, setF] = useState<Coordonnees>(() => coordonnees(user ?? { prenom: '', nom: '', email: '', telephone: '' }));
  const [err, setErr] = useState('');
  if (!user) return null;
  // Démo : l'email sert à reconnaître la personne dans chaque entité ; il ne se change pas ici.
  const emailFixe = mode === 'demo';
  const set = (k: keyof Coordonnees, v: string) => setF((x) => ({ ...x, [k]: v }));
  // Session du club : une seule fiche, celle du club ; mes places la suivent.
  const differentes = session ? [] : autres.filter((e) => !memesCoordonnees(e.store.user!, user));
  const change = !memesCoordonnees(f, user) || differentes.length > 0;
  const entites = club?.vueClub ? club.mine.filter((u) => !u.archive).map((u) => u.nom) : [club?.current.nom, ...autres.map((e) => e.club.current.nom)].filter(Boolean);

  const enregistrer = () => {
    const c = coordonnees(f);
    if (!c.prenom && !c.nom) return setErr('Indique au moins ton prénom ou ton nom.');
    if (c.email && !EMAIL.test(c.email)) return setErr('Adresse email invalide.');
    setErr('');
    if (session) {
      session
        .enregistrerProfil(c)
        .then(() => {
          setF(c);
          setToast(entites.length > 1 ? `✅ Ton profil est à jour, dans tes ${entites.length} entités.` : '✅ Ton profil est à jour.');
        })
        .catch((e: Error) => setErr(e.message));
      return;
    }
    const action = 'Mon profil : prénom, nom, email et téléphone';
    if (!memesCoordonnees(c, user)) update(avec(c, user.id), action);
    let n = 1;
    for (const e of autres) {
      const s = registre?.get(e.id)?.store;
      if (!s?.user) continue;
      n++;
      if (!memesCoordonnees(c, s.user)) s.update(avec(c, s.user.id), action);
    }
    setF(c);
    setToast(n > 1 ? `✅ Ton profil est à jour dans tes ${n} entités.` : '✅ Ton profil est à jour.');
  };

  return (
    <section className="panel form mon-profil">
      <h2 className="full">Mon profil</h2>
      <p className="full muted small-note">
        {session
          ? `Ta fiche « Personnes du club »${entites.length > 1 ? `, la même dans toutes tes entités (${entites.join(', ')})` : ''}.`
          : entites.length > 1
            ? `Le même dans toutes tes entités (${entites.join(', ')}) : un seul enregistrement les met toutes à jour.`
            : 'Tes coordonnées dans l’entité, communes avec la liste des membres du club.'}
      </p>
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
        <input type="email" value={f.email} disabled={emailFixe} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
        {emailFixe ? (
          <small className="muted">Démo : l’email te reconnaît dans chaque entité, il ne se change pas.</small>
        ) : (
          <small className="muted">Pour te joindre ; l’adresse de connexion ne change pas.</small>
        )}
      </label>
      <label>
        Téléphone
        <input type="tel" value={f.telephone} onChange={(e) => set('telephone', e.target.value)} autoComplete="tel" />
      </label>
      {differentes.length > 0 && (
        <p className="full small-note ecart">
          Ta fiche n’est pas la même partout : {differentes.map((e) => `« ${e.club.current.nom} »`).join(', ')}. « Enregistrer » y met ces coordonnées.
        </p>
      )}
      {err && <p className="full error">{err}</p>}
      <div className="full row">
        <button className="btn primary" disabled={!change} onClick={enregistrer}>Enregistrer</button>
      </div>
    </section>
  );
}
