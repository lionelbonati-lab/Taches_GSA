-- 059 : reprise des entités dans l'espace du club (PLAN_APPLI_SIMPLE.md, étape D3 ; règles décidées le 03.11.2026).
--
-- À appliquer par le président, dans l'éditeur SQL de Supabase, APRÈS avoir relu le rapport
-- (outils/reprise/rapport_reprise.sql) et téléchargé une sauvegarde du club. Rien n'est effacé :
--   - chaque entité devient une étiquette du club (groupe → « groupe », sous-comité ou équipe → « événement », avec sa date) ;
--   - ses personnes sont reliées aux fiches du club (même fiche du registre, sinon même adresse, sinon même nom) ; une
--     personne active sans fiche au club en reçoit une (rôle « Membre ») ; une fiche inactive du club est réactivée ;
--     les comptes qui n'avaient accès qu'à des entités sont rattachés à leur fiche du club ;
--   - ses tâches et ses événements sont recopiés dans l'espace du club avec l'étiquette ; les tâches gardent leur
--     identifiant (celles déplacées autrefois depuis le club reprennent leur ancienne ligne, supprimée) ; un groupe range
--     ses tâches dans sa section du club, un événement dans une sous-section de « Événements » ; l'historique des
--     tâches est recopié ;
--   - les tâches du club attribuées à une entité, partagées avec elle ou confiées à l'un de ses responsables reçoivent
--     son étiquette (et ce responsable) ; un délai calé sur la date de l'entité est calé sur celle de l'étiquette ;
--   - les fichiers joints des tâches reprises restent dans le dossier de leur entité : une règle de lecture les ouvre
--     aux personnes du club qui voient la tâche ;
--   - l'entité est archivée (`info.archive`), avec le bilan de la reprise (`info.reprise`). Ses données restent.
-- Chaque ligne du club que la reprise modifie est d'abord recopiée dans `gsa_reprise_avant` (relecture, retour en
-- arrière). Une entité déjà reprise (`info.reprise`) est laissée : la migration peut être rejouée sans effet.

-- ---------- Copie des lignes modifiées ----------
create table if not exists public.gsa_reprise_avant (
  id bigint generated always as identity primary key,
  committee_id uuid not null,
  kind text not null,
  item_id text not null,
  deleted boolean not null,
  data jsonb,
  le timestamptz not null default now()
);
alter table public.gsa_reprise_avant enable row level security;
revoke all on table public.gsa_reprise_avant from public, anon, authenticated;

