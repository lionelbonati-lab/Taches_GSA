import { useCallback, useMemo, useState } from 'react';
import { StoreProvider, type DemoMode } from './data/store';
import { ClubCtx, type Club, type Espace } from './data/club';
import {
  deleteMembre,
  effacerErreursDemo,
  erreursDemo,
  initMembres,
  lierFiches,
  lireHistoriqueDemo,
  loadEspace,
  loadInfoEspace,
  loadMembres,
  loadMoi,
  reglerErreurDemo,
  resetDemo,
  saveEspace,
  saveInfoEspace,
  saveMembres,
  saveMoi,
  signalerErreurDemo,
  verifierVersion,
} from './data/demoClub';
import { ADMIN_ROLE_ID, hasPermission, userRoles } from './data/permissions';
import { compactIban, emailKey, fusionMembre, ibanValide, nomMembre, vueMembre } from './data/membres';
import { uid } from './data/utils';
import { getFile } from './data/files';
import { fichiersDe } from './data/backup';
import { attendusDe } from './data/pourInfo';
import { visaDans } from './data/paiements';
import type { AppData, ClubMembre, Permission, Person, Proposition } from './data/types';
import { App } from './App';
import { Login } from './pages/Login';

// Démo : l'espace du club, gardé dans ce navigateur (demoClub.ts). On se connecte en choisissant une personne du club,
// sans mot de passe ; l'appli s'ouvre sur l'espace du club, avec une seule couche de données (store.tsx).

// Relances « Pour info » de la démo (tâche → heure) : une par heure, dans ce navigateur.
const relancesDemo = new Map<string, number>();
/** Fiches de l'espace au dernier enregistrement (rôles, actives) : changées, mes droits au club sont relus. */
let personnesVues: string | null = null;

/** Au premier passage : la démo à la version du jour (reprise de l'ancienne), « Personnes du club » créé. */
function preparer() {
  verifierVersion();
  initMembres();
  return true;
}

