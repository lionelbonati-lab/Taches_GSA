-- Tâches GSA — 030 : dépendances (étape 3) — changement de dépendance, caisse du comité, fin des « membres liés ».
--
-- • Changement de « Dépend de » : rien n'est déplacé ni copié. Le serveur note la période qui se termine dans la fiche
--   de l'entité (committees.info.historiqueDependance, tenu ici seulement) : le comité d'alors, la date, le réglage
--   des tâches d'alors et la liste des tâches de l'entité à ce moment (hors tickets) : ses « anciennes tâches ».
--     – l'ancien comité garde les tâches de sa période, comme avant (selon le réglage d'alors) ;
--     – le nouveau comité reçoit un droit de lecture et de copie sur les anciennes tâches (gsa_anciennes_taches) :
--       consultation, sans modification ni suppression ; la copie est une tâche à lui, indépendante (faite par l'appli,
--       avec la mention « copiée depuis le comité X, le … ») ;
--     – ce droit dure tant que l'entité dépend de ce comité ; ses admins (ou ceux du comité central) peuvent le retirer
--       (et le rendre) : seul le champ « copie » de la dernière période se change de l'extérieur ;
--     – ordres du jour, PV et tickets ne sont pas concernés : ils restent où ils sont ;
--     – revenir au comité d'avant dans l'heure (« Annuler ») efface le changement au lieu d'ajouter une période.
-- • Tickets (remboursements, factures) envoyés depuis une entité : à la caisse du comité dont elle dépend, s'il a un
--   caissier ; sinon à la caisse centrale, comme avant (gsa_ticket_central, même signature ; gsa_caisse_de).
-- • Anciennes liaisons « tous les membres d'une entité parmi les membres d'une autre » (020) : remplacées par les
--   dépendances. Une entité qui comptait tous les membres du comité dont elle dépend affiche désormais toutes ses tâches
--   à ce comité (réglage « Afficher les tâches ») ; le lien est retiré (fiches liées désactivées par 020, leurs tâches
--   restent) et n'est plus accepté.
-- Le reste ne change pas (027 : réglage des tâches ; 029 : droits de lecture).

