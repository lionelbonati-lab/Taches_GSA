import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ClubCtx, toPerson, type ApercuSuppression, type Club, type CreatedUnit, type NewUnit } from './data/club';
import { accessAction, attribuerTache, caissierClub, deleteMembre, demandesMdp, enregistrerFiche, fichesEntite, maConfidentialite, monIban, monRegistre, estSuperAdmin, type DemandeMdp, fetchAgendaClub, fetchAnciennesTaches, fetchSeancesComite, fetchSectionsDependantes, fetchTachesPartagees, fetchSondagesPartages, fetchMembres, fetchOrg, fetchOrganigrammesAnnuels, membresAcces, photographierOrganigramme, saveMembres, saveTachePartagee, membershipUnit, mesPropositions, myCentralTickets, myMemberships, myRequests, proposerAmelioration, proposeTask, rattraper, sendCentralTicket, setEditionDate, toRows, updateCommittee, voterSondagePartage, type Membership } from './data/cloud';
import { defaultRoleId, unitData } from './data/units';
import { ADMIN_ROLE_ID } from './data/permissions';
import { uid } from './data/utils';
import type { OrgUnit } from './data/types';

// Version réelle : le club autour de l'entité ouverte (organigramme, changement d'entité, demandes au comité central).
// Les données de chaque entité restent dans la sienne ; ce qui passe de l'une à l'autre passe par les
// fonctions du serveur (gsa_organigramme, gsa_proposer_tache, gsa_mes_demandes, gsa_taches_partagees, gsa-acces
// « creerUnite »). On n'ouvre que les entités dont on est membre : le comité dont une entité dépend voit ses tâches
// selon son réglage (« Ses tâches dans … », 027).
// Organigramme à glisser-déposer : chaque modification est faite par le serveur (gsa-acces, orga.ts), qui touche
// souvent plusieurs entités ; l'entité ouverte la reçoit en direct comme les modifications des autres membres.

/** Enregistre le nom et la fiche (colonne info) d'une entité telle qu'elle doit être. */
function ecrireEntite(u: OrgUnit) {
  return updateCommittee(u.id, {
    name: u.nom,
    type: u.type,
    info: {
      couleur: u.couleur,
      description: u.description || undefined,
      date: u.date || undefined,
      dateFin: u.date && u.dateFin && u.dateFin > u.date ? u.dateFin : undefined,
      archive: u.archive || undefined,
      // Ancien réglage « Accès du comité central » (006), plus proposé : gardé tel quel.
      central: u.central && u.central !== 'aucun' ? u.central : undefined,
      logo: u.logo || undefined,
      couleurAppli: u.couleurAppli || undefined,
      dependDe: u.dependDe || undefined,
      tachesDependance: u.tachesDependance && u.tachesDependance !== 'partagees' ? u.tachesDependance : undefined,
      // Tenu par le serveur (030), qui n'en garde que le droit de copie de la dernière période.
      historiqueDependance: u.historiqueDependance?.length ? u.historiqueDependance : undefined,
      carte: u.carte,
      rangement: u.rangement?.length ? u.rangement : undefined,
    },
  });
}