-- ---------- Clé de comparaison des noms (sans accents, ponctuation ni « de / la / … ») ----------
create or replace function public.gsa_reprise_cle(t text) returns text
language sql immutable set search_path = '' as $$
  select replace(regexp_replace(
           ' ' || regexp_replace(translate(lower(coalesce(t, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa'), '[^a-z0-9]+', ' ', 'g') || ' ',
           ' (de|du|des|la|le|les|d|l)(?= )', '', 'g'), ' ', '')
$$;

-- ---------- Fichiers des tâches reprises : lisibles depuis le club ----------
-- Fichier rangé dans le dossier d'une entité du club, joint (sous son chemin complet) à une tâche du club que la
-- personne connectée voit.
create or replace function public.gsa_fichier_repris(name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  dossier text := split_part(gsa_fichier_repris.name, '/', 1);
  club uuid;
begin
  if dossier !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  select c.parent_id into club from public.committees c where c.id = dossier::uuid and c.parent_id is not null;
  if club is null or not public.gsa_is_member(club) then
    return false;
  end if;
  return exists (
    select 1 from public.gsa_items t
    where t.committee_id = club and t.kind = 'tasks' and not t.deleted and jsonb_typeof(t.data -> 'documents') = 'array'
      and t.data -> 'documents' @> jsonb_build_array(jsonb_build_object('id', gsa_fichier_repris.name))
      and public.gsa_tache_lisible(club, t.data));
end $$;
revoke all on function public.gsa_fichier_repris(text) from public, anon;
grant execute on function public.gsa_fichier_repris(text) to authenticated;

drop policy if exists gsa_fichiers_repris_select on storage.objects;
create policy gsa_fichiers_repris_select on storage.objects for select to authenticated
  using (bucket_id = 'gsa-fichiers' and public.gsa_fichier_repris(name));

-- ---------- La reprise ----------
create or replace function public.gsa_reprise_entites(club uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e record;
  f record;
  t record;
  m record;
  bilan jsonb := '[]'::jsonb;
  etid text;
  fid text;
  d jsonb;
  nouveau jsonb;
  cible_section text;
  cible_sous text;
  sec record;
  evs text;
  n_taches int;
  n_evts int;
  n_fiches int;
  n_hist int;
  ouvert text;
  quand timestamptz := now();
  inf jsonb;
  champs_entites constant text[] := array['partage', 'respPartage', 'placePartage', 'auCentral', 'seanceComite',
    'evenementEntite', 'attribueePar', 'copieDe', 'source', 'parCentral', 'modifiePar', 'pieces', 'proposee', 'meetingId'];
begin
  if not exists (select 1 from public.committees c where c.id = club and c.parent_id is null) then
    raise exception 'Club introuvable : %', club;
  end if;
  -- Écrits par le serveur seulement d'habitude (049, 046) : recopiés tels quels.
  perform set_config('gsa.commentaires', 'oui', true);
  perform set_config('gsa.pour_info_vus', 'oui', true);

  create temp table if not exists reprise_ent (id uuid primary key, nom text, type text, archive boolean, etiquette text) on commit drop;
  create temp table if not exists reprise_fiche (eid uuid, pid text, fid text, primary key (eid, pid)) on commit drop;
  create temp table if not exists reprise_tache (eid uuid, tid text, nid text, primary key (eid, tid)) on commit drop;
  create temp table if not exists reprise_evt (eid uuid, vid text, nid text, primary key (eid, vid)) on commit drop;
  truncate reprise_ent, reprise_fiche, reprise_tache, reprise_evt;

  insert into reprise_ent
  select c.id, c.name, c.type, coalesce((c.info ->> 'archive')::boolean, false), 'et-' || c.id
  from public.committees c
  where c.parent_id = club and not (coalesce(c.info, '{}'::jsonb) ? 'reprise');
  if not exists (select 1 from reprise_ent) then
    return jsonb_build_object('entites', 0, 'message', 'Rien à reprendre : toutes les entités le sont déjà.');
  end if;

  -- 1. Rôle « Membre » (comme l'appli) : ses tâches, celles de ses étiquettes, l'agenda.
  insert into public.gsa_items (committee_id, kind, id, pos, data)
  select club, 'roles', 'membre', coalesce((select max(i.pos) + 1 from public.gsa_items i where i.committee_id = club and i.kind = 'roles'), 0),
         '{"id":"membre","label":"Membre","couleur":"#0f766e","permissions":["tasks.editOwn","tab.events"],"sections":[]}'::jsonb
  where not exists (select 1 from public.gsa_items i where i.committee_id = club and i.kind = 'roles' and i.id = 'membre' and not i.deleted)
  on conflict (committee_id, kind, id) do update set data = excluded.data, deleted = false;

  -- 2. Personnes : chaque fiche d'entité reliée à une fiche du club ; fiche créée ou réactivée au besoin.
  for f in
    select p.committee_id as eid, p.id as pid, p.data as d, coalesce((p.data ->> 'actif')::boolean, true) as actif,
           p.data ? 'viaEntite' as via, r.nom as ent
    from public.gsa_items p join reprise_ent r on r.id = p.committee_id
    where p.kind = 'people' and not p.deleted and jsonb_typeof(p.data) = 'object'
    order by (p.data ? 'viaEntite'), not coalesce((p.data ->> 'actif')::boolean, true), r.nom, p.pos, p.id
  loop
    select c.id into fid from public.gsa_items c
    where c.committee_id = club and c.kind = 'people' and not c.deleted and jsonb_typeof(c.data) = 'object'
      and ((coalesce(f.d ->> 'membreId', '') <> '' and c.data ->> 'membreId' = f.d ->> 'membreId'))
    order by c.pos, c.id limit 1;
    if fid is null then
      select c.id into fid from public.gsa_items c
      where c.committee_id = club and c.kind = 'people' and not c.deleted and jsonb_typeof(c.data) = 'object'
        and btrim(coalesce(f.d ->> 'email', '')) <> '' and lower(btrim(c.data ->> 'email')) = lower(btrim(f.d ->> 'email'))
      order by c.pos, c.id limit 1;
    end if;
    if fid is null then
      select c.id into fid from public.gsa_items c
      where c.committee_id = club and c.kind = 'people' and not c.deleted and jsonb_typeof(c.data) = 'object'
        and lower(btrim(coalesce(c.data ->> 'prenom', '') || ' ' || coalesce(c.data ->> 'nom', '')))
          = lower(btrim(coalesce(f.d ->> 'prenom', '') || ' ' || coalesce(f.d ->> 'nom', '')))
        and btrim(coalesce(f.d ->> 'prenom', '') || coalesce(f.d ->> 'nom', '')) <> ''
      order by c.pos, c.id limit 1;
    end if;
    if fid is null and f.actif and not f.via then
      -- Nouvelle fiche du club, rôle « Membre » ; son poste dans l'entité, avec le nom de l'entité.
      fid := 'p-' || f.pid;
      insert into public.gsa_items (committee_id, kind, id, pos, data)
      values (club, 'people', fid, coalesce((select max(i.pos) + 1 from public.gsa_items i where i.committee_id = club and i.kind = 'people'), 0),
        jsonb_strip_nulls(jsonb_build_object(
          'id', fid,
          'prenom', coalesce(f.d ->> 'prenom', ''),
          'nom', coalesce(f.d ->> 'nom', ''),
          'email', coalesce(f.d ->> 'email', ''),
          'telephone', coalesce(f.d ->> 'telephone', ''),
          'couleur', coalesce(f.d ->> 'couleur', '#64748b'),
          'poste', case when btrim(coalesce(f.d ->> 'poste', '')) <> '' then btrim(f.d ->> 'poste') || ' (' || f.ent || ')' else '' end,
          'roles', '["membre"]'::jsonb,
          'actif', true,
          'membreId', nullif(f.d ->> 'membreId', ''))))
      on conflict (committee_id, kind, id) do nothing;
    elsif fid is not null and f.actif and not f.via and exists (
        select 1 from public.gsa_items c where c.committee_id = club and c.kind = 'people' and c.id = fid
          and not coalesce((c.data ->> 'actif')::boolean, true)) then
      -- Fiche inactive du club, personne active dans l'entité : réactivée avec son rôle actuel.
      insert into public.gsa_reprise_avant (committee_id, kind, item_id, deleted, data)
      select c.committee_id, c.kind, c.id, c.deleted, c.data from public.gsa_items c where c.committee_id = club and c.kind = 'people' and c.id = fid;
      update public.gsa_items c set data = c.data || '{"actif": true}'::jsonb, client_id = null
      where c.committee_id = club and c.kind = 'people' and c.id = fid;
    end if;
    if fid is not null then
      insert into reprise_fiche values (f.eid, f.pid, fid) on conflict do nothing;
    end if;
  end loop;

  -- 3. Comptes : ceux qui n'avaient accès qu'à des entités ouvrent le club avec leur fiche.
  for m in
    select distinct on (x.user_id) x.user_id, rf.fid
    from public.gsa_members x
    join reprise_fiche rf on rf.eid = x.committee_id and rf.pid = x.person_id
    join public.gsa_items c on c.committee_id = club and c.kind = 'people' and c.id = rf.fid and not c.deleted
      and coalesce((c.data ->> 'actif')::boolean, true)
    where not exists (select 1 from public.gsa_members y where y.committee_id = club and y.user_id = x.user_id)
    order by x.user_id, x.created_at
  loop
    perform public.gsa_acces_place(club, m.fid, m.user_id);
  end loop;

  -- 4. Étiquettes : une par entité, avec ses membres (ses fiches actives).
  for e in select * from reprise_ent order by nom loop
    select coalesce(c.info, '{}'::jsonb) into inf from public.committees c where c.id = e.id;
    nouveau := jsonb_strip_nulls(jsonb_build_object(
      'id', e.etiquette,
      'nom', e.nom,
      'couleur', coalesce(nullif(inf ->> 'couleur', ''), '#0891b2'),
      'type', case when e.type = 'groupe' then 'groupe' else 'evenement' end,
      'date', case when e.type <> 'groupe' and coalesce(inf ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then inf ->> 'date' end,
      'dateFin', case when e.type <> 'groupe' and coalesce(inf ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
                       and coalesce(inf ->> 'dateFin', '') ~ '^\d{4}-\d{2}-\d{2}$' and (inf ->> 'dateFin') > (inf ->> 'date')
                      then inf ->> 'dateFin' end,
      'membres', (
        select coalesce(jsonb_agg(x.fid order by x.premier), '[]'::jsonb)
        from (select rf.fid, min(p.pos) as premier
              from reprise_fiche rf
              join public.gsa_items p on p.committee_id = rf.eid and p.kind = 'people' and p.id = rf.pid and not p.deleted
              join public.gsa_items c on c.committee_id = club and c.kind = 'people' and c.id = rf.fid and not c.deleted
              where rf.eid = e.id and coalesce((p.data ->> 'actif')::boolean, true) and not p.data ? 'viaEntite'
                and coalesce((c.data ->> 'actif')::boolean, true)
              group by rf.fid) x)));
    if exists (select 1 from public.gsa_items i where i.committee_id = club and i.kind = 'etiquettes' and i.id = e.etiquette and not i.deleted) then
      -- Déjà là (créée à la main) : ses membres s'ajoutent.
      insert into public.gsa_reprise_avant (committee_id, kind, item_id, deleted, data)
      select i.committee_id, i.kind, i.id, i.deleted, i.data from public.gsa_items i where i.committee_id = club and i.kind = 'etiquettes' and i.id = e.etiquette;
      update public.gsa_items i set data = i.data || jsonb_build_object('membres', (
          select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
          from (select jsonb_array_elements_text(coalesce(i.data -> 'membres', '[]')) v
                union select jsonb_array_elements_text(nouveau -> 'membres')) y)), client_id = null
      where i.committee_id = club and i.kind = 'etiquettes' and i.id = e.etiquette;
    else
      insert into public.gsa_items (committee_id, kind, id, pos, data)
      values (club, 'etiquettes', e.etiquette, coalesce((select max(i.pos) + 1 from public.gsa_items i where i.committee_id = club and i.kind = 'etiquettes'), 0), nouveau)
      on conflict (committee_id, kind, id) do update set data = excluded.data, deleted = false;
    end if;
  end loop;

  ouvert := coalesce(
    (select s.id from public.gsa_items s where s.committee_id = club and s.kind = 'statuses' and not s.deleted
       and not coalesce((s.data ->> 'done')::boolean, false) order by s.pos limit 1),
    (select s.id from public.gsa_items s where s.committee_id = club and s.kind = 'statuses' and not s.deleted order by s.pos limit 1));

  -- 5. Par entité : rangement, événements, tâches, historique.
  for e in select * from reprise_ent order by nom loop
    n_taches := 0; n_evts := 0; n_hist := 0;
    cible_section := null; cible_sous := '';

    if exists (select 1 from public.gsa_items i where i.committee_id = e.id and i.kind = 'tasks' and not i.deleted) then
      -- Section « Événements » du club, et l'une de ses sous-sections du même nom (ou de nom proche pour un événement).
      select s.id as id, s.data as data into sec from public.gsa_items s
      where s.committee_id = club and s.kind = 'sections' and not s.deleted and public.gsa_reprise_cle(s.data ->> 'nom') in ('evenements', 'evenement')
      order by s.pos limit 1;
      if sec.id is not null then
        select x into cible_sous from jsonb_array_elements_text(coalesce(sec.data -> 'sousSections', '[]')) x
        where public.gsa_reprise_cle(x) = public.gsa_reprise_cle(e.nom)
           or (e.type <> 'groupe' and length(public.gsa_reprise_cle(x)) >= 4 and length(public.gsa_reprise_cle(e.nom)) >= 4
               and (public.gsa_reprise_cle(x) like '%' || public.gsa_reprise_cle(e.nom) || '%' or public.gsa_reprise_cle(e.nom) like '%' || public.gsa_reprise_cle(x) || '%'))
        order by public.gsa_reprise_cle(x) = public.gsa_reprise_cle(e.nom) desc, length(x) limit 1;
        if cible_sous is not null then
          cible_section := sec.id;
        else
          cible_sous := '';
        end if;
      end if;
      if cible_section is null and e.type = 'groupe' then
        -- Un groupe : sa section (même nom, ou nom proche), sinon une nouvelle section à son nom.
        select s.id into cible_section from public.gsa_items s
        where s.committee_id = club and s.kind = 'sections' and not s.deleted
          and (public.gsa_reprise_cle(s.data ->> 'nom') = public.gsa_reprise_cle(e.nom)
               or (length(public.gsa_reprise_cle(e.nom)) >= 4 and length(public.gsa_reprise_cle(s.data ->> 'nom')) >= 4
                   and (public.gsa_reprise_cle(s.data ->> 'nom') like '%' || public.gsa_reprise_cle(e.nom) || '%'
                        or public.gsa_reprise_cle(e.nom) like '%' || public.gsa_reprise_cle(s.data ->> 'nom') || '%')))
        order by public.gsa_reprise_cle(s.data ->> 'nom') = public.gsa_reprise_cle(e.nom) desc, s.pos limit 1;
        if cible_section is null then
          cible_section := 'sec-' || left(md5(e.id::text), 10);
          insert into public.gsa_items (committee_id, kind, id, pos, data)
          values (club, 'sections', cible_section, coalesce((select max(i.pos) + 1 from public.gsa_items i where i.committee_id = club and i.kind = 'sections'), 0),
                  jsonb_build_object('id', cible_section, 'nom', e.nom, 'sousSections', '[]'::jsonb))
          on conflict (committee_id, kind, id) do update set deleted = false;
        end if;
        cible_sous := '';
      elsif cible_section is null then
        -- Un événement : une sous-section de « Événements » (section créée si le club n'en a pas).
        if sec.id is null then
          sec := null;
          insert into public.gsa_items (committee_id, kind, id, pos, data)
          values (club, 'sections', 'sec-evenements', coalesce((select max(i.pos) + 1 from public.gsa_items i where i.committee_id = club and i.kind = 'sections'), 0),
                  '{"id":"sec-evenements","nom":"Événements","sousSections":[]}'::jsonb)
          on conflict (committee_id, kind, id) do update set deleted = false;
          select s.id as id, s.data as data into sec from public.gsa_items s where s.committee_id = club and s.kind = 'sections' and s.id = 'sec-evenements';
        end if;
        cible_section := sec.id;
        cible_sous := e.nom;
        insert into public.gsa_reprise_avant (committee_id, kind, item_id, deleted, data)
        select s.committee_id, s.kind, s.id, s.deleted, s.data from public.gsa_items s where s.committee_id = club and s.kind = 'sections' and s.id = sec.id;
        update public.gsa_items s
        set data = jsonb_set(s.data, '{sousSections}', coalesce(s.data -> 'sousSections', '[]'::jsonb) || to_jsonb(e.nom)), client_id = null
        where s.committee_id = club and s.kind = 'sections' and s.id = sec.id;
      end if;
    end if;

    -- Événements de l'entité : copiés dans l'agenda du club (identifiant gardé s'il est libre).
    for t in select i.id, i.data from public.gsa_items i where i.committee_id = e.id and i.kind = 'events' and not i.deleted order by i.pos, i.id loop
      fid := case when exists (select 1 from public.gsa_items x where x.committee_id = club and x.kind = 'events' and x.id = t.id)
                  then 'e-' || left(md5(e.id::text || t.id), 10) else t.id end;
      insert into reprise_evt values (e.id, t.id, fid) on conflict do nothing;
    end loop;
    for t in select i.id, i.data, i.pos from public.gsa_items i where i.committee_id = e.id and i.kind = 'events' and not i.deleted loop
      select nid into fid from reprise_evt where eid = e.id and vid = t.id;
      d := t.data || jsonb_build_object('id', fid);
      if d ? 'serie' and jsonb_typeof(d -> 'serie') = 'object' then
        d := jsonb_set(d, '{serie,id}', to_jsonb(coalesce((select nid from reprise_evt where eid = e.id and vid = d -> 'serie' ->> 'id'), d -> 'serie' ->> 'id')));
      end if;
      if d ? 'repriseDe' then
        d := d || jsonb_build_object('repriseDe', coalesce((select nid from reprise_evt where eid = e.id and vid = d ->> 'repriseDe'), d ->> 'repriseDe'));
      end if;
      insert into public.gsa_items (committee_id, kind, id, pos, data)
      values (club, 'events', fid, coalesce((select max(i.pos) + 1 from public.gsa_items i where i.committee_id = club and i.kind = 'events'), 0), d)
      on conflict (committee_id, kind, id) do nothing;
      n_evts := n_evts + 1;
    end loop;

    -- Identifiants des tâches : gardés, sauf si une tâche vivante du club porte déjà le même.
    insert into reprise_tache
    select e.id, i.id,
           case when exists (select 1 from public.gsa_items x where x.committee_id = club and x.kind = 'tasks' and x.id = i.id and not x.deleted)
                then 't-' || left(md5(e.id::text || i.id), 10) else i.id end
    from public.gsa_items i where i.committee_id = e.id and i.kind = 'tasks' and not i.deleted
    on conflict do nothing;

    -- Historique : recopié d'abord (la tâche, recopiée ensuite, s'y ajoute comme « rétablie »).
    insert into public.gsa_historique (committee_id, tache_id, le, par, nom, quoi, champs)
    select club, rt.nid, h.le, h.par, h.nom, h.quoi, h.champs
    from public.gsa_historique h join reprise_tache rt on rt.eid = e.id and rt.tid = h.tache_id
    where h.committee_id = e.id
    order by h.id;
    get diagnostics n_hist = row_count;

    for t in select i.id, i.data from public.gsa_items i where i.committee_id = e.id and i.kind = 'tasks' and not i.deleted order by i.pos, i.id loop
      select nid into fid from reprise_tache where eid = e.id and tid = t.id;
      d := t.data;
      for etid in select unnest(champs_entites) loop
        d := d - etid;
      end loop;
      d := d || jsonb_build_object(
        'id', fid,
        'sectionId', coalesce(cible_section, d ->> 'sectionId'),
        'sousSection', coalesce(cible_sous, ''),
        'statusId', coalesce(
          (select s.id from public.gsa_items s where s.committee_id = club and s.kind = 'statuses' and not s.deleted and s.id = t.data ->> 'statusId'),
          (select s.id from public.gsa_items s
           join public.gsa_items o on o.committee_id = e.id and o.kind = 'statuses' and o.id = t.data ->> 'statusId'
           where s.committee_id = club and s.kind = 'statuses' and not s.deleted and lower(s.data ->> 'label') = lower(o.data ->> 'label') limit 1),
          ouvert),
        'responsables', (
          select coalesce(jsonb_agg(x.fid order by x.n), '[]'::jsonb)
          from (select distinct on (rf.fid) rf.fid, r.n
                from jsonb_array_elements_text(case when jsonb_typeof(t.data -> 'responsables') = 'array' then t.data -> 'responsables' else '[]'::jsonb end) with ordinality r(v, n)
                join reprise_fiche rf on rf.eid = e.id and rf.pid = r.v
                order by rf.fid, r.n) x),
        'createdBy', coalesce((select rf.fid from reprise_fiche rf where rf.eid = e.id and rf.pid = t.data ->> 'createdBy'), ''),
        'etiquettes', (
          select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
          from (select jsonb_array_elements_text(case when jsonb_typeof(t.data -> 'etiquettes') = 'array' then t.data -> 'etiquettes' else '[]'::jsonb end) v
                union select e.etiquette) y));
      -- Événement de l'entité : celui recopié ; séance de l'entité (non reprise) : le délai reste, sans lien.
      if d ? 'eventId' then
        if exists (select 1 from reprise_evt where eid = e.id and vid = d ->> 'eventId') then
          d := d || jsonb_build_object('eventId', (select nid from reprise_evt where eid = e.id and vid = d ->> 'eventId'));
        else
          d := d - 'eventId';
        end if;
      end if;
      if (d -> 'delaiRef' ->> 'type') = 'meeting' or ((d -> 'delaiRef' ->> 'type') = 'event' and not d ? 'eventId') then
        d := d - 'delaiRef';
      end if;
      -- Tâche principale, suivante : leurs identifiants dans le club.
      if d ? 'parentId' then
        d := d || jsonb_build_object('parentId', coalesce((select nid from reprise_tache where eid = e.id and tid = d ->> 'parentId'), d ->> 'parentId'));
      end if;
      if d ? 'suivanteId' then
        d := d || jsonb_build_object('suivanteId', coalesce((select nid from reprise_tache where eid = e.id and tid = d ->> 'suivanteId'), d ->> 'suivanteId'));
      end if;
      -- Messages : leur auteur, sa fiche du club.
      if jsonb_typeof(d -> 'commentaires') = 'array' then
        d := d || jsonb_build_object('commentaires', (
          select coalesce(jsonb_agg((c.v - 'u') || jsonb_build_object('par', coalesce(
                   (select rf.fid from reprise_fiche rf where rf.eid::text = coalesce(nullif(c.v ->> 'u', ''), e.id::text) and rf.pid = c.v ->> 'par'),
                   (select rf.fid from reprise_fiche rf where rf.eid = e.id and rf.pid = c.v ->> 'par'),
                   c.v ->> 'par')) order by c.n), '[]'::jsonb)
          from jsonb_array_elements(d -> 'commentaires') with ordinality c(v, n)));
      end if;
      -- Pour info : ses personnes, et celles des autres entités (« autres ») ; ses « ✓ Vu ».
      if jsonb_typeof(d -> 'pourInfo') = 'object' then
        d := d || jsonb_build_object('pourInfo', jsonb_build_object('personnes', (
          select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
            select rf.fid as x from jsonb_array_elements_text(case when jsonb_typeof(d -> 'pourInfo' -> 'personnes') = 'array' then d -> 'pourInfo' -> 'personnes' else '[]'::jsonb end) p
            join reprise_fiche rf on rf.eid = e.id and rf.pid = p
            union
            select coalesce(rf.fid, case when a.k = club::text then p end)
            from jsonb_each(case when jsonb_typeof(d -> 'pourInfo' -> 'autres') = 'object' then d -> 'pourInfo' -> 'autres' else '{}'::jsonb end) a(k, l)
            cross join lateral jsonb_array_elements_text(case when jsonb_typeof(a.l) = 'array' then a.l else '[]'::jsonb end) p
            left join reprise_fiche rf on rf.eid::text = a.k and rf.pid = p
          ) y where x is not null and not (d -> 'responsables') ? x)));
        if jsonb_array_length(d -> 'pourInfo' -> 'personnes') = 0 then
          d := d - 'pourInfo';
        end if;
      end if;
      if jsonb_typeof(d -> 'pourInfoVus') = 'object' then
        d := d || jsonb_build_object('pourInfoVus', (
          select coalesce(jsonb_object_agg('p:' || rf.fid, v.val), '{}'::jsonb)
          from jsonb_each(d -> 'pourInfoVus') v(k, val)
          join reprise_fiche rf on rf.eid = e.id and v.k = 'p:' || rf.pid));
      end if;
      -- À prendre : ses personnes, refus et auteur.
      if jsonb_typeof(d -> 'aPrendre') = 'object' then
        d := d || jsonb_build_object('aPrendre', ((d -> 'aPrendre') - 'par') || jsonb_strip_nulls(jsonb_build_object(
          'personnes', (select coalesce(jsonb_agg(distinct rf.fid), '[]'::jsonb) from jsonb_array_elements_text(case when jsonb_typeof(d -> 'aPrendre' -> 'personnes') = 'array' then d -> 'aPrendre' -> 'personnes' else '[]'::jsonb end) p join reprise_fiche rf on rf.eid = e.id and rf.pid = p),
          'refus', case when jsonb_typeof(d -> 'aPrendre' -> 'refus') = 'array' then (select coalesce(jsonb_agg(distinct rf.fid), '[]'::jsonb) from jsonb_array_elements_text(d -> 'aPrendre' -> 'refus') p join reprise_fiche rf on rf.eid = e.id and rf.pid = p) end,
          'par', (select rf.fid from reprise_fiche rf where rf.eid = e.id and rf.pid = d -> 'aPrendre' ->> 'par'))));
      end if;
      -- Remboursement ou facture : les personnes du circuit.
      if jsonb_typeof(d -> 'paiement') = 'object' then
        d := jsonb_set(d, '{paiement,demandePar}', to_jsonb(coalesce((select rf.fid from reprise_fiche rf where rf.eid = e.id and rf.pid = d -> 'paiement' ->> 'demandePar'), d -> 'paiement' ->> 'demandePar', '')));
        for etid in select unnest(array['visa', 'validation', 'refus', 'paye']) loop
          if jsonb_typeof(d -> 'paiement' -> etid) = 'object' then
            if d -> 'paiement' -> etid ? 'par' then
              d := jsonb_set(d, array['paiement', etid, 'par'], to_jsonb(coalesce((select rf.fid from reprise_fiche rf where rf.eid = e.id and rf.pid = d -> 'paiement' -> etid ->> 'par'), d -> 'paiement' -> etid ->> 'par')));
            end if;
            if d -> 'paiement' -> etid ? 'a' then
              d := jsonb_set(d, array['paiement', etid, 'a'], to_jsonb(coalesce((select rf.fid from reprise_fiche rf where rf.eid = e.id and rf.pid = d -> 'paiement' -> etid ->> 'a'), d -> 'paiement' -> etid ->> 'a')));
            end if;
          end if;
        end loop;
      end if;
      -- Fichiers joints : sous leur chemin complet (dossier de l'entité), lisibles depuis le club (gsa_fichier_repris).
      if jsonb_typeof(d -> 'documents') = 'array' then
        d := d || jsonb_build_object('documents', (
          select coalesce(jsonb_agg(case when jsonb_typeof(x.v -> 'id') = 'string' and position('/' in x.v ->> 'id') = 0 and coalesce(x.v ->> 'kind', 'fichier') <> 'lien'
                                         then x.v || jsonb_build_object('id', e.id::text || '/' || (x.v ->> 'id')) else x.v end order by x.n), '[]'::jsonb)
          from jsonb_array_elements(d -> 'documents') with ordinality x(v, n)));
      end if;

      -- Ancienne ligne du club (tâche déplacée autrefois vers l'entité) : recopiée, puis reprise.
      insert into public.gsa_reprise_avant (committee_id, kind, item_id, deleted, data)
      select i.committee_id, i.kind, i.id, i.deleted, i.data from public.gsa_items i where i.committee_id = club and i.kind = 'tasks' and i.id = fid;
      insert into public.gsa_items (committee_id, kind, id, pos, data)
      values (club, 'tasks', fid, coalesce((select max(i.pos) + 1 from public.gsa_items i where i.committee_id = club and i.kind = 'tasks'), 0), d)
      on conflict (committee_id, kind, id) do update set data = excluded.data, deleted = false, client_id = null;
      n_taches := n_taches + 1;
    end loop;

    -- Lectures des discussions et réglages d'affichage : ceux des personnes qui n'en ont pas encore au club.
    insert into public.gsa_items (committee_id, kind, id, pos, data)
    select club, 'prefs', rf.fid, 0, p.data
    from public.gsa_items p join reprise_fiche rf on rf.eid = e.id and rf.pid = p.id
    where p.committee_id = e.id and p.kind = 'prefs' and not p.deleted and jsonb_typeof(p.data) = 'object'
      and not exists (select 1 from public.gsa_items x where x.committee_id = club and x.kind = 'prefs' and x.id = rf.fid)
    on conflict (committee_id, kind, id) do nothing;
    for f in
      select rf.fid, p.data from public.gsa_items p join reprise_fiche rf on rf.eid = e.id and rf.pid = p.id
      where p.committee_id = e.id and p.kind = 'discussionsLues' and not p.deleted and jsonb_typeof(p.data) = 'object'
    loop
      nouveau := (
        select coalesce(jsonb_object_agg(coalesce(rt.nid, x.tache), x.le), '{}'::jsonb)
        from (select regexp_replace(k, '^.*:', '') as tache, k, v as le from jsonb_each(f.data) j(k, v)) x
        left join reprise_tache rt on rt.tid = x.tache and (rt.eid = e.id or x.k like 'x:' || rt.eid::text || ':%')
        where exists (select 1 from public.gsa_items i where i.committee_id = club and i.kind = 'tasks' and i.id = coalesce(rt.nid, x.tache)));
      if nouveau <> '{}'::jsonb then
        insert into public.gsa_items (committee_id, kind, id, pos, data)
        values (club, 'discussionsLues', f.fid, 0, nouveau)
        on conflict (committee_id, kind, id) do update
          set data = nouveau || coalesce(case when public.gsa_items.deleted then null else public.gsa_items.data end, '{}'::jsonb), deleted = false, client_id = null;
      end if;
    end loop;

    select count(*) into n_fiches from reprise_fiche rf where rf.eid = e.id;
    bilan := bilan || jsonb_build_object('entite', e.nom, 'etiquette', e.etiquette, 'taches', n_taches, 'evenements', n_evts,
                                         'fiches', n_fiches, 'historique', n_hist, 'section', cible_section, 'sousSection', cible_sous);
  end loop;

  -- 6. Tâches du club liées à une entité reprise.
  for t in
    select i.id, i.data from public.gsa_items i
    where i.committee_id = club and i.kind = 'tasks' and not i.deleted and jsonb_typeof(i.data) = 'object'
      and ((i.data -> 'evenementEntite' ->> 'uniteId') in (select id::text from reprise_ent)
        or (jsonb_typeof(i.data -> 'respPartage') = 'object' and exists (select 1 from reprise_ent r where i.data -> 'respPartage' ? r.id::text))
        or (jsonb_typeof(i.data -> 'partage') = 'array' and exists (select 1 from reprise_ent r where i.data -> 'partage' @> to_jsonb(r.id::text))))
  loop
    d := t.data;
    -- Étiquettes : celle de l'entité à qui la tâche était attribuée, et celles des entités du partage.
    d := d || jsonb_build_object('etiquettes', (
      select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
        select jsonb_array_elements_text(case when jsonb_typeof(t.data -> 'etiquettes') = 'array' then t.data -> 'etiquettes' else '[]'::jsonb end) v
        union select r.etiquette from reprise_ent r where (t.data -> 'evenementEntite' ->> 'uniteId') = r.id::text
        union select r.etiquette from reprise_ent r where jsonb_typeof(t.data -> 'partage') = 'array' and t.data -> 'partage' @> to_jsonb(r.id::text)) y));
    -- Délai calé sur la date de l'entité : calé sur celle de son étiquette.
    if (t.data -> 'evenementEntite' ->> 'uniteId') in (select id::text from reprise_ent) then
      if (d -> 'delaiRef' ->> 'type') = 'event' and not d ? 'eventId' then
        d := d || jsonb_build_object('delaiRef', (d -> 'delaiRef') - 'occurrence'
               || jsonb_build_object('type', 'etiquette', 'etiquetteId', 'et-' || (t.data -> 'evenementEntite' ->> 'uniteId')));
      end if;
      d := d - 'evenementEntite';
    end if;
    -- Responsables notés dans une entité reprise : responsables de la tâche.
    if jsonb_typeof(d -> 'respPartage') = 'object' then
      d := d || jsonb_build_object('responsables', (
        select coalesce(jsonb_agg(x.v order by x.n), '[]'::jsonb) from (
          select distinct on (v) v, n from (
            select r.v, r.n from jsonb_array_elements_text(case when jsonb_typeof(t.data -> 'responsables') = 'array' then t.data -> 'responsables' else '[]'::jsonb end) with ordinality r(v, n)
            union all
            select rf.fid, 1000 + p.n
            from jsonb_each(d -> 'respPartage') a(k, l)
            cross join lateral jsonb_array_elements_text(case when jsonb_typeof(a.l) = 'array' then a.l else '[]'::jsonb end) with ordinality p(v, n)
            join reprise_fiche rf on rf.eid::text = a.k and rf.pid = p.v
          ) z order by v, n) x));
      d := d || jsonb_build_object('respPartage', (
        select coalesce(jsonb_object_agg(k, l), '{}'::jsonb) from jsonb_each(d -> 'respPartage') a(k, l)
        where a.k not in (select id::text from reprise_ent)));
      if d -> 'respPartage' = '{}'::jsonb then
        d := d - 'respPartage';
      end if;
    end if;
    if jsonb_typeof(d -> 'partage') = 'array' then
      d := d || jsonb_build_object('partage', (
        select coalesce(jsonb_agg(v), '[]'::jsonb) from jsonb_array_elements_text(d -> 'partage') v
        where v not in (select id::text from reprise_ent)));
      if jsonb_array_length(d -> 'partage') = 0 then
        d := d - 'partage';
      end if;
    end if;
    insert into public.gsa_reprise_avant (committee_id, kind, item_id, deleted, data) values (club, 'tasks', t.id, false, t.data);
    update public.gsa_items i set data = d, client_id = null where i.committee_id = club and i.kind = 'tasks' and i.id = t.id;
  end loop;

  -- 7. Entités archivées, avec le bilan ; historique de la reprise à son nom.
  for e in select * from reprise_ent loop
    update public.committees c
    set info = coalesce(c.info, '{}'::jsonb) || jsonb_build_object('archive', true, 'reprise', jsonb_build_object(
      'le', to_char(quand at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'etiquette', e.etiquette, 'archiveeAvant', e.archive))
    where c.id = e.id;
  end loop;
  update public.gsa_historique h set nom = 'Reprise des entités'
  where h.committee_id = club and h.par is null and h.nom = 'Automatique' and h.le >= quand;

  return jsonb_build_object('entites', jsonb_array_length(bilan), 'detail', bilan,
    'fichesCreees', (select count(*) from public.gsa_items i where i.committee_id = club and i.kind = 'people' and i.id like 'p-%' and i.updated_at >= quand),
    'comptesClub', (select count(*) from public.gsa_members x where x.committee_id = club));
end $$;
revoke all on function public.gsa_reprise_entites(uuid) from public, anon, authenticated;

-- ---------- Application ----------
do $$
declare
  c record;
  r jsonb;
begin
  for c in select id, name from public.committees where parent_id is null loop
    r := public.gsa_reprise_entites(c.id);
    raise notice 'Reprise des entités de « % » : %', c.name, r;
  end loop;
end $$;
