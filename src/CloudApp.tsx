import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { CloudSync, estSuperAdmin, linkMyPerson, mesComptesClub, mesTachesConfiees, modifierTacheConfiee, myMemberships, type Membership, type MonCompteClub } from './data/cloud';
import { doitChangerMdp, doitChoisirMdp, finRecuperation, verifierLienRecuperation } from './data/recuperation';
import { StoreProvider, type CloudMode } from './data/store';
import { migrate, SCHEMA } from './data/migrate';
import { setServerFiles } from './data/files';
import type { AppData, Person, Task } from './data/types';
import { ADMIN_ROLE_ID } from './data/permissions';
import { App } from './App';
import { CloudClub } from './CloudClub';
import { AppLogo } from './components/ui';
import { FirstPassword, Message, NewPassword, RealLogin, Setup, WhoAreYou } from './pages/Real';
import { ComptesSeuls } from './pages/Comptes';
import { entiteDeBase } from './data/units';
import { RegistreEntites } from './data/entites';
import { SansPlace, type TacheConfiee } from './pages/SansPlace';
import { isImage } from './data/logo';

// Version réelle : connexion, mise en route, puis l'appli avec les données du serveur, appuyée sur l'une de mes entités
// (toujours la même : entiteDeBase) ; les autres sont chargées en arrière-plan (vue « moi »).

type Phase =
  | { k: 'chargement'; text: string }
  | { k: 'connexion' }
  | { k: 'motDePasse' }
  | { k: 'nouveauMdp' }
  | { k: 'aucunComite'; superAdmin: boolean }
  | { k: 'sansPlace'; compte: MonCompteClub }
  | { k: 'erreur'; text: string }
  | { k: 'miseEnRoute'; m: Membership; sync: CloudSync }
  | { k: 'quiEsTu'; m: Membership; sync: CloudSync; data: AppData }
  | { k: 'pasPret'; m: Membership }
  | { k: 'pret'; cloud: CloudMode };

