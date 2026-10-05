import { useCallback, useMemo, useState } from 'react';
import { StoreProvider, type DemoMode } from './data/store';
import { ClubCtx, toPerson, type Club, type CreatedUnit, type NewUnit } from './data/club';
import { CENTRAL_ID, loadMe, loadUnitData, loadUnits, resetDemo, saveMe, saveUnitData, saveUnits, UNIT_KEY } from './data/demoClub';
import { defaultRoleId, guestPerson, orgMembers, personKey, sortUnits, unitData, visitLevel } from './data/units';
import { ADMIN_ROLE_ID } from './data/permissions';
import { uid } from './data/utils';
import type { Guest, MyRequest, OrgUnit, Person, Task, Unit } from './data/types';
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
  const [units, setUnits] = useState<Unit[]>(() => loadUnits());
  const [me, setMe] = useState<string | null>(() => loadMe());
  const [unitId, setUnitId] = useState<string | null>(readUnit);
  // Entité ouverte en visiteur (comité central) : pas reprise au prochain lancement ni par la personne suivante.
  const [visitId, setVisitId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

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
        saveUnitData(id, base);
        const next = [...units, { id, nom: n.nom, type: n.type, parentId: central?.id ?? CENTRAL_ID, couleur: n.couleur, description: n.description, date: n.date }];
        saveUnits(next);
        setUnits(next);
        return { unitId: id };
      },
      async updateUnit(id, patch) {
        // Comme le serveur : l'accès du comité central ne change que par les admins de l'entité.
        const admin = org.find((u) => u.id === id)?.moiAdmin;
        const next = units.map((u) => (u.id === id ? { ...u, ...patch, central: admin && patch.central ? patch.central : u.central } : u));
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
    };
  }, [org, current, central, mineAll, visitAll, switchUnit, refresh, units]);

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
            load: () => loadUnitData(current.id),
            save: (d) => saveUnitData(current.id, d),
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
    [current?.id, personId, guest, logout],
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
