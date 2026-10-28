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
