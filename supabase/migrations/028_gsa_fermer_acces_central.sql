-- Accès du comité central fermé (l'appli ne propose plus ce réglage ni la visite d'une entité).
--
-- La migration 006 laissait une entité ouvrir ses données au comité central (committees.info ->> 'central' :
-- « lecture » ou « ecriture »). Le comité dont une entité dépend voit maintenant ses tâches par le réglage
-- « Ses tâches dans … » (migration 027, fonctions gsa_taches_partagees et gsa_modifier_tache_partagee).
-- Ici, gsa_acces_central ne donne plus aucun accès : seuls les membres d'une entité lisent et modifient ses données
-- et ses fichiers (règles de gsa_items et du stockage, inchangées, qui appellent cette fonction).
--
-- Aucune donnée modifiée : les valeurs info.central déjà enregistrées restent, sans effet.
-- Pour revenir en arrière : relancer la définition de gsa_acces_central de la migration 006.

create or replace function public.gsa_acces_central(c uuid) returns text
language sql stable security definer set search_path = '' as $$
  select null::text;
$$;
