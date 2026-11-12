#!/bin/bash
# Vérifie la migration 070 sur la base de test (après donnees.sql) : une modification partie d'une version dépassée
# (data.versionDe ≠ updated_at de la ligne) est refusée (P0409) ; la bonne version, ou pas de marque, passe ; la marque
# n'est jamais enregistrée. Affiche « Tout est bon ».
P=${P:-/var/lib/postgresql/gsatest}
D=$(cd "$(dirname "$0")" && pwd)
C0="'00000000-0000-0000-0000-0000000000c0'"
C1="'00000000-0000-0000-0000-0000000000c1'"
echecs=0
en() { "$D/en.sh" "$1" "$2" | grep -v '^{"sub"' | grep -v '^CONTEXT' | tail -1; }
sql() { psql -h $P -p 5433 -U postgres -d gsa -Atc "$1"; }
attendu() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "ÉCHEC $1 : « $2 » au lieu de « $3 »"; echecs=$((echecs + 1)); fi; }
# Écriture de l'appli (upsert, comme cloud.ts) : compte, espace, sorte, id, data. Rien = accepté, sinon le message d'erreur.
ecrire() { en $1 "insert into gsa_items (committee_id, kind, id, pos, data, deleted) values ($2, '$3', '$4', 0, '$5', false) on conflict (committee_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, pos = excluded.pos;" | sed 's/^INSERT 0 1$//'; }
# Version de la ligne, telle que PostgREST la donne à l'appli.
version() { sql "select to_json(updated_at) #>> '{}' from gsa_items where committee_id = $1 and kind = '$2' and id = '$3'"; }
data() { sql "select data::text from gsa_items where committee_id = $1 and kind = '$2' and id = '$3'"; }
REFUS="ERROR:  Élément modifié entre-temps par quelqu'un d'autre"

sql "delete from gsa_items where id like 'v7%'" >/dev/null
attendu "création avec marque : acceptée" "$(ecrire a1 "$C0" polls v70 '{"id": "v70", "votes": {}, "versionDe": "2026-01-01T00:00:00+00:00"}')" ""
attendu "création : marque non enregistrée" "$(data "$C0" polls v70)" '{"id": "v70", "votes": {}}'
V1=$(version "$C0" polls v70)
attendu "bonne version : acceptée" "$(ecrire a1 "$C0" polls v70 "{\"id\": \"v70\", \"votes\": {\"p1\": [\"a\"]}, \"versionDe\": \"$V1\"}")" ""
attendu "bonne version : marque non enregistrée" "$(data "$C0" polls v70)" '{"id": "v70", "votes": {"p1": ["a"]}}'
attendu "version dépassée : refusée" "$(ecrire a1 "$C0" polls v70 "{\"id\": \"v70\", \"votes\": {\"p3\": [\"b\"]}, \"versionDe\": \"$V1\"}")" "$REFUS"
attendu "version dépassée : rien d'écrit" "$(data "$C0" polls v70)" '{"id": "v70", "votes": {"p1": ["a"]}}'
attendu "code d'erreur P0409" "$("$D/en.sh" a1 "\\set VERBOSITY verbose
insert into gsa_items (committee_id, kind, id, pos, data) values ($C0, 'polls', 'v70', 0, '{\"versionDe\": \"$V1\"}') on conflict (committee_id, kind, id) do update set data = excluded.data;" | grep -o P0409 | head -1)" "P0409"
attendu "sans marque (appli pas à jour) : acceptée comme avant" "$(ecrire a1 "$C0" polls v70 '{"id": "v70", "votes": {"p3": ["b"]}}')" ""
attendu "marque illisible : pas de contrôle" "$(ecrire a1 "$C0" polls v70 '{"id": "v70", "votes": {"p3": ["c"]}, "versionDe": "?"}')" ""
attendu "marque illisible : non enregistrée" "$(data "$C0" polls v70)" '{"id": "v70", "votes": {"p3": ["c"]}}'

