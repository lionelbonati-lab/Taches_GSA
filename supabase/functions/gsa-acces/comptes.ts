// Tâches GSA – comptes du club (actions de la fonction gsa-acces, migration 025).
// • « demandeMdp » (sans connexion) : mot de passe oublié, demande aux admins des entités du compte. La réponse est
//   toujours la même, que l'adresse ait un compte ou non (on ne révèle pas qui a un compte).
// • « approuverMdp » / « refuserMdp » : un admin de l'une de ses entités (garde-fou : gsa_peut_approuver_mdp) ou un
//   super-admin valide la demande ; il reçoit un mot de passe provisoire à transmettre, à changer à la connexion.
// • Super-admins (gsa_super_admins) : « comptes » (liste), « reinitialiserCompte », « bloquer », « debloquer », « fusionner ».
// Le mot de passe provisoire se donne en deux temps : le mot de passe, puis le drapeau (app_metadata) ; le déclencheur
// de la migration 025 retire le drapeau quand le mot de passe change alors qu'il est déjà posé.
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2';

type Db = SupabaseClient;

export class ErreurCompte extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const ACTIONS_COMPTES = new Set(['approuverMdp', 'refuserMdp', 'comptes', 'reinitialiserCompte', 'bloquer', 'debloquer', 'fusionner']);
const SUPER_ADMIN = new Set(['comptes', 'reinitialiserCompte', 'bloquer', 'debloquer', 'fusionner']);

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function tempPassword() {
  const s = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/** Mot de passe provisoire à changer à la connexion (drapeau dans app_metadata, et dans user_metadata pour l'appli d'avant 025). */
export const provisoire = (u: User | null | undefined) => u?.app_metadata?.doit_changer_mdp === true || u?.user_metadata?.doit_changer_mdp === true;

/** Donne un nouveau mot de passe provisoire au compte ; les sessions ouvertes sont fermées par le serveur d'authentification. */
export async function donnerMdpProvisoire(db: Db, userId: string) {
  const { data: u, error: e0 } = await db.auth.admin.getUserById(userId);
  if (e0 || !u.user) throw new ErreurCompte('Compte introuvable.', 404);
  const password = tempPassword();
  const { error: e1 } = await db.auth.admin.updateUserById(userId, { password });
  if (e1) throw new ErreurCompte(e1.message);
  const { error: e2 } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { doit_changer_mdp: true },
    user_metadata: { ...(u.user.user_metadata ?? {}), doit_changer_mdp: true },
  });
  if (e2) throw new ErreurCompte(`Mot de passe changé, mais pas l’obligation de le changer : ${e2.message}`);
  // Demandes en attente de ce compte : traitées.
  await db.from('gsa_demandes_mdp').update({ etat: 'faite', traitee_le: new Date().toISOString() }).eq('user_id', userId).eq('etat', 'attente');
  return { email: u.user.email ?? '', password };
}

export async function estSuperAdmin(db: Db, userId: string) {
  const { data } = await db.from('gsa_super_admins').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}

export async function peutApprouver(db: Db, appelant: string, cible: string) {
  const { data, error } = await db.rpc('gsa_peut_approuver_mdp', { appelant, cible });
  if (error) throw new ErreurCompte(error.message);
  return data === true;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PAR_COMPTE_24H = 3;
const PAR_HEURE = 30;

/** Mot de passe oublié, sans connexion. Toujours la même réponse ; au plus 3 demandes par compte et par jour. */
export async function demandeMdp(db: Db, body: Record<string, unknown>) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const reponse = { ok: true };
  if (!EMAIL.test(email) || email.length > 200) return reponse;
  const heure = new Date(Date.now() - 3600_000).toISOString();
  const { count: total } = await db.from('gsa_demandes_mdp').select('id', { count: 'exact', head: true }).gte('le', heure);
  if ((total ?? 0) >= PAR_HEURE) return reponse;
  const { data: userId } = await db.rpc('gsa_compte_par_email', { e: email });
  if (!userId) return reponse;
  const { count: membre } = await db.from('gsa_members').select('committee_id', { count: 'exact', head: true }).eq('user_id', userId);
  if (!membre) return reponse;
  const jour = new Date(Date.now() - 86400_000).toISOString();
  const { count: miennes } = await db.from('gsa_demandes_mdp').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('le', jour);
  if ((miennes ?? 0) >= PAR_COMPTE_24H) return reponse;
  await db.from('gsa_demandes_mdp').insert({ user_id: userId });
  return reponse;
}

