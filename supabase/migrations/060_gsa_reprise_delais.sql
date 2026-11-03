-- 060 : délais calés sur la date d'une étiquette, rétablis après la reprise (059).
--
-- Entre la publication de l'étape D1 (02.11.2026, vers 16 h UTC) et la reprise (059), l'appli retirait le lien
-- « N jours avant » des tâches du club attribuées à une entité : elle ne savait plus trouver la date de l'entité. La date
-- de ces tâches n'a pas changé, seul le lien est parti ; la reprise n'a donc pas pu le caler sur la date de l'étiquette.
-- Cette migration le rétablit d'après la dernière copie de nuit d'avant D1 (gsa_copies) : une tâche du club qui y avait
-- un délai calé sur la date d'une entité reprise, et qui n'a plus de délai calé, reçoit un délai calé sur la date de
-- l'étiquette de cette entité (même décalage) et porte cette étiquette. La date ne change pas.
-- Rejouable : une tâche qui a déjà un délai calé n'est pas touchée. La ligne d'avant est recopiée dans gsa_reprise_avant.
do $$
declare
  club record;
  copie bigint;
  t record;
  n int;
  et text;
begin
  for club in select c.id, c.name from public.committees c where c.parent_id is null loop
    n := 0;
    select k.id into copie from public.gsa_copies k
    where k.committee_id = club.id and k.faite_le < '2026-11-02T16:00:00Z'
    order by k.faite_le desc limit 1;
    if copie is null then
      continue;
    end if;
    for t in
      select i.id, i.data, r -> 'data' as avant, e.id as entite
      from public.gsa_copies k
      cross join lateral jsonb_array_elements(case when jsonb_typeof(k.donnees) = 'array' then k.donnees else '[]'::jsonb end) r
      join public.gsa_items i on i.committee_id = club.id and i.kind = 'tasks' and i.id = r ->> 'id' and not i.deleted
      join public.committees e on e.parent_id = club.id and e.id::text = r -> 'data' -> 'evenementEntite' ->> 'uniteId'
        and coalesce(e.info, '{}'::jsonb) ? 'reprise'
      where k.id = copie and r ->> 'kind' = 'tasks'
        and jsonb_typeof(r -> 'data' -> 'delaiRef') = 'object' and r -> 'data' -> 'delaiRef' ->> 'type' = 'event'
        and not ((r -> 'data') ? 'eventId')
        and jsonb_typeof(i.data) = 'object' and not (i.data ? 'delaiRef')
    loop
      et := 'et-' || t.entite::text;
      continue when not exists (
        select 1 from public.gsa_items x
        where x.committee_id = club.id and x.kind = 'etiquettes' and x.id = et and not x.deleted and coalesce(x.data ->> 'date', '') <> '');
      insert into public.gsa_reprise_avant (committee_id, kind, item_id, deleted, data) values (club.id, 'tasks', t.id, false, t.data);
      update public.gsa_items i
      set data = i.data
        || jsonb_build_object('delaiRef', ((t.avant -> 'delaiRef') - 'occurrence') || jsonb_build_object('type', 'etiquette', 'etiquetteId', et))
        || jsonb_build_object('etiquettes', (
             select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(case when jsonb_typeof(i.data -> 'etiquettes') = 'array' then i.data -> 'etiquettes' else '[]'::jsonb end) v
                   union select et) y)),
          client_id = null
      where i.committee_id = club.id and i.kind = 'tasks' and i.id = t.id;
      n := n + 1;
    end loop;
    update public.gsa_historique h set nom = 'Reprise des entités'
    where h.committee_id = club.id and h.par is null and h.nom = 'Automatique' and h.le >= now();
    raise notice '« % » : % délai(s) calé(s) de nouveau sur la date d''une étiquette', club.name, n;
  end loop;
end $$;
