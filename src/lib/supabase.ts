import { createClient } from '@supabase/supabase-js';

// Projet Supabase de la version réelle. L'adresse et la clé « publishable » sont publiques par nature :
// les données sont protégées par les règles d'accès de la base (RLS), voir supabase/migrations.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://akmpyrikdudvkbwdhesr.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_icIPpSMPG-2wb56636HMXw_thnJIEzW';

export const hasSupabase = Boolean(url && anonKey);
export const supabase = hasSupabase ? createClient(url, anonKey, { auth: { storageKey: 'taches-gsa-auth' } }) : null;
