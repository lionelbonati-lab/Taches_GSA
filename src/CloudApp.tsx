import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { CloudSync, linkMyPerson, myMemberships, type Membership } from './data/cloud';
import { migrate, SCHEMA, StoreProvider, type CloudMode } from './data/store';
import { setServerFiles } from './data/files';
import type { AppData, Person } from './data/types';
import { App } from './App';
import { ChooseCommittee, FirstPassword, Message, RealLogin, Setup, WhoAreYou } from './pages/Real';

// Version réelle : connexion, choix du comité, mise en route, puis l'appli avec les données du serveur.

type Phase =
  | { k: 'chargement'; text: string }
  | { k: 'connexion' }
  | { k: 'motDePasse' }
  | { k: 'aucunComite' }
  | { k: 'choixComite'; list: Membership[] }
  | { k: 'erreur'; text: string }
  | { k: 'miseEnRoute'; m: Membership; sync: CloudSync }
  | { k: 'quiEsTu'; m: Membership; sync: CloudSync; data: AppData }
  | { k: 'pasPret'; m: Membership }
  | { k: 'pret'; cloud: CloudMode };

const COMMITTEE_KEY = 'taches-gsa-comite';

export function CloudApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ k: 'chargement', text: 'Connexion…' });
  const run = useRef(0);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((event, s) => {
      // Le renouvellement du jeton ne doit pas recharger l'appli.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase!.auth.signOut();
    window.location.reload();
  }, []);

  const open = useCallback(
    async (s: Session, m: Membership) => {
      const id = ++run.current;
      const alive = () => id === run.current;
      try {
        localStorage.setItem(COMMITTEE_KEY, m.committeeId);
      } catch {
        /* ignore */
      }
      setPhase({ k: 'chargement', text: `Chargement des données · ${m.committeeName}…` });
      setServerFiles(m.committeeId);
      const sync = new CloudSync(m.committeeId, s.user.id);
      const { data, empty } = await sync.load();
      if (!alive()) return;
      if (empty) return setPhase(m.owner ? { k: 'miseEnRoute', m, sync } : { k: 'pasPret', m });
      const person = data.people.find((p) => p.id === m.personId);
      if (!person) return setPhase(m.owner ? { k: 'quiEsTu', m, sync, data } : { k: 'pasPret', m });
      // Les étapes de mise à niveau ≤ v12 ne concernent que la démo.
      if (!data.schema) data.schema = SCHEMA;
      else if (data.schema < SCHEMA) migrate(data);
      setPhase({ k: 'pret', cloud: { sync, initial: data, personId: person.id, membership: m, email: s.user.email ?? '', signOut } });
    },
    [signOut],
  );

  const start = useCallback(
    async (s: Session | null) => {
      const id = ++run.current;
      if (!s) return setPhase({ k: 'connexion' });
      if (s.user.user_metadata?.doit_changer_mdp) return setPhase({ k: 'motDePasse' });
      setPhase({ k: 'chargement', text: 'Recherche de ton comité…' });
      try {
        const list = await myMemberships(s.user.id);
        if (id !== run.current) return;
        if (!list.length) return setPhase({ k: 'aucunComite' });
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(COMMITTEE_KEY);
        } catch {
          /* ignore */
        }
        const m = list.find((x) => x.committeeId === saved) ?? (list.length === 1 ? list[0] : null);
        if (!m) return setPhase({ k: 'choixComite', list });
        await open(s, m);
      } catch (e) {
        if (id === run.current) setPhase({ k: 'erreur', text: (e as Error).message });
      }
    },
    [open],
  );

  // Nouvelle session (connexion, déconnexion, mot de passe changé) : on repart du début.
  const lastUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (session === undefined) return;
    const key = session ? `${session.user.id}:${!!session.user.user_metadata?.doit_changer_mdp}` : null;
    if (key === lastUser.current) return;
    lastUser.current = key;
    void start(session);
  }, [session, start]);

  const email = session?.user.email ?? '';
  const retry = () => session && start(session);

  switch (phase.k) {
    case 'chargement':
      return <div className="loading-screen"><img src="./icon.svg" alt="" width={56} height={56} /><p>{phase.text}</p></div>;
    case 'connexion':
      return <RealLogin />;
    case 'motDePasse':
      return <FirstPassword email={email} onSignOut={signOut} onDone={() => supabase!.auth.getSession().then(({ data }) => setSession(data.session))} />;
    case 'aucunComite':
      return (
        <Message title="Pas encore d’accès" onSignOut={signOut}>
          <p>Le compte <b>{email}</b> n’est rattaché à aucun comité. Demande au président de te donner l’accès (console admin › Utilisateurs).</p>
        </Message>
      );
    case 'choixComite':
      return <ChooseCommittee list={phase.list} onSignOut={signOut} onChoose={(m) => session && void open(session, m).catch((e) => setPhase({ k: 'erreur', text: (e as Error).message }))} />;
    case 'erreur': {
      const offline = /fetch|network/i.test(phase.text);
      return (
        <Message title={offline ? 'Serveur injoignable' : 'Erreur du serveur'} onSignOut={signOut}>
          <p>{offline ? 'Pas de connexion Internet, ou le serveur ne répond pas.' : phase.text}</p>
          <p><button className="btn primary" onClick={retry}>Réessayer</button></p>
        </Message>
      );
    }
    case 'pasPret':
      return (
        <Message title={phase.m.committeeName} onSignOut={signOut}>
          <p>Aucune donnée accessible pour l’instant : le comité n’est pas encore mis en route, ou ton accès a été désactivé.</p>
          <p>Renseigne-toi auprès du président.</p>
          <p><button className="btn" onClick={retry}>Réessayer</button></p>
        </Message>
      );
    case 'miseEnRoute':
      return <Setup membership={phase.m} userId={session!.user.id} email={email} sync={phase.sync} onSignOut={signOut} onDone={retry} />;
    case 'quiEsTu': {
      const { m, sync, data } = phase;
      const choose = async (personId: string, created?: Person) => {
        if (created) await sync.flushNow({ ...data, people: [...data.people, created] });
        await linkMyPerson(m.committeeId, session!.user.id, personId);
        await retry();
      };
      return <WhoAreYou data={data} email={email} onChoose={choose} onSignOut={signOut} />;
    }
    case 'pret':
      return (
        <StoreProvider cloud={phase.cloud}>
          <App />
        </StoreProvider>
      );
  }
}
