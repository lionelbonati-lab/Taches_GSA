-- Tâches GSA — 019 : tâches partagées entre les entités du club.
-- Une tâche reste dans son entité ; ses membres la partagent avec d'autres entités du club (data.partage :
-- identifiants des entités ; l'ancienne case data.auCentral de 018 vaut pour le comité central).
-- Les membres de ces entités la lisent (gsa_taches_partagees) et la modifient comme les leurs
-- (gsa_modifier_tache_partagee) : titre, délai, statut, responsables, remarque, checklist, et leur propre
-- rangement dans leurs sections. Le reste (documents, liens, répétition, partage) ne change que dans son entité.
-- Ni les tickets (remboursements, factures), ni les tâches des entités archivées.
-- Ajout pur : deux nouvelles fonctions ; aucune donnée existante modifiée. gsa_taches_transmises (018) n'est plus
-- utilisée par l'appli (laissée en place).

-- Tâches que les autres entités du club partagent avec l'entité `unite` (vide pour qui n'en est pas membre).
create or replace function public.gsa_taches_partagees(unite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  club uuid;
begin
  if not public.gsa_is_member(unite) then
    return '[]'::jsonb;
  end if;
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = unite;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'uniteId', c.id,
      'unite', c.name,
      'type', c.type,
      'task', t.data - 'documents',
      'statuts', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id,
          'label', coalesce(s.data ->> 'label', ''),
          'done', coalesce((s.data ->> 'done')::boolean, false)
        ) order by s.pos), '[]'::jsonb)
        from public.gsa_items s
        where s.committee_id = c.id and s.kind = 'statuses' and not s.deleted
      )
    ) order by c.name, t.data ->> 'delai'), '[]'::jsonb)
    from public.committees c
    join public.gsa_items t on t.committee_id = c.id and t.kind = 'tasks' and not t.deleted
    where (c.id = club or c.parent_id = club) and c.id <> unite
      and not coalesce((c.info ->> 'archive')::boolean, false)
      and not (t.data ? 'paiement')
      and (
        (jsonb_typeof(t.data -> 'partage') = 'array' and t.data -> 'partage' ? unite::text)
        or (coalesce((t.data ->> 'auCentral')::boolean, false) and unite = c.parent_id)
      )
  );
end $$;

-- Modification d'une tâche partagée par un membre de l'entité `unite` : enregistrée dans l'entité `source`.
-- Seuls les champs modifiables sont repris (types contrôlés, sinon l'ancienne valeur reste).
create or replace function public.gsa_modifier_tache_partagee(unite uuid, source uuid, tache text, modif jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  src public.committees;
  club uuid;
  old jsonb;
  nd jsonb;
  place jsonb;
begin
  if not public.gsa_is_member(unite) then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = unite;
  select * into src from public.committees x where x.id = source;
  if src.id is null or src.id = unite or coalesce(src.parent_id, src.id) is distinct from club
     or coalesce((src.info ->> 'archive')::boolean, false) then
    raise exception 'Entité introuvable' using errcode = '42501';
  end if;
  select i.data into old from public.gsa_items i
  where i.committee_id = source and i.kind = 'tasks' and i.id = tache and not i.deleted
  for update;
  if old is null or old ? 'paiement' or not (
       (jsonb_typeof(old -> 'partage') = 'array' and old -> 'partage' ? unite::text)
       or (coalesce((old ->> 'auCentral')::boolean, false) and unite = src.parent_id)) then
    raise exception 'Cette tâche n’est plus partagée avec cette entité' using errcode = '42501';
  end if;

  nd := old;
  if jsonb_typeof(modif -> 'titre') = 'string' and btrim(modif ->> 'titre') <> '' then
    nd := nd || jsonb_build_object('titre', left(btrim(modif ->> 'titre'), 500));
  end if;
  -- Délai changé ici : il ne suit plus l'événement / la séance de l'entité de la tâche.
  if jsonb_typeof(modif -> 'delai') = 'string' and (modif ->> 'delai' = '' or modif ->> 'delai' ~ '^\d{4}-\d{2}-\d{2}$')
     and (modif ->> 'delai') is distinct from (old ->> 'delai') then
    nd := (nd - 'delaiRef') || jsonb_build_object('delai', modif ->> 'delai');
  end if;
  if jsonb_typeof(modif -> 'statusId') = 'string' and exists (
       select 1 from public.gsa_items s
       where s.committee_id = source and s.kind = 'statuses' and s.id = modif ->> 'statusId' and not s.deleted) then
    nd := nd || jsonb_build_object('statusId', modif ->> 'statusId');
  end if;
  if jsonb_typeof(modif -> 'remarque') = 'string' then
    nd := nd || jsonb_build_object('remarque', left(modif ->> 'remarque', 5000));
  end if;
  if jsonb_typeof(modif -> 'checklist') = 'array' then
    nd := nd || jsonb_build_object('checklist', modif -> 'checklist');
  end if;
  -- Responsables : fiches de l'entité de la tâche ; ceux des entités du partage : respPartage.
  if jsonb_typeof(modif -> 'responsables') = 'array' then
    nd := nd || jsonb_build_object('responsables', (
      select coalesce(jsonb_agg(r.v order by r.n), '[]'::jsonb)
      from jsonb_array_elements_text(modif -> 'responsables') with ordinality as r(v, n)
      where exists (select 1 from public.gsa_items p where p.committee_id = source and p.kind = 'people' and p.id = r.v and not p.deleted)
    ));
  end if;
  if jsonb_typeof(modif -> 'respPartage') = 'object' then
    nd := nd || jsonb_build_object('respPartage', modif -> 'respPartage');
  else
    nd := nd - 'respPartage';
  end if;
  -- Rangement : seulement celui de l'entité qui modifie.
  place := coalesce(old -> 'placePartage', '{}'::jsonb) - unite::text;
  if jsonb_typeof(modif -> 'placePartage' -> unite::text) = 'object' then
    place := place || jsonb_build_object(unite::text, modif -> 'placePartage' -> unite::text);
  end if;
  nd := case when place = '{}'::jsonb then nd - 'placePartage' else nd || jsonb_build_object('placePartage', place) end;
  if jsonb_typeof(modif -> 'termineeLe') = 'string' then
    nd := nd || jsonb_build_object('termineeLe', left(modif ->> 'termineeLe', 10));
  else
    nd := nd - 'termineeLe';
  end if;
  if jsonb_typeof(modif -> 'modifiePar') = 'string' then
    nd := nd || jsonb_build_object('modifiePar', left(modif ->> 'modifiePar', 200));
  end if;
  nd := nd || jsonb_build_object('updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  update public.gsa_items i set data = nd, client_id = null
  where i.committee_id = source and i.kind = 'tasks' and i.id = tache;
end $$;

grant execute on function public.gsa_taches_partagees(uuid) to authenticated;
grant execute on function public.gsa_modifier_tache_partagee(uuid, uuid, text, jsonb) to authenticated;
