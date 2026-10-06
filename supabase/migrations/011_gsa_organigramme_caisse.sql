-- Tâches GSA — 011 : l'organigramme indique qui tient la caisse de chaque entité (rôle qui donne
-- expressément « paiements.payer », hors admin). Le formulaire des tickets ne propose ainsi que les
-- entités qui ont un caissier. Seul ajout : le champ « caisse » de chaque membre ; aucune donnée modifiée.

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
      ) end
    ) order by c.parent_id nulls first, c.name), '[]'::jsonb)
    from public.committees c
    where c.id = club or c.parent_id = club
  );
end $$;