-- Le comité dont dépendrait `entite` avec le choix `choix` (comme gsa_dependance, 027).
create or replace function public.gsa_dependance_choisie(entite uuid, choix text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.committees;
  x public.committees;
  club uuid;
  choisi uuid;
  suivant text := choix;
  vus uuid[] := '{}';
begin
  select * into e from public.committees c where c.id = entite;
  if e.id is null or e.parent_id is null then
    return null;
  end if;
  club := e.parent_id;
  loop
    select * into x from public.committees c
    where c.id::text = suivant and c.parent_id = club and not coalesce((c.info ->> 'archive')::boolean, false);
    exit when x.id is null;
    if x.id = entite then
      return club;
    end if;
    exit when x.id = any(vus);
    vus := vus || x.id;
    if choisi is null and x.type = 'sous-comite' then
      choisi := x.id;
    end if;
    suivant := x.info ->> 'dependDe';
  end loop;
  return coalesce(choisi, club);
end $$;

create or replace function public.gsa_dependance(entite uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select public.gsa_dependance_choisie(c.id, c.info ->> 'dependDe') from public.committees c where c.id = entite
$$;

-- Ce que l'entité `unite` voit de la tâche `t` (identifiant `tid`) d'une autre entité du club :
--   'modifiable' : dans ses tâches, son ordre du jour et son PV, modifiable comme une tâche partagée ;
--   'ancienne'   : ancienne tâche, en lecture et copie seulement (nouveau comité après un changement de dépendance) ;
--   null         : rien.
-- `h` : historiqueDependance de l'entité de la tâche ; `depend` : elle dépend de `unite` ; `reglage` : gsa_reglage_taches ;
-- `club` : le comité central (pour l'ancienne case « Transmettre au comité central »).
create or replace function public.gsa_tache_dans(h jsonb, depend boolean, reglage text, club uuid, tid text, t jsonb, unite uuid) returns text
language plpgsql immutable set search_path = '' as $$
declare
  n int := case when jsonb_typeof(h) = 'array' then jsonb_array_length(h) else 0 end;
  partagee boolean := coalesce(
    (jsonb_typeof(t -> 'partage') = 'array' and t -> 'partage' ? unite::text)
    or (coalesce((t ->> 'auCentral')::boolean, false) and unite = club), false);
  e jsonb;
  r text;
  k int;
begin
  if t ? 'paiement' then
    return null;
  end if;
  -- Tâche de la période où l'entité dépendait de `unite` : elle y reste, selon le réglage d'alors.
  for k in reverse n - 1 .. 0 loop
    e := h -> k;
    if e ->> 'comite' = unite::text and jsonb_typeof(e -> 'taches') = 'array' and e -> 'taches' ? tid
       and not (k > 0 and jsonb_typeof(h -> (k - 1) -> 'taches') = 'array' and h -> (k - 1) -> 'taches' ? tid) then
      r := coalesce(e ->> 'reglage', 'partagees');
      return case when r = 'toutes' or (r = 'partagees' and partagee) then 'modifiable' end;
    end if;
  end loop;
  if depend then
    -- Ancienne tâche (d'avant le dernier changement de dépendance) : lecture et copie, sauf droit retiré.
    if n > 0 and jsonb_typeof(h -> (n - 1) -> 'taches') = 'array' and h -> (n - 1) -> 'taches' ? tid then
      if partagee and reglage <> 'rien' then
        return 'modifiable';
      end if;
      return case when coalesce((h -> (n - 1) ->> 'copie')::boolean, true) then 'ancienne' end;
    end if;
    return case when reglage = 'toutes' or (reglage = 'partagees' and partagee) then 'modifiable' end;
  end if;
  return case when partagee then 'modifiable' end;
end $$;

-- Tâches des autres entités du club affichées dans l'entité `unite` (029, avec la règle ci-dessus).
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
    with sources as (
      select c.id, c.name, c.type, c.parent_id, c.info -> 'historiqueDependance' as h,
             coalesce(public.gsa_dependance(c.id) = unite, false) as depend,
             public.gsa_reglage_taches(c.id) as reglage
      from public.committees c
      where (c.id = club or c.parent_id = club) and c.id <> unite
        and not coalesce((c.info ->> 'archive')::boolean, false)
    )
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
    from sources c
    join public.gsa_items t on t.committee_id = c.id and t.kind = 'tasks' and not t.deleted
    where public.gsa_tache_dans(c.h, c.depend, c.reglage, c.parent_id, t.id, t.data, unite) = 'modifiable'
      and public.gsa_partagee_lisible(unite, c.id, t.data)
  );
end $$;

-- Anciennes tâches des entités qui dépendent de `unite` depuis leur dernier changement de dépendance : lecture et copie.
-- Comme les tâches partagées (029) : pour les admins et « Voir toutes les tâches », sinon celles dont on est responsable.
create or replace function public.gsa_anciennes_taches(unite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  club uuid;
begin
  if not public.gsa_is_member(unite) then
    return '[]'::jsonb;
  end if;
  select coalesce(x.parent_id, x.id) into club from public.committees x where x.id = unite;
  return (
    with sources as (
      select c.id, c.name, c.type, c.parent_id, c.info -> 'historiqueDependance' as h,
             c.info -> 'historiqueDependance' -> (jsonb_array_length(c.info -> 'historiqueDependance') - 1) as dernier,
             public.gsa_reglage_taches(c.id) as reglage
      from public.committees c
      where c.parent_id = club and c.id <> unite
        and not coalesce((c.info ->> 'archive')::boolean, false)
        and jsonb_typeof(c.info -> 'historiqueDependance') = 'array'
        and jsonb_array_length(c.info -> 'historiqueDependance') > 0
        and public.gsa_dependance(c.id) = unite
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'uniteId', c.id,
      'unite', c.name,
      'type', c.type,
      'ancienne', jsonb_build_object('comite', coalesce(c.dernier ->> 'nom', ''), 'jusqua', coalesce(c.dernier ->> 'jusqua', '')),
      'task', (t.data - 'documents') || jsonb_build_object('pieces', case when jsonb_typeof(t.data -> 'documents') = 'array'
        then jsonb_array_length(t.data -> 'documents') else 0 end),
      'statuts', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id,
          'label', coalesce(s.data ->> 'label', ''),
          'done', coalesce((s.data ->> 'done')::boolean, false)
        ) order by s.pos), '[]'::jsonb)
        from public.gsa_items s
        where s.committee_id = c.id and s.kind = 'statuses' and not s.deleted
      )
    ) order by c.name, t.pos), '[]'::jsonb)
    from sources c
    join public.gsa_items t on t.committee_id = c.id and t.kind = 'tasks' and not t.deleted
    where public.gsa_tache_dans(c.h, true, c.reglage, c.parent_id, t.id, t.data, unite) = 'ancienne'
      and public.gsa_partagee_lisible(unite, c.id, t.data)
  );
