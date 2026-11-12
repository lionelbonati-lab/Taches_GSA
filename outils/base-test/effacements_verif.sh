#!/bin/bash
# Vérifie les migrations 065 et 069 sur la base de test (après donnees.sql) : une étiquette, une série d'événements ou une
# assemblée générale n'est effacée par l'appli que si la demande le dit (data.retiree = true) ; une appli d'avant leur
# ajout, qui demande à les effacer sans la marque, n'efface rien. Affiche « Tout est bon ».
P=${P:-/var/lib/postgresql/gsatest}
D=$(cd "$(dirname "$0")" && pwd)
C="'00000000-0000-0000-0000-0000000000c0'"
echecs=0
en() { "$D/en.sh" "$1" "$2" | grep -v '^{"sub"' | grep -v '^CONTEXT' | tail -1; }
sql() { psql -h $P -p 5433 -U postgres -d gsa -Atc "$1"; }
attendu() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "ÉCHEC $1 : « $2 » au lieu de « $3 »"; echecs=$((echecs + 1)); fi; }
# Écriture de l'appli (upsert, comme cloud.ts) au nom d'Ada (admin).
ecrire() { en a1 "insert into gsa_items (committee_id, kind, id, pos, data, deleted) values ($C, '$1', '$2', 0, '$3', $4) on conflict (committee_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, pos = excluded.pos;" >/dev/null; }
etat() { sql "select deleted || ':' || coalesce(data ->> 'nom', '') || ':' || (data ? 'retiree') from gsa_items where committee_id = $C and kind = '$1' and id = '$2'"; }

for k in etiquettes seriesEvenements assemblees; do
  sql "delete from gsa_items where committee_id = $C and kind = '$k' and id like 'v%'" >/dev/null
  ecrire $k v1 '{"id": "v1", "nom": "Un"}' false
  attendu "$k : créée" "$(etat $k v1)" "false:Un:false"
  ecrire $k v1 '{"id": "v1", "nom": "Un"}' true
  attendu "$k : effacement sans marque ignoré (upsert)" "$(etat $k v1)" "false:Un:false"
  en a1 "update gsa_items set deleted = true where committee_id = $C and kind = '$k' and id = 'v1';" >/dev/null
  attendu "$k : effacement sans marque ignoré (mise à jour)" "$(etat $k v1)" "false:Un:false"
  ecrire $k v2 '{"id": "v2", "nom": "Deux"}' true
  attendu "$k : nouvelle ligne déjà effacée, sans marque : ignorée" "$(etat $k v2)" ""
  ecrire $k v1 '{"id": "v1", "nom": "Un bis"}' false
  attendu "$k : modification normale" "$(etat $k v1)" "false:Un bis:false"
  ecrire $k v1 '{"id": "v1", "nom": "Un bis", "retiree": true}' true
  attendu "$k : effacement voulu (marque enlevée)" "$(etat $k v1)" "true:Un bis:false"
  ecrire $k v1 '{"id": "v1", "nom": "Un bis"}' false
  attendu "$k : rétablie par l'appli" "$(etat $k v1)" "false:Un bis:false"
  sql "update gsa_items set deleted = true where committee_id = $C and kind = '$k' and id = 'v1'" >/dev/null
  attendu "$k : effacée par le serveur (sans compte)" "$(etat $k v1)" "true:Un bis:false"
  sql "update gsa_items set deleted = false where committee_id = $C and kind = '$k' and id = 'v1'" >/dev/null
  attendu "$k : rétablie par le serveur" "$(etat $k v1)" "false:Un bis:false"
done
sql "delete from gsa_items where committee_id = $C and kind = 'events' and id = 'v1'" >/dev/null
ecrire events v1 '{"id": "v1", "nom": "Fête"}' false
ecrire events v1 '{"id": "v1", "nom": "Fête"}' true
attendu "un événement s'efface comme avant" "$(etat events v1)" "true:Fête:false"
attendu "ancien déclencheur (065) retiré" "$(sql "select count(*) from pg_trigger where tgname = 'gsa_items_etiquettes_garde'")" "0"
attendu "fonction fermée aux comptes" "$(en a1 "select public.gsa_items_effacement_garde();")" "ERROR:  permission denied for function gsa_items_effacement_garde"

[ $echecs -eq 0 ] && echo "Tout est bon" || { echo "$echecs échec(s)"; exit 1; }
