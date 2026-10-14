-- Tâches GSA — 037 : « Pour info » sur une tâche (des personnes ou des entités la voient, sans s'en occuper).
--
-- La tâche garde la liste dans data.pourInfo :
--   personnes : fiches de l'entité de la tâche ;
--   unites    : autres entités du club (leurs admins et les rôles « Voir toutes les tâches ») ;
--   autres    : personnes d'autres entités, par entité ({ "<entité>": ["<fiche>", …] }).
-- Jamais pour les tickets (remboursements, factures) : l'appli ne l'enregistre pas, et le serveur l'ignore.
--
-- • gsa_tache_lisible (029) : une personne mentionnée pour info lit la tâche dans son entité, même sans
--   « Voir toutes les tâches » (seule différence avec 029 : le bloc « pour info »).
-- • gsa_taches_pour_info(unite) : tâches des autres entités du club pour info de l'entité ouverte (lues par ses admins et
--   les rôles « Voir toutes les tâches ») ou de la personne connectée (sa fiche dans l'entité ouverte). Lecture seule,
--   comme gsa_anciennes_taches (030) : les liens joints sont transmis, les fichiers comptés seulement.
-- Ajout pur : une fonction redéfinie (même règle + le bloc « pour info ») et une nouvelle ; aucune donnée modifiée.
-- Pour revenir en arrière : relancer gsa_tache_lisible de 029 et supprimer gsa_taches_pour_info.

create or replace function public.gsa_tache_lisible(c uuid, t jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  moi text;
  p jsonb := case when jsonb_typeof(t -> 'paiement') = 'object' then t -> 'paiement' end;
begin
  if public.gsa_is_admin(c) then
    return true;
  end if;
  moi := public.gsa_ma_fiche(c);
  if moi is not null and (
       (jsonb_typeof(t -> 'responsables') = 'array' and (t -> 'responsables') ? moi)
    or t ->> 'createdBy' = moi
    or p ->> 'demandePar' = moi
    or p -> 'visa' ->> 'a' = moi
    or p -> 'validation' ->> 'par' = moi) then
    return true;
  end if;
  -- Pour info (037) : la personne mentionnée la lit, sans en être responsable.
  if moi is not null and p is null
    and jsonb_typeof(t -> 'pourInfo' -> 'personnes') = 'array' and (t -> 'pourInfo' -> 'personnes') ? moi then
    return true;
  end if;
  if p is not null then
    return public.gsa_a_droit(c, 'paiements.payer');
  end if;
  return public.gsa_a_droit_section(c, 'tasks.viewAll', t ->> 'sectionId');
end $$;

create or replace function public.gsa_taches_pour_info(unite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  club uuid;
  moi text;
  tout boolean;
begin
  if not public.gsa_is_member(unite) then
    return '[]'::jsonb;
  end if;
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = unite;
  moi := public.gsa_ma_fiche(unite);
  tout := public.gsa_is_admin(unite) or public.gsa_a_droit(unite, 'tasks.viewAll');
  return (
    with taches as (
      select c.id as uid, c.name, c.type, t.pos, t.data,
             case when jsonb_typeof(t.data -> 'documents') = 'array' then t.data -> 'documents' else '[]'::jsonb end as docs
      from public.committees c
      join public.gsa_items t on t.committee_id = c.id and t.kind = 'tasks' and not t.deleted
      where (c.id = club or c.parent_id = club) and c.id <> unite
        and not coalesce((c.info ->> 'archive')::boolean, false)
        and jsonb_typeof(t.data -> 'paiement') is distinct from 'object'
        and jsonb_typeof(t.data -> 'pourInfo') = 'object'
        and (
             (tout and jsonb_typeof(t.data -> 'pourInfo' -> 'unites') = 'array' and (t.data -> 'pourInfo' -> 'unites') ? unite::text)
          or (moi is not null and jsonb_typeof(t.data -> 'pourInfo' -> 'autres' -> unite::text) = 'array'
              and (t.data -> 'pourInfo' -> 'autres' -> unite::text) ? moi))
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'uniteId', x.uid,
      'unite', x.name,
      'type', x.type,
      'task', (x.data - 'documents') || jsonb_build_object(
        'documents', (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(x.docs) d where d ->> 'kind' = 'lien'),
        'pieces', (select count(*) from jsonb_array_elements(x.docs) d where d ->> 'kind' is distinct from 'lien')),
      'statuts', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id,
          'label', coalesce(s.data ->> 'label', ''),
          'done', coalesce((s.data ->> 'done')::boolean, false)
        ) order by s.pos), '[]'::jsonb)
        from public.gsa_items s
        where s.committee_id = x.uid and s.kind = 'statuses' and not s.deleted
      )
    ) order by x.name, x.pos), '[]'::jsonb)
    from taches x
  );
end $$;

revoke all on function public.gsa_taches_pour_info(uuid) from public, anon;
grant execute on function public.gsa_taches_pour_info(uuid) to authenticated;
