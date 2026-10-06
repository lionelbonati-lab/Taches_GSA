-- Tâches GSA — 014 : agenda du club. Les événements de chaque entité (nom, dates, lieu ; pas la description)
-- sont visibles des membres de toutes les entités du club, pour les afficher dans leur agenda à côté des
-- dates d'édition des manifestations. Entités archivées exclues. Ajout pur : une nouvelle fonction, en lecture seule.

create or replace function public.gsa_agenda_club(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.gsa_is_club_member(club) then
    raise exception 'Réservé aux membres du club' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'uniteId', c.id,
      'id', e.id,
      'nom', coalesce(e.data ->> 'nom', ''),
      'date', e.data ->> 'date',
      'dateFin', e.data ->> 'dateFin',
      'lieu', coalesce(e.data ->> 'lieu', '')
    )) order by e.data ->> 'date'), '[]'::jsonb)
    from public.committees c
    join public.gsa_items e on e.committee_id = c.id and e.kind = 'events' and not e.deleted
    where (c.id = club or c.parent_id = club)
      and not coalesce((c.info ->> 'archive')::boolean, false)
      and coalesce(e.data ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
  );
end $$;

grant execute on function public.gsa_agenda_club(uuid) to authenticated;
