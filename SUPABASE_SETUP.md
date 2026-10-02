# Mise en place de Supabase

1. Créer un projet Supabase puis exécuter `supabase/migrations/001_init.sql` dans **SQL Editor**.
2. Dans Authentication, choisir Email (et confirmer les adresses selon la politique du club).
3. Copier l’URL du projet et la clé `anon` dans `.env` à partir de `.env.example`.
4. Créer un premier utilisateur dans Authentication, puis une ligne `committees` et sa ligne `memberships` avec le rôle `admin` (ou faire cette opération depuis la console SQL).
5. Lancer `npm install` puis `npm run dev`.

Sans variables Supabase, l'application reste utilisable en mode démonstration avec ses données locales. Les règles RLS séparent les comités : un membre voit les données de son comité, un responsable voit aussi ses tâches assignées, et un administrateur gère les membres et les comités.
