-- Tâches GSA — 032 : lier une tâche à une séance du comité dont l'entité dépend.
--
-- Une entité (sous-comité, groupe, équipe d'événement) peut lier l'une de ses tâches à une séance du comité dont elle
-- dépend (« Dépend de » : gsa_dependance, 030). L'appli partage alors la tâche avec ce comité (règle habituelle, 019 et
-- 030) et ce comité la voit à l'ordre du jour et au PV de cette séance (champ seanceComite de la tâche).
-- Pour choisir la séance, les membres de l'entité lisent la liste des séances de ce comité : titre, date et heure
-- seulement (ni ordre du jour, ni notes, ni PV, ni excusés).
-- Ajout pur : une nouvelle fonction, en lecture seule ; rien d'autre ne change.

create or replace function public.gsa_seances_comite(unite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  comite uuid;
begin
  if not public.gsa_is_member(unite) then
    return jsonb_build_object('comite', null, 'seances', '[]'::jsonb);
  end if;
  -- Comité central : il ne dépend de personne.
  comite := public.gsa_dependance(unite);
  if comite is null or comite = unite then
    return jsonb_build_object('comite', null, 'seances', '[]'::jsonb);
  end if;
  return jsonb_build_object('comite', comite, 'seances', (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', m.id,
      'titre', coalesce(m.data ->> 'titre', ''),
      'date', m.data ->> 'date',
      'heure', nullif(m.data ->> 'heure', '')
    )) order by m.data ->> 'date', m.id), '[]'::jsonb)
    from public.gsa_items m
    where m.committee_id = comite and m.kind = 'meetings' and not m.deleted
      and coalesce(m.data ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
  ));
end $$;

grant execute on function public.gsa_seances_comite(uuid) to authenticated;
