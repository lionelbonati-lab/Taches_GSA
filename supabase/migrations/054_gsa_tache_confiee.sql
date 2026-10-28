-- Tâches GSA — 054 : une tâche confiée à une personne d'une autre entité, sans la partager avec son entité.
--
-- Ce sont les tâches qui font partie des entités, pas les personnes. Une personne voit les tâches des entités où elle a
-- accès ; une tâche peut en plus lui être confiée, à elle seule, depuis une autre entité du club : elle est alors dans
-- respPartage (sa fiche dans son entité), sans que son entité soit dans partage. Elle la voit et la modifie comme une
-- tâche partagée (liste, modification, « à prendre », discussion, historique, fichiers joints), depuis n'importe laquelle
-- de ses entités (même personne : même fiche du registre « Membres du club » ou même email). Les autres personnes de son
-- entité, ses admins compris, ne la voient pas.
-- • gsa_tache_dans (030) est renommée gsa_tache_dans_entite, sans changement : la tâche partagée avec l'entité en entier
--   (partage, dépendance). La nouvelle gsa_tache_dans rend aussi « modifiable » une tâche confiée à quelqu'un d'une autre
--   entité (respPartage non vide) ; la personne est vérifiée par gsa_partagee_lisible, que les fonctions qui s'en servent
--   appellent aussi (gsa_taches_partagees, gsa_modifier_tache_partagee, gsa_commenter, gsa_historique_tache,
--   gsa_fichier_partage_lisible ; gsa_repondre_partagee vérifie, elle, que la tâche est proposée à la personne).
-- • gsa_partagee_lisible (040) est renommée gsa_partagee_lisible_entite, sans changement. La nouvelle : tâche partagée
--   avec l'entité en entier → comme avant ; sinon, seulement la personne à qui elle est confiée.
-- Ajout pur : deux fonctions renommées, deux nouvelles ; aucune donnée modifiée.
-- Pour revenir en arrière :
--   drop function public.gsa_tache_dans(jsonb, boolean, text, uuid, text, jsonb, uuid);
--   alter function public.gsa_tache_dans_entite(jsonb, boolean, text, uuid, text, jsonb, uuid) rename to gsa_tache_dans;
--   drop function public.gsa_partagee_lisible(uuid, uuid, jsonb);
--   alter function public.gsa_partagee_lisible_entite(uuid, uuid, jsonb) rename to gsa_partagee_lisible;

alter function public.gsa_tache_dans(jsonb, boolean, text, uuid, text, jsonb, uuid) rename to gsa_tache_dans_entite;
alter function public.gsa_partagee_lisible(uuid, uuid, jsonb) rename to gsa_partagee_lisible_entite;

create or replace function public.gsa_tache_dans(h jsonb, depend boolean, reglage text, club uuid, tid text, t jsonb, unite uuid) returns text
language plpgsql immutable set search_path = '' as $$
begin
  return coalesce(
    public.gsa_tache_dans_entite(h, depend, reglage, club, tid, t, unite),
    case when not (t ? 'paiement') and jsonb_typeof(t -> 'respPartage') = 'object' and exists (
           select 1 from jsonb_each(t -> 'respPartage') e(k, l)
           where jsonb_typeof(e.l) = 'array' and jsonb_array_length(e.l) > 0)
         then 'modifiable' end);
end $$;
revoke all on function public.gsa_tache_dans(jsonb, boolean, text, uuid, text, jsonb, uuid) from public, anon, authenticated;

create or replace function public.gsa_partagee_lisible(unite uuid, source uuid, t jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  src public.committees;
  moi text;
  ma jsonb;
begin
  select * into src from public.committees x where x.id = source;
  if src.id is null then
    return false;
  end if;
  if public.gsa_tache_dans_entite(src.info -> 'historiqueDependance', coalesce(public.gsa_dependance(src.id) = unite, false),
       public.gsa_reglage_taches(src.id), src.parent_id, t ->> 'id', t, unite) is not null then
    return public.gsa_partagee_lisible_entite(unite, source, t);
  end if;
  -- Pas partagée avec l'entité : seulement la personne à qui elle est confiée (sa fiche ici, ou la même personne ailleurs).
  moi := public.gsa_ma_fiche(unite);
  if moi is null or t ? 'paiement' or jsonb_typeof(t -> 'respPartage') is distinct from 'object' then
    return false;
  end if;
  select p.data into ma from public.gsa_items p where p.committee_id = unite and p.kind = 'people' and p.id = moi and not p.deleted;
  return exists (
    select 1
    from (
      select case when e.k ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then e.k::uuid end as entite, r.v as fid
      from jsonb_each(t -> 'respPartage') e(k, l)
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.l) = 'array' then e.l else '[]'::jsonb end) r(v)
    ) x
    join public.gsa_items p on p.committee_id = x.entite and p.kind = 'people' and p.id = x.fid and not p.deleted
    where (x.entite = unite and x.fid = moi)
       or (coalesce(ma ->> 'membreId', '') <> '' and p.data ->> 'membreId' = ma ->> 'membreId')
       or (btrim(coalesce(ma ->> 'email', '')) <> '' and lower(btrim(p.data ->> 'email')) = lower(btrim(ma ->> 'email')))
  );
end $$;
revoke all on function public.gsa_partagee_lisible(uuid, uuid, jsonb) from public, anon, authenticated;
