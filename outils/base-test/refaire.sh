#!/bin/bash
# Refait la base de test : stubs, migrations 001-004, colonne « name » (créée hors migrations en production), puis le reste.
P=${P:-/var/lib/postgresql/gsatest}
D=$(cd "$(dirname "$0")" && pwd)
cd "$D/../.."
psql -h $P -p 5433 -U postgres -q -c "drop database if exists gsa;" -c "create database gsa;" >/dev/null
psql -h $P -p 5433 -U postgres -d gsa -q -f $D/stubs.sql >/dev/null 2>&1
$D/appliquer.sh supabase/migrations/00[1-4]*.sql >/dev/null || exit 1
psql -h $P -p 5433 -U postgres -d gsa -q -c "alter table public.committees add column if not exists name text; update public.committees set name = nom where name is null; alter table public.profiles add column if not exists full_name text;"
$D/appliquer.sh $(ls supabase/migrations/0*.sql | sed -n '5,200p') "$@"