end $$;

-- 029, avec la règle ci-dessus : une ancienne tâche ne se modifie pas.
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
  if old is not null and public.gsa_tache_dans(src.info -> 'historiqueDependance', coalesce(public.gsa_dependance(src.id) = unite, false),
       public.gsa_reglage_taches(src.id), src.parent_id, tache, old, unite) = 'ancienne' then
    raise exception 'Ancienne tâche de « % » : elle se consulte et se copie, sans modification', src.name using errcode = '42501';
  end if;
  if old is null or public.gsa_tache_dans(src.info -> 'historiqueDependance', coalesce(public.gsa_dependance(src.id) = unite, false),
       public.gsa_reglage_taches(src.id), src.parent_id, tache, old, unite) is distinct from 'modifiable' then
    raise exception 'Cette tâche n’est plus partagée avec cette entité' using errcode = '42501';
  end if;
  if not public.gsa_partagee_lisible(unite, source, old) then
    raise exception 'Cette tâche ne t’est pas attribuée' using errcode = '42501';
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

-- Garde des fiches d'entités (027), avec l'historique des dépendances, tenu ici quel que soit l'auteur (appli, fonction
-- gsa-acces, éditeur SQL) : une période qui se termine à chaque changement du comité dont l'entité dépend (sauf retour
-- au comité d'avant dans l'heure : le changement est effacé). De
-- l'extérieur, seul le droit de copie de la dernière période change (admins de l'entité ou du comité central : règle
-- d'accès gsa_committees_update).
create or replace function public.gsa_committees_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  h jsonb;
  hc jsonb;
  n int;
  avant uuid;
  apres uuid;