export function DemoApp() {
  const [pret] = useState(preparer);
  const [me, setMe] = useState<string | null>(() => (pret ? loadMoi() : null));
  // Données de l'espace réécrites hors de l'écran (« Personnes du club », propositions…) : la couche de données les relit.
  const [version, setVersion] = useState(0);
  const relire = useCallback(() => setVersion((v) => v + 1), []);
  const [espace, setEspace] = useState<Espace>(loadInfoEspace);

  // Ma fiche et mes droits, lus dans l'espace (relus après une modification faite hors de l'écran).
  const moi = useMemo(() => {
    if (!me) return null;
    const d = loadEspace();
    const fiche = d.people.find((p) => p.id === me && p.actif);
    return fiche ? { d, fiche, roles: userRoles(d.roles, fiche) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, version]);
  const droit = useCallback((p: Permission) => !!moi && hasPermission(moi.roles, p), [moi]);
  const admin = droit('admin.access');

  const logout = useCallback(() => {
    saveMoi(null);
    setMe(null);
  }, []);

  // Personnes du club : la liste pour tout le monde ; coordonnées et gestion selon les rôles.
  const personnes = useMemo(() => {
    const gerer = droit('club.membres') || droit('people.manage');
    return { voir: !!moi, coordonnees: gerer || droit('tab.people'), gerer };
  }, [moi, droit]);
  // Caissier : un rôle qui donne expressément « paiements.payer » (hors Admin).
  const caissier = !!moi && moi.roles.some((r) => !r.locked && r.permissions.includes('paiements.payer'));

  // Ma fiche du registre (comme le serveur, gsa_mon_membre) : celle liée à ma fiche, sinon même email.
  const monMembre = useCallback((): ClubMembre | undefined => {
    if (!moi) return undefined;
    const list = loadMembres();
    return list.find((m) => m.id === moi.fiche.membreId) ?? list.find((m) => !!emailKey(m.email) && emailKey(m.email) === emailKey(moi.fiche.email));
  }, [moi]);

  /** Modifie les données de l'espace hors de l'écran, puis la couche de données les relit. */
  const changerEspace = useCallback(
    (f: (d: AppData) => void) => {
      const d = loadEspace();
      f(d);
      saveEspace(d);
      relire();
    },
    [relire],
  );

  const club: Club = useMemo(
    () => ({
      espace,
      loading: false,
      async modifierEspace(patch) {
        if (!admin) throw new Error('Réservé aux admins.');
        const e: Espace = { ...espace, ...patch, nom: patch.nom?.trim() || espace.nom };
        saveInfoEspace(e);
        setEspace(e);
      },
      // Comme le serveur (043) : ticket visé ou payé seulement.
      verifierVisa: async (code) => visaDans(loadEspace(), code, espace.nom),
      // Historique d'une tâche (version réelle : gsa_historique_tache, 050).
      historique: async (tacheId) => lireHistoriqueDemo(tacheId),
      // Rapport d'erreurs (version réelle : gsa_signaler_erreur, gsa_erreurs_liste…, 051), gardé dans ce navigateur.
      signalerErreur: async (r) => {
        if (me) signalerErreurDemo(espace.nom, me, r);
      },
      erreurs: async () => {
        if (!admin) throw new Error('Réservé aux admins.');
        return erreursDemo();
      },
      reglerErreur: async (id, reglee) => {
        if (!admin) throw new Error('Réservé aux admins.');
        reglerErreurDemo(id, reglee);
      },
      effacerErreurs: async () => {
        if (!admin) throw new Error('Réservé aux admins.');
        return effacerErreursDemo();
      },
      // Personnes attendues (version réelle : gsa_pour_info_suivi, 052) : fiche active avec un email.
      async suiviPourInfo(tacheIds) {
        const d = loadEspace();
        const compte = (f: string) => d.people.some((p) => p.id === f && p.actif && !!p.email);
        return Object.fromEntries(d.tasks.filter((t) => tacheIds.includes(t.id) && t.pourInfo && !t.paiement).map((t) => [t.id, attendusDe(t, compte)]));
      },
      // Relance (version réelle : gsa_pour_info_relancer, 052) : la couche de données prévient les personnes (`ici`).
      async relancerPourInfo(tacheId, t) {
        if (!moi) throw new Error('Connecte-toi d’abord.');
        if (t.paiement || !t.pourInfo) throw new Error('Tâche introuvable');
        if (Date.now() - (relancesDemo.get(tacheId) ?? 0) < 3600e3) throw new Error('Déjà relancée il y a moins d’une heure');
        const d = loadEspace();
        const ici = attendusDe(t, (f) => d.people.some((p) => p.id === f && p.actif && !!p.email)).filter((k) => !t.pourInfoVus?.[k]).map((k) => k.slice(2));
        relancesDemo.set(tacheId, Date.now());
        return { n: ici.length, ici };
      },
      // Proposition d'amélioration de l'appli, rangée dans l'espace (version réelle : gsa_proposer_amelioration).
      async proposerAmelioration(r) {
        if (!moi) throw new Error('Connecte-toi d’abord.');
        const texte = r.texte.trim().slice(0, 4000);
        if (!texte) throw new Error('La proposition est vide');
        const p: Proposition = {
          id: uid('am'),
          genre: r.genre,
          texte,
          page: r.page || undefined,
          le: new Date().toISOString(),
          par: nomMembre(moi.fiche) || 'Membre du club',
          auteur: moi.fiche.id,
          statut: 'nouvelle',
        };
        changerEspace((d) => {
          d.propositions = [p, ...(d.propositions ?? [])];
        });
      },
      async mesPropositions() {
        if (!moi) return [];
        return (loadEspace().propositions ?? []).filter((p) => p.auteur === moi.fiche.id).sort((a, b) => b.le.localeCompare(a.le));
      },
      personnes,
      caissier,
      // Comme le serveur (034) : données masquées vides, IBAN aux caissiers et à la personne elle-même.
      async membres() {
        if (!personnes.voir) throw new Error('Réservé aux personnes du club.');
        const mid = monMembre()?.id;
        // Sans le droit « voir les coordonnées » : les noms seulement (sauf les siennes).
        return loadMembres().map((m) => vueMembre(m, m.id === mid, caissier)).map((m) => (personnes.coordonnees || m.moi ? m : { ...m, email: '', telephone: '' }));
      },
      async saveMembres(l) {
        if (!personnes.gerer) throw new Error('Réservé aux personnes qui ont le droit « Gérer les personnes ».');
        // IBAN et confidentialité gardés, comme les coordonnées masquées (sauf par la personne elle-même).
        const avant = loadMembres();
        const mid = monMembre()?.id;
        saveMembres(l.map((m) => fusionMembre(avant.find((x) => x.id === m.id), m, m.id === mid)));
        relire();
      },
      // Retirée du club : sa fiche désactivée (ses tâches gardent son nom) et sa fiche du registre retirée.
      async deleteMembre(id) {
        if (!personnes.gerer) throw new Error('Réservé aux personnes qui ont le droit « Gérer les personnes ».');
        const m = loadMembres().find((x) => x.id === id);
        if (!m || !moi) return;
        if (m.id === monMembre()?.id) throw new Error('Tu ne peux pas te retirer toi-même du club.');
        const d = loadEspace();
        const sienne = (p: Person) => p.actif && (p.membreId === id || (!p.membreId && !!emailKey(m.email) && emailKey(p.email) === emailKey(m.email)));
        const admins = d.people.filter((p) => p.actif && p.roles.includes(ADMIN_ROLE_ID));
        if (admins.some(sienne) && !admin) throw new Error(`${nomMembre(m)} est admin : réservé aux admins.`);
        if (admins.length && admins.every(sienne)) throw new Error(`${nomMembre(m)} est le seul admin : donne d’abord le rôle Admin à quelqu’un d’autre.`);
        deleteMembre(id);
        relire();
      },
      async monRegistre() {
        const m = monMembre();
        return m ? { id: m.id, prenom: m.prenom, nom: m.nom, iban: m.iban ?? '', prive: !!m.prive } : null;
      },
      // Mon IBAN, ma confidentialité : moi seul (comme le serveur).
      async enregistrerMonIban(iban) {
        const m = monMembre();
        if (!m) throw new Error('Tu n’es pas encore dans « Personnes du club » : demande à quelqu’un qui gère les personnes de t’y inscrire.');
        const v = compactIban(iban);
        if (!ibanValide(v)) throw new Error('IBAN invalide : vérifie-le (longueur et chiffres de contrôle).');
        saveMembres([{ ...m, iban: v || undefined }]);
        return v;
      },
      async setConfidentialite(masquer) {
        const m = monMembre();
        if (!m) throw new Error('Tu n’es pas encore dans « Personnes du club » : demande à quelqu’un qui gère les personnes de t’y inscrire.');
        saveMembres([{ ...m, prive: masquer }]);
      },
      // Démo : pas de comptes ni de mots de passe.
      demandesMdp: [],
      approuverMdp: () => Promise.reject(new Error('Pas de mots de passe dans la démo.')),
      refuserMdp: () => Promise.resolve(),
      superAdmin: false,
      // Sauvegarde de tout le club : les admins (version réelle : les super-admins).
      sauvegardeClub: admin
        ? async (par) => {
            const data = loadEspace();
            const personnes = loadMembres().map(({ iban: _iban, ...m }) => m);
            return {
              app: 'taches-gsa',
              version: 2,
              exportedAt: new Date().toISOString(),
              exportedBy: par,
              club: { id: espace.id, nom: espace.nom },
              entites: [{ id: espace.id, nom: espace.nom, type: 'central', schema: data.schema ?? 0, data, files: await fichiersDe(data, getFile) }],
              personnes,
            };
          }
        : undefined,
    }),
    [espace, admin, me, moi, personnes, caissier, monMembre, changerEspace, relire],
  );

  // Couche de données de l'espace ; ses fiches restent liées à « Personnes du club » (comme le serveur).
  const demo: DemoMode = useMemo(
    () => ({
      load: loadEspace,
      save: (d) => {
        const { change } = lierFiches(d);
        saveEspace(d);
        // Fiches liées au registre, ou personnes modifiées (rôles…) : relues (mes droits au club aussi).
        const sig = JSON.stringify(d.people.map((p) => [p.id, p.actif, p.roles, p.membreId]));
        if (change || (personnesVues !== null && sig !== personnesVues)) queueMicrotask(relire);
        personnesVues = sig;
      },
      epoch: version,
      personId: me,
      logout,
      reset: () => {
        resetDemo();
        window.location.hash = '';
        window.location.reload();
      },
    }),
    [me, version, logout, relire],
  );

  if (!me || !moi) {
    const d = loadEspace();
    return (
      <Login
        data={d}
        logo={espace.logo}
        onPick={(id) => {
          saveMoi(id);
          setMe(id);
          relire();
        }}
        onReset={() => {
          resetDemo();
          window.location.reload();
        }}
      />
    );
  }

  return (
    <ClubCtx.Provider value={club}>
      <StoreProvider key={me} demo={demo}>
        <App />
      </StoreProvider>
    </ClubCtx.Provider>
  );
}
