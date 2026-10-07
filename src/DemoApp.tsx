import { useCallback, useMemo, useState } from 'react';
import { StoreProvider, type DemoMode } from './data/store';
import { ClubCtx, toPerson, type Club, type CreatedUnit, type NewUnit } from './data/club';
import { CENTRAL_ID, deleteMembre, ecrireBrut, initMembres, initPostes, lierEntiteDemo, lierFiches, lireBrut, loadMe, loadMembres, loadUnitData, loadUnits, propagerLiens, resetDemo, saveMe, saveMembres, saveUnitData, saveUnits, signatureMembres, suivrePostes, synchroDemo, UNIT_KEY } from './data/demoClub';
import { defaultRoleId, guestPerson, orgMembers, personKey, sortUnits, unitData, UNIT_TYPES, visitLevel } from './data/units';
import { poserResponsable } from './data/cablage';
import { ADMIN_ROLE_ID, hasPermission, userRoles } from './data/permissions';
import { emailKey, nouveauMembre } from './data/membres';
import { appliquer, estEtoile } from './data/organigramme';
import { uid } from './data/utils';
import { demoClassique } from './data/mode';
import type { AgendaClubEvent, Guest, MyRequest, OrgUnit, Person, Proposition, SondagePartage, SuiviTicket, TachePartagee, Task, Unit } from './data/types';
import { avecVote, cleVote, electorat, isOpen } from './data/polls';
import { fusionPartagee, partageDe } from './data/partage';
import { GENRES, caissiers, sectionFinances, statutPour, type Ticket } from './data/paiements';
import { App } from './App';
import { Login } from './pages/Login';

// Démo : le club et ses entités, toutes gardées dans ce navigateur.
// On se connecte en choisissant une personne de l'annuaire du club ; elle retrouve les entités dont elle fait partie,
// et, membre du comité central, celles qui lui sont ouvertes (consulter, ou aussi modifier / ajouter).

const readUnit = () => {
  try {
    return localStorage.getItem(UNIT_KEY);
  } catch {
    return null;
  }
};

