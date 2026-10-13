-- Tâches GSA — 035 : une tâche que le comité attribue à un groupe ou à un événement qui dépend de lui est enregistrée
-- chez eux.
--
-- Dans le formulaire d'une tâche du comité, la sous-section propose les événements qui dépendent de lui (section des
-- événements) et les sections du groupe dont la section porte le nom (033). Jusqu'ici, ce choix laissait la tâche dans
-- le comité et la partageait avec l'entité. Désormais, la tâche est enregistrée dans l'entité choisie : elle est à
-- elle (ses membres la gèrent comme les leurs : documents, répétition, suppression…) et elle est partagée avec le
-- comité, où elle apparaît à la même place (règle habituelle des tâches partagées : 019, 027, 030).
--
-- gsa_attribuer_tache(comité, entité, tâche, statut) : la tâche préparée par l'appli est enregistrée dans l'entité,
-- après contrôle :
--   • la personne connectée est membre du comité et peut y créer des tâches dans la section choisie ;
--   • l'entité dépend du comité (« Dépend de » : gsa_dependance), n'est pas archivée ;
--   • pas de ticket (remboursement, facture), un identifiant libre dans l'entité, une section de l'entité ;
--   • ne sont gardés que les responsables qui ont une fiche dans l'entité (les autres : respPartage, par entité),
--     le partage (avec le comité en plus), la séance du comité liée (son ordre du jour), les liens (pas les fichiers,
--     rangés chez le comité) ; le statut est celui de l'entité du même nom (sinon du même état) ;
--   • la tâche note qui l'a attribuée (attribueePar).
-- L'appli retire ensuite la tâche du comité (une tâche existante) : elle y reste visible, partagée.
-- Ajout pur : une nouvelle fonction ; aucune donnée existante modifiée.

