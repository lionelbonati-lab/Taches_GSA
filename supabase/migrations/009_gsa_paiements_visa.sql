-- Tâches GSA — 009 : circuit des tickets « photo → caisse → demande de visa → visa → paiement ».
-- Remplace le contrôle de 008. Règles appliquées par le serveur, admins compris (séparation des rôles) :
--   • un ticket est envoyé à son propre nom (sauf par la caisse) et son demandeur ne change plus ;
--   • la caisse (« paiements.payer ») demande le visa, à une autre personne que le demandeur ;
--   • seule la personne désignée par la caisse vise (signe), jamais le demandeur, à son propre nom ;
--   • un ticket visé ne change plus (montant, bénéficiaire, IBAN, justificatifs, visa) ;
--   • refus : la caisse, ou la personne à qui le visa est demandé ; visa retiré : la caisse ou la personne qui a visé ;
--   • « payé » (ou son annulation) : la caisse, au nom de la personne connectée, sur un ticket visé ;
--   • un ticket visé ou payé n'est supprimé que par la caisse.

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

  -- Demande de visa (ou changement de signataire) : la caisse, à une autre personne que le demandeur.
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

-- Garde des données partagées : le contrôle des tickets s'applique aussi aux admins.
create or replace function public.gsa_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_admin boolean;
  now_admin boolean;
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  if auth.uid() is null then
    return new;
  end if;
  -- Un upsert passe d'abord par l'insertion : si l'élément existe déjà, le contrôle se fait à la mise à jour.
  if new.kind = 'tasks' and (tg_op = 'UPDATE' or not exists (select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = new.kind and i.id = new.id)) then
    perform public.gsa_paiement_check(
      new.committee_id,
      case when tg_op = 'UPDATE' and not old.deleted then old.data end,
      new.data,
      tg_op = 'UPDATE' and new.deleted and not old.deleted);
  end if;
  if public.gsa_is_admin(new.committee_id) then
    return new;
  end if;
  if not public.gsa_is_member(new.committee_id) then
    -- Membre du comité central (les règles d'accès ont déjà limité ce qu'il peut écrire).
    if new.kind = 'tasks' and new.deleted and (tg_op = 'INSERT' or not old.deleted) then
      raise exception 'Le comité central ne supprime pas les tâches d’une entité' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.kind = 'roles' then
    raise exception 'Seul un administrateur peut modifier les rôles' using errcode = '42501';
  end if;
  if new.kind = 'people' then
    now_admin = coalesce((new.data -> 'roles') @> '["admin"]'::jsonb, false);
    if tg_op = 'INSERT' then
      -- Un upsert passe d'abord ici : si la fiche existe déjà, le contrôle se fait à la mise à jour.
      if now_admin and not exists (select 1 from public.gsa_items i where i.committee_id = new.committee_id and i.kind = new.kind and i.id = new.id) then
        raise exception 'Seul un administrateur peut donner le rôle Admin' using errcode = '42501';
      end if;
    else
      was_admin = coalesce((old.data -> 'roles') @> '["admin"]'::jsonb, false);
      if was_admin is distinct from now_admin
         or (was_admin and (new.deleted is distinct from old.deleted or (new.data ->> 'actif') is distinct from (old.data ->> 'actif'))) then
        raise exception 'Seul un administrateur peut modifier un compte administrateur' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
