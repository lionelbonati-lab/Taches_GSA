#!/bin/bash
# Base de test jetable : applique les migrations du dépôt (pg_cron / pg_net simulés ; règles créées à la main en
# production tolérées).
P=${P:-/var/lib/postgresql/gsatest}
DB=${DB:-gsa}
for f in "$@"; do
  sed -E -e '/create extension if not exists (pg_cron|pg_net)/d' -e 's/drop policy "/drop policy if exists "/I' -e '/alter policy "profils lisibles"/d' "$f" > $P/courant.sql
  out=$(psql -h $P -p 5433 -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f $P/courant.sql 2>&1)
  if [ $? -ne 0 ]; then echo "ÉCHEC $(basename $f)"; echo "$out" | grep -i "error" | head -5; exit 1; fi
done
echo "ok ($# migrations)"
