#!/bin/bash
# Vérifie la migration 064 sur la base de test, après discussion_verif.sh (063) : points d'une étiquette renvoyés quand ses
# membres changent ; gsa-push appelée à chaque écriture qui ajoute une notification. Affiche « Tout est bon ».
P=${P:-/var/lib/postgresql/gsatest}
D=$(cd "$(dirname "$0")" && pwd)
C="'00000000-0000-0000-0000-0000000000c0'"
echecs=0
en() { "$D/en.sh" "$1" "$2" | grep -v '^{"sub"' | grep -v '^CONTEXT' | tail -1; }
sql() { psql -h $P -p 5433 -U postgres -d gsa -Atc "$1"; }
attendu() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "ÉCHEC $1 : « $2 » au lieu de « $3 »"; echecs=$((echecs + 1)); fi; }

# Appels de gsa-push notés (pg_net simulé) ; un appareil inscrit (sinon gsa_push_lancer n'appelle rien).
sql "create table if not exists net.appels (id serial, corps jsonb, le timestamptz default clock_timestamp());
     create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 1000)
       returns bigint language sql as \$\$ insert into net.appels (corps) values (body) returning id::bigint \$\$;
     truncate net.appels;
     insert into public.gsa_push_abonnements (endpoint, user_id, p256dh, auth) values ('https://essai.example/1', '00000000-0000-0000-0000-0000000000a1', repeat('x', 87), repeat('y', 22)) on conflict do nothing;" >/dev/null
appels() { sql "select count(*) from net.appels"; }

# ---------- Étiquette ----------
sql "select set_config('gsa.commentaires', 'oui', false); update gsa_items set client_id = 'appli-x' where kind in ('tasks', 'discussions')" >/dev/null
histo=$(sql "select count(*) from gsa_historique")
avant=$(sql "select md5(string_agg(kind || id || data::text, '' order by kind, id)) from gsa_items where kind in ('tasks', 'discussions')")
en a1 "update gsa_items set data = jsonb_set(data, '{nom}', '\"Course 2027\"') where kind = 'etiquettes' and id = 'et1';" >/dev/null
attendu "nom changé : rien n'est renvoyé" "$(sql "select count(*) from gsa_items where kind in ('tasks', 'discussions') and client_id is null")" "0"
en a1 "update gsa_items set data = jsonb_set(data, '{membres}', '[\"p3\", \"p6\"]') where kind = 'etiquettes' and id = 'et1';" >/dev/null
attendu "membres changés : le point t1 et sa discussion renvoyés" "$(sql "select string_agg(kind || ':' || id, ' ' order by kind, id) from gsa_items where kind in ('tasks', 'discussions') and client_id is null")" "discussions:t1 tasks:t1"
attendu "rien n'a changé dans les données" "$(sql "select md5(string_agg(kind || id || data::text, '' order by kind, id)) from gsa_items where kind in ('tasks', 'discussions')")" "$avant"
attendu "aucune ligne d'historique" "$(sql "select count(*) from gsa_historique")" "$histo"
attendu "Sam, nouveau membre, lit t1 et sa discussion" "$(en a6 "select count(*) from gsa_items where id = 't1' and kind in ('tasks', 'discussions');")" "2"
attendu "les discussions restent écrites par le serveur seul" "$(en a3 "insert into gsa_items (committee_id, kind, id, pos, data) values ($C, 'discussions', 't1', 0, '{}') on conflict (committee_id, kind, id) do update set data = excluded.data;" >/dev/null; sql "select data ? 'commentaires' from gsa_items where kind = 'discussions' and id = 't1'")" "t"

# ---------- Notifications ----------
sql "truncate net.appels" >/dev/null
en a3 "select public.gsa_commenter($C, 't1', $C, 'Message instantané') is not null;" >/dev/null
attendu "un message (notifications ajoutées) : gsa-push appelée une fois" "$(appels)" "1"
attendu "appel « tourner »" "$(sql "select corps ->> 'action' from net.appels order by id desc limit 1")" "tourner"
en a1 "insert into gsa_items (committee_id, kind, id, pos, data) values ($C, 'notifications', 'n-essai', 0, '{\"id\": \"n-essai\", \"userId\": \"p3\", \"type\": \"assign\", \"taskId\": \"t2\", \"by\": \"p1\", \"at\": \"2026-11-03T12:00:00Z\"}') on conflict (committee_id, kind, id) do update set data = excluded.data;" >/dev/null
attendu "une notification écrite par l'appli : appelée" "$(appels)" "2"
en a1 "insert into gsa_items (committee_id, kind, id, pos, data) values ($C, 'notifications', 'n-essai', 0, '{\"id\": \"n-essai\", \"userId\": \"p3\", \"type\": \"assign\", \"taskId\": \"t2\", \"by\": \"p1\", \"at\": \"2026-11-03T12:01:00Z\"}') on conflict (committee_id, kind, id) do update set data = excluded.data;" >/dev/null
attendu "la même réécrite : pas d'appel" "$(appels)" "2"
en a1 "update gsa_items set data = jsonb_set(data, '{titre}', '\"Point ordinaire (bis)\"') where kind = 'tasks' and id = 't2';" >/dev/null
attendu "un point modifié sans notification : pas d'appel" "$(appels)" "2"
sql "delete from public.gsa_push_abonnements" >/dev/null
en a3 "select public.gsa_commenter($C, 't1', $C, 'Sans appareil inscrit') is not null;" >/dev/null
attendu "aucun appareil inscrit : pas d'appel" "$(appels)" "2"
sql "create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 1000) returns bigint language plpgsql as \$\$ begin raise exception 'réseau en panne'; end \$\$;
     insert into public.gsa_push_abonnements (endpoint, user_id, p256dh, auth) values ('https://essai.example/1', '00000000-0000-0000-0000-0000000000a1', repeat('x', 87), repeat('y', 22)) on conflict do nothing;" >/dev/null
attendu "appel impossible : le message est quand même écrit" "$(en a3 "select jsonb_array_length(public.gsa_commenter($C, 't1', $C, 'Malgré la panne') -> 'commentaires') > 0;")" "t"
sql "create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 1000) returns bigint language sql as \$\$ select 1::bigint \$\$;
     delete from public.gsa_push_abonnements;" >/dev/null
attendu "verrou de gsa-push : colonnes présentes" "$(sql "select en_cours is null and not a_refaire from gsa_push_reglages where id = 1")" "t"

[ $echecs -eq 0 ] && echo "Tout est bon" || { echo "$echecs échec(s)"; exit 1; }
