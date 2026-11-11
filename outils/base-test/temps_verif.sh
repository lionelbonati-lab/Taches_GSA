#!/bin/bash
# Vérifie la migration 067 (compteur de temps personnel : chacun ses lignes) sur la base de test, après donnees.sql.
# Affiche « Tout est bon ».
P=${P:-/var/lib/postgresql/gsatest}
D=$(cd "$(dirname "$0")" && pwd)
echecs=0
en() { "$D/en.sh" "$1" "$2" | grep -v '^{"sub"' | grep -v '^CONTEXT\|^DETAIL' | tail -1; }
sql() { psql -h $P -p 5433 -U postgres -d gsa -Atc "$1"; }
attendu() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "ÉCHEC $1 : « $2 » au lieu de « $3 »"; echecs=$((echecs + 1)); fi; }
compte() { echo "'00000000-0000-0000-0000-0000000000$1'"; }
lignes() { en "$1" "select count(*) from public.gsa_temps;"; }
# Comme en.sh, avec un mot de passe provisoire pas encore changé (025).
provisoire() {
  psql -h $P -p 5433 -U postgres -d gsa -At -v ON_ERROR_STOP=0 <<SQL 2>&1 | grep -v "^SET$\|^$\|set_config\|^{" | grep -v '^CONTEXT\|^DETAIL' | tail -1
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000$1","role":"authenticated","app_metadata":{"doit_changer_mdp":"true"}}', false);
$2
SQL
}

sql "delete from public.gsa_temps" >/dev/null

# Ada (a1, admin du club) écrit son compteur ; le serveur date la ligne lui-même.
attendu "Ada ajoute une entrée" "$(en a1 "insert into public.gsa_temps (compte, id, data, modifie) values ($(compte a1), 'e1', '{\"id\":\"e1\",\"sorte\":\"ajout\",\"jour\":\"2026-11-11\",\"minutes\":15}', '2000-01-01');")" "INSERT 0 1"
attendu "date posée par le serveur" "$(sql "select modifie > now() - interval '1 minute' from public.gsa_temps where id = 'e1'")" "t"
attendu "Ada ajoute ses réglages (compte par défaut : le sien)" "$(en a1 "insert into public.gsa_temps (id, data) values ('reglages', '{\"actif\":true}');")" "INSERT 0 1"
attendu "Ada modifie son entrée (upsert)" "$(en a1 "insert into public.gsa_temps (compte, id, data) values ($(compte a1), 'e1', '{\"id\":\"e1\",\"sorte\":\"ajout\",\"jour\":\"2026-11-11\",\"minutes\":30}') on conflict (compte, id) do update set data = excluded.data;")" "INSERT 0 1"
attendu "Ada lit ses deux lignes" "$(lignes a1)" "2"
attendu "Ada relit ce qui a changé depuis" "$(en a1 "select count(*) from public.gsa_temps where modifie > now() - interval '1 hour';")" "2"

# Eve (a3) a son propre compteur, et ne voit pas celui d'Ada ; Ada, admin, ne voit pas celui d'Eve.
attendu "Eve ajoute une entrée" "$(en a3 "insert into public.gsa_temps (compte, id, data) values ($(compte a3), 'e1', '{}');")" "INSERT 0 1"
attendu "Eve ne lit que la sienne" "$(lignes a3)" "1"
attendu "Ada (admin) ne lit pas celle d'Eve" "$(en a1 "select count(*) from public.gsa_temps where compte = $(compte a3);")" "0"
attendu "un compte sans place dans le club a son compteur" "$(en a6 "insert into public.gsa_temps (compte, id, data) values ($(compte a6), 'e1', '{}');")" "INSERT 0 1"

# Ce qu'on ne peut pas faire.
attendu "Eve n'écrit pas au nom d'Ada" "$(en a3 "insert into public.gsa_temps (compte, id, data) values ($(compte a1), 'x', '{}');")" 'ERROR:  new row violates row-level security policy for table "gsa_temps"'
attendu "Eve ne modifie pas l'entrée d'Ada" "$(en a3 "update public.gsa_temps set data = '{}' where compte = $(compte a1);")" "UPDATE 0"
attendu "Eve n'efface pas l'entrée d'Ada" "$(en a3 "delete from public.gsa_temps where compte = $(compte a1);")" "DELETE 0"
attendu "Eve ne donne pas sa ligne à Ada" "$(en a3 "update public.gsa_temps set compte = $(compte a1);")" 'ERROR:  new row violates row-level security policy for table "gsa_temps"'
attendu "les lignes d'Ada sont intactes" "$(sql "select (data ->> 'minutes') from public.gsa_temps where compte = $(compte a1) and id = 'e1'")" "30"
attendu "sans connexion : rien" "$(psql -h $P -p 5433 -U postgres -d gsa -At -c "set role anon; select count(*) from public.gsa_temps;" 2>&1 | tail -1)" "ERROR:  permission denied for table gsa_temps"
attendu "mot de passe provisoire : ne lit rien" "$(provisoire a1 "select count(*) from public.gsa_temps;")" "0"
attendu "mot de passe provisoire : n'écrit rien" "$(provisoire a1 "insert into public.gsa_temps (compte, id, data) values ($(compte a1), 'p', '{}');")" 'ERROR:  new row violates row-level security policy for table "gsa_temps"'
attendu "contenu de plus de 4 Ko refusé" "$(en a1 "insert into public.gsa_temps (compte, id, data) values ($(compte a1), 'gros', jsonb_build_object('t', repeat('x', 5000)));" | grep -o 'violates check constraint "gsa_temps_data_check"')" 'violates check constraint "gsa_temps_data_check"'
attendu "fonction du déclencheur fermée aux comptes" "$(en a1 "select public.gsa_temps_modifie();")" "ERROR:  permission denied for function gsa_temps_modifie"

# Entrée retirée (marquée), puis effacée par l'appli ; compte supprimé : ses lignes partent avec lui.
attendu "Ada marque une entrée retirée" "$(en a1 "update public.gsa_temps set data = '{}', supprime = true where id = 'e1';")" "UPDATE 1"
attendu "Ada efface ses lignes retirées" "$(en a1 "delete from public.gsa_temps where supprime;")" "DELETE 1"
sql "delete from auth.users where id = $(compte a6)" >/dev/null
attendu "compte supprimé : son compteur aussi" "$(sql "select count(*) from public.gsa_temps where compte = $(compte a6)")" "0"

sql "delete from public.gsa_temps" >/dev/null
if [ $echecs -eq 0 ]; then echo "Tout est bon"; else echo "$echecs échec(s)"; exit 1; fi
