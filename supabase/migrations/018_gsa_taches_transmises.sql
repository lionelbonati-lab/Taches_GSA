-- Tâches GSA — 018 : tâches transmises au comité central. Un sous-comité, un groupe ou une équipe coche
-- « Transmettre au comité central » dans une tâche (data.auCentral) : la tâche reste dans ses données, et
-- les membres du comité central la lisent pour leur ordre du jour (titre, délai, statut, responsables,
-- remarque, checklist). Pas les tickets (remboursements, factures). Entités archivées exclues.
-- Ajout pur : une nouvelle fonction, en lecture seule ; aucune donnée modifiée.

create or replace function public.gsa_taches_transmises(club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.committees where id = club and parent_id is null) or not public.gsa_is_member(club) then
    raise exception 'Réservé aux membres du comité central' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'uniteId', c.id,
      'unite', c.name,
      'type', c.type,
      'id', t.id,
      'titre', coalesce(t.data ->> 'titre', ''),
      'delai', coalesce(t.data ->> 'delai', ''),
      'remarque', coalesce(t.data ->> 'remarque', ''),
      'statut', coalesce(s.data ->> 'label', '?'),
      'termine', coalesce((s.data ->> 'done')::boolean, false),
      'termineeLe', t.data ->> 'termineeLe',
      'checklist', case when jsonb_typeof(t.data -> 'checklist') = 'array' then t.data -> 'checklist' else '[]'::jsonb end,
      'responsables', (
        select coalesce(jsonb_agg(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', ''))), '[]'::jsonb)
        from public.gsa_items p
        where p.committee_id = c.id and p.kind = 'people' and not p.deleted
          and p.id in (select jsonb_array_elements_text(case when jsonb_typeof(t.data -> 'responsables') = 'array' then t.data -> 'responsables' else '[]'::jsonb end))
      )
    )) order by c.name, t.data ->> 'delai'), '[]'::jsonb)
    from public.committees c
    join public.gsa_items t on t.committee_id = c.id and t.kind = 'tasks' and not t.deleted
    left join public.gsa_items s on s.committee_id = c.id and s.kind = 'statuses' and s.id = t.data ->> 'statusId' and not s.deleted
    where c.parent_id = club
      and not coalesce((c.info ->> 'archive')::boolean, false)
      and coalesce((t.data ->> 'auCentral')::boolean, false)
      and not (t.data ? 'paiement')
  );
end $$;

grant execute on function public.gsa_taches_transmises(uuid) to authenticated;
