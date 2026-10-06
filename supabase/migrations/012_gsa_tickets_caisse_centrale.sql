-- Tâches GSA — 012 : tout membre du club peut envoyer un ticket à la caisse centrale.
-- Un membre d'une entité (sous-comité, groupe, équipe) qui ne fait pas partie du comité central dépose la
-- photo de son ticket dans le dossier du comité central (fichiers « tk-… » : il ne peut ni les remplacer, ni
-- les supprimer une fois le ticket envoyé), puis gsa_ticket_central crée le ticket chez la caisse centrale
-- (demandeur « externe » : entité, nom, compte). Il en suit l'état avec gsa_mes_tickets_centraux.
-- Le circuit reste celui de 009/010 : la caisse centrale fait viser un membre du comité central.

-- Nom de fichier déposable : « <comité central>/tk-… », par un membre du club.
-- (Paramètre qualifié : « name » désigne sinon la colonne du même nom de committees.)
create or replace function public.gsa_depot_ticket(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when gsa_depot_ticket.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/tk-[A-Za-z0-9_-]{4,60}$'
      then exists (select 1 from public.committees c where c.id = split_part(gsa_depot_ticket.name, '/', 1)::uuid and c.parent_id is null)
        and public.gsa_is_club_member(split_part(gsa_depot_ticket.name, '/', 1)::uuid)
    else false
  end
$$;

-- Ce fichier est-il un justificatif d'un ticket (même supprimé) ?
create or replace function public.gsa_fichier_de_ticket(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      then exists (select 1 from public.gsa_items t
        where t.committee_id = split_part(name, '/', 1)::uuid and t.kind = 'tasks'
          and t.data -> 'documents' @> jsonb_build_array(jsonb_build_object('id', name)))
    else false
  end
$$;

-- Dépôt (sans remplacement), relecture de ses propres dépôts, retrait tant qu'aucun ticket ne les utilise.
create policy gsa_fichiers_ticket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gsa-fichiers' and public.gsa_depot_ticket(name));
create policy gsa_fichiers_ticket_select on storage.objects for select to authenticated
  using (bucket_id = 'gsa-fichiers' and owner_id = (select auth.uid())::text and public.gsa_depot_ticket(name));
create policy gsa_fichiers_ticket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gsa-fichiers' and owner_id = (select auth.uid())::text and public.gsa_depot_ticket(name)
    and not public.gsa_fichier_de_ticket(name));

-- Envoi d'un ticket à la caisse centrale depuis une entité du club. Le contenu est contrôlé ici, pas repris tel quel.
create or replace function public.gsa_ticket_central(source uuid, ticket jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  central uuid;
  unite text;
  fiche jsonb;
  montant numeric;
  titre text := left(btrim(coalesce(ticket ->> 'titre', '')), 300);
  benef text := left(btrim(coalesce(ticket ->> 'beneficiaire', '')), 200);
  iban text := upper(regexp_replace(coalesce(ticket ->> 'iban', ''), '\s', '', 'g'));
  remarque text := left(coalesce(ticket ->> 'remarque', ''), 4000);
  docs jsonb := '[]'::jsonb;
  d jsonb;
  caisse jsonb;
  sec text;
  statut text;
  le text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  tid text := 'tk' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  select c.parent_id, c.name into central, unite from public.committees c where c.id = source;
  if central is null then
    raise exception 'Seules les entités du club envoient des tickets à la caisse centrale' using errcode = '22023';
  end if;
  if not public.gsa_is_member(source) then
    raise exception 'Réservé aux membres de l’entité' using errcode = '42501';
  end if;
  if public.gsa_is_member(central) then
    raise exception 'Membre du comité central : envoie le ticket depuis le comité central' using errcode = '22023';
  end if;

  select p.data into fiche
  from public.gsa_members m
  join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
  where m.committee_id = source and m.user_id = (select auth.uid());

  begin
    montant := round((ticket ->> 'montant')::numeric, 2);
  exception when others then
    montant := null;
  end;
  if titre = '' or benef = '' or montant is null or montant <= 0 or montant > 1000000 then
    raise exception 'Ticket incomplet : objet, montant et personne à rembourser' using errcode = '22023';
  end if;
  if iban <> '' and iban !~ '^[A-Z]{2}[0-9A-Z]{10,32}$' then
    raise exception 'IBAN invalide' using errcode = '22023';
  end if;

  for d in select * from jsonb_array_elements(case when jsonb_typeof(ticket -> 'documents') = 'array' then ticket -> 'documents' else '[]'::jsonb end) loop
    if coalesce(d ->> 'id', '') !~ ('^' || central::text || '/tk-[A-Za-z0-9_-]{4,60}$')
       or not exists (select 1 from storage.objects o
         where o.bucket_id = 'gsa-fichiers' and o.name = d ->> 'id' and o.owner_id = (select auth.uid())::text) then
      raise exception 'Justificatif introuvable : ajoute à nouveau la photo du ticket' using errcode = '22023';
    end if;
    docs := docs || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', d ->> 'id', 'nom', left(coalesce(nullif(btrim(d ->> 'nom'), ''), 'ticket'), 200), 'kind', 'fichier',
      'mime', left(d ->> 'mime', 100), 'taille', case when jsonb_typeof(d -> 'taille') = 'number' then d -> 'taille' end,
      'par', '', 'le', le)));
  end loop;
  if jsonb_array_length(docs) = 0 or jsonb_array_length(docs) > 10 then
    raise exception 'Ajoute la photo du ticket' using errcode = '22023';
  end if;

  -- Caissiers : rôle qui donne expressément le droit « Caisse » (hors admin).
  select jsonb_agg(p.id order by p.pos) into caisse
  from public.gsa_items p
  where p.committee_id = central and p.kind = 'people' and not p.deleted and coalesce((p.data ->> 'actif')::boolean, true)
    and exists (select 1 from public.gsa_items r
      where r.committee_id = central and r.kind = 'roles' and not r.deleted and (p.data -> 'roles') ? r.id
        and not coalesce((r.data ->> 'locked')::boolean, false) and (r.data -> 'permissions') ? 'paiements.payer');
  if caisse is null then
    raise exception 'La caisse centrale n’a pas encore de caissier' using errcode = '22023';
  end if;

  select s.id into sec from public.gsa_items s
  where s.committee_id = central and s.kind = 'sections' and not s.deleted
  order by (s.data ->> 'nom') ~* '(compta|financ|caisse|trésor|tresor)' desc, s.pos limit 1;
  select s.id into statut from public.gsa_items s
  where s.committee_id = central and s.kind = 'statuses' and not s.deleted and not coalesce((s.data ->> 'done')::boolean, false)
  order by s.pos limit 1;

  perform set_config('gsa.ticket_externe', tid, true);
  insert into public.gsa_items (committee_id, kind, id, pos, data)
  select central, 'tasks', tid, coalesce(min(i.pos), 0) - 1, jsonb_build_object(
    'id', tid, 'sectionId', coalesce(sec, ''), 'sousSection', 'Remboursements', 'titre', titre, 'responsables', caisse,
    'statusId', coalesce(statut, ''), 'delai', '', 'remarque', remarque, 'checklist', '[]'::jsonb, 'documents', docs,
    'createdBy', '', 'updatedAt', le,
    'paiement', jsonb_strip_nulls(jsonb_build_object(
      'montant', montant, 'beneficiaire', benef, 'iban', nullif(iban, ''), 'etat', 'recu', 'demandePar', '', 'demandeLe', le,
      'externe', jsonb_build_object(
        'uniteId', source, 'unite', unite,
        'par', coalesce(nullif(btrim(coalesce(fiche ->> 'prenom', '') || ' ' || coalesce(fiche ->> 'nom', '')), ''), 'Membre'),
        'email', lower(btrim(coalesce(fiche ->> 'email', ''))),
        'userId', (select auth.uid())::text))))
  from public.gsa_items i where i.committee_id = central and i.kind = 'tasks';
  perform set_config('gsa.ticket_externe', '', true);

  insert into public.gsa_items (committee_id, kind, id, pos, data)
  select central, 'log', 'l' || tid, coalesce(min(i.pos), 0) - 1, jsonb_build_object(
    'id', 'l' || tid, 'at', le, 'userId', '',
    'action', format('Ticket à rembourser de « %s » (%s) : « %s » (%s CHF)', unite,
      coalesce(nullif(btrim(coalesce(fiche ->> 'prenom', '') || ' ' || coalesce(fiche ->> 'nom', '')), ''), 'Membre'), titre, montant))
  from public.gsa_items i where i.committee_id = central and i.kind = 'log';

  return tid;
