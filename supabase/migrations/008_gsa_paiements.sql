-- Tâches GSA — 008 : tickets à rembourser (onglet « Paiements »).
-- Règles appliquées par le serveur (l'appli les applique aussi, mais on ne s'y fie pas) :
--   • valider (signer), refuser ou retirer une validation : droit « paiements.valider » ; la signature porte
--     le nom de la personne connectée ;
--   • un ticket validé ne change plus (montant, bénéficiaire, IBAN, justificatifs) sans un validateur ;
--   • marquer « payé » (OK de la caisse) ou l'annuler : droit « paiements.payer », au nom de la personne connectée ;
--   • un ticket validé ou payé n'est supprimé que par un validateur.
-- Les admins de l'entité ont tous les droits (comme dans l'appli).

-- Fiche (personne) de l'utilisateur connecté dans l'entité.
create or replace function public.gsa_ma_fiche(c uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.person_id from public.gsa_members m where m.committee_id = c and m.user_id = auth.uid() limit 1
$$;

-- L'utilisateur connecté a-t-il ce droit dans l'entité (par l'un des rôles de sa fiche active) ?
create or replace function public.gsa_a_droit(c uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.gsa_members m
    join public.gsa_items p on p.committee_id = m.committee_id and p.kind = 'people' and p.id = m.person_id and not p.deleted
    join public.gsa_items r on r.committee_id = m.committee_id and r.kind = 'roles' and not r.deleted
    where m.committee_id = c and m.user_id = auth.uid()
      and coalesce((p.data ->> 'actif')::boolean, true)
      and (p.data -> 'roles') ? r.id
      and (coalesce((r.data ->> 'locked')::boolean, false) or (r.data -> 'permissions') ? perm)
  )
$$;

-- o : tâche avant (null à la création), n : tâche après, supprime : la tâche est supprimée.
create or replace function public.gsa_paiement_check(c uuid, o jsonb, n jsonb, supprime boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  op jsonb = o -> 'paiement';
  np jsonb = n -> 'paiement';
  oe text = coalesce(op ->> 'etat', '');
  ne text = coalesce(np ->> 'etat', '');
  moi text = public.gsa_ma_fiche(c);
begin
  if op is null and np is null then
    return;
  end if;
  if supprime then
    if oe in ('valide', 'paye') and not public.gsa_a_droit(c, 'paiements.valider') then
      raise exception 'Un ticket validé ne peut être supprimé que par un validateur' using errcode = '42501';
    end if;
    return;
  end if;

  -- Validation : passage à « validé », signature changée, ou ticket validé dont le contenu change.
  if ne in ('valide', 'paye') and (
       oe not in ('valide', 'paye')
    or (op -> 'validation') is distinct from (np -> 'validation')
    or (op -> 'montant') is distinct from (np -> 'montant')
    or (op ->> 'beneficiaire') is distinct from (np ->> 'beneficiaire')
    or (op ->> 'iban') is distinct from (np ->> 'iban')
    or (o -> 'documents') is distinct from (n -> 'documents')) then
    if not public.gsa_a_droit(c, 'paiements.valider') then
      raise exception 'Seule une personne autorisée peut valider (signer) un ticket' using errcode = '42501';
    end if;
    if (oe not in ('valide', 'paye') or (op -> 'validation') is distinct from (np -> 'validation'))
       and (moi is null or (np -> 'validation' ->> 'par') is distinct from moi or coalesce(np -> 'validation' ->> 'signature', '') = '') then
      raise exception 'La validation doit porter la signature de la personne connectée' using errcode = '42501';
    end if;
  end if;

  -- Refus, ou retrait d'une validation.
  if (ne = 'refuse' and oe <> 'refuse') or (oe in ('valide', 'paye') and ne not in ('valide', 'paye')) then
    if not public.gsa_a_droit(c, 'paiements.valider') then
      raise exception 'Seule une personne autorisée peut refuser un ticket ou retirer une validation' using errcode = '42501';
    end if;
  end if;

  -- « Payé » (OK de la caisse), ou annulation de « payé ».
  if (ne = 'paye') <> (oe = 'paye') or (ne = 'paye' and (op -> 'paye') is distinct from (np -> 'paye')) then
    if not public.gsa_a_droit(c, 'paiements.payer') then
      raise exception 'Seule la caisse peut indiquer qu’un ticket est payé' using errcode = '42501';
    end if;
    if ne = 'paye' and (moi is null or (np -> 'paye' ->> 'par') is distinct from moi) then
      raise exception '« Payé » doit être indiqué au nom de la personne connectée' using errcode = '42501';
    end if;
  end if;
end $$;

-- Garde des données partagées (006) + contrôle des tickets.
create or replace function public.gsa_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_admin boolean;
  now_admin boolean;
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  if auth.uid() is null or public.gsa_is_admin(new.committee_id) then
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