export function DemoApp() {
  const [units, setUnits] = useState<Unit[]>(() => {
    const u = loadUnits();
    initMembres(u);
    initPostes(u);
    return u;
  });
  const [me, setMe] = useState<string | null>(() => loadMe());
  const [unitId, setUnitId] = useState<string | null>(readUnit);
  // Entité ouverte en visiteur (comité central) : pas reprise au prochain lancement ni par la personne suivante.
  const [visitId, setVisitId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Fiches de l'entité ouverte modifiées depuis le registre des membres du club : l'écran les relit.
  const [epoch, setEpoch] = useState(0);
  // ?demo&classique : l'organigramme câblé d'avant (sans glisser-déposer ni postes).
  const [classique] = useState(demoClassique);

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

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const logout = useCallback(() => {
    saveMe(null);
    setMe(null);
    setVisitId(null);
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

  const mineAll = org.filter((u) => u.moi);
  const central = org.find((u) => u.type === 'central') ?? null;
  const visitAll = org.filter((u) => visitLevel(u, central));
  const current =
    visitAll.find((u) => u.id === visitId) ??
    mineAll.find((u) => u.id === unitId) ??
    mineAll.find((u) => u.type === 'central' && !u.archive) ??
    mineAll.find((u) => !u.archive) ??
    mineAll[0];
  // Entité ouverte en visiteur : fiche de la personne au comité central, droits selon le réglage de l'entité.
  const guest: Guest | null = useMemo(() => {
    const niveau = current && visitLevel(current, central);
    const me2 = niveau && central?.membres.find((m) => personKey(m, central.id) === me);
    return niveau && me2 ? { person: guestPerson(me2), niveau } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.central, central, me]);

  const switchUnit = useCallback(
    (id: string, hash = '#/') => {
      if (org.find((u) => u.id === id)?.moi) {
        try {
          localStorage.setItem(UNIT_KEY, id);
        } catch {
          /* ignore */
        }
        setUnitId(id);
        setVisitId(null);
      } else setVisitId(id);
      window.location.hash = hash;
      setVersion((v) => v + 1);
    },
    [org],
  );

  const club: Club | null = useMemo(() => {
    if (!current) return null;
    return {
      units: org,
      current,
      central,
      mine: mineAll.filter((u) => !u.archive || u.id === current.id),
      visitable: visitAll.filter((u) => !u.archive || u.id === current.id),
      canManage: !!central?.moiAdmin,
      liens: true,
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
        base.postes = [];
        saveUnitData(id, lierFiches(id, base));
        const next = [...units, { id, nom: n.nom, type: n.type, parentId: central?.id ?? CENTRAL_ID, couleur: n.couleur, description: n.description, date: n.date, dateFin: n.dateFin, dependDe: n.dependDe }];
        saveUnits(next);
        setUnits(next);
        // Organigramme : les postes qui portent son nom (« Camp de Pentecôte » au comité central) lui sont liés.
        if (!classique && lierEntiteDemo(id).includes(current.id)) setEpoch((e) => e + 1);
        return { unitId: id };
      },
      async updateUnit(id, patch) {
        // Comme le serveur : l'accès du comité central ne change que par les admins de l'entité.
        const admin = org.find((u) => u.id === id)?.moiAdmin;
        const next = units.map((u) => (u.id === id ? { ...u, ...patch, central: admin && patch.central ? patch.central : u.central } : u));
        saveUnits(next);
        setUnits(next);
        if (!classique && patch.nom && patch.nom !== units.find((u) => u.id === id)?.nom && lierEntiteDemo(id).includes(current.id)) setEpoch((e) => e + 1);
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
      // Organigramme câblé (version réelle : gsa-acces, action « responsable »).
      async definirResponsable(uniteId, r) {
        const u = org.find((x) => x.id === uniteId);
        if (!u || u.type === 'central') throw new Error('Le responsable se désigne pour une entité du club (pas le comité central).');
        if (!central?.moiAdmin && !u.moiAdmin) throw new Error('Réservé aux admins du comité central ou de l’entité.');
        if (u.archive) throw new Error('Cette entité est archivée.');
        const d = loadUnitData(uniteId);
        poserResponsable(d, r, UNIT_TYPES[u.type].chef);
        const n = synchroDemo(uniteId, d);
        saveUnitData(uniteId, lierFiches(uniteId, n ?? d));
        propagerLiens(uniteId);
        // Entité ouverte : l'écran relit ses données.
        if (uniteId === current.id) setEpoch((e) => e + 1);
        refresh();
        // Démo : on se connecte avec l'adresse de sa fiche.
        return { compte: !!emailKey(r.email) };
      },
      // Organigramme à glisser-déposer (démo seulement pour l'instant ; voir data/organigramme.ts).
      organiser: classique ? undefined : async (op) => {
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
        const fiche = ids.map((id) => loadUnitData(id).people.find((p) => p.actif && personKey(p, id) === me)).find((p) => !!p) ?? (guest ? guest.person : undefined);
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
      async mesPropositions() {
        if (!central || !me) return [];
        return (loadUnitData(central.id).propositions ?? []).filter((p) => p.auteur === me).sort((a, b) => b.le.localeCompare(a.le));
      },
      // Remboursement / paiement demandé par un membre d'une autre entité à la caisse centrale (version réelle : gsa_ticket_central).
      async ticketCentral(r) {
        if (!central || !me) throw new Error('Pas de comité central.');
        const d = loadUnitData(central.id);
        const caisse = caissiers(d).map((p) => p.id);
        if (!caisse.length) throw new Error('La caisse centrale n’a pas encore de caissier');
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
        saveUnitData(central.id, d);
      },
      // Agenda du club : événements de toutes les entités (version réelle : gsa_agenda_club).
      async agendaClub(): Promise<AgendaClubEvent[]> {
        return units
          .filter((u) => !u.archive)
          .flatMap((u) => loadUnitData(u.id).events.map((e) => ({ uniteId: u.id, id: e.id, nom: e.nom, date: e.date, dateFin: e.dateFin, lieu: e.lieu })))
          .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date))
          .sort((a, b) => a.date.localeCompare(b.date));
      },
      // Tâches que les autres entités partagent avec l'entité ouverte (version réelle : gsa_taches_partagees, 019).
      async tachesPartagees(): Promise<TachePartagee[]> {
        if (guest) return [];
        return units
          .filter((u) => u.id !== current.id && !u.archive)
          .flatMap((u) => {
            const d = loadUnitData(u.id);
            const statuts = d.statuses.map(({ id, label, done }) => ({ id, label, done }));
            return d.tasks
              .filter((t) => !t.paiement && partageDe(t, u.parentId).includes(current.id))
              .map((t) => ({ uniteId: u.id, unite: u.nom, type: u.type, task: t, statuts }));
          });
      },
      // Modification depuis l'entité ouverte, enregistrée dans l'entité de la tâche (version réelle : gsa_modifier_tache_partagee).
      async modifierTachePartagee(uniteId, task) {
        const u = units.find((x) => x.id === uniteId);
        const d = loadUnitData(uniteId);
        const old = d.tasks.find((t) => t.id === task.id);
        if (guest || !u || u.archive || !old || old.paiement || !partageDe(old, u.parentId).includes(current.id))
          throw new Error('Cette tâche n’est plus partagée avec cette entité.');
        d.tasks = d.tasks.map((t) => (t.id === old.id ? fusionPartagee(old, task, current.id) : t));
        saveUnitData(uniteId, d);
      },
      // Sondages des autres entités ouverts à l'entité ouverte (version réelle : gsa_sondages_partages, 021).
      async sondagesPartages(): Promise<SondagePartage[]> {
        if (guest) return [];
        return units
          .filter((u) => u.id !== current.id && !u.archive)
          .flatMap((u) => (loadUnitData(u.id).polls ?? []).filter((p) => p.entites?.includes(current.id)).map((poll) => ({ uniteId: u.id, unite: u.nom, poll })));
      },
      // Réponse enregistrée dans l'entité du sondage, sous la clé de vote de la personne (version réelle : gsa_voter_sondage_partage).
      async voterSondagePartage(uniteId, pollId, choix, texte) {
        const u = units.find((x) => x.id === uniteId);
        const d = loadUnitData(uniteId);
        const p = d.polls?.find((x) => x.id === pollId);
        if (guest || !u || u.archive || !p || !p.entites?.includes(current.id)) throw new Error('Ce sondage n’est plus ouvert à cette entité.');
        if (!isOpen(p)) throw new Error('Ce sondage est clôturé.');
        const fiche = loadUnitData(current.id).people.find((x) => x.actif && personKey(x, current.id) === me);
        const cle = fiche && cleVote(electorat(p, uniteId, d.people.filter((x) => x.actif), org), current.id, fiche);
        if (!cle) throw new Error('Tu ne fais pas partie des votants de ce sondage.');
        d.polls = d.polls!.map((x) => (x.id === pollId ? { ...x, ...avecVote(x, cle, choix, texte) } : x));
        saveUnitData(uniteId, d);
      },
      async mesTicketsCentraux(): Promise<SuiviTicket[]> {
        if (!central || !me) return [];
        return loadUnitData(central.id)
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
            caisse: central.nom,
            viseLe: t.paiement.validation?.le,
            payeLe: t.paiement.paye?.le,
            motif: t.paiement.refus?.motif,
          }))
          .sort((a, b) => b.le.localeCompare(a.le));
      },
      membresAcces,
      async membres() {
        if (!membresAcces) throw new Error('Réservé aux personnes qui ont le droit « Membres du club ».');
        return loadMembres();
      },
      async saveMembres(list) {
        if (!membresAcces) throw new Error('Réservé aux personnes qui ont le droit « Membres du club ».');
        // Adresse de la personne connectée changée : elle reste connectée.
        const avant = loadMembres();
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
    };
  }, [org, current, central, mineAll, visitAll, switchUnit, refresh, units, me, membresAcces, guest]);

  const personId = useMemo(() => {
    if (!current || !me) return null;
    if (guest) return guest.person.id;
    return loadUnitData(current.id).people.find((p) => p.actif && personKey(p, current.id) === me)?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, me, guest]);

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
              const postes = !classique ? suivrePostes(current.id, ancien, lierFiches(current.id, n ?? d)) : null;
              const next = postes?.d ?? lierFiches(current.id, n ?? d);
              saveUnitData(current.id, next);
              const autres = signatureMembres(next.people) !== avant && propagerLiens(current.id);
              for (const k of postes?.autres ?? []) propagerLiens(k);
              if (n || postes?.ici) setEpoch((e) => e + 1);
              if (autres || n || postes?.ici || postes?.autres.length) refresh();
            },
            epoch,
            personId,
            guest,
            logout,
            reset: () => {
              resetDemo();
              window.location.hash = '';
              window.location.reload();
            },
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.id, personId, guest, logout, epoch, refresh],
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