end $$;

-- Suivi, pour la personne connectée, des tickets qu'elle a envoyés à la caisse centrale.
create or replace function public.gsa_mes_tickets_centraux() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'titre', t.data ->> 'titre',
    'montant', t.data -> 'paiement' -> 'montant',
    'beneficiaire', t.data -> 'paiement' ->> 'beneficiaire',
    'etat', t.data -> 'paiement' ->> 'etat',
    'le', t.data -> 'paiement' ->> 'demandeLe',
    'unite', t.data -> 'paiement' -> 'externe' ->> 'unite',
    'caisse', c.name,
    'viseLe', t.data -> 'paiement' -> 'validation' ->> 'le',
    'payeLe', t.data -> 'paiement' -> 'paye' ->> 'le',
    'motif', t.data -> 'paiement' -> 'refus' ->> 'motif'
  ) order by t.data -> 'paiement' ->> 'demandeLe' desc), '[]'::jsonb)
  from public.gsa_items t
  join public.committees c on c.id = t.committee_id
  where t.kind = 'tasks' and not t.deleted and (select auth.uid()) is not null
    and t.data -> 'paiement' -> 'externe' ->> 'userId' = (select auth.uid())::text
$$;

grant execute on function public.gsa_depot_ticket(text) to authenticated;
grant execute on function public.gsa_fichier_de_ticket(text) to authenticated;
grant execute on function public.gsa_ticket_central(uuid, jsonb) to authenticated;
grant execute on function public.gsa_mes_tickets_centraux() to authenticated;

