-- Tâches GSA — 049 : discussion sur une tâche (commentaires).
--
-- Chaque tâche a son fil de discussion, dans data.commentaires (du plus ancien au plus récent) :
--   { "id": "c…", "par": "<fiche>", "u": "<entité de l'auteur, si ce n'est pas celle de la tâche>", "nom": "<nom affiché>",
--     "le": "<date ISO>", "texte": "…", "modifieLe": "<date ISO, s'il a été corrigé>" }
-- Le nom est celui du moment (l'auteur peut être d'une autre entité, sans fiche dans celle de la tâche).
--
-- • gsa_commenter(unite, tache, depuis, texte, cle, supprimer) : depuis l'entité ouverte `depuis`, sur la tâche `tache` de
--   l'entité `unite` (la même, ou une autre entité du club : tâche partagée avec `depuis` ou reçue pour info).
--     - sans `cle` : ajoute le commentaire `texte` (1 à 2000 caractères, 200 commentaires au plus par tâche) ;
--     - avec `cle` : corrige son propre commentaire (nouveau `texte`), ou le retire (`supprimer`) ; un admin de l'entité de
--       la tâche peut retirer n'importe quel commentaire.
--   Contrôles : fiche dans `depuis`, même club, entité de la tâche pas archivée (sauf depuis elle-même), la personne lit la
--   tâche (mêmes règles que l'appli : gsa_tache_lisible ; tâche partagée : gsa_tache_dans + gsa_partagee_lisible ; pour
--   info : sa personne ou son entité mentionnée). Pas de discussion sur les tickets de paiement. La ligne est verrouillée et
--   seuls les commentaires changent (ni la date de modification, ni le reste de la tâche). Renvoie la tâche.
--   Nouveau commentaire : une notification (cloche 🔔, type « comment ») pour les personnes concernées, sauf l'auteur, dans
--   leur propre entité : responsables, auteur de la tâche et ceux qui ont déjà commenté (entité de la tâche) ; personnes
--   d'autres entités choisies comme responsables (respPartage) ou qui ont déjà commenté. Fiches actives seulement.
-- • Garde gsa_items_commentaires_garde : seul gsa_commenter écrit les commentaires. Une tâche enregistrée par l'appli garde
--   ceux du serveur (un enregistrement fait avec une copie plus ancienne ne les efface pas, et personne ne peut en
--   inventer) ; s'ils diffèrent de ce que l'appli a envoyé, la ligne est marquée comme écrite par le serveur (client_id
--   vide), pour que l'appli la relise. Une tâche nouvelle (copie, occurrence suivante, duplication) part sans commentaires.
-- Ajout pur : une fonction et une garde nouvelles ; aucune donnée modifiée.
-- Pour revenir en arrière : supprimer le déclencheur gsa_items_commentaires_garde, puis les fonctions
-- gsa_items_commentaires_garde et gsa_commenter (les commentaires déjà enregistrés restent dans les tâches, sans effet).

create or replace function public.gsa_items_commentaires_garde() returns trigger
language plpgsql set search_path = '' as $$
declare
  envoye jsonb;
begin
  if new.kind is distinct from 'tasks' or jsonb_typeof(new.data) is distinct from 'object'
     or current_setting('gsa.commentaires', true) = 'oui' then
    return new;
  end if;
  envoye := new.data -> 'commentaires';
  new.data := new.data - 'commentaires';
  if tg_op = 'UPDATE' and jsonb_typeof(old.data) = 'object' and jsonb_typeof(old.data -> 'commentaires') = 'array' then
    new.data := new.data || jsonb_build_object('commentaires', old.data -> 'commentaires');
  end if;
  if (new.data -> 'commentaires') is distinct from envoye then
    new.client_id := null;
  end if;
  return new;
end $$;

drop trigger if exists gsa_items_commentaires_garde on public.gsa_items;
create trigger gsa_items_commentaires_garde before insert or update on public.gsa_items
  for each row execute function public.gsa_items_commentaires_garde();

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
    if not (c ->> 'par' = moi and coalesce(c ->> 'u', unite::text) = depuis::text)
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
      ) x
      offset 0
    ) z;
  end if;
  return d;
end $$;

revoke all on function public.gsa_commenter(uuid, text, uuid, text, text, boolean) from public, anon;
grant execute on function public.gsa_commenter(uuid, text, uuid, text, text, boolean) to authenticated;
