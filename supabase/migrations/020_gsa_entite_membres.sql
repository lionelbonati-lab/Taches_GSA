-- Tâches GSA — 020 : toute une entité parmi les membres d'une autre (organigramme).
-- Les admins d'une entité B y ajoutent « tous les membres de A » (données de B, meta « membresDe » : [{uniteId, role}]).
-- B reçoit une fiche par membre propre de A (fiche liée : data.viaEntite = A, data.viaFiche = sa fiche dans A),
-- tenue à jour ici, quel que soit l'auteur de la modification :
--   • qui rejoint A rejoint B, avec le rôle choisi pour le lien (jamais Admin) ; qui quitte A quitte B (fiche désactivée,
--     ses tâches restent) ; coordonnées et couleur suivent ;
--   • une personne déjà membre de B elle-même n'est pas doublée ; une fiche liée retirée à la main (data.exclu) n'y
--     revient pas ;
--   • seuls les membres propres de A passent (pas ceux que A reçoit elle-même d'une autre entité) : pas de boucle ;
--   • accès à l'appli : le compte lié à la fiche de A ouvre aussi B (gsa_members) ; retiré dans A, il l'est aussi dans B.
-- Même règle que la démo (src/data/liens.ts, synchroLiens).
-- Ajout pur : nouvelles fonctions, nouveaux déclencheurs, un index ; l'organigramme (016) donne en plus le lien de chaque
-- fiche (viaEntite, viaFiche) et les entités liées (liens). Aucune donnée existante modifiée : aucune entité n'a encore de lien.

create index if not exists gsa_items_liens_idx on public.gsa_items (committee_id) where kind = 'meta' and id = 'membresDe';

-- Entités qui comptent tous les membres de `a` parmi les leurs.
create or replace function public.gsa_liens_vers(a uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select i.committee_id from public.gsa_items i
  where i.kind = 'meta' and i.id = 'membresDe' and not i.deleted and i.committee_id <> a
    and jsonb_typeof(i.data) = 'array' and i.data @> jsonb_build_array(jsonb_build_object('uniteId', a::text))
$$;

-- Fiches liées de l'entité `b` remises en accord avec les membres des entités liées.
create or replace function public.gsa_liens_synchro(b uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  club uuid;
  liens jsonb;
  l jsonb;
  a uuid;
  role text;
  defaut text;
  p record;
  f record;
  m record;
  cles text[];
  vus text[];
  pris text[] := '{}';
  fid text;
  nd jsonb;
  pos0 double precision;
begin
  select coalesce(c.parent_id, c.id) into club from public.committees c where c.id = b;
  if club is null then
    return;
  end if;
  select i.data into liens from public.gsa_items i where i.committee_id = b and i.kind = 'meta' and i.id = 'membresDe' and not i.deleted;
  if liens is null or jsonb_typeof(liens) <> 'array' then
    liens := '[]'::jsonb;
  end if;
  -- Membres de B eux-mêmes (fiche du registre, adresse) : pas doublés par une fiche liée.
  select coalesce(array_agg(k), '{}') into vus
  from public.gsa_items i,
       lateral unnest(array[nullif(i.data ->> 'membreId', ''), 'e:' || nullif(lower(btrim(coalesce(i.data ->> 'email', ''))), '')]) k
  where i.committee_id = b and i.kind = 'people' and not i.deleted
    and coalesce((i.data ->> 'actif')::boolean, true) and not (i.data ? 'viaEntite') and k is not null;
  -- Rôle par défaut (comme defaultRoleId, sans Admin).
  select r.id into defaut from public.gsa_items r
  where r.committee_id = b and r.kind = 'roles' and not r.deleted and r.id <> 'admin'
  order by (r.id in ('comite', 'membre')) desc,
    case when r.id in ('comite', 'membre') or jsonb_typeof(r.data -> 'permissions') <> 'array' then 0 else jsonb_array_length(r.data -> 'permissions') end,
    r.pos
  limit 1;

  for l in select e from jsonb_array_elements(liens) e loop
    continue when jsonb_typeof(l) <> 'object' or coalesce(l ->> 'uniteId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    a := (l ->> 'uniteId')::uuid;
    continue when a = b or not exists (select 1 from public.committees c where c.id = a and coalesce(c.parent_id, c.id) = club);
    role := l ->> 'role';
    if role is null or role = 'admin' or not exists (
         select 1 from public.gsa_items r where r.committee_id = b and r.kind = 'roles' and r.id = role and not r.deleted) then
      role := defaut;
    end if;
    for p in
      select i.id, i.data from public.gsa_items i
      where i.committee_id = a and i.kind = 'people' and not i.deleted
        and coalesce((i.data ->> 'actif')::boolean, true) and not (i.data ? 'viaEntite')
      order by i.pos, i.id
    loop
      cles := array_remove(array[nullif(p.data ->> 'membreId', ''), 'e:' || nullif(lower(btrim(coalesce(p.data ->> 'email', ''))), '')], null);
      continue when cles && vus;
      vus := vus || cles;
      -- Fiche liée existante : même fiche d'origine, sinon même membre du club (revenu, ou venu d'une autre entité liée).
      select i.id, i.data into f from public.gsa_items i
      where i.committee_id = b and i.kind = 'people' and not i.deleted and i.data ? 'viaEntite' and not (i.id = any (pris))
        and ((i.data ->> 'viaEntite' = a::text and i.data ->> 'viaFiche' = p.id)
             or (nullif(p.data ->> 'membreId', '') is not null and i.data ->> 'membreId' = p.data ->> 'membreId'))
      order by (i.data ->> 'viaEntite' = a::text and i.data ->> 'viaFiche' = p.id) desc, i.pos
      limit 1;
      if found then
        fid := f.id;
        pris := pris || fid;
        -- Retirée de B à la main : elle n'y revient pas.
        continue when coalesce((f.data ->> 'exclu')::boolean, false);
        nd := f.data || public.gsa_coordonnees(p.data)
          || jsonb_build_object('actif', true, 'viaEntite', a::text, 'viaFiche', p.id, 'couleur', coalesce(p.data -> 'couleur', f.data -> 'couleur', '"#0f766e"'::jsonb))
          || case when nullif(p.data ->> 'membreId', '') is not null then jsonb_build_object('membreId', p.data ->> 'membreId') else '{}'::jsonb end;
        if nd is distinct from f.data then
          update public.gsa_items i set data = nd, client_id = null where i.committee_id = b and i.kind = 'people' and i.id = fid;
        end if;
      else
        fid := 'v' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
        pris := pris || fid;
        select coalesce(max(i.pos), 0) + 1 into pos0 from public.gsa_items i where i.committee_id = b and i.kind = 'people';
        insert into public.gsa_items (committee_id, kind, id, pos, data)
        values (b, 'people', fid, pos0, public.gsa_coordonnees(p.data) || jsonb_build_object(
          'id', fid,
          'poste', '',
          'roles', case when role is null then '[]'::jsonb else jsonb_build_array(role) end,
          'actif', true,
          'couleur', coalesce(p.data -> 'couleur', '"#0f766e"'::jsonb),
          'viaEntite', a::text,
          'viaFiche', p.id)
          || case when nullif(p.data ->> 'membreId', '') is not null then jsonb_build_object('membreId', p.data ->> 'membreId') else '{}'::jsonb end);
      end if;
      -- Accès à l'appli : le compte lié à la fiche de A ouvre aussi B.
      for m in select x.user_id from public.gsa_members x where x.committee_id = a and x.person_id = p.id loop
        if not exists (select 1 from public.gsa_members x where x.committee_id = b and (x.user_id = m.user_id or x.person_id = fid)) then
          insert into public.gsa_members (committee_id, user_id, person_id) values (b, m.user_id, fid);
        else
          -- Compte déjà lié dans B à une fiche retirée : il passe à la fiche liée.
          update public.gsa_members x set person_id = fid
          where x.committee_id = b and x.user_id = m.user_id and not x.owner and x.person_id is distinct from fid
            and not exists (select 1 from public.gsa_members y where y.committee_id = b and y.person_id = fid)
            and not exists (
              select 1 from public.gsa_items q
              where q.committee_id = b and q.kind = 'people' and q.id = x.person_id and not q.deleted
                and coalesce((q.data ->> 'actif')::boolean, true));
        end if;
      end loop;
    end loop;
  end loop;

  -- Plus membre de l'entité liée (ou lien retiré) : fiche désactivée, gardée pour ses tâches.
  update public.gsa_items i set data = i.data || '{"actif": false}'::jsonb, client_id = null
  where i.committee_id = b and i.kind = 'people' and not i.deleted and i.data ? 'viaEntite'
    and not (i.id = any (pris)) and coalesce((i.data ->> 'actif')::boolean, true);
end $$;

-- Garde : le lien se change par les admins de B ; une fiche liée n'est jamais admin.
create or replace function public.gsa_items_liens_garde() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'people' and not new.deleted and new.data ? 'viaEntite' and coalesce((new.data -> 'roles') @> '["admin"]'::jsonb, false) then
    raise exception 'Une personne membre par le lien d’une autre entité n’en est pas admin : ajoute-la elle-même' using errcode = '42501';
  end if;
  if new.kind = 'meta' and new.id = 'membresDe' and auth.uid() is not null and not public.gsa_is_admin(new.committee_id) then
    -- Un upsert passe d'abord par l'insertion : si la ligne existe déjà, le contrôle se fait à la mise à jour.
    if (tg_op = 'INSERT' and not exists (select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = new.kind and i.id = new.id))
       or (tg_op = 'UPDATE' and (new.data is distinct from old.data or new.deleted is distinct from old.deleted)) then
      raise exception 'Seul un admin de l’entité y ajoute ou retire toute une entité' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Après une écriture : lien changé, ou membre propre d'une entité changé → les fiches liées suivent.
create or replace function public.gsa_items_liens() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  b uuid;
begin
  if new.kind = 'meta' and new.id = 'membresDe' then
    if tg_op = 'INSERT' or new.data is distinct from old.data or new.deleted is distinct from old.deleted then
      perform public.gsa_liens_synchro(new.committee_id);
    end if;
    return null;
  end if;
  if new.kind <> 'people' or (tg_op = 'UPDATE' and new.data is not distinct from old.data and new.deleted is not distinct from old.deleted) then
    return null;
  end if;
  -- Fiche liée (écrite par la mise à jour elle-même, ou retouchée dans B) : rien à propager.
  if new.data ? 'viaEntite' and (tg_op = 'INSERT' or old.data ? 'viaEntite') then
    return null;
  end if;
  -- Les entités qui comptent tous les membres de celle-ci suivent (sans bloquer l'enregistrement en cas d'erreur).
  for b in select public.gsa_liens_vers(new.committee_id) loop
    begin
      perform public.gsa_liens_synchro(b);
    exception when others then
      raise warning 'Membres liés de % non mis à jour : %', b, sqlerrm;
    end;
  end loop;
  -- Et l'entité elle-même si elle en compte d'autres : pas de fiche liée en double d'un membre propre.
  if exists (select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = 'meta' and i.id = 'membresDe' and not i.deleted
             and case when jsonb_typeof(i.data) = 'array' then jsonb_array_length(i.data) > 0 else false end) then
    begin
      perform public.gsa_liens_synchro(new.committee_id);
    exception when others then
      raise warning 'Membres liés de % non mis à jour : %', new.committee_id, sqlerrm;
    end;
  end if;
  return null;
end $$;

-- Accès donné dans A : les entités liées l'ouvrent aussi ; retiré dans A : retiré là où la fiche liée vient de A.
create or replace function public.gsa_members_liens() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  b uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if new.person_id is null or exists (
         select 1 from public.gsa_items i
         where i.committee_id = new.committee_id and i.kind = 'people' and i.id = new.person_id and i.data ? 'viaEntite') then
      return null;
    end if;
    for b in select public.gsa_liens_vers(new.committee_id) loop
      begin
        perform public.gsa_liens_synchro(b);
      exception when others then
        raise warning 'Accès liés de % non mis à jour : %', b, sqlerrm;
      end;
    end loop;
    return null;
  end if;
  delete from public.gsa_members x
  using public.gsa_items i
  where i.committee_id = x.committee_id and i.kind = 'people' and i.id = x.person_id
    and x.committee_id in (select public.gsa_liens_vers(old.committee_id))
    and x.user_id = old.user_id and not x.owner
    and i.data ->> 'viaEntite' = old.committee_id::text and i.data ->> 'viaFiche' = old.person_id;
  return null;
end $$;

drop trigger if exists gsa_items_liens_garde on public.gsa_items;
create trigger gsa_items_liens_garde before insert or update on public.gsa_items
  for each row execute function public.gsa_items_liens_garde();
drop trigger if exists gsa_items_liens on public.gsa_items;
create trigger gsa_items_liens after insert or update on public.gsa_items
  for each row execute function public.gsa_items_liens();
drop trigger if exists gsa_members_liens on public.gsa_members;
create trigger gsa_members_liens after insert or update of person_id or delete on public.gsa_members
  for each row execute function public.gsa_members_liens();

-- Fonctions internes : appelées par les déclencheurs seulement.
revoke all on function public.gsa_liens_vers(uuid) from public, anon, authenticated;
revoke all on function public.gsa_liens_synchro(uuid) from public, anon, authenticated;

-- Organigramme (016) : avec le lien de chaque fiche (viaEntite, viaFiche) et les entités dont tous les membres font partie (liens).
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
      )
    ) order by c.parent_id nulls first, c.name), '[]'::jsonb)
    from public.committees c
    where c.id = club or c.parent_id = club
  );
end $$;