export function CloudClub({ m, userId, onSwitch, children }: { m: Membership; userId: string; onSwitch: (m: Membership) => void; children: ReactNode }) {
  const clubId = m.parentId ?? m.committeeId;
  const [org, setOrg] = useState<OrgUnit[] | null>(null);
  const [list, setList] = useState<Membership[]>([m]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [acces, setAcces] = useState(false);
  const [caissier, setCaissier] = useState(false);
  // Le serveur tient les postes des fiches (migration 023) : organigramme à glisser-déposer.
  const [orga, setOrga] = useState(false);
  const conversion = useRef(false);
  const ouverte = useRef(m.committeeId);
  ouverte.current = m.committeeId;

  // Historique de l'organigramme (026) : après chaque lecture, le serveur reprend la photo de l'année (rien s'il n'a pas changé).
  const photo = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(photo.current), []);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([fetchOrg(clubId), myMemberships(userId), membresAcces(clubId), caissierClub(clubId)])
      .then(([o, l, a, c]) => {
        setOrg(o.units);
        setOrga(o.postes);
        setList(l);
        setAcces(a);
        setCaissier(c);
        setError('');
        clearTimeout(photo.current);
        photo.current = setTimeout(() => void photographierOrganigramme(clubId).catch(() => {}), 3000);
        // Première ouverture : les postes des fiches sont déduits de leurs fonctions, une fois pour tout le club.
        if (o.postes && !conversion.current && o.units.some((u) => !u.postes)) {
          conversion.current = true;
          accessAction<{ converti?: boolean }>({ action: 'postes', committeeId: ouverte.current })
            .then((r) => {
              if (!r.converti) return;
              rattraper();
              return fetchOrg(clubId).then((x) => setOrg(x.units));
            })
            .catch(() => {});
        }
      })
      .catch((e: Error) => setError(`Organigramme indisponible : ${e.message}`))
      .finally(() => setLoading(false));
  }, [clubId, userId]);
  useEffect(refresh, [refresh]);

  // Mots de passe oubliés : demandes des membres de l'entité ouverte (le serveur ne répond qu'à ses admins), revues toutes les 5 minutes.
  const [demandes, setDemandes] = useState<DemandeMdp[]>([]);
  const chargerDemandes = useCallback(() => {
    void demandesMdp(m.committeeId).then(setDemandes);
  }, [m.committeeId]);
  useEffect(() => {
    chargerDemandes();
    const id = setInterval(chargerDemandes, 5 * 60_000);
    return () => clearInterval(id);
  }, [chargerDemandes]);
  const [superAdmin, setSuperAdmin] = useState(false);
  useEffect(() => {
    void estSuperAdmin().then(setSuperAdmin);
  }, [userId]);

  const club = useMemo<Club>(() => {
    const units = org ?? [membershipUnit(m)];
    const current = units.find((u) => u.id === m.committeeId) ?? membershipUnit(m);
    const central = units.find((u) => u.type === 'central') ?? null;
    const reachable = new Set(list.map((x) => x.committeeId));
    return {
      units,
      current,
      central,
      mine: units.filter((u) => u.moi && reachable.has(u.id) && (!u.archive || u.id === current.id)),
      canManage: !!central?.moiAdmin,
      // Remplacés par les dépendances (030) : plus d'entité entière ajoutée parmi les membres d'une autre.
      liens: false,
      loading,
      error,
      refresh,
      switchUnit(id, hash = '#/') {
        if (id === m.committeeId) return;
        const target = list.find((x) => x.committeeId === id);
        if (!target) return;
        window.location.hash = hash;
        onSwitch(target);
      },
      async createUnit(n: NewUnit): Promise<CreatedUnit> {
        if (!central) throw new Error('Comité central introuvable.');
        const chef = toPerson(n.chef, [ADMIN_ROLE_ID]);
        const d = unitData(n.type, [], chef.id, n.nom);
        const chefEmail = n.chef.email.trim().toLowerCase();
        d.people = [chef, ...n.membres.filter((x) => x.email.trim().toLowerCase() !== chefEmail).map((x) => toPerson(x, [defaultRoleId(d.roles)]))];
        // Organigramme : pas encore de poste ; le serveur lie ensuite à la nouvelle entité les postes qui portent son nom.
        if (orga) d.postes = (n.postes ?? []).map((nom) => ({ id: uid('po'), nom }));
        const r = await accessAction<{ unitId: string; email?: string; password?: string; existant?: boolean; error?: string }>({
          action: 'creerUnite',
          committeeId: central.id,
          unite: { nom: n.nom, type: n.type, info: { couleur: n.couleur, description: n.description, date: n.date, dateFin: n.dateFin } },
          rows: toRows(d),
          chefId: chef.id,
        });
        // « Dépend de » (organigramme) : ajouté ensuite à la fiche, la création ne garde que les champs de départ.
        const info = { couleur: n.couleur, description: n.description || undefined, date: n.date || undefined, dateFin: n.dateFin || undefined, dependDe: n.dependDe };
        if (n.dependDe) await updateCommittee(r.unitId, { name: n.nom, type: n.type, info }).catch(() => {});
        refresh();
        return { unitId: r.unitId, email: r.email, password: r.password, existant: r.existant, avertissement: r.error };
      },
      async updateUnit(id, patch) {
        const u = units.find((x) => x.id === id);
        if (!u) throw new Error('Entité introuvable.');
        await ecrireEntite({ ...u, ...patch });
        // Renommée : les postes qui portent son nouveau nom lui sont liés (organigramme).
        if (orga && patch.nom && patch.nom !== u.nom) await accessAction({ action: 'lierEntite', committeeId: id }).catch(() => {});
        refresh();
      },
      async apercuSuppression(id) {
        if (!central) throw new Error('Comité central introuvable.');
        return accessAction<ApercuSuppression>({ action: 'supprimerUnite', committeeId: central.id, uniteId: id, apercu: true }).catch((e) => {
          throw e instanceof Error && e.message === 'Action inconnue.' ? new Error('Le serveur ne sait pas encore supprimer une entité (fonction gsa-acces à mettre à jour).') : e;
        });
      },
      async supprimerUnite(id, nom) {
        if (!central) throw new Error('Comité central introuvable.');
        const r = await accessAction<{ avertissement?: string }>({ action: 'supprimerUnite', committeeId: central.id, uniteId: id, nom });
        refresh();
        return r.avertissement;
      },
      async placerCartes(places) {
        const faits = await Promise.allSettled(
          Object.entries(places).map(([id, carte]) => {
            const u = units.find((x) => x.id === id);
            return u ? ecrireEntite({ ...u, carte: carte ?? undefined }) : Promise.reject(new Error('Entité introuvable.'));
          }),
        );
        refresh();
        const echec = faits.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (echec) throw echec.reason instanceof Error ? echec.reason : new Error(String(echec.reason));
      },
      async setEditionDate(date, dateFin) {
        await setEditionDate(m.committeeId, date, dateFin);
        refresh();
      },
      async proposeTask(r) {
        await proposeTask(m.committeeId, { titre: r.titre, remarque: r.remarque, delai: r.delai, sectionId: r.sectionId });
      },
      myRequests: () => myRequests(m.committeeId),
      // Organigramme à glisser-déposer : le serveur applique la modification (droits, postes liés) et donne de quoi l'annuler.
      organiser: orga
        ? async (op) => {
            try {
              const r = await accessAction<{ message: string; unites?: string[]; annuler?: string }>({ action: 'organiser', committeeId: m.committeeId, op });
              if (r.unites?.includes(m.committeeId)) rattraper();
              return {
                message: r.message,
                annuler: async () => {
                  if (!r.annuler) return;
                  try {
                    await accessAction({ action: 'annulerOrga', committeeId: m.committeeId, jeton: r.annuler });
                  } finally {
                    rattraper();
                    refresh();
                  }
                },
              };
            } catch (e) {
              if (op.type === 'placer' && op.vers.zone === 'avec' && (e as Error).message === 'Modification invalide.')
                throw new Error('Le serveur ne sait pas encore mettre plusieurs personnes sur un poste : la fonction « gsa-acces » doit d’abord être mise à jour.');
              throw e;
            } finally {
              refresh();
            }
          }
        : undefined,
      suivrePostes:
        orga
          ? async (avant) => {
              const r = await accessAction<{ unites?: string[] }>({ action: 'suivre', committeeId: m.committeeId, avant });
              if (r.unites?.includes(m.committeeId)) rattraper();
              if (r.unites?.some((id) => id !== m.committeeId)) refresh();
            }
          : undefined,
      async proposerAmelioration(p) {
        await proposerAmelioration(clubId, m.committeeId, p);
      },
      mesPropositions: () => mesPropositions(clubId),
      organigrammesAnnuels: () => fetchOrganigrammesAnnuels(clubId),
      async ticketCentral(t) {
        await sendCentralTicket(m.committeeId, t);
      },
      mesTicketsCentraux: () => myCentralTickets(),
      agendaClub: () => fetchAgendaClub(clubId),
      tachesPartagees: () => fetchTachesPartagees(m.committeeId),
      seancesComite: () => fetchSeancesComite(m.committeeId),
      sectionsDependantes: () => fetchSectionsDependantes(m.committeeId),
      anciennesTaches: () => fetchAnciennesTaches(m.committeeId),
      modifierTachePartagee: (uniteId, task) => saveTachePartagee(m.committeeId, uniteId, task),
      attribuerTache: (uniteId, task, statut) => attribuerTache(m.committeeId, uniteId, task, statut),
      sondagesPartages: () => fetchSondagesPartages(m.committeeId),
      voterSondagePartage: (uniteId, pollId, choix, texte) => voterSondagePartage(m.committeeId, uniteId, pollId, choix, texte),
      membresAcces: acces,
      membres: () => fetchMembres(clubId),
      async saveMembres(l) {
        await saveMembres(clubId, l);
        refresh();
      },
      async deleteMembre(id) {
        await deleteMembre(clubId, id);
        refresh();
      },
      caissier,
      monRegistre: () => monRegistre(clubId),
      enregistrerMonIban: (iban) => monIban(clubId, iban),
      setConfidentialite: (masquer) => maConfidentialite(clubId, masquer),
      async fichesEntite(uniteId) {
        if (!units.find((u) => u.id === uniteId)?.moiAdmin) throw new Error('Réservé aux admins de l’entité.');
        return fichesEntite(uniteId);
      },
      async enregistrerFiche(uniteId, p) {
        const u = units.find((x) => x.id === uniteId);
        if (!u?.moiAdmin) throw new Error(`Réservé aux admins de « ${u?.nom ?? 'l’entité'} ».`);
        const { people } = await fichesEntite(uniteId);
        const i = people.findIndex((x) => x.id === p.id);
        await enregistrerFiche(uniteId, p, i >= 0 ? i : people.length);
        // Comme après une fiche modifiée dans l'entité : ses postes et les postes liés suivent (serveur).
        if (orga) await accessAction({ action: 'suivre', committeeId: uniteId, avant: people });
        if (uniteId === m.committeeId) rattraper();
        refresh();
      },
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
    };
  }, [org, list, m, loading, error, refresh, onSwitch, acces, caissier, clubId, orga, demandes, chargerDemandes, superAdmin]);

  return <ClubCtx.Provider value={club}>{children}</ClubCtx.Provider>;
}