create or replace function public.gsa_attribuer_tache(unite uuid, cible uuid, tache jsonb, statut jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  moi public.committees;
  c public.committees;
  tid text := tache ->> 'id';
  sec text := coalesce(tache -> 'placePartage' -> unite::text ->> 'sectionId', '');
  fait boolean := coalesce((statut ->> 'done')::boolean, false);
  nd jsonb;
  st text;
  x jsonb;
  pos double precision;
begin
  if not public.gsa_is_member(unite) then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  select * into moi from public.committees y where y.id = unite;
  select * into c from public.committees y where y.id = cible;
  if c.id is null or c.id = unite or c.parent_id is null or coalesce((c.info ->> 'archive')::boolean, false)
     or public.gsa_dependance(c.id) is distinct from unite then
    raise exception 'Cette entité ne dépend pas de « % »', moi.name using errcode = '42501';
  end if;
  if jsonb_typeof(tache) is distinct from 'object' or coalesce(tid, '') !~ '^[A-Za-z0-9_-]{1,80}$' or tache ? 'paiement'
     or btrim(coalesce(tache ->> 'titre', '')) = '' then
    raise exception 'Tâche invalide' using errcode = '22023';
  end if;
  if not (public.gsa_a_droit_section(unite, 'tasks.createAny', sec) or public.gsa_a_droit_section(unite, 'tasks.editOwn', sec)) then
    raise exception 'Ton rôle ne permet pas de créer des tâches dans cette section' using errcode = '42501';
  end if;
  if exists (select 1 from public.gsa_items i where i.committee_id = cible and i.kind = 'tasks' and i.id = tid and not i.deleted) then
    raise exception 'Cette tâche est déjà enregistrée dans « % »', c.name using errcode = '23505';
  end if;
  if not exists (select 1 from public.gsa_items s where s.committee_id = cible and s.kind = 'sections' and s.id = tache ->> 'sectionId' and not s.deleted) then
    raise exception 'Section introuvable dans « % »', c.name using errcode = '22023';
  end if;

  -- Statut de l'entité : même nom et même état, sinon même identifiant et même état, sinon même état, sinon le premier.
  select s.id into st from public.gsa_items s
  where s.committee_id = cible and s.kind = 'statuses' and not s.deleted
  order by (lower(btrim(s.data ->> 'label')) = lower(btrim(coalesce(statut ->> 'label', ''))) and coalesce((s.data ->> 'done')::boolean, false) = fait) desc,
    (s.id = tache ->> 'statusId' and coalesce((s.data ->> 'done')::boolean, false) = fait) desc,
    (coalesce((s.data ->> 'done')::boolean, false) = fait) desc,
    s.pos
  limit 1;

  nd := tache - array['source', 'meetingId', 'eventId', 'parentId', 'suivanteId', 'postesResp', 'proposee', 'parCentral',
    'auCentral', 'evenementEntite', 'modifiePar', 'pieces', 'attribueePar', 'delaiRef', 'seanceComite', 'documents'];
  nd := nd || jsonb_build_object(
    'titre', left(btrim(tache ->> 'titre'), 500),
    'sousSection', '',
    'statusId', coalesce(st, ''),
    -- Responsables : fiches de l'entité ; ceux des autres entités restent dans respPartage.
    'responsables', (
      select coalesce(jsonb_agg(r.v order by r.n), '[]'::jsonb)
      from jsonb_array_elements_text(case when jsonb_typeof(tache -> 'responsables') = 'array' then tache -> 'responsables' else '[]'::jsonb end)
        with ordinality as r(v, n)
      where exists (select 1 from public.gsa_items p where p.committee_id = cible and p.kind = 'people' and p.id = r.v and not p.deleted)),
    'partage', (
      select jsonb_agg(distinct v)
      from (
        select p.v from jsonb_array_elements_text(case when jsonb_typeof(tache -> 'partage') = 'array' then tache -> 'partage' else '[]'::jsonb end) p(v)
        where p.v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and p.v <> cible::text
        union select unite::text) l(v)),
    'createdBy', case when exists (select 1 from public.gsa_items p where p.committee_id = cible and p.kind = 'people' and p.id = tache ->> 'createdBy' and not p.deleted)
      then tache ->> 'createdBy' else '' end,
    'attribueePar', jsonb_build_object('uniteId', unite, 'unite', moi.name, 'par', left(coalesce(tache -> 'attribueePar' ->> 'par', ''), 200),
      'le', to_char(now() at time zone 'Europe/Zurich', 'YYYY-MM-DD')),
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  -- Rangement : celui du comité (et des autres entités du partage), pas celui de l'entité, dont c'est la tâche.
  x := case when jsonb_typeof(tache -> 'placePartage') = 'object' then (tache -> 'placePartage') - cible::text else '{}'::jsonb end;
  nd := case when x = '{}'::jsonb then nd - 'placePartage' else nd || jsonb_build_object('placePartage', x) end;
  x := case when jsonb_typeof(tache -> 'respPartage') = 'object' then (tache -> 'respPartage') - cible::text else '{}'::jsonb end;
  nd := case when x = '{}'::jsonb then nd - 'respPartage' else nd || jsonb_build_object('respPartage', x) end;
  -- Séance du comité liée : à l'ordre du jour et au PV du comité ; le délai peut la suivre.
  if tache -> 'seanceComite' ->> 'uniteId' = unite::text then
    nd := nd || jsonb_build_object('seanceComite', tache -> 'seanceComite');
    if tache -> 'delaiRef' ->> 'type' = 'meeting' then
      nd := nd || jsonb_build_object('delaiRef', tache -> 'delaiRef');
    end if;
  end if;
  -- Documents : les liens seulement (les fichiers sont rangés chez le comité).
  if jsonb_typeof(tache -> 'documents') = 'array' then
    x := (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(tache -> 'documents') d where d ->> 'kind' is distinct from 'fichier');
    if x <> '[]'::jsonb then
      nd := nd || jsonb_build_object('documents', x);
    end if;
  end if;

  select coalesce(min(i.pos), 0) - 1 into pos from public.gsa_items i where i.committee_id = cible and i.kind = 'tasks';
  insert into public.gsa_items as i (committee_id, kind, id, pos, data, deleted)
  values (cible, 'tasks', tid, pos, nd, false)
  on conflict (committee_id, kind, id) do update set data = excluded.data, pos = excluded.pos, deleted = false, client_id = null;
end $$;

grant execute on function public.gsa_attribuer_tache(uuid, uuid, jsonb, jsonb) to authenticated;
