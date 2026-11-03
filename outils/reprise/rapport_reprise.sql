-- Rapport de reprise des entités (PLAN_APPLI_SIMPLE.md, étape D2) : LECTURE SEULE.
--
-- Une seule requête SELECT : rien n'est écrit. À coller dans l'éditeur SQL de Supabase (ou psql), résultat en un tableau
-- (partie, entite, element, detail), dans l'ordre des parties. Il dit ce que la reprise (étape D3) ferait de chaque
-- entité, et ce qu'il reste à vérifier. Les règles sont celles décidées le 03.11.2026 (PLAN_APPLI_SIMPLE.md), appliquées par
-- la migration 059 (les mêmes que la reprise de la démo, src/data/repriseEntites.ts) :
--   - une entité devient une étiquette du club : groupe → « groupe », sous-comité ou équipe → « événement » (avec sa date) ;
--   - ses membres : ses fiches actives (pas les fiches « liées » d'une autre entité, `viaEntite`) ;
--   - une personne d'une entité est la fiche du comité central qui a la même fiche du registre (`membreId`), sinon la même
--     adresse, sinon le même prénom et nom ; sinon une fiche est à créer (rôle « Membre ») ;
--   - ses tâches et ses événements viennent dans l'espace du club, avec l'étiquette ; les séances des entités ne sont pas
--     reprises.
-- Une entité déjà reprise (059, `info.reprise`) n'y figure plus : après la reprise, le rapport est presque vide.
-- Les noms et adresses du club apparaissent dans le résultat : ne pas le publier (le dépôt est public).

with
central as (select c.id, c.name from public.committees c where c.parent_id is null),
ent as (
  select c.id, c.name, c.type, coalesce((c.info->>'archive')::boolean, false) as archive,
         c.info->>'date' as date, c.info->>'dateFin' as date_fin, c.info->>'couleur' as couleur
  from public.committees c join central on c.parent_id = central.id
  where not (coalesce(c.info, '{}'::jsonb) ? 'reprise')  -- déjà reprise par la migration 059 : plus rien à voir
),
it as (select * from public.gsa_items where not deleted),
cfiche as (
  select i.id, i.data as d, coalesce((i.data->>'actif')::boolean, true) as actif
  from it i join central on central.id = i.committee_id where i.kind = 'people'
),
efiche as (
  select e.id as eid, e.name as ent, i.id as pid, i.data as d, coalesce((i.data->>'actif')::boolean, true) as actif,
         i.data->>'viaEntite' is not null as via,
         trim(coalesce(i.data->>'prenom', '') || ' ' || coalesce(i.data->>'nom', '')) as nom
  from it i join ent e on e.id = i.committee_id where i.kind = 'people'
),
-- Rapprochement d'une fiche d'entité avec une fiche du comité central.
lien as (
  select f.*,
    (select c.id from cfiche c where f.d->>'membreId' is not null and c.d->>'membreId' = f.d->>'membreId' limit 1) as par_registre,
    (select c.id from cfiche c where nullif(lower(trim(f.d->>'email')), '') is not null
       and lower(trim(c.d->>'email')) = lower(trim(f.d->>'email')) limit 1) as par_email,
    (select c.id from cfiche c where lower(trim(coalesce(c.d->>'prenom', '') || ' ' || coalesce(c.d->>'nom', ''))) = lower(f.nom) limit 1) as par_nom
  from efiche f
),
lien2 as (
  select l.*, coalesce(par_registre, par_email, par_nom) as fiche_club,
    (select c.actif from cfiche c where c.id = coalesce(par_registre, par_email, par_nom)) as club_actif
  from lien l
),
etache as (
  select e.id as eid, e.name as ent, i.id as tid, i.data as d
  from it i join ent e on e.id = i.committee_id where i.kind = 'tasks'
),
statut as (select committee_id, id, data->>'label' as label, coalesce((data->>'done')::boolean, false) as fini from it where kind = 'statuses'),
-- Personnes citées par les tâches des entités.
refs as (
  select t.eid, t.ent, t.tid, 'responsable' as quoi, r as pid from etache t, jsonb_array_elements_text(coalesce(t.d->'responsables', '[]')) r
  union all select t.eid, t.ent, t.tid, 'auteur', t.d->>'createdBy' from etache t where coalesce(t.d->>'createdBy', '') <> ''
  union all select t.eid, t.ent, t.tid, 'commentaire', c->>'par' from etache t, jsonb_array_elements(coalesce(t.d->'commentaires', '[]')) c
  union all select t.eid, t.ent, t.tid, 'pour info', p from etache t, jsonb_array_elements_text(coalesce(t.d->'pourInfo'->'personnes', '[]')) p
  union all select t.eid, t.ent, t.tid, 'à prendre', p from etache t, jsonb_array_elements_text(coalesce(t.d->'aPrendre'->'personnes', '[]')) p
),
comptes as (
  select m.user_id, string_agg(distinct e.name, ', ') as entites,
         min(f.nom) as nom,
         exists (select 1 from public.gsa_members m2 join central on central.id = m2.committee_id where m2.user_id = m.user_id) as au_central
  from public.gsa_members m join ent e on e.id = m.committee_id
  left join efiche f on f.eid = m.committee_id and f.pid = m.person_id
  group by m.user_id
),
csection as (select i.id, i.data->>'nom' as nom, i.data->'sousSections' as sous from it i join central on central.id = i.committee_id where i.kind = 'sections'),
lignes as (
  -- 01 Étiquettes : une par entité.
  select '01 Étiquettes' as partie, e.name as entite,
         case when e.type = 'groupe' then 'groupe' else 'événement' end
           || coalesce(' · ' || e.date || coalesce(' → ' || e.date_fin, ''), case when e.type = 'groupe' then '' else ' · sans date' end)
           || case when e.archive then ' · ARCHIVÉE' else '' end as element,
         (select count(*) from etache t where t.eid = e.id) || ' tâche(s) dont '
           || (select count(*) from etache t where t.eid = e.id and not coalesce((select s.fini from statut s where s.committee_id = e.id and s.id = t.d->>'statusId'), false)) || ' en cours ; '
           || (select count(*) from it i where i.committee_id = e.id and i.kind = 'events') || ' événement(s) ; '
           || (select count(*) from efiche f where f.eid = e.id and f.actif and not f.via) || ' membre(s) ; couleur ' || coalesce(e.couleur, '—')
           || case when e.archive then ' ; entité déjà archivée : reprise aussi (décision du 03.11.2026)' else '' end as detail
  from ent e

  -- 02 Membres de chaque étiquette : fiches actives de l'entité, et leur fiche au club.
  union all
  select '02 Membres', l.ent, l.nom,
         case when l.fiche_club is null then 'pas de fiche au club : à créer (rôle « Membre »)'
              when not coalesce(l.club_actif, true) then 'fiche ' || l.fiche_club || ' inactive au club : à réactiver'
              else 'fiche ' || l.fiche_club || case when l.par_registre is not null then ' (registre)' when l.par_email is not null then ' (adresse)' else ' (nom)' end end
  from lien2 l where l.actif and not l.via

  -- 03 Personnes à créer ou à réactiver au club (toutes entités).
  union all
  select '03 Fiches à créer ou réactiver', string_agg(distinct l.ent, ', '), l.nom,
         case when l.fiche_club is null then 'à créer (rôle « Membre »)' || coalesce(' ; registre ' || max(l.d->>'membreId'), '')
              else 'fiche ' || l.fiche_club || ' inactive : à réactiver' end
         || ' ; rôles dans les entités : ' || string_agg(distinct r, ', ')
  from lien2 l left join lateral jsonb_array_elements_text(coalesce(l.d->'roles', '[]')) r on true
  where l.actif and not l.via and (l.fiche_club is null or not coalesce(l.club_actif, true))
  group by l.nom, l.fiche_club

  -- 04 Comptes qui n'ont accès qu'à des entités : sans rattachement au comité central, ils perdraient l'accès.
  union all
  select '04 Comptes à rattacher', c.entites, coalesce(c.nom, c.user_id::text),
         'compte sans accès au comité central : à rattacher à sa fiche du club'
  from comptes c where not c.au_central

  -- 05 Personnes citées par les tâches des entités et sans fiche au club.
  union all
  select '05 Personnes des tâches', r.ent, coalesce(l.nom, r.pid),
         string_agg(distinct r.quoi, ', ') || ' de ' || count(distinct r.tid) || ' tâche(s) : '
           || case when l.pid is null then 'fiche introuvable dans l''entité' else 'pas de fiche au club (voir 03)' end
  from refs r left join lien2 l on l.eid = r.eid and l.pid = r.pid
  where l.fiche_club is null
  group by r.ent, coalesce(l.nom, r.pid), l.pid

  -- 06 Tâches des entités : ce qu'il faut savoir avant de les reprendre.
  union all
  select '06 Tâches', t.ent, left(t.d->>'titre', 60),
         concat_ws(' ; ',
           case when not exists (select 1 from statut s join central on central.id = s.committee_id where s.id = t.d->>'statusId')
                then 'statut « ' || coalesce((select s.label from statut s where s.committee_id = t.eid and s.id = t.d->>'statusId'), '?') || ' » absent du club' end,
           case when exists (select 1 from public.gsa_items x join central on central.id = x.committee_id where x.kind = 'tasks' and x.id = t.tid and x.deleted)
                then 'même identifiant qu''une tâche supprimée du comité central (déplacée vers l''entité) : la reprendre sous cet identifiant' end,
           case when exists (select 1 from it x join central on central.id = x.committee_id where x.kind = 'tasks' and x.id = t.tid)
                then 'même identifiant qu''une tâche du comité central : nouvel identifiant' end,
           case when not coalesce(t.d->'partage' @> to_jsonb((select id::text from central)), false) and coalesce(t.d->>'auCentral', 'false') <> 'true'
                then 'pas partagée avec le comité central (nouvelle pour lui)' end,
           case when jsonb_array_length(coalesce(t.d->'documents', '[]')) > 0 then jsonb_array_length(t.d->'documents') || ' fichier(s) joint(s) dans le dossier de l''entité' end,
           case when jsonb_array_length(coalesce(t.d->'commentaires', '[]')) > 0 then jsonb_array_length(t.d->'commentaires') || ' message(s)' end,
           case when t.d ? 'paiement' then 'remboursement ou facture' end,
           case when t.d->'pourInfo' ? 'autres' then '« pour info » à des personnes d''autres entités' end,
           case when t.d->>'meetingId' is not null then 'liée à une séance de l''entité (non reprise)' end,
           case when t.d->>'eventId' is not null then 'liée à un événement de l''entité' end)
  from etache t
  where not exists (select 1 from statut s join central on central.id = s.committee_id where s.id = t.d->>'statusId')
     or exists (select 1 from public.gsa_items x join central on central.id = x.committee_id where x.kind = 'tasks' and x.id = t.tid)
     or not coalesce(t.d->'partage' @> to_jsonb((select id::text from central)), false)
     or jsonb_array_length(coalesce(t.d->'documents', '[]')) > 0 or jsonb_array_length(coalesce(t.d->'commentaires', '[]')) > 0
     or t.d ? 'paiement' or t.d->'pourInfo' ? 'autres' or t.d->>'meetingId' is not null or t.d->>'eventId' is not null

  -- 07 Tâches du comité central liées à une entité.
  union all
  select '07 Tâches du comité central', coalesce(t.data->'evenementEntite'->>'nom', (select string_agg(e.name, ', ') from ent e where t.data->'respPartage' ? e.id::text or t.data->'partage' @> to_jsonb(e.id::text))),
         left(t.data->>'titre', 60),
         concat_ws(' ; ',
           case when t.data ? 'evenementEntite' then 'attribuée à l''entité : recevrait son étiquette' end,
           case when t.data->'delaiRef'->>'type' = 'event' and t.data->>'eventId' is null
                then 'délai « ' || coalesce(t.data->'delaiRef'->>'joursAvant', '?') || ' jours avant » sa date : calé sur la date de son étiquette' end,
           case when t.data ? 'respPartage' then 'responsables dans l''entité (respPartage) : à ajouter aux responsables' end,
           case when jsonb_array_length(coalesce(t.data->'partage', '[]')) > 0 then 'partagée avec des entités : recevrait leurs étiquettes' end)
  from it t join central on central.id = t.committee_id
  where t.kind = 'tasks' and (t.data ? 'evenementEntite' or t.data ? 'respPartage' or jsonb_array_length(coalesce(t.data->'partage', '[]')) > 0)

  -- 08 Événements des entités : copiés dans l'agenda du club.
  union all
  select '08 Événements', e.name, (i.data->>'nom') || ' · ' || coalesce(i.data->>'date', '?') || case when i.data ? 'repetition' then ' (se répète)' else '' end,
         coalesce('même jour au club : « ' || (select string_agg(x.data->>'nom', ', ') from it x join central on central.id = x.committee_id
                   where x.kind = 'events' and x.data->>'date' = i.data->>'date') || ' »', 'copié dans l''agenda du club')
  from it i join ent e on e.id = i.committee_id where i.kind = 'events'

  -- 09 Sections : où ranger les tâches de chaque entité (sections du club de nom voisin ; sous-sections des « Événements »).
  union all
  select '09 Sections', e.name,
         coalesce((select string_agg('section « ' || s.nom || ' »', ', ') from csection s
                   where lower(s.nom) = lower(e.name) or (length(e.name) >= 4 and length(s.nom) >= 4
                     and (lower(s.nom) like '%' || lower(e.name) || '%' or lower(e.name) like '%' || lower(s.nom) || '%'))),
                  'aucune section du même nom'),
         coalesce((select string_agg('« ' || s.nom || ' › ' || x || ' »', ', ') from csection s, jsonb_array_elements_text(coalesce(s.sous, '[]')) x
                   where lower(x) = lower(e.name)), 'pas de sous-section du même nom')
           || ' ; sections de l''entité utilisées : '
           || coalesce((select string_agg(distinct coalesce((select s.data->>'nom' from it s where s.committee_id = e.id and s.kind = 'sections' and s.id = t.d->>'sectionId'), '?'), ', ')
                        from etache t where t.eid = e.id), 'aucune (pas de tâche)')
  from ent e

  -- 10 Fichiers joints rangés dans le dossier de chaque entité (à recopier dans celui du club).
  union all
  select '10 Fichiers', e.name, count(o.*) || ' fichier(s)', pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0))
  from ent e join storage.objects o on o.bucket_id = 'gsa-fichiers' and split_part(o.name, '/', 1) = e.id::text
  group by e.name

  -- 11 Historique des tâches des entités (à rattacher aux tâches reprises).
  union all
  select '11 Historique', e.name, count(h.*) || ' entrée(s)', 'tâches : ' || count(distinct h.tache_id)
  from ent e join public.gsa_historique h on h.committee_id = e.id group by e.name

  -- 12 Registre « Personnes du club » : personnes sans fiche au comité central.
  union all
  select '12 Registre sans fiche au club', coalesce((select string_agg(distinct f.ent, ', ') from efiche f where f.d->>'membreId' = r.id), '—'),
         trim(coalesce(r.data->>'prenom', '') || ' ' || coalesce(r.data->>'nom', '')),
         case when exists (select 1 from public.gsa_club_comptes k where k.club_id = r.club_id and k.membre_id = r.id)
                or exists (select 1 from public.gsa_members m join efiche f on f.eid = m.committee_id and f.pid = m.person_id where f.d->>'membreId' = r.id)
              then 'a un compte' else 'sans compte' end
         || case when exists (select 1 from efiche f where f.d->>'membreId' = r.id and f.actif and not f.via) then ' ; active dans une entité (voir 03)' else ' ; rien à reprendre' end
  from public.gsa_club_membres r join central on central.id = r.club_id
  where not exists (select 1 from cfiche c where c.d->>'membreId' = r.id)

  -- 13 Fiches inactives du comité central sans personne du registre (anciennes fiches de départ) : pour mémoire.
  union all
  select '13 Fiches inactives sans registre', (select name from central), trim(coalesce(c.d->>'prenom', '') || ' ' || coalesce(c.d->>'nom', '')) || ' (' || c.id || ')',
         coalesce(c.d->>'poste', '') || ' ; la reprise n''y touche pas'
  from cfiche c
  where not c.actif and not exists (select 1 from public.gsa_club_membres r where r.id = c.d->>'membreId')
)
select partie, entite, element, detail from lignes order by partie, entite, element;
