#!/bin/bash
# Vérifie la migration 063 (personne ajoutée à une discussion) sur la base de test, après etiquettes_verif.sh (062).
# Affiche « Tout est bon ».
P=${P:-/var/lib/postgresql/gsatest}
D=$(cd "$(dirname "$0")" && pwd)
C="'00000000-0000-0000-0000-0000000000c0'"
echecs=0
en() { "$D/en.sh" "$1" "$2" | grep -v '^{"sub"' | grep -v '^CONTEXT' | tail -1; }
sql() { psql -h $P -p 5433 -U postgres -d gsa -Atc "$1"; }
attendu() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "ÉCHEC $1 : « $2 » au lieu de « $3 »"; echecs=$((echecs + 1)); fi; }
lit() { en "$1" "select count(*) from gsa_items where kind = 'discussions' and id = '$2';"; }
voit() { en "$1" "select count(*) from gsa_items where kind = 'tasks' and id = '$2';"; }
ajoute() { en "$1" "select public.gsa_discussion_ajouter($C, '$2', '$3', ${4:-false}) is not null;"; }

# Point de départ : l'étiquette « Course » (t1) n'a plus qu'Eve (p3) comme membre.
sql "update gsa_items set data = jsonb_set(data, '{membres}', '[\"p3\"]') where kind = 'etiquettes' and id = 'et1'" >/dev/null
sql "delete from gsa_items where kind = 'notifications'" >/dev/null

attendu "Ada (hors étiquette) ne s'ajoute pas elle-même" "$(ajoute a1 t1 p1)" "ERROR:  Tu ne lis pas cette discussion"
attendu "Eve n'ajoute pas une fiche inconnue" "$(ajoute a3 t1 p99)" "ERROR:  Personne introuvable"
attendu "Eve ajoute Ada à la discussion de t1" "$(ajoute a3 t1 p1)" "t"
attendu "Ada lit maintenant la discussion de t1" "$(lit a1 t1)" "1"
attendu "Ada est prévenue (« discussion »)" "$(sql "select string_agg(data ->> 'userId' || ':' || (data ->> 'type') || ':' || (data ->> 'by'), ',') from gsa_items where kind = 'notifications'")" "p1:discussion:p3"
attendu "Sam (voir toutes) ne lit toujours pas t1" "$(lit a6 t1)" "0"
attendu "Pia (responsable, hors étiquette) non plus" "$(lit a5 t1)" "0"
ajoute a3 t1 p1 >/dev/null
attendu "ajouter deux fois ne change rien" "$(sql "select jsonb_array_length(data -> 'participants') from gsa_items where kind = 'discussions' and id = 't1'")" "1"
attendu "Ada (ajoutée) ajoute Sam" "$(ajoute a1 t1 p6)" "t"
sql "delete from gsa_items where kind = 'notifications'" >/dev/null
attendu "Ada écrit sur t1" "$(en a1 "select public.gsa_commenter($C, 't1', $C, 'Merci de m’avoir ajoutée') ->> 'participants';")" '["p1", "p6"]'
attendu "prévenus : Eve (membre) et Sam (ajouté), pas Pia" "$(sql "select string_agg(data ->> 'userId', ',' order by data ->> 'userId') from gsa_items where kind = 'notifications'")" "p3,p6"
attendu "un message garde les personnes ajoutées" "$(sql "select data -> 'participants' from gsa_items where kind = 'discussions' and id = 't1'")" '["p1", "p6"]'

# Point sans étiquette (t2, responsable Eve) : Pia ne le voit pas ; ajoutée, elle voit le point et sa discussion.
attendu "Pia ne voit pas t2" "$(voit a5 t2)" "0"
attendu "Eve ajoute Pia à t2" "$(ajoute a3 t2 p7)" "t"
attendu "Pia voit t2" "$(voit a5 t2)" "1"
attendu "Pia lit la discussion de t2" "$(lit a5 t2)" "1"
attendu "Pia écrit sur t2" "$(en a5 "select public.gsa_commenter($C, 't2', $C, 'Bien reçu') is not null;")" "t"
attendu "Pia se retire de t2" "$(ajoute a5 t2 p7 true)" "t"
attendu "Pia ne voit plus t2" "$(voit a5 t2)" "0"
attendu "Pia ne lit plus sa discussion" "$(lit a5 t2)" "0"

# Ce que l'appli ne peut pas faire.
avant=$(sql "select md5(data::text) from gsa_items where kind = 'discussions' and id = 't1'")
en a5 "insert into gsa_items (committee_id, kind, id, pos, data) values ($C, 'discussions', 't1', 0, '{\"tache\": \"t1\", \"participants\": [\"p7\"]}') on conflict (committee_id, kind, id) do update set data = excluded.data;" >/dev/null
attendu "Pia ne s'ajoute pas en écrivant la ligne" "$(sql "select md5(data::text) from gsa_items where kind = 'discussions' and id = 't1'")" "$avant"
attendu "Pia ne lit toujours pas t1" "$(lit a5 t1)" "0"
attendu "fonction interne fermée aux comptes" "$(en a5 "select public.gsa_dans_discussion($C, 't1', 'p1');")" "ERROR:  permission denied for function gsa_dans_discussion"
attendu "Eve retire Sam de t1" "$(ajoute a3 t1 p6 true)" "t"
attendu "Sam ne lit plus t1" "$(lit a6 t1)" "0"

[ $echecs -eq 0 ] && echo "Tout est bon" || { echo "$echecs échec(s)"; exit 1; }
