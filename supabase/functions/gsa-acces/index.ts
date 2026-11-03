// Tâches GSA – comptes de la version réelle (fonction Supabase « gsa-acces »). Un seul espace, le club
// (PLAN_APPLI_SIMPLE.md, D4) : plus d'organigramme, de création ni de suppression d'entités, ni d'accès donnés entité par
// entité. Restent :
//   - les comptes du club (comptes.ts : mot de passe oublié, super-admins, blocage, fusion) ;
//   - les comptes des personnes du club (club.ts : un compte par personne, migration 056 ; retrait du club).
// Les comptes sont créés ici (clé secrète, jamais dans le navigateur), adresse confirmée d'office : aucun email n'est
// envoyé, l'admin transmet lui-même le mot de passe provisoire, à changer à la 1re connexion.
// Mot de passe provisoire pas encore changé (app_metadata, migration 025) : aucune action, sauf la demande sans connexion.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ACTIONS_COMPTES, actionComptes, demandeMdp, ErreurCompte } from './comptes.ts';
import { ACTIONS_CLUB, actionClub } from './club.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function secretKey() {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    if (keys.default) return keys.default as string;
  } catch {
    /* clé héritée ci-dessous */
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

/** Clé publique : appels au nom de la personne connectée (avec son jeton), pour les droits calculés par le serveur. */
function publicKey() {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (keys.default) return keys.default as string;
  } catch {
    /* clé héritée ci-dessous */
  }
  return Deno.env.get('SUPABASE_ANON_KEY')!;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }
  const action = String(body.action ?? '');

  // Mot de passe oublié : sans connexion.
  if (action === 'demandeMdp') return json(await demandeMdp(db, body));

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: me } = await db.auth.getUser(token);
  if (!me?.user) return json({ error: 'Connexion requise.' }, 401);
  if (me.user.app_metadata?.doit_changer_mdp === true) return json({ error: 'Choisis d’abord ton propre mot de passe (mot de passe provisoire).' }, 403);

  // Comptes du club : demandes de mot de passe, super-admins (comptes.ts).
  if (ACTIONS_COMPTES.has(action)) {
    try {
      return json(await actionComptes(db, me.user.id, action, body));
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof ErreurCompte ? e.status : 400);
    }
  }
  // Personnes du club : leur compte (club.ts) ; droits : gsa_compte_club_etat, au nom de la personne connectée.
  if (ACTIONS_CLUB.has(action)) {
    try {
      const commeMoi = createClient(Deno.env.get('SUPABASE_URL')!, publicKey(), {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return json(await actionClub(db, commeMoi, me.user.id, action, body));
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof ErreurCompte ? e.status : 400);
    }
  }

  // Anciennes actions (organigramme, entités, accès par entité) : retirées avec les entités.
  return json({ error: 'Action inconnue.' }, 400);
});
