import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClubCtx, toPerson, type Club, type CreatedUnit, type NewUnit } from './data/club';
import { accessAction, fetchOrg, membershipUnit, myMemberships, myRequests, proposeTask, toRows, updateCommittee, type Membership } from './data/cloud';
import { defaultRoleId, guestPerson, unitData, visitLevel } from './data/units';
import { ADMIN_ROLE_ID } from './data/permissions';
import type { OrgUnit } from './data/types';

// Version réelle : le club autour de l'entité ouverte (organigramme, changement d'entité, demandes au comité central).
// Les données de chaque entité restent dans la sienne ; ce qui passe de l'une à l'autre passe par les
// fonctions du serveur (gsa_organigramme, gsa_proposer_tache, gsa_mes_demandes, gsa-acces « creerUnite »).
// Exception : une entité peut ouvrir ses données au comité central (consulter, ou aussi modifier / ajouter) ;
// ses membres l'ouvrent alors en visiteur, avec leur fiche du comité central (règles du serveur : 006).

export function CloudClub({ m, userId, onSwitch, children }: { m: Membership; userId: string; onSwitch: (m: Membership) => void; children: ReactNode }) {
  const clubId = m.parentId ?? m.committeeId;
  const [org, setOrg] = useState<OrgUnit[] | null>(null);
  const [list, setList] = useState<Membership[]>([m]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([fetchOrg(clubId), myMemberships(userId)])
      .then(([o, l]) => {
        setOrg(o);
        setList(l);
        setError('');
      })
      .catch((e: Error) => setError(`Organigramme indisponible : ${e.message}`))
      .finally(() => setLoading(false));
  }, [clubId, userId]);
  useEffect(refresh, [refresh]);

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
      visitable: units.filter((u) => visitLevel(u, central) && (!u.archive || u.id === current.id)),
      canManage: !!central?.moiAdmin,
      loading,
      error,
      refresh,
      switchUnit(id, hash = '#/') {
        if (id === m.committeeId) return;
        let target = list.find((x) => x.committeeId === id);
        if (!target) {
          // Entité ouverte au comité central : visite avec la fiche de l'utilisateur au comité central.
          const u = units.find((x) => x.id === id);
          const niveau = u && visitLevel(u, central);
          const myCentral = list.find((x) => x.committeeId === central?.id);
          const me = central?.membres.find((x) => x.id === myCentral?.personId);
          if (!u || !niveau || !me) return;
          target = {
            committeeId: u.id,
            committeeName: u.nom,
            personId: null,
            owner: false,
            type: u.type,
            parentId: u.parentId ?? null,
            info: { couleur: u.couleur, description: u.description, date: u.date, archive: u.archive, central: u.central, logo: u.logo },
            guest: { person: guestPerson(me), niveau },
          };
        }
        window.location.hash = hash;
        onSwitch(target);
      },
      async createUnit(n: NewUnit): Promise<CreatedUnit> {
        if (!central) throw new Error('Comité central introuvable.');
        const chef = toPerson(n.chef, [ADMIN_ROLE_ID]);
        const d = unitData(n.type, [], chef.id, n.nom);
        const chefEmail = n.chef.email.trim().toLowerCase();
        d.people = [chef, ...n.membres.filter((x) => x.email.trim().toLowerCase() !== chefEmail).map((x) => toPerson(x, [defaultRoleId(d.roles)]))];
        const r = await accessAction<{ unitId: string; email?: string; password?: string; existant?: boolean; error?: string }>({
          action: 'creerUnite',
          committeeId: central.id,
          unite: { nom: n.nom, type: n.type, info: { couleur: n.couleur, description: n.description, date: n.date } },
          rows: toRows(d),
          chefId: chef.id,
        });
        refresh();
        return { unitId: r.unitId, email: r.email, password: r.password, existant: r.existant, avertissement: r.error };
      },
      async updateUnit(id, patch) {
        const u = units.find((x) => x.id === id);
        if (!u) throw new Error('Entité introuvable.');
        const next = { ...u, ...patch };
        await updateCommittee(id, {
          name: next.nom,
          type: next.type,
          info: {
            couleur: next.couleur,
            description: next.description || undefined,
            date: next.date || undefined,
            archive: next.archive || undefined,
            // Réglage de l'entité : le serveur garde l'ancienne valeur si l'auteur n'en est pas admin.
            central: next.central && next.central !== 'aucun' ? next.central : undefined,
            logo: next.logo || undefined,
          },
        });
        refresh();
      },
      async proposeTask(r) {
        await proposeTask(m.committeeId, { titre: r.titre, remarque: r.remarque, delai: r.delai, sectionId: r.sectionId });
      },
      myRequests: () => myRequests(m.committeeId),
    };
  }, [org, list, m, loading, error, refresh, onSwitch]);

  return <ClubCtx.Provider value={club}>{children}</ClubCtx.Provider>;
}
