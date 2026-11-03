-- 065 : étiquettes protégées des applis pas à jour.
--
-- Le 03.11.2026, une appli restée ouverte sur une version d'avant les étiquettes (avant le 02.11.2026) a supprimé toutes
-- les étiquettes du club, deux fois (20:13 et 20:56). Elle charge toutes les lignes de l'espace, ne connaît pas les
-- lignes « etiquettes », croit qu'elles ont disparu de ses données et demande à les effacer, dès qu'elle envoie quelque
-- chose (même sans rien modifier). Les points gardaient leurs étiquettes ; leurs membres ne les voyaient plus.
--
-- Garde : une étiquette n'est retirée par l'appli que si la demande le dit (data.retiree = true, que l'appli envoie
-- depuis cette version, cloud.ts) ; sinon la demande est ignorée, sans erreur : rien n'est écrit, rien n'est effacé
-- (comme les discussions envoyées par l'appli, 062). Le serveur lui-même (SQL, fonctions sans compte connecté) n'est pas
-- concerné. Une étiquette retirée peut être rétablie (data.retiree est enlevé à l'écriture).
--
-- Rien d'autre ne change ; aucune donnée modifiée.
-- Retour en arrière : drop trigger gsa_items_etiquettes_garde on public.gsa_items;
--                     drop function public.gsa_items_etiquettes_garde();

create or replace function public.gsa_items_etiquettes_garde() returns trigger
language plpgsql set search_path = '' as $$
declare
  voulue boolean := coalesce(new.data ->> 'retiree', '') = 'true';
begin
  if new.kind is distinct from 'etiquettes' or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Un « upsert » passe d'abord ici : une suppression non voulue est ignorée tout de suite (pas de mise à jour ensuite).
    -- Voulue : la marque reste jusqu'à la mise à jour, qui la retire.
    return case when new.deleted and not voulue then null else new end;
  end if;
  if new.deleted and not old.deleted and not voulue then
    return null;
  end if;
  if voulue or not new.deleted then
    new.data := new.data - 'retiree';
  end if;
  return new;
end $$;
revoke all on function public.gsa_items_etiquettes_garde() from public, anon, authenticated;

drop trigger if exists gsa_items_etiquettes_garde on public.gsa_items;
create trigger gsa_items_etiquettes_garde before insert or update on public.gsa_items
  for each row execute function public.gsa_items_etiquettes_garde();
