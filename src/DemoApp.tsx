import { useCallback, useEffect, useMemo, useState } from 'react';
import { StoreProvider, type DemoMode } from './data/store';
import { ClubCtx, toPerson, type ApercuSuppression, type Club, type CreatedUnit, type NewUnit } from './data/club';
import { CENTRAL_ID, deleteMembre, ecrireBrut, effacerErreursDemo, erreursDemo, reglerErreurDemo, signalerErreurDemo, initMembres, initPostes, lierEntiteDemo, lierFiches, lireBrut, lireHistoriqueDemo, loadMe, loadMembres, loadOrganigrammes, loadUnitData, loadUnits, migrerLiens, photographierDemo, propagerLiens, resetDemo, saveMe, saveMembres, saveUnitData, saveUnits, signatureMembres, suivrePostes, synchroDemo, UNIT_KEY } from './data/demoClub';
import { caisseDe, defaultRoleId, nouvelHistorique, orgMembers, parentDans, personKey, reglageTaches, sortUnits, unitData } from './data/units';
import { ADMIN_ROLE_ID, hasPermission, userRoles } from './data/permissions';
import { compactIban, emailKey, fusionMembre, ibanValide, nouveauMembre, vueMembre } from './data/membres';
import { appliquer, estEtoile } from './data/organigramme';
import { uid } from './data/utils';
import { deleteFiles } from './data/files';
import { fileIds } from './data/backup';
import type { AgendaClubEvent, AppData, MyRequest, OrgUnit, Person, Proposition, SeancesDuComite, SectionsDependantes, SondagePartage, SuiviTicket, TachePartagee, Task, Unit } from './data/types';
import { avecVote, cleVote, electorat, isOpen } from './data/polls';
import { fusionPartagee, tacheDans } from './data/partage';
import { reponseAilleurs } from './data/aPrendre';
import { ajouterVus, attendusDe, clesVu, dernierAttendu } from './data/pourInfo';
import { appliquerCommentaire, destinatairesCommentaire, notifsCommentaire, unParPersonne } from './data/commentaires';
import { changementsTache } from './data/historique';
import { nettoyerAttribuee } from './data/externes';
import { GENRES, caissiers, sectionFinances, statutPour, visaDans, type Ticket } from './data/paiements';
import { App } from './App';
import { Login } from './pages/Login';
import { uniteDuLien } from './data/lienPartage';

// Démo : le club et ses entités, toutes gardées dans ce navigateur.
// On se connecte en choisissant une personne de l'annuaire du club ; elle retrouve les entités dont elle fait partie,
// et, membre du comité central, celles qui lui sont ouvertes (consulter, ou aussi modifier / ajouter).

// Entité d'un lien reçu (WhatsApp…), sinon la dernière ouverte.
// Relances « Pour info » de la démo (entité:tâche → heure) : une par heure, dans ce navigateur.
const relancesDemo = new Map<string, number>();

/**
 * Personnes attendues sur une tâche « Pour info » de l'entité `uniteId` (démo ; version réelle : 052) : une personne « a un
 * compte » si sa fiche est active et a un email ; une entité mentionnée en entier, ses rôles « Voir toutes les tâches ».
 */
function attendusDemo(t: Task, uniteId: string, units: Unit[]) {
  const lues = new Map<string, AppData | undefined>();
  const de = (e: string) => {
    if (!lues.has(e)) lues.set(e, units.some((x) => x.id === e && !x.archive) ? loadUnitData(e) : undefined);
    return lues.get(e);
  };
  return attendusDe(
    t,
    uniteId,
    (e, f) => !!de(e)?.people.some((p) => p.id === f && p.actif && !!p.email),
    (e) => { const d = de(e); return d ? d.people.filter((p) => p.actif && !!p.email && hasPermission(userRoles(d.roles, p), 'tasks.viewAll')).map((p) => p.id) : []; },
  );
}

const readUnit = () => {
  try {
    return uniteDuLien() ?? localStorage.getItem(UNIT_KEY);
  } catch {
    return null;
  }
};

