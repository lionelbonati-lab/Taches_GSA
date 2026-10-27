-- Tâches GSA — 053 : discussion (049) depuis n'importe laquelle de ses entités.
--
-- Une personne membre de plusieurs entités du club y a une fiche dans chacune ; un message porte la fiche (et l'entité)
-- d'où il a été écrit.
-- • gsa_commenter (049) remplacée, mêmes contrôles et mêmes paramètres, deux changements :
--     - corriger ou retirer son message : aussi depuis une autre de ses entités que celle d'où il a été écrit (le message
--       est le sien si sa fiche et son entité sont celles de l'un de ses accès, gsa_members du compte connecté). Le message
--       garde son auteur, son entité et sa date ; seuls son texte et « corrigé le » changent, comme avant ;
--     - nouveau message : ses autres fiches (ses accès dans les autres entités) ne sont pas prévenues de son propre message.
-- Ajout pur : une fonction remplacée ; aucune donnée modifiée.
-- Pour revenir en arrière : relancer gsa_commenter de 049.

create or replace function public.gsa_commenter(unite uuid, tache text, depuis uuid, texte text default null, cle text default null,
  supprimer boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(depuis);
  src public.committees;
  club uuid;
  ici text;
  d jsonb;
  ok boolean;
  liste jsonb;
  avant jsonb;
  c jsonb;
  idx int;
  nom text;
  mot text := btrim(coalesce(texte, ''));
  quand text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if moi is null then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  select coalesce(x.parent_id, x.id), x.name into club, ici from public.committees x where x.id = depuis;
  select * into src from public.committees x where x.id = unite;
  if src.id is null or coalesce(src.parent_id, src.id) is distinct from club
     or (src.id <> depuis and coalesce((src.info ->> 'archive')::boolean, false)) then
    raise exception 'Tâche introuvable' using errcode = 'P0002';
  end if;
  select i.data into d
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache and not i.deleted
  for update;
  if jsonb_typeof(d) is distinct from 'object' then
    raise exception 'Tâche introuvable' using errcode = 'P0002';
  end if;
  if jsonb_typeof(d -> 'paiement') = 'object' then
    raise exception 'Pas de discussion sur un ticket de paiement' using errcode = '42501';
  end if;
  if depuis = unite then
    ok := public.gsa_tache_lisible(unite, d);
  else
    ok := (public.gsa_tache_dans(src.info -> 'historiqueDependance', coalesce(public.gsa_dependance(src.id) = depuis, false),
             public.gsa_reglage_taches(src.id), src.parent_id, tache, d, depuis) = 'modifiable'
           and public.gsa_partagee_lisible(depuis, unite, d))
      or (jsonb_typeof(d -> 'pourInfo') = 'object' and (
             ((public.gsa_is_admin(depuis) or public.gsa_a_droit(depuis, 'tasks.viewAll'))
              and jsonb_typeof(d -> 'pourInfo' -> 'unites') = 'array' and (d -> 'pourInfo' -> 'unites') ? depuis::text)
          or (jsonb_typeof(d -> 'pourInfo' -> 'autres' -> depuis::text) = 'array'
              and (d -> 'pourInfo' -> 'autres' -> depuis::text) ? moi)));
  end if;
  if not coalesce(ok, false) then
    raise exception 'Tu ne vois pas cette tâche' using errcode = '42501';
  end if;

  avant := case when jsonb_typeof(d -> 'commentaires') = 'array' then d -> 'commentaires' else '[]'::jsonb end;
  liste := avant;
  if cle is null then
    if supprimer then
      raise exception 'Commentaire introuvable' using errcode = 'P0002';
    end if;
    if char_length(mot) = 0 or char_length(mot) > 2000 then
      raise exception 'Le commentaire doit faire entre 1 et 2000 caractères' using errcode = '22023';
    end if;
    if jsonb_array_length(liste) >= 200 then
      raise exception 'Cette discussion a atteint 200 commentaires' using errcode = '54000';
    end if;
    select nullif(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', '')), '') into nom
    from public.gsa_items p
    where p.committee_id = depuis and p.kind = 'people' and p.id = moi and not p.deleted;
    c := jsonb_build_object('id', 'c' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'par', moi,
      'nom', coalesce(nom, '?'), 'le', quand, 'texte', mot)
      || case when depuis <> unite then jsonb_build_object('u', depuis::text) else '{}'::jsonb end;
    liste := liste || jsonb_build_array(c);
  else
    select (x.i - 1)::int, x.v into idx, c
    from jsonb_array_elements(liste) with ordinality x(v, i)
    where x.v ->> 'id' = cle;
    if c is null then
      raise exception 'Commentaire introuvable' using errcode = 'P0002';
    end if;
    -- Le sien : écrit depuis l'entité ouverte, ou depuis une autre de ses entités (sa fiche là-bas, 053).
    if not (c ->> 'par' = moi and coalesce(c ->> 'u', unite::text) = depuis::text)
       and not exists (select 1 from public.gsa_members m
                       where m.user_id = auth.uid() and m.committee_id::text = coalesce(c ->> 'u', unite::text)
                         and m.person_id = c ->> 'par')
       and not (supprimer and public.gsa_is_admin(unite)) then
      raise exception 'Ce commentaire n’est pas le tien' using errcode = '42501';
    end if;
    if supprimer then
      liste := liste - idx;
    else
      if char_length(mot) = 0 or char_length(mot) > 2000 then
        raise exception 'Le commentaire doit faire entre 1 et 2000 caractères' using errcode = '22023';
      end if;
      if c ->> 'texte' = mot then
        return d;
      end if;
      liste := jsonb_set(liste, array[idx::text], c || jsonb_build_object('texte', mot, 'modifieLe', quand));
    end if;
  end if;

  d := case when jsonb_array_length(liste) = 0 then d - 'commentaires' else d || jsonb_build_object('commentaires', liste) end;
  perform set_config('gsa.commentaires', 'oui', true);
  update public.gsa_items i set data = d, client_id = null
  where i.committee_id = unite and i.kind = 'tasks' and i.id = tache;
  perform set_config('gsa.commentaires', '', true);

  -- Nouveau commentaire : les personnes concernées sont prévenues, chacune dans son entité.
  if cle is null then
    insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
    select z.entite, 'notifications', z.nid, z.pos,
      jsonb_build_object(
        'id', z.nid, 'userId', z.fiche, 'type', 'comment',
        'taskId', case when z.entite = unite then tache else 'x:' || unite::text || ':' || tache end,
        'by', case when z.entite = depuis then moi else 'x:' || depuis::text || ':' || moi end,
        'at', quand, 'titre', coalesce(d ->> 'titre', ''),
        'detail', case when char_length(mot) > 140 then left(mot, 139) || '…' else mot end)
      || case when z.entite <> depuis then jsonb_build_object('byName', coalesce(nom, '?') || ' (' || coalesce(ici, '?') || ')') else '{}'::jsonb end,
      false, null
    from (
      -- Un identifiant par notification (calculé ligne par ligne) ; en tête de la liste de son entité.
      select x.entite, x.fiche, 'n' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) as nid,
        coalesce((select min(n.pos) from public.gsa_items n where n.committee_id = x.entite and n.kind = 'notifications'), 0) - 1 as pos
      from (
        select distinct y.entite, y.fiche
        from (
          select unite as entite, r.v as fiche
          from jsonb_array_elements_text(case when jsonb_typeof(d -> 'responsables') = 'array' then d -> 'responsables' else '[]'::jsonb end) r(v)
          union all
          select unite, d ->> 'createdBy' where coalesce(d ->> 'createdBy', '') <> ''
          union all
          select e.k::uuid, r.v
          from jsonb_each(case when jsonb_typeof(d -> 'respPartage') = 'object' then d -> 'respPartage' else '{}'::jsonb end) e(k, l)
          cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.l) = 'array' then e.l else '[]'::jsonb end) r(v)
          where e.k ~ uuid_re
          union all
          select coalesce(nullif(a.v ->> 'u', '')::uuid, unite), a.v ->> 'par'
          from jsonb_array_elements(avant) a(v)
          where coalesce(a.v ->> 'u', '') = '' or a.v ->> 'u' ~ uuid_re
        ) y
        join public.committees e on e.id = y.entite and coalesce(e.parent_id, e.id) = club and not coalesce((e.info ->> 'archive')::boolean, false)
        join public.gsa_items p on p.committee_id = y.entite and p.kind = 'people' and p.id = y.fiche and not p.deleted
          and coalesce((p.data ->> 'actif')::boolean, true)
        where not (y.entite = depuis and y.fiche = moi)
          -- Ni ses autres fiches (053) : on n'est pas prévenu de son propre message dans ses autres entités.
          and not exists (select 1 from public.gsa_members m where m.user_id = auth.uid() and m.committee_id = y.entite and m.person_id = y.fiche)
      ) x
      offset 0
    ) z;
  end if;
  return d;
end $$;

revoke all on function public.gsa_commenter(uuid, text, uuid, text, text, boolean) from public, anon;
grant execute on function public.gsa_commenter(uuid, text, uuid, text, text, boolean) to authenticated;