async function demande(db: Db, id: string) {
  const { data } = await db.from('gsa_demandes_mdp').select('id, user_id, etat, le').eq('id', id).maybeSingle();
  if (!data) throw new ErreurCompte('Demande introuvable.', 404);
  if (data.etat !== 'attente') throw new ErreurCompte('Cette demande a déjà été traitée par un autre admin.', 409);
  return data as { id: string; user_id: string; etat: string; le: string };
}

/** Actions sur les comptes, pour une personne connectée (`me`) dont le mot de passe n'est plus provisoire. */
export async function actionComptes(db: Db, me: string, action: string, body: Record<string, unknown>) {
  const sup = await estSuperAdmin(db, me);
  if (SUPER_ADMIN.has(action) && !sup) throw new ErreurCompte('Réservé aux super-admins du club.', 403);
  const userId = String(body.userId ?? '');

  if (action === 'approuverMdp' || action === 'refuserMdp') {
    const d = await demande(db, String(body.demandeId ?? ''));
    if (!(await peutApprouver(db, me, d.user_id)))
      throw new ErreurCompte('Ce compte est celui d’un admin d’une autre entité : un admin de cette entité, du comité central ou un super-admin doit valider la demande.', 403);
    if (action === 'refuserMdp') {
      await db.from('gsa_demandes_mdp').update({ etat: 'refusee', traitee_le: new Date().toISOString(), par: me }).eq('user_id', d.user_id).eq('etat', 'attente');
      return { ok: true };
    }
    const r = await donnerMdpProvisoire(db, d.user_id);
    await db.from('gsa_demandes_mdp').update({ par: me }).eq('id', d.id);
    return r;
  }

  if (action === 'comptes') {
    const { data, error } = await db.rpc('gsa_comptes_club');
    if (error) throw new ErreurCompte(error.message);
    return { comptes: data ?? [], moi: me };
  }

  if (!userId) throw new ErreurCompte('Compte manquant.');

  if (action === 'reinitialiserCompte') return await donnerMdpProvisoire(db, userId);

  if (action === 'bloquer' || action === 'debloquer') {
    if (userId === me) throw new ErreurCompte('Tu ne peux pas bloquer ton propre compte.');
    // Bloqué : plus de connexion, ni de renouvellement du jeton (fin de l'accès dans l'heure au plus tard).
    const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: action === 'bloquer' ? '876000h' : 'none' });
    if (error) throw new ErreurCompte(error.message);
    return { ok: true };
  }

  if (action === 'fusionner') {
    const absorber = String(body.absorber ?? '');
    if (!absorber || absorber === userId) throw new ErreurCompte('Choisis deux comptes différents.');
    if (absorber === me) throw new ErreurCompte('Garde ton propre compte : fusionne l’autre dans le tien.');
    const { data, error } = await db.rpc('gsa_fusionner_comptes', { garder: userId, absorber });
    if (error) throw new ErreurCompte(error.message);
    // Personnes du club (056) : le compte gardé reprend celle du compte absorbé, s'il n'en a pas déjà une dans ce club.
    const { data: liens } = await db.from('gsa_club_comptes').select('club_id, membre_id').eq('user_id', absorber);
    for (const l of liens ?? []) {
      const { data: deja } = await db.from('gsa_club_comptes').select('membre_id').eq('club_id', l.club_id).eq('user_id', userId).maybeSingle();
      if (deja) await db.from('gsa_club_comptes').delete().eq('club_id', l.club_id).eq('membre_id', l.membre_id);
      else await db.from('gsa_club_comptes').update({ user_id: userId }).eq('club_id', l.club_id).eq('membre_id', l.membre_id);
    }
    // Le compte absorbé n'a plus rien : supprimé, ou à défaut bloqué.
    const { error: e } = await db.auth.admin.deleteUser(absorber);
    if (e) {
      await db.auth.admin.updateUserById(absorber, { ban_duration: '876000h' });
      return { ...(data as Record<string, unknown>), supprime: false, raison: e.message };
    }
    return { ...(data as Record<string, unknown>), supprime: true };
  }

  throw new ErreurCompte('Action inconnue.');
}