create or replace function public.gsa_paiement_check(c uuid, o jsonb, n jsonb, supprime boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  op jsonb = o -> 'paiement';
  np jsonb = n -> 'paiement';
  oe text = coalesce(op ->> 'etat', '');
  ne text = coalesce(np ->> 'etat', '');
  moi text = public.gsa_ma_fiche(c);
  caisse boolean = public.gsa_a_droit(c, 'paiements.payer');
  vise boolean = coalesce(op ->> 'etat', '') in ('valide', 'paye');
begin
  if op is null and np is null then
    return;
  end if;
  if supprime then
    if vise and not caisse then
      raise exception 'Un ticket visé ne peut être supprimé que par la caisse' using errcode = '42501';
    end if;
    return;
  end if;
  if np is null then
    if vise then
      raise exception 'Un ticket visé ne change plus' using errcode = '42501';
    end if;
    return;
  end if;

  -- Demandeur : soi-même à la création (la caisse peut saisir pour quelqu'un ; un membre d'une autre entité passe
  -- par gsa_ticket_central) ; il ne change plus ensuite.
  if op is null then
    if (n ->> 'id') is not null and current_setting('gsa.ticket_externe', true) is not distinct from (n ->> 'id') then
      null;
    elsif not caisse and (coalesce(np ->> 'demandePar', '') = '' or (np ->> 'demandePar') is distinct from moi or np ? 'externe') then
      raise exception 'Un ticket s’envoie à son propre nom' using errcode = '42501';
    end if;
  elsif (op ->> 'demandePar') is distinct from (np ->> 'demandePar') or (op -> 'externe') is distinct from (np -> 'externe') then
    raise exception 'Le demandeur d’un ticket ne change pas' using errcode = '42501';
  end if;

  -- Ticket visé : contenu figé (seuls l'état « payé » et sa remarque évoluent).
  if vise and ne in ('valide', 'paye') and (
       (op -> 'montant') is distinct from (np -> 'montant')
    or (op ->> 'beneficiaire') is distinct from (np ->> 'beneficiaire')
    or (op ->> 'iban') is distinct from (np ->> 'iban')
    or (op -> 'visa') is distinct from (np -> 'visa')
    or (op -> 'validation') is distinct from (np -> 'validation')
    or (o -> 'documents') is distinct from (n -> 'documents')) then
    raise exception 'Un ticket visé ne change plus' using errcode = '42501';
  end if;

  -- Demande de visa (ou changement de signataire) : la caisse, à un membre du comité autre que le demandeur.
  if ne = 'visa' and (oe <> 'visa' or (op -> 'visa') is distinct from (np -> 'visa')) then
    if not caisse then
      raise exception 'Seule la caisse demande un visa' using errcode = '42501';
    end if;
    if coalesce(np -> 'visa' ->> 'a', '') in ('', coalesce(np ->> 'demandePar', '')) then
      raise exception 'Le visa doit être demandé à une autre personne que le demandeur' using errcode = '42501';
    end if;
    if moi is null or (np -> 'visa' ->> 'par') is distinct from moi then
      raise exception 'La demande de visa se fait au nom de la personne connectée' using errcode = '42501';
    end if;
    if not public.gsa_fiche_au_comite(c, np -> 'visa' ->> 'a') then
      raise exception 'Le visa se demande à un membre du comité de l’entité' using errcode = '42501';
    end if;
  end if;

  -- Visa : la personne désignée par la caisse, jamais le demandeur, avec sa signature ; ticket inchangé.
  if ne in ('valide', 'paye') and not vise then
    if oe <> 'visa' then
      raise exception 'Un ticket doit passer par une demande de visa' using errcode = '42501';
    end if;
    if moi is null or moi is distinct from (op -> 'visa' ->> 'a') or (np -> 'visa') is distinct from (op -> 'visa') then
      raise exception 'Seule la personne désignée par la caisse peut viser ce ticket' using errcode = '42501';
    end if;
    if moi = (np ->> 'demandePar') or (np -> 'externe' ->> 'userId') = (select auth.uid())::text then
      raise exception 'On ne vise pas son propre ticket' using errcode = '42501';
    end if;
    if not public.gsa_fiche_au_comite(c, moi) then
      raise exception 'Seul un membre du comité de l’entité peut viser' using errcode = '42501';
    end if;
    if (np -> 'validation' ->> 'par') is distinct from moi or coalesce(np -> 'validation' ->> 'signature', '') = '' then
      raise exception 'Le visa doit porter la signature de la personne connectée' using errcode = '42501';
    end if;
    if (op -> 'montant') is distinct from (np -> 'montant')
       or (op ->> 'beneficiaire') is distinct from (np ->> 'beneficiaire')
       or (op ->> 'iban') is distinct from (np ->> 'iban') then
      raise exception 'Le ticket ne peut pas être modifié pendant le visa' using errcode = '42501';
    end if;
  end if;

  -- Refus : la caisse, ou la personne à qui le visa est demandé.
  if ne = 'refuse' and oe <> 'refuse' then
    if not (caisse or (oe = 'visa' and moi is not null and moi = (op -> 'visa' ->> 'a'))) then
      raise exception 'Seule la caisse ou la personne qui vise peut refuser un ticket' using errcode = '42501';
    end if;
  end if;

  -- Visa retiré : la caisse ou la personne qui a visé.
  if vise and ne not in ('valide', 'paye') then
    if not (caisse or (moi is not null and moi = (op -> 'validation' ->> 'par'))) then
      raise exception 'Seule la caisse ou la personne qui a visé peut retirer le visa' using errcode = '42501';
    end if;
  end if;

  -- « Payé » ou son annulation : la caisse, au nom de la personne connectée, sur un ticket visé.
  if (ne = 'paye') <> (oe = 'paye') or (ne = 'paye' and (op -> 'paye') is distinct from (np -> 'paye')) then
    if not caisse then
      raise exception 'Seule la caisse peut indiquer qu’un ticket est payé' using errcode = '42501';
    end if;
    if ne = 'paye' and (not vise or moi is null or (np -> 'paye' ->> 'par') is distinct from moi) then
      raise exception '« Payé » s’indique au nom de la personne connectée, sur un ticket visé' using errcode = '42501';
    end if;
  end if;
end $$;
