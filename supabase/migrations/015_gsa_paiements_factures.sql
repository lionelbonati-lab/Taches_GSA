-- Tâches GSA — 015 : remboursements et paiements de factures.
-- Les demandes de paiement passent dans les tâches (plus d'onglet Paiements). Deux genres :
--   • remboursement (par défaut) : une personne a avancé l'argent, photo de son ticket ;
--   • facture (« paiement ») : payée directement à qui l'a envoyée ; échéance facultative (délai de la tâche).
-- gsa_ticket_central accepte « type » = 'facture' et « delai » (sous-section « Paiements ») ; gsa_mes_tickets_centraux
-- renvoie le type. Remplacement des deux fonctions de 012 (même signature, mêmes contrôles), rien d'autre ne change.

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
  facture boolean := coalesce(ticket ->> 'type', '') = 'facture';
  echeance text := case when coalesce(ticket ->> 'type', '') = 'facture' and coalesce(ticket ->> 'delai', '') ~ '^\d{4}-\d{2}-\d{2}$'
    then ticket ->> 'delai' else '' end;
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
    raise exception 'Demande incomplète : objet, montant et %', case when facture then 'à qui payer la facture' else 'personne à rembourser' end
      using errcode = '22023';
  end if;
  if echeance <> '' then
    begin
      perform echeance::date;
    exception when others then
      echeance := '';
    end;
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
    raise exception '%', case when facture then 'Ajoute la facture' else 'Ajoute la photo du ticket' end using errcode = '22023';
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
    'id', tid, 'sectionId', coalesce(sec, ''), 'sousSection', case when facture then 'Paiements' else 'Remboursements' end, 'titre', titre, 'responsables', caisse,
    'statusId', coalesce(statut, ''), 'delai', echeance, 'remarque', remarque, 'checklist', '[]'::jsonb, 'documents', docs,
    'createdBy', '', 'updatedAt', le,
    'paiement', jsonb_strip_nulls(jsonb_build_object(
      'type', case when facture then 'facture' end,
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
    'action', format('%s demandé par « %s » (%s) : « %s » (%s CHF)', case when facture then 'Paiement de facture' else 'Remboursement' end, unite,
      coalesce(nullif(btrim(coalesce(fiche ->> 'prenom', '') || ' ' || coalesce(fiche ->> 'nom', '')), ''), 'Membre'), titre, montant))
  from public.gsa_items i where i.committee_id = central and i.kind = 'log';

  return tid;
end $$;

-- Suivi, pour la personne connectée, des tickets qu'elle a envoyés à la caisse centrale.
create or replace function public.gsa_mes_tickets_centraux() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'type', t.data -> 'paiement' ->> 'type',
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

grant execute on function public.gsa_ticket_central(uuid, jsonb) to authenticated;
grant execute on function public.gsa_mes_tickets_centraux() to authenticated;
