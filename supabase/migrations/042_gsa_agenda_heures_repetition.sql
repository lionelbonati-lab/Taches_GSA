-- Tâches GSA — 042 : heures et répétitions des événements dans l'agenda du club. gsa_agenda_club (014) donne en plus
-- l'heure de début et de fin, la répétition (tous les jours, semaines, mois, ans, personnalisée) et les occurrences
-- retirées de la série, pour afficher chaque occurrence dans l'agenda des autres entités. Même fonction, mêmes droits,
-- toujours sans la description ; en lecture seule, rien d'autre ne change.

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
      'heure', e.data ->> 'heure',
      'heureFin', e.data ->> 'heureFin',
      'lieu', coalesce(e.data ->> 'lieu', ''),
      'repetition', case when jsonb_typeof(e.data -> 'repetition') = 'object' then e.data -> 'repetition' end,
      'sauf', case when jsonb_typeof(e.data -> 'sauf') = 'array' then e.data -> 'sauf' end
    )) order by e.data ->> 'date'), '[]'::jsonb)
    from public.committees c
    join public.gsa_items e on e.committee_id = c.id and e.kind = 'events' and not e.deleted
    where (c.id = club or c.parent_id = club)
      and not coalesce((c.info ->> 'archive')::boolean, false)
      and coalesce(e.data ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
  );
end $$;

grant execute on function public.gsa_agenda_club(uuid) to authenticated;
