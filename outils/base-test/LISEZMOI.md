# Base de test locale (données fictives)

Pour essayer les migrations avant de les proposer : une base PostgreSQL jetable (port 5433), avec des simulations des
schémas Supabase (`stubs.sql` : `auth`, `storage`, `cron`, `net`, rôles `anon` / `authenticated`) et un jeu de données
fictif (`donnees.sql` : un club, un comité d'organisation, six comptes `a1`…`a6`).

```bash
P=/var/lib/postgresql/gsatest
mkdir -p $P && chown postgres $P
su postgres -c "/usr/lib/postgresql/*/bin/initdb -D $P/data -U postgres --auth=trust"
su postgres -c "/usr/lib/postgresql/*/bin/pg_ctl -D $P/data -o '-p 5433 -k $P' -l $P/log.txt start"
outils/base-test/refaire.sh                       # base « gsa » : toutes les migrations du dépôt
psql -h $P -p 5433 -U postgres -d gsa -f outils/base-test/donnees.sql
outils/base-test/en.sh a1 "select public.gsa_est_super_admin();"   # une requête au nom du compte a1
```

Après un redémarrage de la machine, seule la commande `pg_ctl … start` est à refaire.

Tests de l'appli (Playwright) avec le navigateur déjà installé : créer `playwright.local.config.ts` (ignoré par git) :

```ts
import base from './playwright.config';
export default { ...base, use: { ...base.use, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } } };
```

puis `npm run build` et `npx playwright test -c playwright.local.config.ts`.

Rapport de reprise des entités (étape D2, lecture seule) sur la base de test :

```bash
psql -h $P -p 5433 -U postgres -d gsa -P pager=off -f outils/reprise/rapport_reprise.sql
```

Essai de la reprise (migration 059, étape D3) sur des données fictives :

```bash
outils/base-test/refaire.sh
psql -h $P -p 5433 -U postgres -d gsa -f outils/base-test/donnees.sql
psql -h $P -p 5433 -U postgres -d gsa -f outils/base-test/reprise_donnees.sql
psql -h $P -p 5433 -U postgres -d gsa -f outils/base-test/reprise_d1.sql         # facultatif : le lien de délai retiré en D1 (060)
psql -h $P -p 5433 -U postgres -d gsa -P pager=off -f outils/reprise/rapport_reprise.sql   # avant
psql -h $P -p 5433 -U postgres -d gsa -f supabase/migrations/059_gsa_reprise_entites.sql   # la reprise, avec son bilan
psql -h $P -p 5433 -U postgres -d gsa -f supabase/migrations/060_gsa_reprise_delais.sql    # délais rétablis (après reprise_d1.sql)
psql -h $P -p 5433 -U postgres -d gsa -f outils/base-test/reprise_verif.sql                # « Reprise vérifiée »
```

Essai du ménage des fonctions (migration 061, étape D5) : `refaire.sh` l'applique déjà avec les autres ; pour la
rejouer après la reprise ci-dessus et vérifier que rien ne manque :

```bash
psql -h $P -p 5433 -U postgres -d gsa -f supabase/migrations/061_gsa_menage_fonctions.sql   # fonctions_restantes = 0
psql -h $P -p 5433 -U postgres -d gsa -f outils/base-test/reprise_verif.sql                  # toujours « Reprise vérifiée »
```

Essai des étiquettes et des discussions réservées (migrations 062 à 064) : la base jusqu'à 061, le scénario (messages
encore dans les tâches), puis 062 et ses vérifications, 063 et les siennes (« Tout est bon » attendu à chaque fois) :

```bash
outils/base-test/refaire.sh                                # puis, comme 062 à 064 viennent d'être appliquées, la refaire sans elles :
psql -h $P -p 5433 -U postgres -q -c "drop database gsa;" -c "create database gsa;"
psql -h $P -p 5433 -U postgres -d gsa -q -f outils/base-test/stubs.sql
outils/base-test/appliquer.sh supabase/migrations/00[1-4]*.sql
psql -h $P -p 5433 -U postgres -d gsa -q -c "alter table public.committees add column if not exists name text; update public.committees set name = nom where name is null; alter table public.profiles add column if not exists full_name text;"
outils/base-test/appliquer.sh $(ls supabase/migrations/0*.sql | sed -n '5,200p' | grep -v '06[234]')
psql -h $P -p 5433 -U postgres -d gsa -q -f outils/base-test/donnees.sql
psql -h $P -p 5433 -U postgres -d gsa -q -f outils/base-test/etiquettes_donnees.sql
outils/base-test/appliquer.sh supabase/migrations/062_gsa_etiquettes_discussions.sql
outils/base-test/etiquettes_verif.sh
# Personnes ajoutées à une discussion (063), à la suite :
outils/base-test/appliquer.sh supabase/migrations/063_gsa_discussion_participants.sql
outils/base-test/discussion_verif.sh
# Instantané (064), à la suite : étiquette renvoyée, gsa-push appelée à chaque notification ajoutée.
outils/base-test/appliquer.sh supabase/migrations/064_gsa_instantane.sql
outils/base-test/instantane_verif.sh
```

Essai du compteur de temps personnel (migration 067 : chacun ses lignes, admins compris) : `refaire.sh` l'applique avec
les autres ; sur une base neuve avec `donnees.sql` (« Tout est bon » attendu) :

```bash
outils/base-test/refaire.sh
psql -h $P -p 5433 -U postgres -d gsa -f outils/base-test/donnees.sql
outils/base-test/temps_verif.sh
```

Essai de la garde des effacements (migrations 065 et 069 : une étiquette, une série d'événements ou une assemblée générale
n'est effacée par l'appli que si la demande le dit) : `refaire.sh` les applique avec les autres ; sur une base neuve avec
`donnees.sql` (« Tout est bon » attendu) :

```bash
outils/base-test/refaire.sh
psql -h $P -p 5433 -U postgres -d gsa -f outils/base-test/donnees.sql
outils/base-test/effacements_verif.sh
```

Essai du contrôle des versions (migration 070 : une modification partie d'une version dépassée est refusée), sur une base
neuve avec `donnees.sql` (« Tout est bon » attendu) :

```bash
outils/base-test/versions_verif.sh
```
