-- Tâches GSA — 048 : les fonctions du serveur ne sont plus appelables sans être connecté.
-- Par défaut, toute fonction créée dans le schéma public est exécutable par le rôle « anon » (clé publique de l'appli,
-- visible par tous) : un visiteur non connecté pouvait donc appeler les fonctions gsa_* en direct. Elles vérifient
-- elles-mêmes qui appelle (et ne répondent rien sans compte), mais rien ne justifie qu'elles soient ouvertes : l'appli
-- ne les appelle qu'une fois connectée, les règles d'accès (RLS, fichiers) qui les utilisent ne valent que pour
-- « authenticated », et les fonctions « gsa-acces », « gsa-agenda » et « gsa-push » passent par la clé de service ou le
-- rôle « authenticated ».
-- Ici : chaque fonction gsa_* encore exécutable par « anon » ne l'est plus (ni par « public ») ; « authenticated » et
-- « service_role » gardent le droit qu'ils avaient. Les fonctions qui ne sont pas gsa_* ne sont pas touchées.
-- Les migrations suivantes retirent ce droit elles-mêmes (comme 039, 046, 047…).
-- Aucune donnée modifiée. Retour en arrière : « grant execute on function public.<nom>(<arguments>) to anon; » pour la
-- fonction concernée.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as fonction
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'gsa\_%'
      and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.fonction);
    execute format('revoke execute on function %s from public, anon', f.fonction);
  end loop;
end
$$;

-- Contrôle : plus aucune fonction gsa_* exécutable sans être connecté.
do $$
declare
  reste text;
begin
  select string_agg(p.proname, ', ') into reste
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'gsa\_%' and has_function_privilege('anon', p.oid, 'execute');
  if reste is not null then
    raise exception 'Fonctions encore ouvertes sans connexion : %', reste;
  end if;
end
$$;
