-- Tâches GSA – logo du club et des entités (appliqué le 05.10.2026).
--
-- Le logo est gardé dans la fiche de l'entité (committees.info.logo) : une image réduite par l'appli
-- (256 px au plus), en data URL PNG, JPEG ou WebP. Comme la couleur ou la description, il est modifiable
-- par les admins de l'entité et ceux du comité central, et visible dans l'organigramme du club.
-- Le serveur refuse ce qui n'est pas une telle image, ou une image de plus de 200 Ko.
--
-- Ajout pur : seule la fonction du déclencheur gsa_committees_guard est remplacée (même règles que 006, plus le logo).

create or replace function public.gsa_committees_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.info ->> 'central', 'aucun') not in ('aucun', 'lecture', 'ecriture') then
    raise exception 'Accès du comité central inconnu : %', new.info ->> 'central' using errcode = '22023';
  end if;
  if new.info ? 'logo' and (
       jsonb_typeof(new.info -> 'logo') <> 'string'
       or length(new.info ->> 'logo') > 200000
       or (new.info ->> 'logo') !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then
    raise exception 'Logo refusé : image PNG, JPEG ou WebP de 200 Ko au plus' using errcode = '22023';
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if (new.info -> 'central') is distinct from (old.info -> 'central') and not public.gsa_is_admin(old.id) then
    new.info = case when old.info ? 'central' then new.info || jsonb_build_object('central', old.info -> 'central') else new.info - 'central' end;
  end if;
  if public.gsa_is_admin(old.parent_id) then
    return new;
  end if;
  if new.type is distinct from old.type
     or coalesce(new.info -> 'archive', 'false'::jsonb) is distinct from coalesce(old.info -> 'archive', 'false'::jsonb) then
    raise exception 'Seul le comité central change le type d’une entité ou l’archive' using errcode = '42501';
  end if;
  return new;
end $$;