export function DemoApp() {
  const [units, setUnits] = useState<Unit[]>(() => {
    const u = loadUnits();
    initMembres(u);
    initPostes(u);
    return migrerLiens(u);
  });
  const [me, setMe] = useState<string | null>(() => loadMe());
  const [unitId, setUnitId] = useState<string | null>(readUnit);
  const [version, setVersion] = useState(0);
  // Fiches de l'entité ouverte modifiées depuis le registre des membres du club : l'écran les relit.
  const [epoch, setEpoch] = useState(0);

  // Organigramme : membres de chaque entité, lus dans ses données.
  const org: OrgUnit[] = useMemo(
    () =>
      sortUnits(units).map((u) => {
        const d = loadUnitData(u.id);
        const mine = me ? d.people.find((p) => p.actif && personKey(p, u.id) === me) : undefined;
        return {
          ...u,
          membres: orgMembers(d),
          moi: !!mine,
          moiAdmin: !!mine?.roles.includes(ADMIN_ROLE_ID),
          sections: u.type === 'central' ? d.sections.map((s) => ({ id: s.id, nom: s.nom })) : undefined,
          liens: d.membresDe?.length ? d.membresDe.map((l) => l.uniteId) : undefined,
          postes: d.postes,
        };
      }),
    // `version` : relire après une modification faite dans une autre entité.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, me, version],
  );

  // Ma fiche dans chacune de mes entités : mes messages écrits d'ailleurs restent les miens.
  const mesFiches = useMemo(
    () =>
      Object.fromEntries(
        me
          ? units.flatMap((u) => {
              const p = loadUnitData(u.id).people.find((x) => personKey(x, u.id) === me);
              return p ? [[u.id, p.id]] : [];
            })
          : [],
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, me, version],
  );

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  // Historique de l'organigramme : photo de l'année en cours, reprise à chaque changement.
  useEffect(() => photographierDemo(org), [org]);
  const logout = useCallback(() => {
    saveMe(null);
    setMe(null);
  }, []);

  // Registre des membres du club : droit « club.membres » (ou admin) dans l'une des entités.
  const membresAcces = useMemo(
    () =>
      !!me &&
      units.some((u) => {
        const d = loadUnitData(u.id);
        const p = d.people.find((x) => x.actif && personKey(x, u.id) === me);
        return !!p && hasPermission(userRoles(d.roles, p), 'club.membres');
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, me, version],
  );

  // Caissier du club : un rôle qui donne expressément « paiements.payer » (hors Admin) dans l'une de ses entités.
  const caissier = useMemo(
    () =>
      !!me &&
      units.some((u) => {
        if (u.archive) return false;
        const d = loadUnitData(u.id);
        const p = d.people.find((x) => x.actif && personKey(x, u.id) === me);
        return !!p && d.roles.some((r) => p.roles.includes(r.id) && !r.locked && r.permissions.includes('paiements.payer'));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, me, version],
  );

  const mineAll = org.filter((u) => u.moi);
  const central = org.find((u) => u.type === 'central') ?? null;
  const current =
    mineAll.find((u) => u.id === unitId) ??
    mineAll.find((u) => u.type === 'central' && !u.archive) ??
    mineAll.find((u) => !u.archive) ??
    mineAll[0];
  const switchUnit = useCallback(
    (id: string, hash = '#/') => {
      if (!org.find((u) => u.id === id)?.moi) return;
      try {
        localStorage.setItem(UNIT_KEY, id);
      } catch {
        /* ignore */
      }
      setUnitId(id);
      window.location.hash = hash;
      setVersion((v) => v + 1);
    },
    [org],
  );

  // Ma fiche du registre (comme le serveur, gsa_mon_membre) : celle de l'une de mes fiches d'entité, sinon même email.
  const monMembre = () => {
    const list = loadMembres();
    for (const u of sortUnits(units)) {
      const p = loadUnitData(u.id).people.find((x) => x.membreId && personKey(x, u.id) === me);
      const m = p && list.find((x) => x.id === p.membreId);
      if (m) return m;
    }
    return list.find((x) => !!me && emailKey(x.email) === me);
  };

  const club: Club | null = useMemo(() => {
    if (!current) return null;
    return {
      units: org,
      current,
      central,
      mine: mineAll.filter((u) => !u.archive || u.id === current.id),
      mesFiches,
      canManage: !!central?.moiAdmin,
      // Remplacés par les dépendances (030) : plus d'entité entière ajoutée parmi les membres d'une autre.
      liens: false,
      loading: false,
      error: '',
      switchUnit,
      refresh,
      async createUnit(n: NewUnit): Promise<CreatedUnit> {
        const id = uid('u-');
        const base = unitData(n.type, [], 'p1', n.nom);
        const chef = toPerson(n.chef, [ADMIN_ROLE_ID]);
        base.people = [chef, ...n.membres.filter((m) => m.email.toLowerCase() !== n.chef.email.toLowerCase()).map((m) => toPerson(m, [defaultRoleId(base.roles)]))];
        base.log[0].userId = chef.id;
        base.postes = (n.postes ?? []).map((nom) => ({ id: uid('po'), nom }));
        saveUnitData(id, lierFiches(id, base));
        const next = [...units, { id, nom: n.nom, type: n.type, parentId: central?.id ?? CENTRAL_ID, couleur: n.couleur, icone: n.icone, description: n.description, date: n.date, dateFin: n.dateFin, dependDe: n.dependDe }];
        saveUnits(next);
        setUnits(next);
        // Organigramme : les postes qui portent son nom (« Camp de Pentecôte » au comité central) lui sont liés.
        if (lierEntiteDemo(id).includes(current.id)) setEpoch((e) => e + 1);
        return { unitId: id };
      },
      async updateUnit(id, patch) {
        let next = units.map((u) => (u.id === id ? { ...u, ...patch } : u));
        // Historique des dépendances, tenu comme par le serveur (030).
        const u0 = org.find((u) => u.id === id);
        if (u0) {
          const taches = loadUnitData(id).tasks.filter((t) => !t.paiement).map((t) => t.id);
          const h = nouvelHistorique(units, next, id, { reglage: reglageTaches(org, u0), taches });
          next = next.map((u) => (u.id === id ? { ...u, historiqueDependance: h } : u));
        }
        saveUnits(next);
        setUnits(next);
        if (patch.nom && patch.nom !== units.find((u) => u.id === id)?.nom && lierEntiteDemo(id).includes(current.id)) setEpoch((e) => e + 1);
      },
      // Entité archivée supprimée définitivement (version réelle : action « supprimerUnite » de gsa-acces).
      async apercuSuppression(id): Promise<ApercuSuppression> {
        const u = units.find((x) => x.id === id);
        if (!u || u.type === 'central') throw new Error('Entité introuvable.');
        const d = loadUnitData(id);
        return {
          nom: u.nom,
          taches: d.tasks.filter((t) => !t.paiement).length,
          tickets: d.tasks.filter((t) => t.paiement).length,
          seances: d.meetings.length,
          evenements: d.events.length,
          sondages: (d.polls ?? []).length,
          personnes: d.people.length,
          fichiers: fileIds(d).length,
          dependantes: units.filter((x) => !x.archive && x.id !== id && x.dependDe === id).map((x) => x.nom),
          postesLies: units.filter((x) => x.id !== id).reduce((n, x) => n + (loadUnitData(x.id).postes ?? []).filter((p) => p.lien === id).length, 0),
        };
      },
      async supprimerUnite(id, nom) {
        const u = units.find((x) => x.id === id);
        if (!u || u.type === 'central') throw new Error('Entité introuvable.');
        if (!central?.moiAdmin) throw new Error('Réservé aux administrateurs du comité central.');
        if (!u.archive) throw new Error('Seule une entité archivée se supprime : archive-la d’abord.');
        if (nom.trim() !== u.nom.trim()) throw new Error('Le nom tapé n’est pas celui de l’entité : rien n’a été supprimé.');
        if (id === current.id) throw new Error('Ouvre une autre entité pour supprimer celle-ci.');
        const d = loadUnitData(id);
        const fichiers = fileIds(d);
        await deleteFiles(fichiers);
        ecrireBrut(id, null);
        // Postes liés ⛓ à elle : déliés (le poste et son titulaire restent).
        for (const x of units) {
          if (x.id === id) continue;
          const dx = loadUnitData(x.id);
          if (!dx.postes?.some((p) => p.lien === id)) continue;
          dx.postes = dx.postes.map(({ lien, ...p }) => (lien === id ? p : { ...p, lien }));
          saveUnitData(x.id, dx);
        }
        // Registre « Membres du club » : plus dans ce groupe.
        const membres = loadMembres().filter((m) => m.groupes.includes(id));
        if (membres.length) saveMembres(membres.map((m) => ({ ...m, groupes: m.groupes.filter((g) => g !== id) })));
        if (central) {
          const dc = loadUnitData(central.id);
          const fiche = dc.people.find((p) => personKey(p, central.id) === me);
          dc.log.unshift({ id: uid('l'), at: new Date().toISOString(), userId: fiche?.id ?? '', action: `Entité « ${u.nom} » supprimée définitivement (archivée ; ses données, ses accès et ${fichiers.length} fichier(s))` });
          saveUnitData(central.id, dc);
        }
        const next = units.filter((x) => x.id !== id);
        saveUnits(next);
        setUnits(next);
        setEpoch((e) => e + 1);
        return undefined;
      },
      async placerCartes(places) {
        const next = units.map((u) => (u.id in places ? { ...u, carte: places[u.id] ?? undefined } : u));
        saveUnits(next);
        setUnits(next);
      },
      async setEditionDate(date, dateFin) {
        const next = units.map((u) => (u.id === current.id ? { ...u, date, dateFin: dateFin && dateFin > date ? dateFin : undefined } : u));
        saveUnits(next);
        setUnits(next);
      },
      async proposeTask(r) {
        if (!central) throw new Error('Pas de comité central.');
        const d = loadUnitData(central.id);
        const now = new Date().toISOString();
        const open = d.statuses.find((s) => !s.done) ?? d.statuses[0];
        const t: Task = {
          id: uid('d'),
          sectionId: d.sections.some((s) => s.id === r.sectionId) ? r.sectionId : d.sections[0]?.id ?? '',
          sousSection: '',
          titre: r.titre.trim(),
          responsables: [],
          statusId: open?.id ?? '',
          delai: r.delai,
          remarque: r.remarque.trim(),
          checklist: [],
          createdBy: '',
          updatedAt: now,
          proposee: { uniteId: current.id, unite: current.nom, par: r.par, le: now },
        };
        d.tasks.unshift(t);
        d.log.unshift({ id: uid('l'), at: now, userId: '', action: `Demande de « ${current.nom} » (${r.par}) : « ${t.titre} »` });
        saveUnitData(central.id, d);
      },
      async myRequests(): Promise<MyRequest[]> {
        if (!central) return [];
        const d = loadUnitData(central.id);
        return d.tasks
          .filter((t) => t.proposee?.uniteId === current.id)
          .map((t) => {
            const s = d.statuses.find((x) => x.id === t.statusId);
            return {
              id: t.id,
              titre: t.titre,
              delai: t.delai,
              le: t.proposee!.le,
              par: t.proposee!.par,
              statut: s?.label ?? '?',
              couleur: s?.couleur ?? '#999',
              termine: !!s?.done,
              supprimee: false,
              responsables: t.responsables.map((id) => d.people.find((p) => p.id === id)).filter((p): p is Person => !!p).map((p) => `${p.prenom} ${p.nom}`.trim()),
            };
          })
          .sort((a, b) => b.le.localeCompare(a.le));
      },
      // Organigramme à glisser-déposer (voir data/organigramme.ts ; version réelle : par la fonction « gsa-acces »).
      organiser: async (op) => {
        const brut = new Map(units.map((u) => [u.id, lireBrut(u.id)]));
        // Personne pas encore au club : sa fiche du registre d'abord, pour la retrouver d'une entité à l'autre.
        if (op.type === 'placer' && !op.qui.membreId && !emailKey(op.qui.email)) {
          if (!op.qui.prenom.trim() && !op.qui.nom.trim()) throw new Error('Indique au moins son prénom ou son nom.');
          const n = nouveauMembre({ prenom: op.qui.prenom, nom: op.qui.nom, couleur: op.qui.couleur });
          saveMembres([n]);
          op = { ...op, qui: { ...op.qui, membreId: n.id } };
        }
        const data = new Map(units.map((u) => [u.id, loadUnitData(u.id)]));
        const avant = new Map([...data].map(([id, d]) => [id, JSON.stringify(d)]));
        const message = appliquer({ units, data, notes: [] }, op);
        const changees = units.filter((u) => JSON.stringify(data.get(u.id)) !== avant.get(u.id));
        // Comme le serveur le fera : les fiches touchées directement, par leurs admins ou ceux du comité central (lier un
        // poste : aussi l'entité liée, si elle change). Celles qui suivent par un poste lié suivent : c'est le principe du lien.
        const directes = new Set(op.type === 'placer' ? [op.depuis?.uniteId, op.vers.zone === 'corbeille' ? undefined : op.vers.uniteId] : op.type === 'lier' ? [op.uniteId, op.lien] : [op.uniteId]);
        for (const u of changees)
          if (directes.has(u.id) && !central?.moiAdmin && !org.find((x) => x.id === u.id)?.moiAdmin) throw new Error(`Réservé aux admins de « ${u.nom} » ou du comité central.`);
        if (central && changees.some((u) => u.id === central.id) && !data.get(central.id)!.people.some(estEtoile)) throw new Error('Le comité central garde au moins un ★.');
        for (const u of changees) {
          const d = data.get(u.id)!;
          const n = synchroDemo(u.id, d);
          saveUnitData(u.id, lierFiches(u.id, n ?? d));
        }
        for (const u of changees) propagerLiens(u.id);
        const apres = new Map(units.map((u) => [u.id, lireBrut(u.id)]));
        if (changees.some((u) => u.id === current.id)) setEpoch((e) => e + 1);
        if (changees.length) refresh();
        return {
          message,
          annuler: async () => {
            for (const u of units) if (apres.get(u.id) !== brut.get(u.id)) ecrireBrut(u.id, brut.get(u.id) ?? null);
            setEpoch((e) => e + 1);
            refresh();
          },
        };
      },
      // Proposition d'amélioration de l'appli, rangée au comité central (version réelle : gsa_proposer_amelioration).
      async proposerAmelioration(r) {
        if (!central || !me) throw new Error('Pas de comité central.');
        const texte = r.texte.trim().slice(0, 4000);
        if (!texte) throw new Error('La proposition est vide');
        // Nom : sa fiche dans l'entité ouverte, sinon au comité central, sinon dans une autre entité.
        const ids = [current.id, central.id, ...units.map((u) => u.id)];
        const fiche = ids.map((id) => loadUnitData(id).people.find((p) => p.actif && personKey(p, id) === me)).find((p) => !!p);
        const p: Proposition = {
          id: uid('am'),
          genre: r.genre,
          texte,
          page: r.page || undefined,
          le: new Date().toISOString(),
          par: `${fiche?.prenom ?? ''} ${fiche?.nom ?? ''}`.trim() || 'Membre du club',
          unite: current.nom,
          auteur: me,
          statut: 'nouvelle',
        };
        const d = loadUnitData(central.id);
        d.propositions = [p, ...(d.propositions ?? [])];
        saveUnitData(central.id, d);
        // Comité central ouvert : l'écran relit ses données.
        if (current.id === central.id) setEpoch((e) => e + 1);
      },
      organigrammesAnnuels: async () => loadOrganigrammes(),
      async mesPropositions() {
        if (!central || !me) return [];
        return (loadUnitData(central.id).propositions ?? []).filter((p) => p.auteur === me).sort((a, b) => b.le.localeCompare(a.le));
      },
      // Remboursement / paiement demandé par un membre d'une autre entité à la caisse qui reçoit ses tickets : celle du
      // comité dont elle dépend s'il a un caissier, sinon la caisse centrale (version réelle : gsa_ticket_central, 030).
      async ticketCentral(r) {
        const cible = caisseDe(org, current);
        if (!cible || !me) throw new Error('Pas de comité central.');
        if (cible.moi) throw new Error(`Membre de « ${cible.nom} » : envoie le ticket depuis « ${cible.nom} »`);
        const d = loadUnitData(cible.id);
        const caisse = caissiers(d).map((p) => p.id);
        if (!caisse.length) throw new Error(`La caisse de « ${cible.nom} » n’a pas encore de caissier`);
        const fiche = loadUnitData(current.id).people.find((p) => personKey(p, current.id) === me);
        const par = `${fiche?.prenom ?? ''} ${fiche?.nom ?? ''}`.trim() || 'Membre';
        const now = new Date().toISOString();
        const t: Ticket = {
          id: uid('tk'),
          sectionId: sectionFinances(d),
          sousSection: GENRES[r.type === 'facture' ? 'facture' : 'remboursement'].sous,
          titre: r.titre.trim(),
          responsables: caisse,
          statusId: statutPour(d, 'recu'),
          delai: r.type === 'facture' && r.delai ? r.delai : '',
          remarque: r.remarque.trim(),
          checklist: [],
          documents: r.documents.map((x) => ({ ...x, par: '' })),
          createdBy: '',
          updatedAt: now,
          paiement: {
            ...(r.type === 'facture' ? { type: 'facture' as const } : {}),
            montant: r.montant,
            beneficiaire: r.beneficiaire.trim(),
            iban: r.iban || undefined,
            etat: 'recu',
            demandePar: '',
            demandeLe: now,
            externe: { uniteId: current.id, unite: current.nom, par, email: fiche?.email?.trim().toLowerCase(), userId: me },
          },
        };
        d.tasks.unshift(t);
        d.log.unshift({ id: uid('l'), at: now, userId: '', action: `${r.type === 'facture' ? 'Paiement de facture' : 'Remboursement'} demandé par « ${current.nom} » (${par}) : « ${t.titre} » (${r.montant.toFixed(2)} CHF)` });
        saveUnitData(cible.id, d);
      },
      // Agenda du club : événements de toutes les entités (version réelle : gsa_agenda_club).
      async agendaClub(): Promise<AgendaClubEvent[]> {
        return units
          .filter((u) => !u.archive)
          .flatMap((u) => loadUnitData(u.id).events.map((e) => ({ uniteId: u.id, id: e.id, nom: e.nom, date: e.date, dateFin: e.dateFin, heure: e.heure, heureFin: e.heureFin, lieu: e.lieu, repetition: e.repetition, sauf: e.sauf })))
          .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date))
          .sort((a, b) => a.date.localeCompare(b.date));
      },
      // Tâches que les autres entités partagent avec l'entité ouverte (version réelle : gsa_taches_partagees, 019).
      async tachesPartagees(): Promise<TachePartagee[]> {
        const actives = units.filter((u) => !u.archive);
        return actives
          .filter((u) => u.id !== current.id)
          .flatMap((u) => {
            const d = loadUnitData(u.id);
            const statuts = d.statuses.map(({ id, label, done }) => ({ id, label, done }));
            return d.tasks
              .filter((t) => tacheDans(t, u, parentDans(actives, u)?.id, current.id, reglageTaches(org, u)) === 'modifiable')
              .map((t) => ({ uniteId: u.id, unite: u.nom, type: u.type, task: t, statuts, v: 41 }));
          });
      },
      // Séances du comité dont dépend l'entité ouverte, pour y lier une tâche (version réelle : gsa_seances_comite, 032).
      async seancesComite(): Promise<SeancesDuComite> {
        const comite = parentDans(units.filter((u) => !u.archive), current);
        if (!comite) return { comite: '', seances: [] };
        const seances = loadUnitData(comite.id)
          .meetings.filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date))
          .map(({ id, titre, date, heure }) => ({ id, titre, date, heure }))
          .sort((a, b) => a.date.localeCompare(b.date));
        return { comite: comite.id, seances };
      },
      // Sections des entités qui dépendent de l'entité ouverte (version réelle : gsa_sections_dependantes, 033).
      async sectionsDependantes(): Promise<SectionsDependantes> {
        const actives = units.filter((u) => !u.archive);
        return Object.fromEntries(
          actives
            .filter((u) => u.id !== current.id && parentDans(actives, u)?.id === current.id)
            .map((u) => [u.id, loadUnitData(u.id).sections.map(({ id, nom }) => ({ id, nom }))]),
        );
      },
      // Anciennes tâches des entités qui dépendent maintenant de l'entité ouverte : lecture et copie (version réelle :
      // gsa_anciennes_taches, 030). Sans pièces jointes (leur nombre seulement).
      async anciennesTaches(): Promise<TachePartagee[]> {
        const actives = units.filter((u) => !u.archive);
        return actives
          .filter((u) => u.id !== current.id && u.historiqueDependance?.length && parentDans(actives, u)?.id === current.id)
          .flatMap((u) => {
            const d = loadUnitData(u.id);
            const statuts = d.statuses.map(({ id, label, done }) => ({ id, label, done }));
            const fin = u.historiqueDependance![u.historiqueDependance!.length - 1];
            return d.tasks
              .filter((t) => tacheDans(t, u, current.id, current.id, reglageTaches(org, u)) === 'ancienne')
              .map(({ documents, ...t }) => ({ uniteId: u.id, unite: u.nom, type: u.type, ancienne: { comite: fin.nom, jusqua: fin.jusqua }, task: { ...t, pieces: documents?.length ?? 0 }, statuts }));
          });
      },
      // Tâches des autres entités pour info de l'entité ouverte ou de l'une de ses personnes (version réelle :
      // gsa_taches_pour_info, 037). Lecture seule ; jamais les tickets.
      async tachesPourInfo(): Promise<TachePartagee[]> {
        return units
          .filter((u) => u.id !== current.id && !u.archive)
          .flatMap((u) => {
            const d = loadUnitData(u.id);
            const statuts = d.statuses.map(({ id, label, done }) => ({ id, label, done }));
            return d.tasks
              .filter((t) => !t.paiement && (t.pourInfo?.unites?.includes(current.id) || !!t.pourInfo?.autres?.[current.id]?.length))
              .map(({ documents = [], ...t }) => ({
                uniteId: u.id,
                unite: u.nom,
                type: u.type,
                // Liens transmis ; fichiers comptés seulement (consultables dans l'entité de la tâche).
                task: { ...t, documents: documents.filter((x) => x.kind === 'lien'), pieces: documents.filter((x) => x.kind !== 'lien').length },
                statuts,
              }));
          });
      },
      // Modification depuis l'entité ouverte, enregistrée dans l'entité de la tâche (version réelle : gsa_modifier_tache_partagee).
      async modifierTachePartagee(uniteId, task) {
        const u = units.find((x) => x.id === uniteId);
        const d = loadUnitData(uniteId);
        const old = d.tasks.find((t) => t.id === task.id);
        const vue = u && old && !u.archive ? tacheDans(old, u, parentDans(units.filter((x) => !x.archive), u)?.id, current.id, reglageTaches(org, u)) : null;
        if (vue === 'ancienne') throw new Error(`Ancienne tâche de « ${u!.nom} » : elle se consulte et se copie, sans modification`);
        if (!u || !old || vue !== 'modifiable') throw new Error('Cette tâche n’est plus partagée avec cette entité.');
        const t = fusionPartagee(old, task, current.id, uniteId, { entites: units, centralId: central?.id, meetings: loadUnitData(current.id).meetings });
        // Contenu modifié : date posée comme le fait le serveur (052).
        const ch = changementsTache(old, t);
        if (ch && Object.keys(ch.champs).some((k) => k !== 'pourInfo')) t.contenuLe = new Date().toISOString();
        d.tasks = d.tasks.map((x) => (x.id === old.id ? t : x));
        saveUnitData(uniteId, d);
      },
      // Réponse à une tâche à prendre partagée, proposée ici à la personne connectée (version réelle : gsa_repondre_partagee, 040).
      async repondreTachePartagee(uniteId, tacheId, prend) {
        const u = units.find((x) => x.id === uniteId);
        const d = loadUnitData(uniteId);
        const old = d.tasks.find((t) => t.id === tacheId);
        if (!u || u.archive || !old || tacheDans(old, u, parentDans(units.filter((x) => !x.archive), u)?.id, current.id, reglageTaches(org, u)) !== 'modifiable')
          throw new Error('Cette tâche n’est plus partagée avec cette entité.');
        const fiche = loadUnitData(current.id).people.find((x) => x.actif && personKey(x, current.id) === me);
        if (!fiche) throw new Error('Réservé aux membres de l’entité.');
        const terminee = !!d.statuses.find((s) => s.id === old.statusId)?.done;
        const t = reponseAilleurs(old, current.id, fiche.id, prend, terminee);
        if (t === old) return;
        d.tasks = d.tasks.map((x) => (x.id === old.id ? { ...t, modifiePar: `${fiche.prenom} ${fiche.nom} (${current.nom})`.trim(), contenuLe: new Date().toISOString() } : x));
        saveUnitData(uniteId, d);
      },
      // « ✓ Vu » sur une tâche d'une autre entité, pour info d'ici ou partagée (version réelle : gsa_pour_info_vu, 046).
      async vuPourInfo(uniteId, tacheId) {
        const u = units.find((x) => x.id === uniteId);
        const d = loadUnitData(uniteId);
        const old = d.tasks.find((t) => t.id === tacheId);
        const ici = loadUnitData(current.id);
        const fiche = ici.people.find((x) => x.actif && personKey(x, current.id) === me);
        if (!fiche) throw new Error('Réservé aux membres de l’entité.');
        if (!u || u.archive || !old) throw new Error('Tâche introuvable');
        const cles = clesVu(old, uniteId, current.id, fiche.id, hasPermission(userRoles(ici.roles, fiche), 'tasks.viewAll'));
        if (!cles.length) throw new Error('Cette tâche n’est pas « pour info » pour toi');
        const le = new Date().toISOString();
        const vus = ajouterVus(old.pourInfoVus, cles, le, old.contenuLe);
        if (vus === old.pourInfoVus) return;
        d.tasks = d.tasks.map((x) => (x.id === old.id ? { ...x, pourInfoVus: vus } : x));
        // Dernier « ✓ Vu » attendu : l'auteur est prévenu, dans l'entité de la tâche (version réelle : 052).
        if (old.createdBy && d.people.some((p) => p.id === old.createdBy && p.actif) && dernierAttendu(old.pourInfoVus, vus, attendusDemo(old, uniteId, units)))
          d.notifications = [
            { id: uid('n'), userId: old.createdBy, type: 'toutVu' as const, taskId: old.id, by: `x:${current.id}:${fiche.id}`, byName: `${`${fiche.prenom} ${fiche.nom}`.trim()} (${current.nom})`, at: le, titre: old.titre },
            ...(d.notifications ?? []),
          ].slice(0, 300);
        saveUnitData(uniteId, d);
      },
      // Historique d'une tâche (version réelle : gsa_historique_tache, 050 ; la démo ne vérifie pas qui la lit).
      historique: async (uniteId, tacheId) => lireHistoriqueDemo(uniteId, tacheId),
      // Rapport d'erreurs (version réelle : gsa_signaler_erreur, gsa_erreurs_liste…, 051), gardé dans ce navigateur.
      signalerErreur: async (r) => {
        if (me) signalerErreurDemo(current.nom, me, r);
      },
      erreurs: async () => {
        if (!central?.moiAdmin) throw new Error('Réservé aux admins du comité central.');
        return erreursDemo();
      },
      reglerErreur: async (id, reglee) => {
        if (!central?.moiAdmin) throw new Error('Réservé aux admins du comité central.');
        reglerErreurDemo(id, reglee);
      },
      effacerErreurs: async () => {
        if (!central?.moiAdmin) throw new Error('Réservé aux admins du comité central.');
        return effacerErreursDemo();
      },
      // Discussion sur une tâche d'une autre entité, partagée avec l'entité ouverte ou reçue pour info (version réelle :
      // gsa_commenter, 049). Les personnes prévenues dans les autres entités le sont ici ; celles d'ici, par le store.
      async commenter(uniteId, tacheId, a) {
        const u = units.find((x) => x.id === uniteId);
        const d = loadUnitData(uniteId);
        const old = d.tasks.find((t) => t.id === tacheId);
        const ici = loadUnitData(current.id);
        const fiche = ici.people.find((x) => x.actif && personKey(x, current.id) === me);
        if (!fiche) throw new Error('Réservé aux membres de l’entité.');
        if (!u || u.archive || !old) throw new Error('Tâche introuvable');
        if (old.paiement) throw new Error('Pas de discussion sur un ticket de paiement');
        const partagee = tacheDans(old, u, parentDans(units.filter((x) => !x.archive), u)?.id, current.id, reglageTaches(org, u)) === 'modifiable';
        if (!partagee && !clesVu(old, uniteId, current.id, fiche.id, hasPermission(userRoles(ici.roles, fiche), 'tasks.viewAll')).length)
          throw new Error('Tu ne vois pas cette tâche');
        const nom = `${fiche.prenom} ${fiche.nom}`.trim();
        const le = new Date().toISOString();
        const commentaires = appliquerCommentaire(old.commentaires, a, { moi: fiche.id, nom, depuis: current.id, unite: uniteId, admin: false, le, mesFiches });
        d.tasks = d.tasks.map((x) => (x.id === old.id ? { ...x, commentaires: commentaires.length ? commentaires : undefined } : x));
        saveUnitData(uniteId, d);
        if (a.cle) return;
        // Comme le serveur : fiches actives des entités pas archivées, sans les miennes, une notification par personne.
        const donnees = (e: string) => (e === uniteId ? d : loadUnitData(e));
        const actives = Object.fromEntries(
          Object.entries(destinatairesCommentaire(old, uniteId, fiche.id, current.id))
            .filter(([e]) => units.some((x) => x.id === e && !x.archive))
            .map(([e, l]) => {
              const people = donnees(e).people;
              return [e, l.filter((f) => people.some((p) => p.id === f && p.actif && personKey(p, e) !== me))];
            }),
        );
        const qui = (e: string, f: string) => {
          const p = donnees(e).people.find((x) => x.id === f);
          return p && personKey(p, e);
        };
        for (const [e, fiches] of Object.entries(unParPersonne(actives, uniteId, current.id, qui))) {
          if (e === current.id) continue;
          const de = donnees(e);
          const notifs = notifsCommentaire(fiches, { entite: e, unite: uniteId, tache: old.id, titre: old.titre, moi: fiche.id, depuis: current.id, nom, nomDepuis: current.nom, texte: a.texte ?? '', le });
          if (!notifs.length) continue;
          de.notifications = [...notifs, ...(de.notifications ?? [])].slice(0, 300);
          saveUnitData(e, de);
        }
      },
      async suiviPourInfo(uniteId, tacheIds) {
        const d = loadUnitData(uniteId);
        return Object.fromEntries(d.tasks.filter((t) => tacheIds.includes(t.id) && t.pourInfo && !t.paiement).map((t) => [t.id, attendusDemo(t, uniteId, units)]));
      },
      // Relance (version réelle : gsa_pour_info_relancer, 052) : les personnes des autres entités prévenues dans leur entité,
      // celles d'ici par le store.
      async relancerPourInfo(tacheId, t) {
        const fiche = loadUnitData(current.id).people.find((x) => x.actif && personKey(x, current.id) === me);
        if (!fiche) throw new Error('Réservé aux membres de l’entité.');
        if (t.paiement || !t.pourInfo) throw new Error('Tâche introuvable');
        const cle = `${current.id}:${tacheId}`;
        if (Date.now() - (relancesDemo.get(cle) ?? 0) < 3600e3) throw new Error('Déjà relancée il y a moins d’une heure');
        const le = new Date().toISOString();
        const nom = `${`${fiche.prenom} ${fiche.nom}`.trim()} (${current.nom})`;
        const parEntite = new Map<string, string[]>();
        for (const k of attendusDemo(t, current.id, units).filter((x) => !t.pourInfoVus?.[x])) {
          const [g, a, b] = k.split(':');
          const [e, f] = g === 'p' ? [current.id, a] : [a, b];
          if (!parEntite.get(e)?.includes(f)) parEntite.set(e, [...(parEntite.get(e) ?? []), f]);
        }
        for (const [e, fiches] of parEntite) {
          if (e === current.id) continue;
          const de = loadUnitData(e);
          const notifs = fiches.map((f) => ({ id: uid('n'), userId: f, type: 'relance' as const, taskId: `x:${cle}`, by: `x:${current.id}:${fiche.id}`, byName: nom, at: le, titre: t.titre }));
          de.notifications = [...notifs, ...(de.notifications ?? [])].slice(0, 300);
          saveUnitData(e, de);
        }
        relancesDemo.set(cle, Date.now());
        return { n: [...parEntite.values()].reduce((n, l) => n + l.length, 0), ici: parEntite.get(current.id) ?? [] };
      },
      async destinatairesPourInfo(uniteId, tacheId) {
        const t = loadUnitData(uniteId).tasks.find((x) => x.id === tacheId);
        const r: Record<string, string[]> = {};
        for (const e of t && !t.paiement ? (t.pourInfo?.unites ?? []) : []) {
          const d = units.some((x) => x.id === e && !x.archive) ? loadUnitData(e) : undefined;
          r[e] = d ? d.people.filter((p) => p.actif && hasPermission(userRoles(d.roles, p), 'tasks.viewAll')).map((p) => p.id) : [];
        }
        return r;
      },
      // Tâche attribuée à une entité qui dépend de l'entité ouverte : enregistrée chez elle (version réelle :
      // gsa_attribuer_tache, 035).
      async attribuerTache(uniteId, task, statut) {
        const actives = units.filter((x) => !x.archive);
        const u = actives.find((x) => x.id === uniteId);
        if (!u || u.id === current.id || parentDans(actives, u)?.id !== current.id) throw new Error(`Cette entité ne dépend pas de « ${current.nom} »`);
        const d = loadUnitData(uniteId);
        d.tasks.unshift(nettoyerAttribuee(task, d, statut, u));
        saveUnitData(uniteId, d);
      },
      // Sondages des autres entités ouverts à l'entité ouverte (version réelle : gsa_sondages_partages, 021).
      async sondagesPartages(): Promise<SondagePartage[]> {
        return units
          .filter((u) => u.id !== current.id && !u.archive)
          .flatMap((u) => (loadUnitData(u.id).polls ?? []).filter((p) => p.entites?.includes(current.id)).map((poll) => ({ uniteId: u.id, unite: u.nom, poll })));
      },
      // Réponse enregistrée dans l'entité du sondage, sous la clé de vote de la personne (version réelle : gsa_voter_sondage_partage).
      async voterSondagePartage(uniteId, pollId, choix, texte) {
        const u = units.find((x) => x.id === uniteId);
        const d = loadUnitData(uniteId);
        const p = d.polls?.find((x) => x.id === pollId);
        if (!u || u.archive || !p || !p.entites?.includes(current.id)) throw new Error('Ce sondage n’est plus ouvert à cette entité.');
        if (!isOpen(p)) throw new Error('Ce sondage est clôturé.');
        const fiche = loadUnitData(current.id).people.find((x) => x.actif && personKey(x, current.id) === me);
        const cle = fiche && cleVote(electorat(p, uniteId, d.people.filter((x) => x.actif), org), current.id, fiche);
        if (!cle) throw new Error('Tu ne fais pas partie des votants de ce sondage.');
        d.polls = d.polls!.map((x) => (x.id === pollId ? { ...x, ...avecVote(x, cle, choix, texte) } : x));
        saveUnitData(uniteId, d);
      },
      async mesTicketsCentraux(): Promise<SuiviTicket[]> {
        if (!me) return [];
        return units.flatMap((c) => loadUnitData(c.id)
          .tasks.filter((t): t is Ticket => !!t.paiement && t.paiement.externe?.userId === me)
          .map((t) => ({
            id: t.id,
            type: t.paiement.type === 'facture' ? ('facture' as const) : null,
            titre: t.titre,
            montant: t.paiement.montant,
            beneficiaire: t.paiement.beneficiaire,
            etat: t.paiement.etat,
            le: t.paiement.demandeLe,
            unite: t.paiement.externe!.unite,
            caisse: c.nom,
            viseLe: t.paiement.validation?.le,
            payeLe: t.paiement.paye?.le,
            motif: t.paiement.refus?.motif,
          })))
          .sort((a, b) => b.le.localeCompare(a.le));
      },
      // Comme le serveur (043) : dans toutes les entités du club, ticket visé ou payé seulement.
      async verifierVisa(code) {
        for (const u of units) {
          const v = visaDans(loadUnitData(u.id), code, u.nom);
          if (v) return v;
        }
        return null;
      },
      membresAcces,
      caissier,
      // Comme le serveur (034) : données masquées vides, IBAN aux caissiers et à la personne elle-même.
      async membres() {
        if (!membresAcces && !caissier) throw new Error('Réservé aux personnes qui ont le droit « Membres du club » et aux caissiers.');
        const mid = monMembre()?.id;
        return loadMembres().map((m) => vueMembre(m, m.id === mid, caissier));
      },
      async saveMembres(l) {
        if (!membresAcces) throw new Error('Réservé aux personnes qui ont le droit « Membres du club ».');
        // IBAN et confidentialité gardés, comme les coordonnées masquées (sauf par la personne elle-même).
        const avant = loadMembres();
        const mid = monMembre()?.id;
        const list = l.map((m) => fusionMembre(avant.find((x) => x.id === m.id), m, m.id === mid));
        // Adresse de la personne connectée changée : elle reste connectée.
        const moi = list.find((m) => emailKey(avant.find((x) => x.id === m.id)?.email) === me && emailKey(m.email) && emailKey(m.email) !== me);
        saveMembres(list);
        if (moi) {
          saveMe(emailKey(moi.email));
          setMe(emailKey(moi.email));
        }
        setEpoch((e) => e + 1);
        refresh();
      },
      async deleteMembre(id) {
        if (!membresAcces) throw new Error('Réservé aux personnes qui ont le droit « Membres du club ».');
        deleteMembre(id);
        refresh();
      },
      async monRegistre() {
        const m = monMembre();
        return m ? { id: m.id, prenom: m.prenom, nom: m.nom, iban: m.iban ?? '', prive: !!m.prive } : null;
      },
      // Mon IBAN, ma confidentialité : moi seul (comme le serveur).
      async enregistrerMonIban(iban) {
        const m = monMembre();
        if (!m) throw new Error('Ta fiche n’est pas dans le registre « Membres du club » : demande à un admin de t’y inscrire.');
        const v = compactIban(iban);
        if (!ibanValide(v)) throw new Error('IBAN invalide : vérifie-le (longueur et chiffres de contrôle).');
        saveMembres([{ ...m, iban: v || undefined }]);
        return v;
      },
      async setConfidentialite(masquer) {
        const m = monMembre();
        if (!m) throw new Error('Ta fiche n’est pas dans le registre « Membres du club » : demande à un admin de t’y inscrire.');
        saveMembres([{ ...m, prive: masquer }]);
      },
      async fichesEntite(uniteId) {
        if (!org.find((u) => u.id === uniteId)?.moiAdmin) throw new Error('Réservé aux admins de l’entité.');
        const d = loadUnitData(uniteId);
        return { roles: d.roles, people: d.people };
      },
      // Comme une fiche modifiée dans l'entité : liée au registre, ses postes et les postes liés suivent.
      async enregistrerFiche(uniteId, p) {
        const u = org.find((x) => x.id === uniteId);
        if (!u?.moiAdmin) throw new Error(`Réservé aux admins de « ${u?.nom ?? 'l’entité'} ».`);
        const ancien = loadUnitData(uniteId);
        const d: AppData = loadUnitData(uniteId);
        const i = d.people.findIndex((x) => x.id === p.id);
        if (i >= 0) d.people[i] = p;
        else d.people.push(p);
        const n = synchroDemo(uniteId, d);
        const lie = lierFiches(uniteId, n ?? d);
        const postes = suivrePostes(uniteId, ancien, lie);
        saveUnitData(uniteId, postes?.d ?? lie);
        propagerLiens(uniteId);
        for (const k of postes?.autres ?? []) propagerLiens(k);
        if (uniteId === current.id) setEpoch((e) => e + 1);
        refresh();
      },
      // Démo : pas de comptes ni de mots de passe.
      demandesMdp: [],
      approuverMdp: () => Promise.reject(new Error('Pas de mots de passe dans la démo.')),
      refuserMdp: () => Promise.resolve(),
      superAdmin: false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, current, central, mineAll, mesFiches, switchUnit, refresh, units, me, membresAcces, caissier]);

  const personId = useMemo(() => {
    if (!current || !me) return null;
    return loadUnitData(current.id).people.find((p) => p.actif && personKey(p, current.id) === me)?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, me]);

  const demo: DemoMode | null = useMemo(
    () =>
      current
        ? {
            load: () => {
              const d = loadUnitData(current.id);
              const n = synchroDemo(current.id, d);
              if (n) saveUnitData(current.id, lierFiches(current.id, n));
              return n ?? d;
            },
            // Comme le serveur : fiches liées au registre ; liens « Membres de » tenus à jour, dans l'entité ouverte
            // (relue si elle a changé) et dans celles qui la comptent parmi leurs membres.
            // Organigramme à glisser-déposer : ses postes et les postes liés suivent les personnes modifiées ici.
            save: (d) => {
              const ancien = loadUnitData(current.id);
              const avant = signatureMembres(ancien.people);
              const n = synchroDemo(current.id, d);
              const postes = suivrePostes(current.id, ancien, lierFiches(current.id, n ?? d));
              const next = postes?.d ?? lierFiches(current.id, n ?? d);
              saveUnitData(current.id, next);
              const autres = signatureMembres(next.people) !== avant && propagerLiens(current.id);
              for (const k of postes?.autres ?? []) propagerLiens(k);
              if (n || postes?.ici) setEpoch((e) => e + 1);
              if (autres || n || postes?.ici || postes?.autres.length) refresh();
            },
            epoch,
            personId,
            logout,
            reset: () => {
              resetDemo();
              window.location.hash = '';
              window.location.reload();
            },
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.id, personId, logout, epoch, refresh],
  );

  if (!me || !club || !demo) {
    return (
      <Login
        units={org}
        onPick={(key) => {
          saveMe(key);
          setMe(key);
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
      <StoreProvider key={`${current.id}|${me}`} demo={demo}>
        <App />
      </StoreProvider>
    </ClubCtx.Provider>
  );
}