# Mise à jour simple (sans upsert) : même contrôle.
V2=$(version "$C0" polls v70)
attendu "mise à jour, version dépassée : refusée" "$(en a1 "update gsa_items set data = '{\"id\": \"v70\", \"versionDe\": \"$V1\"}' where committee_id = $C0 and kind = 'polls' and id = 'v70';")" "$REFUS"
attendu "mise à jour, bonne version : acceptée" "$(en a1 "update gsa_items set data = '{\"id\": \"v70\", \"votes\": {}, \"versionDe\": \"$V2\"}' where committee_id = $C0 and kind = 'polls' and id = 'v70';")" "UPDATE 1"

# Supprimé par quelqu'un d'autre depuis : refusé.
V3=$(version "$C0" polls v70)
en a1 "update gsa_items set deleted = true where committee_id = $C0 and kind = 'polls' and id = 'v70';" >/dev/null
attendu "supprimé entre-temps : refusé" "$(ecrire a1 "$C0" polls v70 "{\"id\": \"v70\", \"votes\": {}, \"versionDe\": \"$V3\"}")" "$REFUS"

# Point : la date du contenu (052) ne bouge pas pour une marque seule.
ecrire a1 "$C0" tasks v71 '{"id": "v71", "titre": "Affiches", "statut": "s1"}' >/dev/null
L1=$(sql "select data ->> 'contenuLe' from gsa_items where committee_id = $C0 and kind = 'tasks' and id = 'v71'")
V4=$(version "$C0" tasks v71)
attendu "point, bonne version : accepté" "$(ecrire a1 "$C0" tasks v71 "{\"id\": \"v71\", \"titre\": \"Affiches\", \"statut\": \"s1\", \"contenuLe\": \"$L1\", \"versionDe\": \"$V4\"}")" ""
attendu "point : date du contenu inchangée" "$(sql "select data ->> 'contenuLe' from gsa_items where committee_id = $C0 and kind = 'tasks' and id = 'v71'")" "$L1"
attendu "point, version dépassée : refusé" "$(ecrire a1 "$C0" tasks v71 "{\"id\": \"v71\", \"titre\": \"Flyers\", \"statut\": \"s1\", \"versionDe\": \"$V4\"}")" "$REFUS"

# Membre non admin d'un autre espace.
ecrire a4 "$C1" meetings v72 '{"id": "v72", "titre": "Comité", "lieu": "Salle 1"}' >/dev/null
V5=$(version "$C1" meetings v72)
attendu "membre : bonne version acceptée" "$(ecrire a4 "$C1" meetings v72 "{\"id\": \"v72\", \"titre\": \"Comité\", \"lieu\": \"Salle 2\", \"versionDe\": \"$V5\"}")" ""
attendu "membre : version dépassée refusée" "$(ecrire a4 "$C1" meetings v72 "{\"id\": \"v72\", \"titre\": \"Comité\", \"lieu\": \"Salle 3\", \"versionDe\": \"$V5\"}")" "$REFUS"

# Le serveur lui-même (sans compte) : même règle s'il envoie une marque ; sans marque, rien ne change.
attendu "serveur sans marque : accepté" "$(sql "update gsa_items set data = data || '{\"lieu\": \"Salle 4\"}' where committee_id = $C1 and kind = 'meetings' and id = 'v72' returning data ->> 'lieu'" | head -1)" "Salle 4"

attendu "aucune marque enregistrée nulle part" "$(sql "select count(*) from gsa_items where data ? 'versionDe'")" "0"
attendu "historique sans marque" "$(sql "select count(*) from gsa_historique where to_jsonb(gsa_historique)::text like '%versionDe%'" 2>/dev/null || echo 0)" "0"
attendu "fonction fermée aux comptes" "$(en a1 "select public.gsa_items_version_garde();")" "ERROR:  permission denied for function gsa_items_version_garde"

[ $echecs -eq 0 ] && echo "Tout est bon" || { echo "$echecs échec(s)"; exit 1; }
