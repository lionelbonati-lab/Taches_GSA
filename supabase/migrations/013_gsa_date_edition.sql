-- Tâches GSA — 013 : date de la prochaine édition d'une manifestation, sur un ou plusieurs jours.
-- Le comité d'organisation (sous-comité, équipe d'événement) change lui-même la date de sa prochaine édition :
-- ses admins, ses membres qui ont le droit « Gérer les événements », et les admins du comité central.
-- Seules les dates de la fiche de l'entité (committees.info : date, dateFin) changent ; le reste est intact.
--
-- Ajout pur : une nouvelle fonction.

create or replace function public.gsa_date_edition(c uuid, debut date, fin date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u public.committees;
begin
  select * into u from public.committees where id = c;
  if u.id is null or u.type not in ('sous-comite', 'equipe') then
    raise exception 'Cette entité n’a pas de date d’édition' using errcode = '22023';
  end if;
  if not (public.gsa_is_admin(c) or public.gsa_a_droit(c, 'events.manage') or (u.parent_id is not null and public.gsa_is_admin(u.parent_id))) then
    raise exception 'Seul le comité de l’entité change la date de sa prochaine édition' using errcode = '42501';
  end if;
  if debut is null then
    raise exception 'Indique la date de la prochaine édition' using errcode = '22023';
  end if;
  if fin is not null and fin < debut then
    raise exception 'Le dernier jour ne peut pas précéder le premier' using errcode = '22023';
  end if;
  update public.committees
     set info = (coalesce(info, '{}'::jsonb) - 'date' - 'dateFin')
       || jsonb_build_object('date', to_char(debut, 'YYYY-MM-DD'))
       || case when fin > debut then jsonb_build_object('dateFin', to_char(fin, 'YYYY-MM-DD')) else '{}'::jsonb end
   where id = c;
end $$;

grant execute on function public.gsa_date_edition(uuid, date, date) to authenticated;
