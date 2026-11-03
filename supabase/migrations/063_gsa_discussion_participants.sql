-- 063 : ajouter une personne à la discussion d'un point, même si elle n'est pas membre de ses étiquettes.
--
-- Les personnes ajoutées sont dans la ligne « discussions » du point (062) : data.participants = [fiches], écrite par le
-- serveur seulement (personne ne s'y ajoute en écrivant la ligne, la garde de 062 l'ignore).
-- • gsa_discussion_ajouter(unite, tache, fiche, retirer) : qui lit la discussion y ajoute une personne active du club,
--   ou retire une personne ajoutée (chacun peut aussi se retirer lui-même) ; la personne ajoutée est prévenue (🔔, type
--   « discussion »), et la tâche est relue par ceux qui la voient (la personne ajoutée la reçoit tout de suite).
--   Renvoie la discussion. Pas sur les tickets de paiement.
-- • Une personne ajoutée lit la discussion (même réservée aux membres d'une étiquette, 062) et la tâche dont on parle
--   (gsa_tache_lisible), écrit dans la discussion et est prévenue des nouveaux messages (gsa_commenter, qui garde les
--   personnes ajoutées en écrivant la discussion).
-- Ajout pur pour les données : rien n'est modifié ni repris.
-- Retour en arrière : relancer gsa_tache_lisible, gsa_discussion_lisible et gsa_commenter de 062, puis supprimer
-- gsa_discussion_ajouter et gsa_dans_discussion (les personnes ajoutées restent dans les discussions, sans effet).

-- La fiche `fiche` a été ajoutée à la discussion de la tâche `tache` de l'espace `c`.
create or replace function public.gsa_dans_discussion(c uuid, tache text, fiche text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(fiche, '') <> '' and coalesce(tache, '') <> '' and exists (
    select 1 from public.gsa_items x
    where x.committee_id = c and x.kind = 'discussions' and x.id = tache and not x.deleted
      and jsonb_typeof(x.data -> 'participants') = 'array' and (x.data -> 'participants') ? fiche);
$$;
-- Pas ouverte aux comptes (utilisée par les règles du serveur).
revoke all on function public.gsa_dans_discussion(uuid, text, text) from public, anon, authenticated;

-- ---------- Lecture ----------
-- Qui lit une tâche (038), plus les membres de ses étiquettes (062) et les personnes ajoutées à sa discussion (063).
create or replace function public.gsa_tache_lisible(c uuid, t jsonb)
returns boolean
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
  -- À prendre (038) : la personne à qui elle est proposée la lit, pour s'en charger.
  if moi is not null and p is null
    and jsonb_typeof(t -> 'aPrendre' -> 'personnes') = 'array' and (t -> 'aPrendre' -> 'personnes') ? moi then
    return true;
  end if;
  -- Étiquettes (062) : les membres d'une étiquette de la tâche la lisent.
  if moi is not null and p is null and public.gsa_dans_etiquette(c, t, moi) then
    return true;
  end if;
  -- Discussion (063) : une personne ajoutée à la discussion lit la tâche dont on parle.
  if moi is not null and p is null and public.gsa_dans_discussion(c, t ->> 'id', moi) then
    return true;
  end if;
  if p is not null then
    return public.gsa_a_droit(c, 'paiements.payer');
  end if;
  return public.gsa_a_droit_section(c, 'tasks.viewAll', t ->> 'sectionId');
end $$;

-- Qui lit la discussion (062) : tâche étiquetée, les membres de ses étiquettes et les personnes ajoutées (063) ; sinon,
-- qui lit la tâche (personnes ajoutées comprises).
create or replace function public.gsa_discussion_lisible(c uuid, tache text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  t jsonb;
  moi text;
begin
  if tache is null or not public.gsa_is_member(c) then
    return false;
  end if;
  select i.data into t from public.gsa_items i where i.committee_id = c and i.kind = 'tasks' and i.id = tache;
  if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t -> 'paiement') = 'object' then
    return false;
  end if;
  if public.gsa_tache_etiquetee(c, t) then
    moi := public.gsa_ma_fiche(c);
    return public.gsa_dans_etiquette(c, t, moi) or public.gsa_dans_discussion(c, tache, moi);
  end if;
  return public.gsa_tache_lisible(c, t);
end $$;
revoke all on function public.gsa_discussion_lisible(uuid, text) from public, anon, authenticated;

-- ---------- Discussion ----------
-- Discussion : ajoute un commentaire (sans `cle`), corrige le sien ou le retire (`cle`) ; un admin qui lit la discussion
-- peut retirer n'importe quel commentaire. Renvoie la tâche avec sa discussion (« commentaires »).
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
  reservee boolean;
  participants jsonb;
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
  -- La tâche verrouillée : un commentaire à la fois par discussion.
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
  -- Tâche étiquetée (062) : discussion réservée aux membres de ses étiquettes et aux personnes ajoutées (063), depuis
  -- l'espace de la tâche.
  reservee := public.gsa_tache_etiquetee(unite, d);
  if reservee then
    if depuis <> unite or not (public.gsa_dans_etiquette(unite, d, moi) or public.gsa_dans_discussion(unite, tache, moi)) then
      raise exception 'Discussion réservée aux membres de l’étiquette' using errcode = '42501';
    end if;
  else
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
  end if;

  -- La discussion : sa ligne (062), sinon ce qui restait dans la tâche (avant la reprise) ; ses personnes ajoutées (063).
  select i.data -> 'commentaires', i.data -> 'participants' into avant, participants
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'discussions' and i.id = tache and not i.deleted;
  participants := case when jsonb_typeof(participants) = 'array' then participants else '[]'::jsonb end;
  avant := case when jsonb_typeof(avant) = 'array' then avant
                when jsonb_typeof(d -> 'commentaires') = 'array' then d -> 'commentaires'
                else '[]'::jsonb end;
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
        return (d - 'commentaires') || jsonb_build_object('commentaires', liste);
      end if;
      liste := jsonb_set(liste, array[idx::text], c || jsonb_build_object('texte', mot, 'modifieLe', quand));
    end if;
  end if;

  perform set_config('gsa.commentaires', 'oui', true);
  insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
  values (unite, 'discussions', tache, 0, jsonb_build_object('tache', tache, 'commentaires', liste, 'participants', participants), false, null)
  on conflict (committee_id, kind, id) do update set data = excluded.data, deleted = false, client_id = null;
  -- Ce qui restait dans la tâche (avant la reprise) en sort.
  if d ? 'commentaires' then
    update public.gsa_items i set data = i.data - 'commentaires', client_id = null
    where i.committee_id = unite and i.kind = 'tasks' and i.id = tache;
  end if;
  perform set_config('gsa.commentaires', '', true);

  -- Nouveau commentaire : les personnes concernées sont prévenues, chacune dans son entité (personnes ajoutées comprises,
  -- 063) ; discussion réservée : seulement celles qui la lisent (membres d'une étiquette de la tâche, personnes ajoutées).
  if cle is null then
    insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
    select z.entite, 'notifications', z.nid, z.pos,
      jsonb_build_object(
        'id', z.nid, 'userId', z.fiche, 'type', 'comment',
        'taskId', case when z.entite = unite then tache else 'x:' || unite::text || ':' || tache end,
        'by', case when z.entite = depuis then moi else 'x:' || depuis::text || ':' || moi end,
        'at', quand, 'titre', coalesce(d ->> 'titre', ''),
        'detail', case when char_length(mot) > 140 then left(mot, 139) || '…' else mot end)
      -- De personne à personne (053) : l'auteur d'une autre entité est nommé, sans son entité.
      || case when z.entite <> depuis then jsonb_build_object('byName', coalesce(nom, '?')) else '{}'::jsonb end,
      false, null
    from (
      -- Un identifiant par notification (calculé ligne par ligne) ; en tête de la liste de son entité.
      select x.entite, x.fiche, 'n' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) as nid,
        coalesce((select min(n.pos) from public.gsa_items n where n.committee_id = x.entite and n.kind = 'notifications'), 0) - 1 as pos
      from (
        -- Une notification par personne (053) : une personne avec un accès dans plusieurs entités concernées n'est prévenue
        -- qu'une fois, dans l'entité de la tâche si elle y est concernée, sinon dans celle d'où le message a été écrit,
        -- sinon dans la première. Une fiche sans accès compte pour elle-même.
        select distinct on (coalesce(m.user_id::text, y.entite::text || ':' || y.fiche)) y.entite, y.fiche
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
          select unite, r.v from jsonb_array_elements_text(participants) r(v)
          union all
          select coalesce(nullif(a.v ->> 'u', '')::uuid, unite), a.v ->> 'par'
          from jsonb_array_elements(avant) a(v)
          where coalesce(a.v ->> 'u', '') = '' or a.v ->> 'u' ~ uuid_re
        ) y
        join public.committees e on e.id = y.entite and coalesce(e.parent_id, e.id) = club and not coalesce((e.info ->> 'archive')::boolean, false)
        join public.gsa_items p on p.committee_id = y.entite and p.kind = 'people' and p.id = y.fiche and not p.deleted
          and coalesce((p.data ->> 'actif')::boolean, true)
        left join public.gsa_members m on m.committee_id = y.entite and m.person_id = y.fiche
        where not (y.entite = depuis and y.fiche = moi)
          -- Ni ses autres fiches (053) : on n'est pas prévenu de son propre message dans ses autres entités.
          and m.user_id is distinct from auth.uid()
          -- Discussion réservée (062) : seulement ceux qui la lisent (membres d'une étiquette de la tâche, personnes ajoutées).
          and (not reservee or (y.entite = unite and (public.gsa_dans_etiquette(unite, d, y.fiche) or participants ? y.fiche)))
        order by coalesce(m.user_id::text, y.entite::text || ':' || y.fiche), (y.entite = unite) desc, (y.entite = depuis) desc, y.entite
      ) x
      offset 0
    ) z;
  end if;
  return (d - 'commentaires') || jsonb_build_object('commentaires', liste, 'participants', participants);
end $$;
revoke all on function public.gsa_commenter(uuid, text, uuid, text, text, boolean) from public, anon;
grant execute on function public.gsa_commenter(uuid, text, uuid, text, text, boolean) to authenticated;

-- Ajouter une personne à la discussion de la tâche `tache` (ou la retirer : `retirer`).
create or replace function public.gsa_discussion_ajouter(unite uuid, tache text, fiche text, retirer boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(unite);
  d jsonb;
  disc jsonb;
  liste jsonb;
  quand text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if moi is null then
    raise exception 'Réservé aux membres du club' using errcode = '42501';
  end if;
  -- La tâche verrouillée, comme pour un message (gsa_commenter) : une modification de la discussion à la fois.
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
  if not public.gsa_discussion_lisible(unite, tache) then
    raise exception 'Tu ne lis pas cette discussion' using errcode = '42501';
  end if;
  if not retirer and not exists (
       select 1 from public.gsa_items p
       where p.committee_id = unite and p.kind = 'people' and p.id = fiche and not p.deleted
         and coalesce((p.data ->> 'actif')::boolean, true)) then
    raise exception 'Personne introuvable' using errcode = 'P0002';
  end if;
  select i.data into disc from public.gsa_items i where i.committee_id = unite and i.kind = 'discussions' and i.id = tache and not i.deleted;
  if jsonb_typeof(disc) is distinct from 'object' then
    disc := jsonb_build_object('tache', tache, 'commentaires', '[]'::jsonb);
  end if;
  liste := case when jsonb_typeof(disc -> 'participants') = 'array' then disc -> 'participants' else '[]'::jsonb end;
  if retirer then
    if not liste ? fiche then
      return disc;
    end if;
    liste := liste - fiche;
  else
    if liste ? fiche then
      return disc;
    end if;
    if jsonb_array_length(liste) >= 50 then
      raise exception 'Cette discussion a déjà 50 personnes ajoutées' using errcode = '54000';
    end if;
    liste := liste || jsonb_build_array(fiche);
  end if;
  disc := disc || jsonb_build_object('participants', liste);

  perform set_config('gsa.commentaires', 'oui', true);
  insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
  values (unite, 'discussions', tache, 0, disc, false, null)
  on conflict (committee_id, kind, id) do update set data = excluded.data, deleted = false, client_id = null;
  perform set_config('gsa.commentaires', '', true);
  -- La tâche relue par ceux qui la voient (rien n'y change) : la personne ajoutée la reçoit sans recharger l'appli.
  update public.gsa_items i set client_id = null where i.committee_id = unite and i.kind = 'tasks' and i.id = tache;

  -- La personne ajoutée (par quelqu'un d'autre) est prévenue ; en tête de la liste des notifications.
  if not retirer and fiche <> moi then
    insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
    select unite, 'notifications', x.nid,
      coalesce((select min(n.pos) from public.gsa_items n where n.committee_id = unite and n.kind = 'notifications'), 0) - 1,
      jsonb_build_object('id', x.nid, 'userId', fiche, 'type', 'discussion', 'taskId', tache, 'by', moi, 'at', quand,
        'titre', coalesce(d ->> 'titre', '')),
      false, null
    from (select 'n' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) as nid) x;
  end if;
  return disc;
end $$;
revoke all on function public.gsa_discussion_ajouter(uuid, text, text, boolean) from public, anon;
grant execute on function public.gsa_discussion_ajouter(uuid, text, text, boolean) to authenticated;
