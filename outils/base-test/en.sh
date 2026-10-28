#!/bin/bash
# en.sh <n° de compte a1..a6> "<requête>" : la requête comme la personne connectée (rôle authenticated, jeton simulé).
P=${P:-/var/lib/postgresql/gsatest}
psql -h $P -p 5433 -U postgres -d gsa -At -v ON_ERROR_STOP=0 <<SQL 2>&1 | grep -v "^SET$\|^$\|set_config"
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000$1","role":"authenticated","email":"x@test.example"}', false);
$2
SQL
