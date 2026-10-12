import { createClient } from '@supabase/supabase-js';

// Projet Supabase de la version réelle. L'adresse et la clé « publishable » sont publiques par nature :
// les données sont protégées par les règles d'accès de la base (RLS), voir supabase/migrations.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://akmpyrikdudvkbwdhesr.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_icIPpSMPG-2wb56636HMXw_thnJIEzW';

export const hasSupabase = Boolean(url && anonKey);
// Lien « mot de passe oublié » (modèle d'e-mail par défaut) : lu par supabase-js dès sa création, on le note avant.
noterLienRecuperation();

/** Voir src/data/recuperation.ts (même clé). */
function noterLienRecuperation() {
  if (typeof location === 'undefined') return;
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  try {
    if (h.get('type') === 'recovery' && h.has('access_token')) sessionStorage.setItem('taches-gsa-recuperation', 'nouveauMdp');
    else if (h.has('error_code') && h.has('error_description')) {
      // Lien expiré ou déjà utilisé : retiré de l'adresse (sinon le routeur l'interprète comme une page).
      sessionStorage.setItem('taches-gsa-recuperation', 'lienInvalide');
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch {
    /* ignore */
  }
}

export const supabase = hasSupabase ? createClient(url, anonKey, { auth: { storageKey: 'taches-gsa-auth' } }) : null;
