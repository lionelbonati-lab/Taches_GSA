-- Vérifie la reprise (059) sur les données fictives de reprise_donnees.sql : chaque attente fausse lève une erreur.
do $$
declare
  club constant uuid := '00000000-0000-0000-0000-0000000000c0';
  e1 constant text := '00000000-0000-0000-0000-0000000000e1';
  d jsonb;
  n int;
  nid text;
  procedure_ok boolean;
  function_ok boolean;
begin
  -- Étiquettes : une par entité (CO de donnees.sql compris), datées pour les événements, archivée comprise.
  select count(*) into n from public.gsa_items where committee_id = club and kind = 'etiquettes' and not deleted;
  if n <> 7 then raise exception 'étiquettes : % au lieu de 7', n; end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'etiquettes' and id = 'et-' || e1;
  if d ->> 'type' <> 'evenement' or d ->> 'date' <> '2027-06-20' or d ->> 'dateFin' <> '2027-06-21' or d ->> 'couleur' <> '#0891b2' then
    raise exception 'étiquette Fête d''été : %', d;
  end if;
  if not (d -> 'membres' ?& array['p1', 'p-xb', 'p9']) or d -> 'membres' ? 'p3' then raise exception 'membres Fête d''été : %', d -> 'membres'; end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'etiquettes' and id = 'et-00000000-0000-0000-0000-0000000000e3';
  if d ->> 'date' <> '2026-01-10' then raise exception 'étiquette archivée sans sa date : %', d; end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'etiquettes' and id = 'et-00000000-0000-0000-0000-0000000000f1';
  if d ->> 'type' <> 'groupe' or d ? 'date' then raise exception 'étiquette groupe : %', d; end if;

  -- Rôle « Membre » ; fiches créées (une seule pour Bob, présent dans deux entités) ; fiche inactive réactivée.
  if not exists (select 1 from public.gsa_items where committee_id = club and kind = 'roles' and id = 'membre' and data -> 'permissions' = '["tasks.editOwn","tab.events"]') then
    raise exception 'rôle Membre absent';
  end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'people' and id = 'p-xb';
  if d is null or d -> 'roles' <> '["membre"]' or not (d ->> 'actif')::boolean or d ->> 'membreId' <> 'm7' or d ->> 'poste' <> 'Responsable (Fête d''été)' then
    raise exception 'fiche Bob : %', d;
  end if;
  if exists (select 1 from public.gsa_items where committee_id = club and kind = 'people' and id = 'p-yb') then raise exception 'Bob en double'; end if;
  if not exists (select 1 from public.gsa_items where committee_id = club and kind = 'people' and id = 'p-zc' and data -> 'roles' = '["membre"]') then
    raise exception 'fiche Carl (sans compte) absente';
  end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'people' and id = 'p9';
  if not (d ->> 'actif')::boolean or d -> 'roles' <> '["externe"]' then raise exception 'Zoé pas réactivée avec son rôle : %', d; end if;

  -- Comptes rattachés au club.
  if not exists (select 1 from public.gsa_members where committee_id = club and user_id = '00000000-0000-0000-0000-0000000000a7' and person_id = 'p-xb') then raise exception 'compte Bob pas rattaché'; end if;
  if not exists (select 1 from public.gsa_members where committee_id = club and user_id = '00000000-0000-0000-0000-0000000000a9' and person_id = 'p9') then raise exception 'compte Zoé pas rattaché'; end if;
  if not exists (select 1 from public.gsa_members where committee_id = club and user_id = '00000000-0000-0000-0000-0000000000a4') then raise exception 'compte Gil (CO) pas rattaché'; end if;

  -- Tâche déplacée autrefois : son ancienne ligne reprise, avec tout ce qui la concerne.
  select data into d from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'tx1' and not deleted;
  if d is null or d ->> 'titre' <> 'Monter la tente' then raise exception 'tx1 non reprise : %', d; end if;
  if d -> 'etiquettes' <> jsonb_build_array('et-' || e1) or d -> 'responsables' <> '["p-xb"]' or d ->> 'createdBy' <> 'p1' then raise exception 'tx1 personnes / étiquette : %', d; end if;
  if d ->> 'sectionId' <> 's-evt' or d ->> 'sousSection' <> 'Fête d''été' or d ? 'partage' then raise exception 'tx1 rangement : %', d; end if;
  if jsonb_array_length(d -> 'commentaires') <> 2 or d -> 'commentaires' -> 0 ->> 'par' <> 'p-xb' or d -> 'commentaires' -> 1 ->> 'par' <> 'p1' or d -> 'commentaires' -> 1 ? 'u' then
    raise exception 'tx1 messages : %', d -> 'commentaires';
  end if;
  if not (d -> 'pourInfo' -> 'personnes' @> '["p9","p3"]') or jsonb_array_length(d -> 'pourInfo' -> 'personnes') <> 2 or d -> 'pourInfo' ? 'autres' then raise exception 'tx1 pour info : %', d -> 'pourInfo'; end if;
  if not (d -> 'pourInfoVus' ? 'p:p9') then raise exception 'tx1 vus : %', d -> 'pourInfoVus'; end if;
  if d -> 'documents' -> 0 ->> 'id' <> e1 || '/d1' then raise exception 'tx1 fichier : %', d -> 'documents'; end if;
  if not exists (select 1 from public.gsa_reprise_avant where committee_id = club and kind = 'tasks' and item_id = 'tx1' and deleted) then raise exception 'ancienne ligne tx1 non gardée'; end if;

  -- Séance de l'entité : lien retiré ; statut inconnu du club : le premier ouvert ; à prendre relié.
  select data into d from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'tx2';
  if d ? 'meetingId' or d ? 'delaiRef' or d ->> 'statusId' <> 's1' or d ->> 'delai' <> '2027-06-01' then raise exception 'tx2 : %', d; end if;
  if d -> 'aPrendre' -> 'personnes' <> '["p-xb"]' or d -> 'aPrendre' ->> 'par' <> 'p1' then raise exception 'tx2 à prendre : %', d -> 'aPrendre'; end if;
  -- Événement de l'entité : recopié, la tâche le suit.
  if not exists (select 1 from public.gsa_items where committee_id = club and kind = 'events' and id = 'ev1') then raise exception 'événement non recopié'; end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'tx3';
  if d ->> 'eventId' <> 'ev1' or d -> 'delaiRef' ->> 'type' <> 'event' then raise exception 'tx3 : %', d; end if;

  -- Identifiant pris par une tâche vivante du club : nouvel identifiant ; la tâche du club ne change pas.
  if (select data ->> 'titre' from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'ty1') <> 'Autre tâche du club' then raise exception 'ty1 du club écrasée'; end if;
  select id, data into nid, d from public.gsa_items where committee_id = club and kind = 'tasks' and data ->> 'titre' = 'Repérer le parcours';
  if nid is null or nid = 'ty1' or d ->> 'sousSection' <> 'Sortie St-Pierre' or d -> 'responsables' <> '["p-xb"]' then raise exception 'ty1 de l''entité : % %', nid, d; end if;

  -- Rangement : nouvelle sous-section pour l'entité archivée ; groupe dans sa section ; groupe déjà en sous-section.
  select data into d from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'tz1';
  if d ->> 'sectionId' <> 's-evt' or d ->> 'sousSection' <> 'Ancienne soirée' or d -> 'responsables' <> '["p-zc"]' then raise exception 'tz1 : %', d; end if;
  if not ((select data -> 'sousSections' from public.gsa_items where committee_id = club and kind = 'sections' and id = 's-evt') ? 'Ancienne soirée') then raise exception 'sous-section Ancienne soirée absente'; end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'tg1';
  if d ->> 'sectionId' <> 's-grp' or d ->> 'sousSection' <> '' then raise exception 'tg1 : %', d; end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'th1';
  if d ->> 'sectionId' <> 's-evt' or d ->> 'sousSection' <> 'Hiver' then raise exception 'th1 : %', d; end if;
  if exists (select 1 from public.gsa_items where committee_id = club and kind = 'sections' and data ->> 'nom' in ('Vide', 'Course', 'CO')) then raise exception 'section créée pour une entité sans besoin'; end if;

  -- Tâches du club liées à une entité.
  select data into d from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'tc1';
  if d ? 'evenementEntite' or d -> 'etiquettes' <> jsonb_build_array('et-' || e1)
     or d -> 'delaiRef' <> jsonb_build_object('type', 'etiquette', 'etiquetteId', 'et-' || e1, 'joursAvant', 3, 'unite', 'jours') then
    raise exception 'tc1 : %', d;
  end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'tc2';
  if d -> 'responsables' <> '["p1","p-xb"]' or d ? 'respPartage' then raise exception 'tc2 : %', d; end if;
  select data into d from public.gsa_items where committee_id = club and kind = 'tasks' and id = 'tc3';
  if d -> 'etiquettes' <> '["et-00000000-0000-0000-0000-0000000000e2"]' or d ? 'partage' then raise exception 'tc3 : %', d; end if;

  -- Historique recopié, lectures et réglages suivis.
  select count(*) into n from public.gsa_historique where committee_id = club and tache_id = 'tx1' and nom = 'Bob Bâton';
  if n <> 2 then raise exception 'historique tx1 : % entrées recopiées', n; end if;
  if not exists (select 1 from public.gsa_historique where committee_id = club and tache_id = 'tx1' and nom = 'Reprise des entités') then raise exception 'historique : pas d''entrée « Reprise des entités »'; end if;
  if not exists (select 1 from public.gsa_items where committee_id = club and kind = 'discussionsLues' and id = 'p-xb' and data ? 'tx1') then raise exception 'lectures de Bob'; end if;
  if not exists (select 1 from public.gsa_items where committee_id = club and kind = 'prefs' and id = 'p-xb') then raise exception 'réglages de Bob'; end if;

  -- Entités archivées, avec le bilan ; leurs données restent.
  select count(*) into n from public.committees where parent_id = club and coalesce((info ->> 'archive')::boolean, false) and info ? 'reprise';
  if n <> 7 then raise exception 'entités archivées : %', n; end if;
  if not ((select info -> 'reprise' ->> 'archiveeAvant' from public.committees where id = '00000000-0000-0000-0000-0000000000e3')::boolean) then raise exception 'archivée avant : non noté'; end if;
  if not exists (select 1 from public.gsa_items where committee_id = e1::uuid and kind = 'tasks' and id = 'tx1' and not deleted) then raise exception 'données de l''entité effacées'; end if;
  raise notice 'Reprise vérifiée : tout est conforme.';
end $$;
