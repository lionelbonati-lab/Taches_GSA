-- Tâches GSA — 010 : une caisse par entité (comité central, sous-comités, groupes, équipes).
-- Le ticket est envoyé à la caisse d'une entité (il est enregistré dans ses données) ; la caisse de
-- chaque entité ne fait viser que les membres de son propre comité (rôle avec l'onglet Comité ou le
-- droit de viser, ou admin de l'entité). Le reste du circuit de 009 est inchangé.

-- Cette fiche de l'entité est-elle membre de son comité ? (réservé aux membres de l'entité)
create or replace function public.gsa_fiche_au_comite(c uuid, fiche text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gsa_is_member(c) and exists (
    select 1
    from public.gsa_items p
    join public.gsa_items r on r.committee_id = p.committee_id and r.kind = 'roles' and not r.deleted
    where p.committee_id = c and p.kind = 'people' and p.id = fiche and not p.deleted
      and coalesce((p.data ->> 'actif')::boolean, true)
      and (p.data -> 'roles') ? r.id
      and (coalesce((r.data ->> 'locked')::boolean, false)
        or (r.data -> 'permissions') ? 'tab.meetings'
        or (r.data -> 'permissions') ? 'paiements.valider')
  )
$$;

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

  -- Demandeur : soi-même à la création (la caisse peut saisir pour quelqu'un) ; il ne change plus ensuite.
  if op is null then
    if (np ->> 'demandePar') is distinct from moi and not caisse then
      raise exception 'Un ticket s’envoie à son propre nom' using errcode = '42501';
    end if;
  elsif (op ->> 'demandePar') is distinct from (np ->> 'demandePar') then
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
    if moi = (np ->> 'demandePar') then
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
