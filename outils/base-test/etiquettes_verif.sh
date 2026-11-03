#!/bin/bash
# Vérifie la migration 062 sur la base de test (après etiquettes_donnees.sql puis 062) : qui lit les tâches, les
# discussions et les notifications de messages ; qui écrit ; ce que l'appli ne peut pas écrire. Affiche « Tout est bon ».
P=${P:-/var/lib/postgresql/gsatest}
D=$(cd "$(dirname "$0")" && pwd)
C="'00000000-0000-0000-0000-0000000000c0'"
echecs=0
en() { "$D/en.sh" "$1" "$2" | grep -v '^{"sub"' | grep -v '^CONTEXT' | tail -1; }
sql() { psql -h $P -p 5433 -U postgres -d gsa -Atc "$1"; }
attendu() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "ÉCHEC $1 : « $2 » au lieu de « $3 »"; echecs=$((echecs + 1)); fi; }
VU="select string_agg(kind || ':' || id || case when data ? 'commentaires' then '+msg' else '' end, ' ' order by kind, id) from public.gsa_items where committee_id = $C and kind in ('tasks', 'discussions') and not deleted;"

attendu "reprise : messages sortis des tâches" "$(sql "select count(*) from gsa_items where kind = 'tasks' and data ? 'commentaires'")" "0"
attendu "reprise : discussions" "$(sql "select string_agg(id, ' ' order by id) from gsa_items where kind = 'discussions'")" "t1 t2"
attendu "Ada (admin, hors étiquette) : t1 sans sa discussion" "$(en a1 "$VU")" "discussions:t2+msg tasks:t1 tasks:t2 tasks:t3"
attendu "Eve (membre de l'étiquette) : voit t1 et sa discussion" "$(en a3 "$VU")" "discussions:t1+msg discussions:t2+msg tasks:t1 tasks:t2"
attendu "Pia (responsable de t1, hors étiquette) : pas sa discussion" "$(en a5 "$VU")" "tasks:t1"
attendu "Sam (voir toutes) : pas la discussion de t1" "$(en a6 "$VU")" "discussions:t2+msg tasks:t1 tasks:t2 tasks:t3"

attendu "Ada ne peut pas écrire sur t1" "$(en a1 "select public.gsa_commenter($C, 't1', $C, 'Coucou');")" "ERROR:  Discussion réservée aux membres de l’étiquette"
attendu "Pia ne peut pas écrire sur t1" "$(en a5 "select public.gsa_commenter($C, 't1', $C, 'Coucou');")" "ERROR:  Discussion réservée aux membres de l’étiquette"
attendu "Eve écrit sur t1" "$(en a3 "select jsonb_array_length(public.gsa_commenter($C, 't1', $C, 'Réponse') -> 'commentaires');")" "2"
attendu "Eve ne corrige pas le message d'Ada" "$(en a3 "select public.gsa_commenter($C, 't1', $C, 'modifié', 'c1');")" "ERROR:  Ce commentaire n’est pas le tien"
attendu "personne n'est prévenu hors étiquette" "$(sql "select count(*) from gsa_items where kind = 'notifications' and data ->> 'taskId' = 't1'")" "0"
sql "update gsa_items set data = jsonb_set(data, '{membres}', '[\"p3\", \"p7\"]') where kind = 'etiquettes' and id = 'et1'" >/dev/null
en a3 "select public.gsa_commenter($C, 't1', $C, 'Pia, tu vois ?');" >/dev/null
attendu "Pia ajoutée à l'étiquette : prévenue (Ada non)" "$(sql "select string_agg(data ->> 'userId', ',') from gsa_items where kind = 'notifications' and data ->> 'taskId' = 't1'")" "p7"
attendu "Ada (admin) ne lit pas cette notification" "$(en a1 "select count(*) from gsa_items where kind = 'notifications' and data ->> 'taskId' = 't1';")" "0"
attendu "Pia la lit" "$(en a5 "select count(*) from gsa_items where kind = 'notifications' and data ->> 'taskId' = 't1';")" "1"
en a6 "select public.gsa_commenter($C, 't2', $C, 'Point ordinaire');" >/dev/null
attendu "t2 (sans étiquette) : responsable et auteur prévenus" "$(sql "select string_agg(data ->> 'userId', ',' order by data ->> 'userId') from gsa_items where kind = 'notifications' and data ->> 'taskId' = 't2'")" "p1,p3"
attendu "Ada (admin) lit les notifications de t2" "$(en a1 "select count(*) from gsa_items where kind = 'notifications' and data ->> 'taskId' = 't2';")" "2"

avant=$(sql "select md5(data::text) from gsa_items where kind = 'discussions' and id = 't1'")
en a3 "insert into gsa_items (committee_id, kind, id, pos, data) values ($C, 'discussions', 't1', 0, '{\"tache\": \"t1\", \"commentaires\": []}') on conflict (committee_id, kind, id) do update set data = excluded.data;" >/dev/null
en a1 "insert into gsa_items (committee_id, kind, id, pos, data, deleted) values ($C, 'discussions', 't2', 0, '{}', true) on conflict (committee_id, kind, id) do update set deleted = excluded.deleted;" >/dev/null
en a3 "insert into gsa_items (committee_id, kind, id, pos, data) values ($C, 'discussions', 't3', 0, '{\"tache\": \"t3\", \"commentaires\": [{\"texte\": \"faux\"}]}');" >/dev/null
attendu "l'appli ne réécrit pas une discussion" "$(sql "select md5(data::text) from gsa_items where kind = 'discussions' and id = 't1'")" "$avant"
attendu "l'appli d'avant n'efface pas une discussion" "$(sql "select string_agg(id || ':' || deleted, ' ' order by id) from gsa_items where kind = 'discussions'")" "t1:false t2:false"
en a1 "update gsa_items set data = data || '{\"commentaires\": [{\"texte\": \"x\"}]}' where kind = 'tasks' and id = 't2';" >/dev/null
attendu "une tâche enregistrée ne garde pas de messages" "$(sql "select data ? 'commentaires' from gsa_items where kind = 'tasks' and id = 't2'")" "f"
attendu "fonction interne fermée aux comptes" "$(en a3 "select public.gsa_dans_etiquette($C, '{\"etiquettes\": [\"et1\"]}', 'p7');")" "ERROR:  permission denied for function gsa_dans_etiquette"
attendu "étiquette supprimée : t3 n'est plus réservée" "$(en a1 "select public.gsa_commenter($C, 't3', $C, 'Libre') is not null;")" "t"

[ $echecs -eq 0 ] && echo "Tout est bon" || { echo "$echecs échec(s)"; exit 1; }
