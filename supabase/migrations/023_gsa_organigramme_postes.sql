-- Tâches GSA — 023 : organigramme à glisser-déposer (version réelle).
-- Chaque entité a ses postes (gsa_items, meta « postes » : [{id, nom, titulaire, lien}]) : la zone « Responsables » de sa
-- fiche dans l'organigramme. Ils sont écrits par la fonction gsa-acces (actions de l'organigramme), qui applique les
-- règles de l'appli (src/data/organigramme.ts) et les droits : on modifie les fiches des entités dont on est admin (ou
-- toutes, admin du comité central) ; un poste lié au ★ d'une autre entité fait de son titulaire un ★ de celle-ci.
--   • gsa_organigramme (020) donne en plus les postes de chaque entité (null tant qu'ils ne sont pas déduits).
--   • Garde : un poste ne se lie à une autre entité que par le serveur. Sans elle, un membre d'une entité écrirait un
--     lien sur un poste qu'il occupe et deviendrait ★ (admin) de l'autre entité. Délier, renommer, réordonner ou
--     supprimer un poste restent permis aux membres (comme le reste des données de l'entité).
-- Ajout pur : une fonction redéfinie (même résultat, plus les postes), une garde ; aucune donnée modifiée.

create or replace function public.gsa_postes_garde() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'meta' or new.id <> 'postes' or new.deleted or auth.uid() is null then
    return new;
  end if;
  -- Chaque poste lié l'était déjà, à la même entité (ligne encore inchangée : la garde passe avant l'écriture).
  if exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(new.data) = 'array' then new.data else '[]'::jsonb end) n
    where jsonb_typeof(n) = 'object' and coalesce(n ->> 'lien', '') <> ''
      and not exists (
        select 1 from public.gsa_items o, jsonb_array_elements(case when jsonb_typeof(o.data) = 'array' then o.data else '[]'::jsonb end) x
        where o.committee_id = new.committee_id and o.kind = 'meta' and o.id = 'postes' and not o.deleted
          and jsonb_typeof(x) = 'object' and x ->> 'id' = n ->> 'id' and x ->> 'lien' = n ->> 'lien')
  ) then
    raise exception 'Un poste se lie à une autre entité depuis l’organigramme' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists gsa_postes_garde on public.gsa_items;
create trigger gsa_postes_garde before insert or update on public.gsa_items
  for each row execute function public.gsa_postes_garde();

-- Organigramme (020) : avec les postes de chaque entité.
create or replace function public.gsa_organigramme(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.gsa_is_club_member(club) then
    raise exception 'Réservé aux membres du club' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'nom', c.name,
      'type', c.type,
      'parentId', c.parent_id,
      'info', c.info,
      'moi', public.gsa_is_member(c.id),
      'moiAdmin', public.gsa_is_admin(c.id),
      'membres', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id,
          'prenom', coalesce(p.data ->> 'prenom', ''),
          'nom', coalesce(p.data ->> 'nom', ''),
          'poste', coalesce(p.data ->> 'poste', ''),
          'autresPostes', p.data ->> 'autresPostes',
          'email', coalesce(p.data ->> 'email', ''),
          'couleur', coalesce(p.data ->> 'couleur', '#999999'),
          'membreId', p.data ->> 'membreId',
          'viaEntite', p.data ->> 'viaEntite',
          'viaFiche', p.data ->> 'viaFiche',
          'roles', (
            select coalesce(jsonb_agg(r.data ->> 'label' order by r.pos), '[]'::jsonb)
            from public.gsa_items r
            where r.committee_id = c.id and r.kind = 'roles' and not r.deleted and coalesce(p.data -> 'roles', '[]'::jsonb) ? r.id
          ),
          'admin', coalesce((p.data -> 'roles') @> '["admin"]'::jsonb, false),
          'caisse', exists (
            select 1 from public.gsa_items r
            where r.committee_id = c.id and r.kind = 'roles' and not r.deleted and coalesce(p.data -> 'roles', '[]'::jsonb) ? r.id
              and not coalesce((r.data ->> 'locked')::boolean, false) and (r.data -> 'permissions') ? 'paiements.payer'
          )
        ) order by p.pos), '[]'::jsonb)
        from public.gsa_items p
        where p.committee_id = c.id and p.kind = 'people' and not p.deleted and coalesce((p.data ->> 'actif')::boolean, true)
      ),
      'sections', case when c.parent_id is null then (
        select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.data ->> 'nom') order by s.pos), '[]'::jsonb)
        from public.gsa_items s
        where s.committee_id = c.id and s.kind = 'sections' and not s.deleted
      ) end,
      'liens', (
        select coalesce(jsonb_agg(e ->> 'uniteId'), '[]'::jsonb)
        from public.gsa_items l, jsonb_array_elements(case when jsonb_typeof(l.data) = 'array' then l.data else '[]'::jsonb end) e
        where l.committee_id = c.id and l.kind = 'meta' and l.id = 'membresDe' and not l.deleted
          and jsonb_typeof(e) = 'object' and e ? 'uniteId'
      ),
      'postes', (
        select l.data from public.gsa_items l
        where l.committee_id = c.id and l.kind = 'meta' and l.id = 'postes' and not l.deleted and jsonb_typeof(l.data) = 'array'
      )
    ) order by c.parent_id nulls first, c.name), '[]'::jsonb)
    from public.committees c
    where c.id = club or c.parent_id = club
  );
end $$;
