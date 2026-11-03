-- 064 : instantané — les points d'une étiquette arrivent tout de suite chez un nouveau membre, et les notifications
-- partent tout de suite sur les téléphones (appli fermée).
--
-- 1. Membres d'une étiquette changés (ou étiquette supprimée, ou rétablie) : ses points et leurs discussions sont relus
--    par ceux qui les voient (la ligne est réécrite telle quelle, client_id vide) ; l'appli d'un nouveau membre les reçoit
--    en direct, sans recharger. Rien ne change dans les données ; l'historique (050) n'en garde rien.
-- 2. Nouvelle notification (ligne « notifications » ajoutée, par le serveur ou par l'appli) : la fonction gsa-push est
--    appelée tout de suite (gsa_push_lancer, 047), une fois par écriture ; la planification toutes les 5 minutes reste
--    (échéances, retards, résumé de la semaine, et filet de sécurité). Un échec de l'appel n'empêche jamais l'écriture.
--    gsa-push (v12) ne fait qu'un passage à la fois : verrou `en_cours` dans gsa_push_reglages (repris après 3 minutes
--    s'il est resté posé) ; un appel pendant un passage lève `a_refaire`, et le passage recommence avant de rendre le
--    verrou. Ainsi deux appels proches n'envoient jamais deux fois la même notification.
-- Retour en arrière : drop trigger gsa_push_notifier et gsa_etiquette_renvoyer on public.gsa_items, puis les fonctions
-- du même nom ; les colonnes en_cours et a_refaire peuvent rester (gsa-push v11 les ignore).

-- ---------- 1. Étiquette : ses points renvoyés ----------
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
  -- Les discussions (écrites par le serveur seulement, 062) : relues de même.
  perform set_config('gsa.commentaires', 'oui', true);
  update public.gsa_items d set client_id = null
  where d.committee_id = new.committee_id and d.kind = 'discussions' and not d.deleted
    and d.id in (select t.id from public.gsa_items t
                 where t.committee_id = new.committee_id and t.kind = 'tasks'
                   and jsonb_typeof(t.data -> 'etiquettes') = 'array' and (t.data -> 'etiquettes') ? new.id);
  perform set_config('gsa.commentaires', coalesce(avant, ''), true);
  return null;
end $$;
revoke all on function public.gsa_etiquette_renvoyer() from public, anon, authenticated;

drop trigger if exists gsa_etiquette_renvoyer on public.gsa_items;
create trigger gsa_etiquette_renvoyer after insert or update on public.gsa_items
  for each row when (new.kind = 'etiquettes') execute function public.gsa_etiquette_renvoyer();

-- ---------- 2. Notifications : envoi tout de suite ----------
alter table public.gsa_push_reglages
  add column if not exists en_cours timestamptz,
  add column if not exists a_refaire boolean not null default false;

create or replace function public.gsa_push_notifier() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from nouvelles n where n.kind = 'notifications' and not n.deleted) then
    begin
      perform public.gsa_push_lancer();
    exception when others then
      raise warning 'gsa-push non appelée : %', sqlerrm;
    end;
  end if;
  return null;
end $$;
revoke all on function public.gsa_push_notifier() from public, anon, authenticated;

drop trigger if exists gsa_push_notifier on public.gsa_items;
create trigger gsa_push_notifier after insert on public.gsa_items
  referencing new table as nouvelles for each statement execute function public.gsa_push_notifier();
