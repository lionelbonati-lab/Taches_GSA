-- 069 : séries d'événements et assemblées générales protégées des applis pas à jour, comme les étiquettes (065).
--
-- Le 10.11.2026 à 22h08 puis le 12.11.2026 à 11h57, un appareil resté sur une version de l'appli d'avant le 03.11.2026
-- a effacé sur le serveur les trois séries d'événements du club (et, la seconde fois, les deux assemblées générales),
-- sans aucune action de sa part : cette version charge toutes les lignes de l'espace, ne connaît pas ces sortes de lignes
-- (ajoutées depuis), croit qu'elles ont disparu de ses données et demande à les effacer. Les étiquettes, protégées par
-- 065, n'ont rien eu. Le garde-fou de l'appli (cloud.ts, 10.11.2026) n'y peut rien : cet appareil n'a pas le nouveau code.
--
-- Garde (celle de 065, étendue) : une ligne « etiquettes », « seriesEvenements » ou « assemblees » n'est retirée par
-- l'appli que si la demande le dit (data.retiree = true, que l'appli envoie depuis cette version, cloud.ts) ; sinon la
-- demande est ignorée, sans erreur : rien n'est écrit, rien n'est effacé. Le serveur lui-même (SQL, fonctions sans compte
-- connecté) n'est pas concerné. Une ligne retirée peut être rétablie (data.retiree est enlevé à l'écriture).
-- Une sorte de ligne ajoutée plus tard : à ajouter ici et dans cloud.ts (RETRAIT_VOULU).
--
-- Remplace le déclencheur de 065 (même place parmi les déclencheurs « avant » : après gsa_items_contenu_garde, avant
-- gsa_items_guard). Rien d'autre ne change ; aucune donnée modifiée.
-- Retour en arrière : drop trigger gsa_items_effacement_garde on public.gsa_items;
--                     drop function public.gsa_items_effacement_garde();
--                     puis rejouer 065 (étiquettes seules).

create or replace function public.gsa_items_effacement_garde() returns trigger
language plpgsql set search_path = '' as $$
declare
  voulue boolean := coalesce(new.data ->> 'retiree', '') = 'true';
begin
  if new.kind not in ('etiquettes', 'seriesEvenements', 'assemblees') or auth.uid() is null then
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
revoke all on function public.gsa_items_effacement_garde() from public, anon, authenticated;

drop trigger if exists gsa_items_effacement_garde on public.gsa_items;
create trigger gsa_items_effacement_garde before insert or update on public.gsa_items
  for each row execute function public.gsa_items_effacement_garde();

-- Celui de 065 (étiquettes seules) : remplacé.
drop trigger if exists gsa_items_etiquettes_garde on public.gsa_items;
drop function if exists public.gsa_items_etiquettes_garde();
