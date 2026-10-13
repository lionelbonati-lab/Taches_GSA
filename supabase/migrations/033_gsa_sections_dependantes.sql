-- Tâches GSA — 033 : attribuer une tâche du comité à une entité qui dépend de lui, dans l'une de ses sections.
--
-- Dans le formulaire d'une tâche, sous la section qui porte le nom d'une entité qui dépend du comité (« Dépend de » :
-- gsa_dependance, 030), par exemple « École de cyclisme », la sous-section propose les sections de cette entité. L'appli
-- partage alors la tâche avec elle (règle habituelle, 019 et 030) et la range dans la section choisie chez elle
-- (placePartage de la tâche).
-- Pour cela, les membres du comité lisent le nom des sections des entités qui dépendent de lui : identifiant et nom
-- seulement (ni sous-sections, ni tâches).
-- Ajout pur : une nouvelle fonction, en lecture seule ; rien d'autre ne change.

create or replace function public.gsa_sections_dependantes(unite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.gsa_is_member(unite) then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('uniteId', c.id, 'sections', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nom', coalesce(s.data ->> 'nom', '')) order by s.pos), '[]'::jsonb)
      from public.gsa_items s
      where s.committee_id = c.id and s.kind = 'sections' and not s.deleted
    )) order by c.name), '[]'::jsonb)
    from public.committees c
    where c.id <> unite and c.parent_id is not null
      and not coalesce((c.info ->> 'archive')::boolean, false)
      and public.gsa_dependance(c.id) = unite
  );
end $$;

grant execute on function public.gsa_sections_dependantes(uuid) to authenticated;
