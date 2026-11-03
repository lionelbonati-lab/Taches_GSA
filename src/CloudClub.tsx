import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClubCtx, type Club, type Espace } from './data/club';
import {
  accessAction,
  caissierClub,
  deleteMembre,
  demandesMdp,
  effacerErreursAppli,
  erreursAppli,
  espaceDe,
  estSuperAdmin,
  fetchMembres,
  historiqueTache,
  maConfidentialite,
  membresAcces,
  mesPropositions,
  modifierEspace,
  monIban,
  monRegistre,
  personnesDroits,
  pourInfoRelancer,
  pourInfoSuivi,
  proposerAmelioration,
  reglerErreurAppli,
  sauvegardeClub,
  saveMembres,
  signalerErreur,
  verifyVisa,
  type DemandeMdp,
  type Membership,
} from './data/cloud';

// Version réelle : le club autour de son espace (PLAN_APPLI_SIMPLE.md). L'espace est celui que l'appli ouvre (sur le
// serveur, l'ancien comité central : CloudApp) ; « Personnes du club », propositions, erreurs, mots de passe oubliés et
// sauvegarde passent par les fonctions du serveur.

export function CloudClub({ m, userId, children }: { m: Membership; userId: string; children: ReactNode }) {
  const clubId = m.parentId ?? m.committeeId;
  const [espace, setEspace] = useState<Espace>(() => espaceDe(m));
  const [acces, setAcces] = useState(false);
  const [caissier, setCaissier] = useState(false);
  // Personnes du club (055) : null avant la migration (le registre, selon `acces`).
  const [droitsPersonnes, setDroitsPersonnes] = useState<{ voir: boolean; coordonnees: boolean; gerer: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setEspace(espaceDe(m));
    setLoading(true);
    void Promise.all([membresAcces(clubId), caissierClub(clubId), personnesDroits(clubId)])
      .then(([a, c, dp]) => {
        setAcces(a);
        setCaissier(c);
        setDroitsPersonnes(dp);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [m, clubId, userId]);

  // Mots de passe oubliés : demandes des membres de l'espace (le serveur ne répond qu'aux admins), revues toutes les 5 minutes.
  const [demandes, setDemandes] = useState<DemandeMdp[]>([]);
  const chargerDemandes = useCallback(() => void demandesMdp(m.committeeId).then(setDemandes), [m.committeeId]);
  useEffect(() => {
    chargerDemandes();
    const id = setInterval(chargerDemandes, 5 * 60_000);
    return () => clearInterval(id);
  }, [chargerDemandes]);
  const [superAdmin, setSuperAdmin] = useState(false);
  useEffect(() => {
    void estSuperAdmin().then(setSuperAdmin);
  }, [userId]);

  const ici = m.committeeId;
  const club: Club = useMemo(
    () => ({
      espace,
      loading,
      async modifierEspace(patch) {
        const r = await modifierEspace(ici, patch);
        setEspace(espaceDe({ committeeId: ici, committeeName: r.nom, info: r.info }));
      },
      verifierVisa: (code) => verifyVisa(code),
      historique: (tacheId) => historiqueTache(ici, tacheId, ici),
      signalerErreur: (r) => signalerErreur(ici, r).catch(() => {}),
      erreurs: () => erreursAppli(ici),
      reglerErreur: (id, reglee) => reglerErreurAppli(ici, id, reglee),
      effacerErreurs: () => effacerErreursAppli(ici),
      suiviPourInfo: (tacheIds) => pourInfoSuivi(ici, tacheIds),
      relancerPourInfo: async (tacheId) => ({ n: await pourInfoRelancer(ici, tacheId, ici), ici: [] }),
      async proposerAmelioration(p) {
        await proposerAmelioration(clubId, ici, p);
      },
      mesPropositions: () => mesPropositions(clubId),
      // Serveur à jour (055) : ses droits ; avant : le registre, selon le droit « Membres du club ».
      personnes: droitsPersonnes ?? { voir: acces || caissier, coordonnees: acces || caissier, gerer: acces },
      caissier,
      membres: () => fetchMembres(clubId),
      saveMembres: (l) => saveMembres(clubId, l),
      async deleteMembre(id) {
        await deleteMembre(clubId, id);
      },
      monRegistre: () => monRegistre(clubId),
      enregistrerMonIban: (iban) => monIban(clubId, iban),
      setConfidentialite: (masquer) => maConfidentialite(clubId, masquer),
      demandesMdp: demandes,
      async approuverMdp(id) {
        try {
          return await accessAction<{ email: string; password: string }>({ action: 'approuverMdp', demandeId: id });
        } finally {
          chargerDemandes();
        }
      },
      async refuserMdp(id) {
        try {
          await accessAction({ action: 'refuserMdp', demandeId: id });
        } finally {
          chargerDemandes();
        }
      },
      superAdmin,
      // Sauvegarde de tout le club (super-admins) : l'espace, et les anciennes entités archivées telles qu'elles sont restées.
      sauvegardeClub: superAdmin ? (par) => sauvegardeClub(clubId, espace.nom, par) : undefined,
    }),
    [espace, loading, ici, clubId, droitsPersonnes, acces, caissier, demandes, chargerDemandes, superAdmin],
  );

  return <ClubCtx.Provider value={club}>{children}</ClubCtx.Provider>;
}