begin
  if coalesce(new.info ->> 'central', 'aucun') not in ('aucun', 'lecture', 'ecriture') then
    raise exception 'Accès du comité central inconnu : %', new.info ->> 'central' using errcode = '22023';
  end if;
  if coalesce(new.info ->> 'tachesDependance', 'partagees') not in ('toutes', 'partagees', 'rien') then
    raise exception 'Réglage des tâches inconnu : %', new.info ->> 'tachesDependance' using errcode = '22023';
  end if;
  if new.info ? 'logo' and (
       jsonb_typeof(new.info -> 'logo') <> 'string'
       or length(new.info ->> 'logo') > 200000
       or (new.info ->> 'logo') !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then
    raise exception 'Logo refusé : image PNG, JPEG ou WebP de 200 Ko au plus' using errcode = '22023';
  end if;
  if auth.uid() is not null then
    if (new.info -> 'central') is distinct from (old.info -> 'central') and not public.gsa_is_admin(old.id) then
      new.info = case when old.info ? 'central' then new.info || jsonb_build_object('central', old.info -> 'central') else new.info - 'central' end;
    end if;
    if not public.gsa_is_admin(old.parent_id) then
      if new.type is distinct from old.type
         or coalesce(new.info -> 'archive', 'false'::jsonb) is distinct from coalesce(old.info -> 'archive', 'false'::jsonb) then
        raise exception 'Seul le comité central change le type d’une entité ou l’archive' using errcode = '42501';
      end if;
      if nullif(new.info ->> 'dependDe', '') is distinct from nullif(old.info ->> 'dependDe', '') then
        new.info = case when old.info ? 'dependDe' then new.info || jsonb_build_object('dependDe', old.info -> 'dependDe') else new.info - 'dependDe' end;
      end if;
    end if;
  end if;

  h := case when jsonb_typeof(old.info -> 'historiqueDependance') = 'array' then old.info -> 'historiqueDependance' else '[]'::jsonb end;
  n := jsonb_array_length(h);
  hc := new.info -> 'historiqueDependance';
  -- (Même dernière période que celle enregistrée : une fiche relue avant un autre changement ne la touche pas.)
  if n > 0 and jsonb_typeof(hc) = 'array' and jsonb_array_length(hc) = n and jsonb_typeof(hc -> (n - 1) -> 'copie') = 'boolean'
     and hc -> (n - 1) ->> 'jusqua' is not distinct from h -> (n - 1) ->> 'jusqua' then
    h := jsonb_set(h, array[(n - 1)::text, 'copie'], hc -> (n - 1) -> 'copie');
  end if;
  if old.parent_id is not null and new.parent_id is not distinct from old.parent_id then
    avant := public.gsa_dependance(old.id);
    apres := public.gsa_dependance_choisie(new.id, new.info ->> 'dependDe');
    if avant is distinct from apres and avant is not null and jsonb_array_length(h) > 0
       and h -> -1 ->> 'comite' = apres::text and (h -> -1 ->> 'jusqua')::timestamptz > now() - interval '1 hour' then
      -- Retour au comité d'avant dans l'heure (« Annuler ») : le changement est effacé, pas de nouvelle période.
      h := h - (jsonb_array_length(h) - 1);
    elsif avant is distinct from apres and avant is not null then
      h := h || jsonb_build_array(jsonb_build_object(
        'comite', avant,
        'nom', (select c.name from public.committees c where c.id = avant),
        'jusqua', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'reglage', public.gsa_reglage_taches(old.id),
        'taches', (
          select coalesce(jsonb_agg(t.id order by t.pos, t.id), '[]'::jsonb)
          from public.gsa_items t
          where t.committee_id = old.id and t.kind = 'tasks' and not t.deleted and not (t.data ? 'paiement')),
        'copie', true));
      -- Les 20 dernières périodes.
      if jsonb_array_length(h) > 20 then
        h := (select jsonb_agg(x.v order by x.n) from jsonb_array_elements(h) with ordinality x(v, n) where x.n > jsonb_array_length(h) - 20);
      end if;
    end if;
  end if;
  new.info = case when jsonb_array_length(h) = 0 then new.info - 'historiqueDependance'
                  else new.info || jsonb_build_object('historiqueDependance', h) end;
  return new;
end $$;

-- Caissiers d'une entité : fiches actives d'un rôle qui donne expressément le droit « Caisse » (hors admin).
create or replace function public.gsa_caissiers(c uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_agg(p.id order by p.pos)
  from public.gsa_items p
  where p.committee_id = c and p.kind = 'people' and not p.deleted and coalesce((p.data ->> 'actif')::boolean, true)
    and exists (select 1 from public.gsa_items r
      where r.committee_id = c and r.kind = 'roles' and not r.deleted and (p.data -> 'roles') ? r.id
        and not coalesce((r.data ->> 'locked')::boolean, false) and (r.data -> 'permissions') ? 'paiements.payer')
$$;

-- Caisse qui reçoit les tickets de `entite` : celle du comité dont elle dépend, s'il a un caissier ; sinon la caisse
-- centrale (comme caisseDe dans l'appli).
create or replace function public.gsa_caisse_de(entite uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when x.dep is not null and x.dep <> x.club and public.gsa_caissiers(x.dep) is not null then x.dep else x.club end
  from (select public.gsa_dependance(c.id) as dep, coalesce(c.parent_id, c.id) as club from public.committees c where c.id = entite) x
$$;

-- Dépôt d'un justificatif (« <caisse>/tk-… ») : dans le dossier de la caisse qui reçoit les tickets de l'une de ses entités.
create or replace function public.gsa_depot_ticket(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when gsa_depot_ticket.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/tk-[A-Za-z0-9_-]{4,60}$'
      then exists (
        select 1 from public.gsa_members m
        where m.user_id = (select auth.uid())
          and public.gsa_caisse_de(m.committee_id) = split_part(gsa_depot_ticket.name, '/', 1)::uuid
          and public.gsa_is_member(m.committee_id))
    else false
  end
$$;

-- Envoi d'un ticket depuis une entité du club à la caisse qui reçoit ses tickets (015, la caisse en plus).
create or replace function public.gsa_ticket_central(source uuid, ticket jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  cible uuid;
  nom_caisse text;
  unite text;
  fiche jsonb;
  montant numeric;
  titre text := left(btrim(coalesce(ticket ->> 'titre', '')), 300);
  benef text := left(btrim(coalesce(ticket ->> 'beneficiaire', '')), 200);
  iban text := upper(regexp_replace(coalesce(ticket ->> 'iban', ''), '\s', '', 'g'));
  remarque text := left(coalesce(ticket ->> 'remarque', ''), 4000);
  facture boolean := coalesce(ticket ->> 'type', '') = 'facture';
  echeance text := case when coalesce(ticket ->> 'type', '') = 'facture' and coalesce(ticket ->> 'delai', '') ~ '^\d{4}-\d{2}-\d{2}$'
    then ticket ->> 'delai' else '' end;
  docs jsonb := '[]'::jsonb;
  d jsonb;
  caisse jsonb;
  sec text;
  statut text;
  le text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  tid text := 'tk' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  select c.name into unite from public.committees c where c.id = source and c.parent_id is not null;
  if unite is null then
    raise exception 'Seules les entités du club envoient des tickets à une autre caisse' using errcode = '22023';
  end if;
  if not public.gsa_is_member(source) then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  cible := public.gsa_caisse_de(source);
  select c.name into nom_caisse from public.committees c where c.id = cible;
  if public.gsa_is_member(cible) then
    raise exception 'Membre de « % » : envoie le ticket depuis « % »', nom_caisse, nom_caisse using errcode = '22023';
  end if;

  select p.data into fiche
  from public.gsa_members m
  join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
  where m.committee_id = source and m.user_id = (select auth.uid());

  begin
    montant := round((ticket ->> 'montant')::numeric, 2);
  exception when others then
    montant := null;
  end;
  if titre = '' or benef = '' or montant is null or montant <= 0 or montant > 1000000 then
    raise exception 'Demande incomplète : objet, montant et %', case when facture then 'à qui payer la facture' else 'personne à rembourser' end
      using errcode = '22023';
  end if;
  if echeance <> '' then
    begin
      perform echeance::date;
    exception when others then
      echeance := '';
    end;
  end if;
  if iban <> '' and iban !~ '^[A-Z]{2}[0-9A-Z]{10,32}$' then
    raise exception 'IBAN invalide' using errcode = '22023';
  end if;

  for d in select * from jsonb_array_elements(case when jsonb_typeof(ticket -> 'documents') = 'array' then ticket -> 'documents' else '[]'::jsonb end) loop
    if coalesce(d ->> 'id', '') !~ ('^' || cible::text || '/tk-[A-Za-z0-9_-]{4,60}$')
       or not exists (select 1 from storage.objects o
         where o.bucket_id = 'gsa-fichiers' and o.name = d ->> 'id' and o.owner_id = (select auth.uid())::text) then
      raise exception 'Justificatif introuvable : ajoute à nouveau la photo du ticket' using errcode = '22023';
    end if;
    docs := docs || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', d ->> 'id', 'nom', left(coalesce(nullif(btrim(d ->> 'nom'), ''), 'ticket'), 200), 'kind', 'fichier',
      'mime', left(d ->> 'mime', 100), 'taille', case when jsonb_typeof(d -> 'taille') = 'number' then d -> 'taille' end,
      'par', '', 'le', le)));
  end loop;
  if jsonb_array_length(docs) = 0 or jsonb_array_length(docs) > 10 then
    raise exception '%', case when facture then 'Ajoute la facture' else 'Ajoute la photo du ticket' end using errcode = '22023';
  end if;

  caisse := public.gsa_caissiers(cible);
  if caisse is null then
    raise exception 'La caisse de « % » n’a pas encore de caissier', nom_caisse using errcode = '22023';
  end if;

  select s.id into sec from public.gsa_items s
  where s.committee_id = cible and s.kind = 'sections' and not s.deleted
  order by (s.data ->> 'nom') ~* '(compta|financ|caisse|trésor|tresor)' desc, s.pos limit 1;
  select s.id into statut from public.gsa_items s
  where s.committee_id = cible and s.kind = 'statuses' and not s.deleted and not coalesce((s.data ->> 'done')::boolean, false)
  order by s.pos limit 1;

  perform set_config('gsa.ticket_externe', tid, true);
  insert into public.gsa_items (committee_id, kind, id, pos, data)
  select cible, 'tasks', tid, coalesce(min(i.pos), 0) - 1, jsonb_build_object(
    'id', tid, 'sectionId', coalesce(sec, ''), 'sousSection', case when facture then 'Paiements' else 'Remboursements' end, 'titre', titre, 'responsables', caisse,
    'statusId', coalesce(statut, ''), 'delai', echeance, 'remarque', remarque, 'checklist', '[]'::jsonb, 'documents', docs,
    'createdBy', '', 'updatedAt', le,
    'paiement', jsonb_strip_nulls(jsonb_build_object(
      'type', case when facture then 'facture' end,
      'montant', montant, 'beneficiaire', benef, 'iban', nullif(iban, ''), 'etat', 'recu', 'demandePar', '', 'demandeLe', le,
      'externe', jsonb_build_object(
        'uniteId', source, 'unite', unite,
        'par', coalesce(nullif(btrim(coalesce(fiche ->> 'prenom', '') || ' ' || coalesce(fiche ->> 'nom', '')), ''), 'Membre'),
        'email', lower(btrim(coalesce(fiche ->> 'email', ''))),
        'userId', (select auth.uid())::text))))
  from public.gsa_items i where i.committee_id = cible and i.kind = 'tasks';
  perform set_config('gsa.ticket_externe', '', true);

  insert into public.gsa_items (committee_id, kind, id, pos, data)
  select cible, 'log', 'l' || tid, coalesce(min(i.pos), 0) - 1, jsonb_build_object(
    'id', 'l' || tid, 'at', le, 'userId', '',
    'action', format('%s demandé par « %s » (%s) : « %s » (%s CHF)', case when facture then 'Paiement de facture' else 'Remboursement' end, unite,
      coalesce(nullif(btrim(coalesce(fiche ->> 'prenom', '') || ' ' || coalesce(fiche ->> 'nom', '')), ''), 'Membre'), titre, montant))
  from public.gsa_items i where i.committee_id = cible and i.kind = 'log';

  return tid;
end $$;

-- Garde des liens (020) : plus de nouveau lien « tous les membres d'une entité » (remplacé par les dépendances) ; le
-- retrait reste possible (les fiches liées sont alors désactivées par 020).
create or replace function public.gsa_items_liens_garde() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'people' and not new.deleted and new.data ? 'viaEntite' and coalesce((new.data -> 'roles') @> '["admin"]'::jsonb, false) then
    raise exception 'Une personne membre par le lien d’une autre entité n’en est pas admin : ajoute-la elle-même' using errcode = '42501';
  end if;
  -- (Comparé à la ligne enregistrée : un upsert passe d'abord par l'insertion.)
  if new.kind = 'meta' and new.id = 'membresDe' and not new.deleted and jsonb_typeof(new.data) = 'array' and exists (
       select 1 from jsonb_array_elements(new.data) l
       where not exists (
         select 1 from public.gsa_items i
         where i.committee_id = new.committee_id and i.kind = 'meta' and i.id = 'membresDe' and not i.deleted
           and jsonb_typeof(i.data) = 'array' and i.data @> jsonb_build_array(l))) then
    raise exception 'Les membres liés sont remplacés par les dépendances : l’entité dépend d’un comité, qui affiche ses tâches (réglage dans sa fiche)'
      using errcode = '42501';
  end if;
  if new.kind = 'meta' and new.id = 'membresDe' and auth.uid() is not null and not public.gsa_is_admin(new.committee_id) then
    if (tg_op = 'INSERT' and not exists (select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = new.kind and i.id = new.id))
       or (tg_op = 'UPDATE' and (new.data is distinct from old.data or new.deleted is distinct from old.deleted)) then
      raise exception 'Seul un admin de l’entité y ajoute ou retire toute une entité' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Migration des liens existants : l'entité qui comptait tous les membres du comité dont elle dépend affiche toutes ses
-- tâches à ce comité ; tous les liens sont retirés (fiches liées désactivées par 020, leurs tâches restent).
do $$
declare
  r record;
  dep uuid;
begin
  for r in
    select i.committee_id as b, i.data
    from public.gsa_items i
    where i.kind = 'meta' and i.id = 'membresDe' and not i.deleted and jsonb_typeof(i.data) = 'array' and jsonb_array_length(i.data) > 0
  loop
    dep := public.gsa_dependance(r.b);
    if dep is not null and r.data @> jsonb_build_array(jsonb_build_object('uniteId', dep::text)) then
      update public.committees c set info = c.info || '{"tachesDependance": "toutes"}'::jsonb
      where c.id = r.b and coalesce(c.info ->> 'tachesDependance', 'partagees') <> 'toutes';
    end if;
    update public.gsa_items i set data = '[]'::jsonb, client_id = null
    where i.committee_id = r.b and i.kind = 'meta' and i.id = 'membresDe';
    raise notice 'Membres liés retirés de % (comité dont elle dépend : %)', (select c.name from public.committees c where c.id = r.b),
      (select c.name from public.committees c where c.id = dep);
  end loop;
end $$;

revoke all on function public.gsa_dependance_choisie(uuid, text) from public, anon, authenticated;
revoke all on function public.gsa_dependance(uuid) from public, anon, authenticated;
revoke all on function public.gsa_tache_dans(jsonb, boolean, text, uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.gsa_caissiers(uuid) from public, anon, authenticated;
revoke all on function public.gsa_caisse_de(uuid) from public, anon, authenticated;
grant execute on function public.gsa_taches_partagees(uuid) to authenticated;
grant execute on function public.gsa_anciennes_taches(uuid) to authenticated;
grant execute on function public.gsa_modifier_tache_partagee(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.gsa_depot_ticket(text) to authenticated;
grant execute on function public.gsa_ticket_central(uuid, jsonb) to authenticated;
