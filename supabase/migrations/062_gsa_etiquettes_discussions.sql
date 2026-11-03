-- 062 : étiquettes côté serveur, et discussion d'une tâche étiquetée réservée aux membres de ses étiquettes.
--
-- 1. Les membres d'une étiquette lisent les tâches qui la portent (comme l'appli et la démo depuis A1, permissions.ts
--    voitTache) : gsa_tache_lisible les compte, donc aussi les fichiers joints, emails et l'écriture de ces tâches.
--    Pas les tickets (remboursements, factures), qui gardent leurs propres règles.
-- 2. La discussion (049) sort de la tâche : une ligne « discussions » par tâche (même identifiant que la tâche),
--    data = { "tache": "<id>", "commentaires": [ … ] }, écrite par le serveur seulement (gsa_commenter).
--    Qui la lit (gsa_discussion_lisible) :
--      • tâche qui porte au moins une étiquette (existante) : les membres de l'une de ses étiquettes, et eux seuls
--        (ni les admins, ni « Voir toutes les tâches », ni les responsables qui n'en sont pas membres) ;
--      • sinon : qui lit la tâche (gsa_tache_lisible), comme avant.
--    gsa_commenter applique la même règle pour écrire, corriger ou retirer, et ne prévient (💬) que les personnes qui
--    peuvent lire la discussion (responsables, auteur, personnes qui y ont écrit, comme avant). Une notification de
--    message (qui en cite le début) ne se lit plus, en dehors de son destinataire et de son auteur, que par qui lit la
--    discussion (les admins lisaient toutes les notifications).
--    Garde : une ligne « discussions » envoyée par l'appli est ignorée (sans erreur : une appli d'avant cette mise à
--    jour, qui ne connaît pas ces lignes, croit qu'elles ont disparu et demande à les effacer) ; une tâche enregistrée
--    par l'appli ne garde plus de commentaires.
-- 3. Reprise : les commentaires des tâches passent dans leur ligne « discussions », puis sont retirés des tâches.
--    Rejouable (une discussion déjà reprise n'est pas écrasée).
--
-- Après cette migration, l'appli d'avant affiche les discussions vides (les messages ne sont pas perdus) : publier la
-- nouvelle appli en même temps.
-- Retour en arrière : remettre les commentaires dans les tâches (data.commentaires = data.commentaires de la ligne
-- « discussions » de même identifiant, avec set_config('gsa.commentaires', 'oui', true)), puis relancer les définitions
-- de gsa_tache_lisible (038), gsa_ligne_lisible (029), gsa_items_commentaires_garde (049) et gsa_commenter (053), et
-- supprimer gsa_dans_etiquette, gsa_tache_etiquetee et gsa_discussion_lisible.

-- ---------- Étiquettes ----------
-- La fiche `fiche` est membre d'une étiquette (existante) portée par la tâche `t` de l'espace `c`.
create or replace function public.gsa_dans_etiquette(c uuid, t jsonb, fiche text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(fiche, '') <> '' and jsonb_typeof(t -> 'etiquettes') = 'array' and exists (
    select 1
    from jsonb_array_elements_text(t -> 'etiquettes') x(id)
    join public.gsa_items e on e.committee_id = c and e.kind = 'etiquettes' and e.id = x.id and not e.deleted
    where jsonb_typeof(e.data -> 'membres') = 'array' and (e.data -> 'membres') ? fiche);
$$;
-- Pas ouverte aux comptes : elle dirait qui est membre de quelle étiquette (utilisée par les règles du serveur).
revoke all on function public.gsa_dans_etiquette(uuid, jsonb, text) from public, anon, authenticated;

-- La tâche `t` porte au moins une étiquette qui existe encore dans l'espace `c`.
create or replace function public.gsa_tache_etiquetee(c uuid, t jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select jsonb_typeof(t -> 'etiquettes') = 'array' and exists (
    select 1
    from jsonb_array_elements_text(t -> 'etiquettes') x(id)
    join public.gsa_items e on e.committee_id = c and e.kind = 'etiquettes' and e.id = x.id and not e.deleted);
$$;
revoke all on function public.gsa_tache_etiquetee(uuid, jsonb) from public, anon, authenticated;

-- Qui lit une tâche (038), plus les membres de ses étiquettes.
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
  if p is not null then
    return public.gsa_a_droit(c, 'paiements.payer');
  end if;
  return public.gsa_a_droit_section(c, 'tasks.viewAll', t ->> 'sectionId');
end $$;

-- ---------- Discussions ----------
-- La personne connectée lit la discussion de la tâche `tache` de l'espace `c`.
create or replace function public.gsa_discussion_lisible(c uuid, tache text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  t jsonb;
begin
  if tache is null or not public.gsa_is_member(c) then
    return false;
  end if;
  select i.data into t from public.gsa_items i where i.committee_id = c and i.kind = 'tasks' and i.id = tache;
  if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t -> 'paiement') = 'object' then
    return false;
  end if;
  if public.gsa_tache_etiquetee(c, t) then
    return public.gsa_dans_etiquette(c, t, public.gsa_ma_fiche(c));
  end if;
  return public.gsa_tache_lisible(c, t);
end $$;
revoke all on function public.gsa_discussion_lisible(uuid, text) from public, anon, authenticated;

-- Règle de lecture des lignes (029) : les discussions suivent leur propre règle, admin compris.
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
    return public.gsa_discussion_lisible(c, d ->> 'tache');
  end if;
  -- Notification d'un message (💬, 📣 d'avant) : elle en cite le début ; pour les autres que son destinataire et son
  -- auteur, admin compris, seulement si l'on peut lire la discussion.
  if k = 'notifications' and d ->> 'type' in ('comment', 'mention') and not coalesce(ecrit, false) then
    moi := public.gsa_ma_fiche(c);
    return coalesce(d ->> 'userId' = moi or d ->> 'by' = moi, false) or public.gsa_discussion_lisible(c, d ->> 'taskId');
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

-- Garde (049) : seul le serveur écrit les discussions ; les tâches ne gardent plus de commentaires.
create or replace function public.gsa_items_commentaires_garde() returns trigger
language plpgsql set search_path = '' as $$
declare
  envoye jsonb;
begin
  if current_setting('gsa.commentaires', true) = 'oui' then
    return new;
  end if;
  -- Ligne « discussions » envoyée par l'appli : ignorée, sans erreur (rien n'est écrit, rien n'est effacé).
  if new.kind = 'discussions' then
    return null;
  end if;
  if new.kind is distinct from 'tasks' or jsonb_typeof(new.data) is distinct from 'object' then
    return new;
  end if;
  envoye := new.data -> 'commentaires';
  if envoye is not null then
    new.data := new.data - 'commentaires';
    new.client_id := null; -- l'appli relit la tâche
  end if;
  return new;
end $$;

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
  -- Tâche étiquetée (062) : discussion réservée aux membres de ses étiquettes, depuis l'espace de la tâche.
  reservee := public.gsa_tache_etiquetee(unite, d);
  if reservee then
    if depuis <> unite or not public.gsa_dans_etiquette(unite, d, moi) then
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

  -- La discussion : sa ligne (062), sinon ce qui restait dans la tâche (avant la reprise).
  select i.data -> 'commentaires' into avant
  from public.gsa_items i
  where i.committee_id = unite and i.kind = 'discussions' and i.id = tache and not i.deleted;
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
  values (unite, 'discussions', tache, 0, jsonb_build_object('tache', tache, 'commentaires', liste), false, null)
  on conflict (committee_id, kind, id) do update set data = excluded.data, deleted = false, client_id = null;
  -- Ce qui restait dans la tâche (avant la reprise) en sort.
  if d ? 'commentaires' then
    update public.gsa_items i set data = i.data - 'commentaires', client_id = null
    where i.committee_id = unite and i.kind = 'tasks' and i.id = tache;
  end if;
  perform set_config('gsa.commentaires', '', true);

  -- Nouveau commentaire : les personnes concernées sont prévenues, chacune dans son entité ; discussion réservée :
  -- seulement celles qui la lisent (membres d'une étiquette de la tâche).
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
          -- Discussion réservée (062) : seulement les membres d'une étiquette de la tâche.
          and (not reservee or (y.entite = unite and public.gsa_dans_etiquette(unite, d, y.fiche)))
        order by coalesce(m.user_id::text, y.entite::text || ':' || y.fiche), (y.entite = unite) desc, (y.entite = depuis) desc, y.entite
      ) x
      offset 0
    ) z;
  end if;
  return (d - 'commentaires') || jsonb_build_object('commentaires', liste);
end $$;
revoke all on function public.gsa_commenter(uuid, text, uuid, text, text, boolean) from public, anon;
grant execute on function public.gsa_commenter(uuid, text, uuid, text, text, boolean) to authenticated;

-- ---------- Reprise : les commentaires des tâches dans leur ligne « discussions » ----------
do $$
declare
  n_discussions int;
  n_taches int;
begin
  perform set_config('gsa.commentaires', 'oui', true);
  insert into public.gsa_items (committee_id, kind, id, pos, data, deleted, client_id)
  select t.committee_id, 'discussions', t.id, 0, jsonb_build_object('tache', t.id, 'commentaires', t.data -> 'commentaires'), false, null
  from public.gsa_items t
  where t.kind = 'tasks' and jsonb_typeof(t.data) = 'object' and jsonb_typeof(t.data -> 'commentaires') = 'array'
    and jsonb_array_length(t.data -> 'commentaires') > 0
  on conflict (committee_id, kind, id) do nothing;
  get diagnostics n_discussions = row_count;
  update public.gsa_items t set data = t.data - 'commentaires', client_id = null
  where t.kind = 'tasks' and jsonb_typeof(t.data) = 'object' and t.data ? 'commentaires';
  get diagnostics n_taches = row_count;
  perform set_config('gsa.commentaires', '', true);
  raise notice 'Discussions reprises : %, tâches allégées : %', n_discussions, n_taches;
end $$;
