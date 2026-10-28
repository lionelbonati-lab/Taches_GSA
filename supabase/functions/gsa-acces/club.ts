// Tâches GSA – comptes des personnes du club (PERSONNES_DU_CLUB.md, migration 056) : actions « compteClub »,
// « mdpCompteClub », « retirerCompteClub » et « retirerDuClub » de la fonction gsa-acces.
// Un compte par personne du club, donné une fois ; ses accès suivent ses places (déclencheurs de 056). Les droits viennent
// du serveur : gsa_compte_club_etat, appelée avec le jeton de la personne connectée (droit « Gérer les personnes du club »,
// places ★, mot de passe) ; le reste se fait ici avec la clé secrète.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { donnerMdpProvisoire, ErreurCompte, tempPassword } from './comptes.ts';
import { retirerPlaces } from './orga.ts';

type Db = SupabaseClient;

export const ACTIONS_CLUB = new Set(['compteClub', 'mdpCompteClub', 'retirerCompteClub', 'retirerDuClub']);

/** Ce que renvoie gsa_compte_club_etat (056). */
interface Etat {
  compte: boolean;
  email: string | null;
  places: number;
  etoiles: string[];
  moi: boolean;
  peutDonner: boolean;
  peutMdp: boolean;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const et = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : (l[0] ?? ''));
const refusEtoile = (e: Etat) =>
  e.etoiles.length
    ? `★ de ${et(e.etoiles.map((x) => `« ${x} »`))} : réservé aux admins de cette entité ou du comité central.`
    : 'Réservé aux super-admins du club (compte du propriétaire ou d’un super-admin).';

/** Retire le compte du club : ses accès aux entités du club (sauf propriétaire) et son lien à la personne. */
async function retirerCompte(db: Db, club: string, membreId: string, userId: string) {
  const { data: entites } = await db.from('committees').select('id').or(`id.eq.${club},parent_id.eq.${club}`);
  const ids = (entites ?? []).map((x) => x.id as string);
  if (ids.length) {
    const { error } = await db.from('gsa_members').delete().eq('user_id', userId).eq('owner', false).in('committee_id', ids);
    if (error) throw new ErreurCompte(error.message);
  }
  const { error } = await db.from('gsa_club_comptes').delete().eq('club_id', club).eq('membre_id', membreId);
  if (error) throw new ErreurCompte(error.message);
}

/** `commeMoi` : client avec le jeton de la personne connectée (droits calculés par le serveur). */
export async function actionClub(db: Db, commeMoi: Db, userId: string, action: string, body: Record<string, unknown>) {
  const club = String(body.club ?? '');
  const membreId = String(body.membreId ?? '');
  if (!club || !membreId) throw new ErreurCompte('Personne du club manquante.');
  const { data, error } = await commeMoi.rpc('gsa_compte_club_etat', { club, membre: membreId });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new ErreurCompte('Serveur pas encore à jour (migration 056).', 501);
    throw new ErreurCompte(error.message, error.code === '42501' ? 403 : 400);
  }
  const etat = data as Etat;
  const { data: lien } = await db.from('gsa_club_comptes').select('user_id').eq('club_id', club).eq('membre_id', membreId).maybeSingle();
  const { data: fiche } = await db.from('gsa_club_membres').select('data').eq('club_id', club).eq('id', membreId).maybeSingle();
  const d = (fiche?.data ?? {}) as Record<string, unknown>;
  const nom = `${d.prenom ?? ''} ${d.nom ?? ''}`.trim() || 'Cette personne';

  if (action === 'compteClub') {
    if (etat.compte || lien) throw new ErreurCompte(`${nom} a déjà un accès.`, 409);
    if (!etat.peutDonner) throw new ErreurCompte(refusEtoile(etat), 403);
    const email = String(d.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new ErreurCompte(`Indique d’abord l’adresse email de ${nom} dans sa fiche.`);
    // Un compte existe déjà pour cette adresse : il devient le sien (sans nouveau mot de passe), s'il n'est pas celui d'une
    // autre personne du club.
    const { data: existant } = await db.rpc('gsa_compte_par_email', { e: email });
    let compte = (existant as string | null) ?? null;
    let password: string | undefined;
    if (compte) {
      const { data: autre } = await db.from('gsa_club_comptes').select('membre_id').eq('club_id', club).eq('user_id', compte).maybeSingle();
      if (autre) throw new ErreurCompte('Cette adresse est celle du compte d’une autre personne du club.', 409);
    } else {
      password = tempPassword();
      const { data: c, error: e } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { doit_changer_mdp: true },
        user_metadata: { full_name: nom, doit_changer_mdp: true },
      });
      if (e || !c.user) throw new ErreurCompte(e?.message ?? 'Création du compte impossible.');
      compte = c.user.id;
    }
    const { error: e2 } = await db.from('gsa_club_comptes').insert({ club_id: club, membre_id: membreId, user_id: compte });
    if (e2) throw new ErreurCompte(e2.message);
    // Adresse de connexion du compte (celle de la fiche, ou celle du compte existant).
    const login = password ? email : (await db.auth.admin.getUserById(compte)).data.user?.email ?? email;
    return { email: login, password, existant: !password, places: etat.places };
  }

  if (action === 'mdpCompteClub') {
    if (!lien) throw new ErreurCompte(`${nom} n’a pas encore d’accès.`, 404);
    if (!etat.peutMdp)
      throw new ErreurCompte(
        etat.moi
          ? 'Change ton propre mot de passe depuis « Mon compte ».'
          : 'Ce compte est aussi celui d’un admin, du propriétaire ou d’un super-admin : un admin de ses entités, du comité central ou un super-admin doit le faire.',
        403,
      );
    return await donnerMdpProvisoire(db, lien.user_id as string);
  }

  if (etat.moi) throw new ErreurCompte(action === 'retirerDuClub' ? 'Tu ne peux pas te retirer toi-même du club.' : 'Tu ne peux pas retirer ton propre accès.', 403);
  if (!etat.peutDonner) throw new ErreurCompte(refusEtoile(etat), 403);

  if (action === 'retirerCompteClub') {
    if (lien) await retirerCompte(db, club, membreId, lien.user_id as string);
    return { ok: true };
  }

  if (action === 'retirerDuClub') {
    if (!fiche) return { ok: true, unites: [] };
    // Ses places d'abord (refusé s'il est le seul ★ d'une entité), puis son compte, puis sa fiche du club (et son IBAN,
    // déclencheur de 034). Ses tâches gardent son nom.
    const unites = await retirerPlaces(db, userId, club, membreId, String(d.email ?? ''));
    if (lien) await retirerCompte(db, club, membreId, lien.user_id as string);
    const { error: e } = await db.from('gsa_club_membres').delete().eq('club_id', club).eq('id', membreId);
    if (e) throw new ErreurCompte(e.message);
    return { ok: true, unites };
  }

  throw new ErreurCompte('Action inconnue.');
}
