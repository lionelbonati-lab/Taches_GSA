-- 066 : une discussion par étiquette (événement, groupe, comité), pour parler de la manifestation ou du groupe en entier.
--
-- 1. Sa ligne : « discussions », identifiant « et:<étiquette> », data = { "etiquette": "<id>", "commentaires": [ … ] },
--    écrite par le serveur seulement (gsa_etiquette_commenter ; une ligne envoyée par l'appli est ignorée, 062).
-- 2. Qui la lit et y écrit : les membres de l'étiquette (et eux seuls, ni les admins ni « Voir tous les points »), comme
--    la discussion d'un point étiqueté (062). Une étiquette retirée : plus personne.
-- 3. Nouveau message : chaque autre membre (fiche active) reçoit une notification 💬 (type « comment », taskId
--    « et:<étiquette> », titre : le nom de l'étiquette), lue seulement par lui, l'auteur et les membres ; elle part aussi
--    sur les téléphones (gsa-push, 064), comme celle d'un point.
-- 4. Membres changés (064) : la discussion de l'étiquette est aussi renvoyée (un nouveau membre la reçoit en direct).
--
-- Ajout : deux fonctions nouvelles ; gsa_ligne_lisible (062) et gsa_etiquette_renvoyer (064) complétées. Aucune donnée
-- modifiée.
-- Retour en arrière : relancer gsa_ligne_lisible de 062 et gsa_etiquette_renvoyer de 064, puis
--   drop function public.gsa_etiquette_commenter(uuid, text, text, text, boolean);
--   drop function public.gsa_etiquette_lisible(uuid, text, text);
-- (les lignes « discussions » des étiquettes restent, illisibles : `delete … where kind = 'discussions' and id like 'et:%'`).

-- La fiche `fiche` est membre de l'étiquette (existante) `etiquette` de l'espace `c`.
create or replace function public.gsa_etiquette_lisible(c uuid, etiquette text, fiche text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(fiche, '') <> '' and exists (
    select 1 from public.gsa_items e
    where e.committee_id = c and e.kind = 'etiquettes' and e.id = etiquette and not e.deleted
      and jsonb_typeof(e.data -> 'membres') = 'array' and (e.data -> 'membres') ? fiche);
$$;
revoke all on function public.gsa_etiquette_lisible(uuid, text, text) from public, anon, authenticated;

-- Règle de lecture des lignes (062) : la discussion d'une étiquette et ses notifications, pour ses membres.
create or replace function public.gsa_ligne_lisible(c uuid, k text, d jsonb, ecrit boolean)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  moi text;
begin
  if not public.gsa_is_member(c) then
    return false;
  end if;
  if k = 'discussions' then
    if d ? 'etiquette' then
      return public.gsa_etiquette_lisible(c, d ->> 'etiquette', public.gsa_ma_fiche(c));
    end if;
    return public.gsa_discussion_lisible(c, d ->> 'tache');
  end if;
  -- Notification d'un message (💬, 📣 d'avant) : elle en cite le début ; pour les autres que son destinataire et son
  -- auteur, admin compris, seulement si l'on peut lire la discussion (d'un point, ou d'une étiquette : « et:<id> »).
  if k = 'notifications' and d ->> 'type' in ('comment', 'mention') and not coalesce(ecrit, false) then
    moi := public.gsa_ma_fiche(c);
    return coalesce(d ->> 'userId' = moi or d ->> 'by' = moi, false)
      or case when coalesce(d ->> 'taskId', '') like 'et:%'
              then public.gsa_etiquette_lisible(c, substr(d ->> 'taskId', 4), moi)
              else public.gsa_discussion_lisible(c, d ->> 'taskId') end;
  end if;
  if k not in ('tasks', 'emails', 'notifications', 'log') or coalesce(ecrit, false) or public.gsa_is_admin(c) then
    return true;
  end if;
  moi := public.gsa_ma_fiche(c);
  return coalesce(case k
    when 'tasks' then public.gsa_tache_lisible(c, d)
    when 'emails' then d ->> 'creePar' = moi or exists (
      select 1 from public.gsa_items t
      where t.committee_id = c and t.kind = 'tasks' and t.id = d ->> 'taskId' and public.gsa_tache_lisible(c, t.data))
    when 'notifications' then d ->> 'userId' = moi or d ->> 'by' = moi
    when 'log' then d ->> 'userId' = moi or public.gsa_a_droit(c, 'admin.access')
  end, false);
end $$;

-- Discussion de l'étiquette `etiquette` de l'espace `unite` : ajoute un message (sans `cle`), corrige le sien ou le
-- retire (`cle`) ; un admin membre peut retirer n'importe quel message. Renvoie { "commentaires": [ … ] }.
create or replace function public.gsa_etiquette_commenter(unite uuid, etiquette text, texte text default null, cle text default null,
  supprimer boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi text := public.gsa_ma_fiche(unite);
  e jsonb;
  ligne constant text := 'et:' || coalesce(etiquette, '');
  liste jsonb;
  c jsonb;
  idx int;
  nom text;
  mot text := btrim(coalesce(texte, ''));
  quand text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if moi is null then
    raise exception 'Réservé aux membres du club' using errcode = '42501';
  end if;
  -- L'étiquette verrouillée : un message à la fois par discussion.
  select i.data into e
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'etiquettes' and i.id = etiquette and not i.deleted
  for update;
  if jsonb_typeof(e) is distinct from 'object' then
    raise exception 'Étiquette introuvable' using errcode = 'P0002';
  end if;
  if not (jsonb_typeof(e -> 'membres') = 'array' and (e -> 'membres') ? moi) then
    raise exception 'Discussion réservée aux membres de l’étiquette' using errcode = '42501';
  end if;

  select i.data -> 'commentaires' into liste
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'discussions' and i.id = ligne and not i.deleted;
  liste := case when jsonb_typeof(liste) = 'array' then liste else '[]'::jsonb end;
  if cle is null then
    if supprimer then
      raise exception 'Commentaire introuvable' using errcode = 'P0002';
    end if;
    if char_length(mot) = 0 or char_length(mot) > 2000 then
      raise exception 'Le commentaire doit faire entre 1 et 2000 caractères' using errcode = '22023';
    end if;
    -- Les 500 derniers messages sont gardés.
    if jsonb_array_length(liste) >= 500 then
      liste := liste - 0;
    end if;
    select nullif(btrim(coalesce(p.data ->> 'prenom', '') || ' ' || coalesce(p.data ->> 'nom', '')), '') into nom
    from public.gsa_items p
    where p.committee_id = unite and p.kind = 'people' and p.id = moi and not p.deleted;
    c := jsonb_build_object('id', 'c' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'par', moi,
           'nom', coalesce(nom, '?'), 'le', quand, 'texte', mot);
    liste := liste || jsonb_build_array(c);
  else
    select (x.i - 1)::int, x.v into idx, c
    from jsonb_array_elements(liste) with ordinality x(v, i)
    where x.v ->> 'id' = cle;
    if c is null then
      raise exception 'Commentaire introuvable' using errcode = 'P0002';
    end if;
    if c ->> 'par' is distinct from moi and not (supprimer and public.gsa_is_admin(unite)) then
      raise exception 'Ce commentaire n’est pas le tien' using errcode = '42501';
    end if;
    if supprimer then
      liste := liste - idx;
    else
      if char_length(mot) = 0 or char_length(mot) > 2000 then
        raise exception 'Le commentaire doit faire entre 1 et 2000 caractères' using errcode = '22023';
      end if;
      if c ->> 'texte' = mot then
        return jsonb_build_object('commentaires', liste);
      end if;
      liste := jsonb_set(liste, array[idx::text], c || jsonb_build_object('texte', mot, 'modifieLe', quand));
    end if;
  end if;

  perform set_config('gsa.commentaires', 'oui', true);
  insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
  values (unite, 'discussions', ligne, 0, jsonb_build_object('etiquette', etiquette, 'commentaires', liste), false, null)
  on conflict (committee_id, kind, id) do update set data = excluded.data, deleted = false, client_id = null;
  perform set_config('gsa.commentaires', '', true);

  -- Nouveau message : les autres membres (fiches actives) sont prévenus.
  if cle is null then
    insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
    select unite, 'notifications', z.nid, z.pos,
      jsonb_build_object('id', z.nid, 'userId', z.fiche, 'type', 'comment', 'taskId', ligne, 'by', moi, 'at', quand,
        'titre', coalesce(e ->> 'nom', ''), 'detail', case when char_length(mot) > 140 then left(mot, 139) || '…' else mot end),
      false, null
    from (
      select x.fiche, 'n' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) as nid,
        coalesce((select min(n.pos) from public.gsa_items n where n.committee_id = unite and n.kind = 'notifications'), 0) - 1 as pos
      from (
        select distinct m.v as fiche
        from jsonb_array_elements_text(e -> 'membres') m(v)
        join public.gsa_items p on p.committee_id = unite and p.kind = 'people' and p.id = m.v and not p.deleted
          and coalesce((p.data ->> 'actif')::boolean, true)
        where m.v <> moi
      ) x
      offset 0
    ) z;
  end if;
  return jsonb_build_object('commentaires', liste);
end $$;
revoke all on function public.gsa_etiquette_commenter(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.gsa_etiquette_commenter(uuid, text, text, text, boolean) to authenticated;

-- Membres d'une étiquette changés (064) : ses points, leurs discussions et la discussion de l'étiquette sont renvoyés.
create or replace function public.gsa_etiquette_renvoyer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  avant text := current_setting('gsa.commentaires', true);
begin
  if tg_op = 'UPDATE' and (new.data -> 'membres') is not distinct from (old.data -> 'membres') and new.deleted = old.deleted then
    return null;
  end if;
  update public.gsa_items t set client_id = null
  where t.committee_id = new.committee_id and t.kind = 'tasks' and not t.deleted
    and jsonb_typeof(t.data -> 'etiquettes') = 'array' and (t.data -> 'etiquettes') ? new.id;
  -- Les discussions (écrites par le serveur seulement, 062) : relues de même, celle de l'étiquette comprise (066).
  perform set_config('gsa.commentaires', 'oui', true);
  update public.gsa_items d set client_id = null
  where d.committee_id = new.committee_id and d.kind = 'discussions' and not d.deleted
    and (d.id = 'et:' || new.id
      or d.id in (select t.id from public.gsa_items t
                  where t.committee_id = new.committee_id and t.kind = 'tasks'
                    and jsonb_typeof(t.data -> 'etiquettes') = 'array' and (t.data -> 'etiquettes') ? new.id));
  perform set_config('gsa.commentaires', coalesce(avant, ''), true);
  return null;
end $$;
revoke all on function public.gsa_etiquette_renvoyer() from public, anon, authenticated;
