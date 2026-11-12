-- 070 : une modification partie d'une version dépassée est refusée (deux personnes sur le même élément).
--
-- Jusqu'ici, chaque élément (sondage, séance, point…) était envoyé en entier et le serveur gardait la dernière version
-- reçue : deux votes à moins d'une seconde d'écart, ou un appareil revenu en ligne avec une version ancienne, effaçaient
-- sans message ce que les autres avaient fait entre-temps sur cet élément (tous leurs votes, par exemple).
--
-- L'appli (cloud.ts, depuis cette version) joint à chaque modification la version du serveur dont elle part
-- (data.versionDe = updated_at de la ligne qu'elle connaissait). Si la ligne a changé depuis, la modification est refusée
-- (code P0409) ; l'appli relit alors la version du serveur, y fusionne ses propres changements et renvoie le tout.
-- Le contrôle se fait à la mise à jour, ligne verrouillée : deux envois simultanés ne passent pas tous les deux.
--
-- Sans data.versionDe (applis pas encore à jour, fonctions du serveur, nouvel élément), rien ne change. La marque n'est
-- jamais enregistrée. Premier déclencheur « avant » (ordre alphabétique : gsa_items_a…), pour que les suivants ne la
-- voient pas à la mise à jour. Aucune donnée modifiée.
-- Retour en arrière : drop trigger gsa_items_a_version_garde on public.gsa_items;
--                     drop function public.gsa_items_version_garde();

create or replace function public.gsa_items_version_garde() returns trigger
language plpgsql set search_path = '' as $$
declare
  base timestamptz;
begin
  if jsonb_typeof(new.data) is distinct from 'object' or not (new.data ? 'versionDe') then
    return new;
  end if;
  begin
    base := (new.data ->> 'versionDe')::timestamptz;
  exception when others then
    base := null;
  end;
  if tg_op = 'INSERT' then
    -- Un « upsert » passe d'abord ici : si la ligne existe déjà, le contrôle se fait à la mise à jour qui suit (la marque
    -- y est retirée) ; sinon c'est une vraie création, la marque est retirée tout de suite.
    if base is not null and exists (
      select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = new.kind and i.id = new.id
    ) then
      return new;
    end if;
    new.data := new.data - 'versionDe';
    return new;
  end if;
  new.data := new.data - 'versionDe';
  if base is not null and (old.deleted or old.updated_at is distinct from base) then
    raise exception 'Élément modifié entre-temps par quelqu''un d''autre' using errcode = 'P0409';
  end if;
  return new;
end $$;
revoke all on function public.gsa_items_version_garde() from public, anon, authenticated;

drop trigger if exists gsa_items_a_version_garde on public.gsa_items;
create trigger gsa_items_a_version_garde before insert or update on public.gsa_items
  for each row execute function public.gsa_items_version_garde();