export function CloudApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ k: 'chargement', text: 'Connexion…' });
  const run = useRef(0);

  useEffect(() => {
    // Lien « mot de passe oublié » (?mdp=…) : vérifié d'abord, il ouvre la session.
    void verifierLienRecuperation().finally(() => supabase!.auth.getSession().then(({ data }) => setSession(data.session)));
    const { data } = supabase!.auth.onAuthStateChange((event, s) => {
      // Le renouvellement du jeton ne doit pas recharger l'appli.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    finRecuperation();
    await supabase!.auth.signOut();
    window.location.reload();
  }, []);

  const open = useCallback(
    async (s: Session, m: Membership) => {
      const id = ++run.current;
      const alive = () => id === run.current;
      setPhase({ k: 'chargement', text: 'Chargement de tes données…' });
      setServerFiles(m.committeeId);
      const sync = new CloudSync(m.committeeId, s.user.id);
      const { data, empty } = await sync.load();
      if (!alive()) return;
      if (empty) return setPhase(m.owner ? { k: 'miseEnRoute', m, sync } : { k: 'pasPret', m });
      const person = data.people.find((p) => p.id === m.personId);
      if (!person) return setPhase(m.owner ? { k: 'quiEsTu', m, sync, data } : { k: 'pasPret', m });
      // Les étapes de mise à niveau ≤ v12 ne concernent que la démo. Les suivantes touchent aux rôles :
      // seul un admin les fait (le serveur refuserait sinon) ; en attendant, l'appli fonctionne sans.
      if (!data.schema) data.schema = SCHEMA;
      else if (data.schema < SCHEMA && person.roles.includes(ADMIN_ROLE_ID)) migrate(data);
      setPhase({ k: 'pret', cloud: { sync, initial: data, personId: person.id, membership: m, email: s.user.email ?? '', signOut } });
    },
    [signOut],
  );

  const start = useCallback(
    async (s: Session | null) => {
      const id = ++run.current;
      if (!s) return setPhase({ k: 'connexion' });
      if (doitChoisirMdp()) return setPhase({ k: 'nouveauMdp' });
      if (doitChangerMdp(s.user)) return setPhase({ k: 'motDePasse' });
      setPhase({ k: 'chargement', text: 'Chargement…' });
      try {
        // Personne du club sans place dans l'organigramme (056) : ses tâches confiées seulement.
        const [list, comptes] = await Promise.all([myMemberships(s.user.id), mesComptesClub()]);
        if (id !== run.current) return;
        const sansPlace = comptes?.length && !comptes.some((c) => c.place) ? comptes[0] : null;
        if (sansPlace) return setPhase({ k: 'sansPlace', compte: sansPlace });
        // Sans entité : le super-admin du club a la page des comptes.
        if (!list.length) return setPhase({ k: 'aucunComite', superAdmin: await estSuperAdmin() });
        // Toujours la même entité de base (le comité central d'abord), avec ma fiche ; un lien reçu vers une autre de mes
        // entités (notification, WhatsApp…) s'ouvre ensuite d'ici (LienRecu), sans changer d'entité.
        const avecFiche = list.filter((x) => x.personId);
        const m = entiteDeBase((avecFiche.length ? avecFiche : list).map((x) => ({ ...x, nom: x.committeeName, archive: !!x.info.archive })))!;
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
    const key = session ? `${session.user.id}:${doitChangerMdp(session.user)}:${doitChoisirMdp()}` : null;
    if (key === lastUser.current) return;
    lastUser.current = key;
    void start(session);
  }, [session, start]);

  const email = session?.user.email ?? '';
  const userId = session?.user.id ?? '';
  const retry = () => session && start(session);
  // Passage à une autre de mes entités : ma fiche a été retirée de l'entité de base, ou celle-ci archivée (App).
  const switchTo = useCallback(
    (m: Membership) => {
      if (session) void open(session, m).catch((e) => setPhase({ k: 'erreur', text: (e as Error).message }));
    },
    [session, open],
  );

  switch (phase.k) {
    case 'chargement':
      return <div className="loading-screen"><AppLogo size={56} /><p>{phase.text}</p></div>;
    case 'connexion':
      return <RealLogin />;
    case 'motDePasse':
      return <FirstPassword email={email} onSignOut={signOut} onDone={() => supabase!.auth.getSession().then(({ data }) => setSession(data.session))} />;
    case 'nouveauMdp':
      return (
        <NewPassword
          email={email}
          onSignOut={signOut}
          onDone={() => {
            finRecuperation();
            void supabase!.auth.getSession().then(({ data }) => setSession(data.session));
          }}
        />
      );
    case 'aucunComite':
      if (phase.superAdmin) return <ComptesSeuls email={email} onSignOut={signOut} />;
      return (
        <Message title="Pas encore d’accès" onSignOut={signOut}>
          <p>Le compte <b>{email}</b> n’a encore de place dans aucune entité du club. Demande à quelqu’un qui gère les personnes du club de te donner l’accès (« Personnes du club » : ta fiche, « Donner l’accès »).</p>
        </Message>
      );
    case 'sansPlace':
      return <SansPlaceReel compte={phase.compte} onSignOut={signOut} />;
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
          <p>Aucune donnée accessible pour l’instant : l’entité n’est pas encore mise en route, ou ton accès a été désactivé.</p>
          <p>Renseigne-toi auprès du président.</p>
          <p><button className="btn" onClick={retry}>Réessayer</button></p>
        </Message>
      );
    case 'miseEnRoute':
      return <Setup membership={phase.m} userId={userId} email={email} sync={phase.sync} onSignOut={signOut} onDone={retry} />;
    case 'quiEsTu': {
      const { m, sync, data } = phase;
      const choose = async (personId: string, created?: Person) => {
        if (created) await sync.flushNow({ ...data, people: [...data.people, created] });
        await linkMyPerson(m.committeeId, userId, personId);
        await retry();
      };
      return <WhoAreYou data={data} email={email} onChoose={choose} onSignOut={signOut} />;
    }
    case 'pret':
      // Déconnexion en cours : la session disparaît avant le rechargement de la page.
      if (!session) return null;
      return (
        <RegistreEntites>
          <CloudClub m={phase.cloud.membership} userId={userId} email={phase.cloud.email} signOut={signOut} onSwitch={switchTo}>
            <StoreProvider cloud={phase.cloud}>
              <App />
            </StoreProvider>
          </CloudClub>
        </RegistreEntites>
      );
  }
}

/** Version réelle de « Mes tâches » (personne du club sans place) : ses tâches confiées, lues et modifiées sur le serveur. */
function SansPlaceReel({ compte, onSignOut }: { compte: MonCompteClub; onSignOut: () => void }) {
  const [taches, setTaches] = useState<TacheConfiee[] | null>(null);
  const [err, setErr] = useState('');
  const charger = useCallback(
    () =>
      mesTachesConfiees(compte.club)
        .then(setTaches)
        .catch((e: Error) => setErr(e.message)),
    [compte.club],
  );
  useEffect(() => {
    void charger();
    // Revenue sur l'appli : les tâches ont pu changer.
    const vue = () => document.visibilityState === 'visible' && void charger();
    document.addEventListener('visibilitychange', vue);
    return () => document.removeEventListener('visibilitychange', vue);
  }, [charger]);
  const remplacer = (uniteId: string, tacheId: string, f: (t: Task) => Task) =>
    setTaches((l) => l?.map((x) => (x.unite.id === uniteId && x.tache.id === tacheId ? { ...x, tache: f(x.tache) } : x)) ?? null);
  const modifier = (uniteId: string, tacheId: string, patch: Partial<Pick<Task, 'statusId' | 'checklist'>>) => {
    setErr('');
    remplacer(uniteId, tacheId, (t) => ({ ...t, ...patch }));
    const coches = patch.checklist ? Object.fromEntries(patch.checklist.map((c) => [c.id, c.done])) : undefined;
    modifierTacheConfiee(compte.club, uniteId, tacheId, { statut: patch.statusId, coches })
      .then((t) => remplacer(uniteId, tacheId, () => t))
      .catch((e: Error) => {
        setErr(e.message);
        void charger();
      });
  };
  if (!taches) {
    if (!err) return <div className="loading-screen"><AppLogo size={56} /><p>Chargement de tes tâches…</p></div>;
    return (
      <Message title="Erreur du serveur" onSignOut={onSignOut}>
        <p>{err}</p>
        <p><button className="btn primary" onClick={() => void charger()}>Réessayer</button></p>
      </Message>
    );
  }
  const logo = compte.logo && isImage(compte.logo) ? compte.logo : undefined;
  return <SansPlace membre={{ prenom: compte.prenom, nom: compte.nomPersonne }} logo={logo} taches={taches} erreur={err} modifier={modifier} sortir="Se déconnecter" onSortir={onSignOut} />;
}
