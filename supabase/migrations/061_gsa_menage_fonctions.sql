-- 061 : ménage (PLAN_APPLI_SIMPLE.md, étape D5) : fonctions des entités devenues inutiles, retirées.
--
-- Depuis l'espace unique (D1) et la reprise des entités (059), plus rien n'appelle ces 23 fonctions : ni l'appli, ni les
-- fonctions serveur (gsa-acces, gsa-push, gsa-agenda), ni une règle d'accès, un déclencheur, une tâche planifiée ou une
-- autre fonction (vérifié le 03.11.2026 sur le serveur, en lecture seule, et sur la base de test). La plupart sont
-- « security definer » et ouvertes aux comptes connectés : certaines écrivent encore dans les tâches des entités
-- archivées (tâches partagées, sondages partagés, tâches attribuées ou proposées). Les retirer ferme ces portes.
--
-- Rien d'autre n'est touché : aucune donnée, aucune table, aucune règle. Restent en place : les fonctions encore
-- utilisées (même celles dont le nom parle d'entités, ex. gsa_demandes_mdp_entite), les règles des fichiers des anciennes
-- entités (gsa_fichier_repris, 059, et celles d'avant), la reprise elle-même (gsa_reprise_entites, gsa_reprise_cle).
-- Rejouable (if exists).
--
-- Retour en arrière : relancer la définition de la fonction dans sa dernière migration (indiquée ci-dessous), avec ses
-- droits (grant / revoke qui la suivent).

-- Tâches partagées entre entités (019 → 041) et réponses « à prendre » depuis une autre entité (040).
drop function if exists public.gsa_modifier_tache_partagee(uuid, uuid, text, jsonb);      -- 041
drop function if exists public.gsa_repondre_partagee(uuid, uuid, text, boolean);          -- 040
drop function if exists public.gsa_docs_partagee(uuid, jsonb, jsonb, text);               -- 041
drop function if exists public.gsa_taches_partagees(uuid);                                -- 041
drop function if exists public.gsa_tache_visible(jsonb, uuid, boolean, text, uuid);       -- 027
drop function if exists public.gsa_anciennes_taches(uuid);                                -- 030
drop function if exists public.gsa_sections_dependantes(uuid);                            -- 033

-- Tâches transmises, attribuées ou proposées à une autre entité (005, 018 → 029, 035).
drop function if exists public.gsa_taches_transmises(uuid);                               -- 029
drop function if exists public.gsa_attribuer_tache(uuid, uuid, jsonb, jsonb);             -- 035
drop function if exists public.gsa_proposer_tache(uuid, jsonb);                           -- 005
drop function if exists public.gsa_mes_demandes(uuid);                                    -- 005

-- Sondages ouverts à d'autres entités (021, 044).
drop function if exists public.gsa_voter_sondage_partage(uuid, uuid, text, jsonb, text);  -- 044
drop function if exists public.gsa_sondages_partages(uuid);                               -- 021
drop function if exists public.gsa_cle_vote(uuid, jsonb, uuid, text);                     -- 021
drop function if exists public.gsa_identites(uuid, text, jsonb);                          -- 021

-- « Pour info » entre entités (037, 046).
drop function if exists public.gsa_taches_pour_info(uuid);                                -- 037
drop function if exists public.gsa_pour_info_destinataires(uuid, text);                   -- 046

-- Organigramme (005 → 023, 026), séances du comité vues d'une entité (032), date d'une édition (013), agenda du club
-- vu d'une entité (014 → 042), tickets envoyés à la caisse centrale (012 → 025).
drop function if exists public.gsa_photo_organigramme(uuid);                              -- 026
drop function if exists public.gsa_organigramme(uuid);                                    -- 023
drop function if exists public.gsa_seances_comite(uuid);                                  -- 032
drop function if exists public.gsa_date_edition(uuid, date, date);                        -- 013
drop function if exists public.gsa_agenda_club(uuid);                                     -- 042
drop function if exists public.gsa_mes_tickets_centraux();                                -- 025

-- Bilan : combien restent (0 attendu).
select count(*) as fonctions_restantes
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = any (array[
  'gsa_modifier_tache_partagee', 'gsa_repondre_partagee', 'gsa_docs_partagee', 'gsa_taches_partagees', 'gsa_tache_visible',
  'gsa_anciennes_taches', 'gsa_sections_dependantes', 'gsa_taches_transmises', 'gsa_attribuer_tache', 'gsa_proposer_tache',
  'gsa_mes_demandes', 'gsa_voter_sondage_partage', 'gsa_sondages_partages', 'gsa_cle_vote', 'gsa_identites',
  'gsa_taches_pour_info', 'gsa_pour_info_destinataires', 'gsa_photo_organigramme', 'gsa_organigramme', 'gsa_seances_comite',
  'gsa_date_edition', 'gsa_agenda_club', 'gsa_mes_tickets_centraux'
]);
