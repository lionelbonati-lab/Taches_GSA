// Tâches GSA – organigramme à glisser-déposer, version réelle (actions « organiser », « annulerOrga », « postes »,
// « suivre », « lierEntite » de la fonction gsa-acces).
// Les règles sont celles de l'appli (src/data/organigramme.ts, src/data/organigrammeServeur.ts), incluses dans
// organigramme.js par `npm run fonction` : ce fichier lit les lignes du club, les passe au calcul et écrit ce qui change
// (clé secrète : une modification touche souvent plusieurs entités, dont l'auteur n'est pas forcément membre).
// Droits : membre du club pour voir et suivre ; admin des fiches touchées directement (ou du comité central) pour les
// changer ; celles qui suivent par un poste lié suivent. Les déclencheurs du serveur font le reste (registre des membres,
// fiches liées « Membres de »). Une personne placée dans une entité y retrouve son compte (s'il existe au club).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
// @ts-ignore module généré (npm run fonction), sans types
import { convertir, fichesArrivees, lierEntiteServeur, lireClub, lireOp, organiser, suivreFiches } from './organigramme.js';

type Db = SupabaseClient;
type Ligne = { committee_id: string; kind: string; id: string; pos: number; data: unknown; deleted?: boolean };
type Ecriture = { ligne: Ligne; avant: Ligne | null };
type Droits = { central: boolean; admin: string[] };
type Entite = { id: string; name: string; type: string; parent_id: string | null; info: Record<string, unknown> | null };

export const ACTIONS_ORGA = new Set(['organiser', 'annulerOrga', 'postes', 'suivre', 'lierEntite']);

export class Erreur extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const cleDe = (c: string, kind: string, id: string) => `${c}|${kind}|${id}`;
const hasard = (n: number) => crypto.randomUUID().replace(/-/g, '').slice(0, n);

/** Le club de l'entité : ses entités, les fiches, rôles et postes de chacune, et ce que l'auteur peut y faire. */
async function chargerClub(db: Db, committeeId: string, userId: string) {
  const { data: c } = await db.from('committees').select('id, parent_id').eq('id', committeeId).maybeSingle();
  if (!c) throw new Erreur('Entité introuvable.', 404);
  const clubId = (c.parent_id ?? c.id) as string;
  const { data: entites, error } = await db.from('committees').select('id, name, type, parent_id, info').or(`id.eq.${clubId},parent_id.eq.${clubId}`);
  if (error || !entites?.length) throw new Erreur(error?.message ?? 'Club introuvable.');
  const ids = entites.map((e) => e.id as string);
  const lignes: Ligne[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db
      .from('gsa_items')
      .select('committee_id, kind, id, pos, data')
      .in('committee_id', ids)
      .eq('deleted', false)
      .or('kind.eq.people,kind.eq.roles,and(kind.eq.meta,id.eq.postes)')
      .order('committee_id')
      .order('kind')
      .order('id')
      .range(from, from + 999);
    if (e) throw new Erreur(e.message);
    lignes.push(...((data ?? []) as Ligne[]));
    if (!data || data.length < 1000) break;
  }
  // Droits de l'auteur, comme gsa_is_member / gsa_is_admin : lien à une fiche active (Admin pour l'admin), ou propriétaire.
  const { data: liens } = await db.from('gsa_members').select('committee_id, person_id, owner').eq('user_id', userId).in('committee_id', ids);
  const membre = new Set<string>();
  const admin = new Set<string>();
  for (const m of liens ?? []) {
    const p = lignes.find((l) => l.committee_id === m.committee_id && l.kind === 'people' && l.id === m.person_id)?.data as { actif?: boolean; roles?: unknown } | undefined;
    const actif = !!p && p.actif !== false;
    if (m.owner || actif) membre.add(m.committee_id);
    if (m.owner || (actif && Array.isArray(p?.roles) && p.roles.includes('admin'))) admin.add(m.committee_id);
  }
  if (!membre.size) throw new Erreur('Réservé aux membres du club.', 403);
  const droits: Droits = { central: admin.has(clubId), admin: [...admin] };
  return { clubId, entites: entites as Entite[], lignes, membre, admin, droits, club: lireClub(entites, lignes) };
}

/** Écrit les lignes (sans client_id : l'appli ouverte les reçoit en direct). */
async function ecrire(db: Db, lignes: Ligne[]) {
  for (let i = 0; i < lignes.length; i += 200) {
    const lot = lignes.slice(i, i + 200).map((l) => ({ committee_id: l.committee_id, kind: l.kind, id: l.id, pos: l.pos, data: l.data, deleted: !!l.deleted, client_id: null }));
    const { error } = await db.from('gsa_items').upsert(lot, { onConflict: 'committee_id,kind,id' });
    if (error) throw new Erreur(`Enregistrement refusé : ${error.message}`);
  }
}

/** Date de dernière modification des lignes (pour n'annuler que si personne n'y a touché depuis). */
async function dates(db: Db, cles: { c: string; k: string; id: string }[]) {
  const out = new Map<string, string>();
  const parEntite = new Map<string, Set<string>>();
  cles.forEach((x) => parEntite.set(x.c, (parEntite.get(x.c) ?? new Set()).add(x.id)));
  for (const [c, set] of parEntite) {
    const { data } = await db.from('gsa_items').select('committee_id, kind, id, updated_at').eq('committee_id', c).in('id', [...set]).in('kind', ['people', 'meta']);
    (data ?? []).forEach((r) => out.set(cleDe(r.committee_id, r.kind, r.id), r.updated_at));
  }
  return out;
}

/**
 * Fiches arrivées dans une entité : le compte de la personne au club (même fiche du registre, ou même adresse que l'une
 * de ses fiches liées à un compte) lui ouvre l'entité, comme l'action « responsable ».
 */
async function ouvrirAcces(db: Db, clubId: string, ids: string[], arrivees: { committee_id: string; id: string; email: string; membreId?: string }[]) {
  if (!arrivees.length) return;
  const { data: members } = await db.from('gsa_members').select('committee_id, user_id, person_id, owner').in('committee_id', ids);
  const { data: people } = await db.from('gsa_items').select('committee_id, id, data').eq('kind', 'people').eq('deleted', false).in('committee_id', ids);
  const fiche = new Map((people ?? []).map((p) => [`${p.committee_id}|${p.id}`, (p.data ?? {}) as { email?: string; membreId?: string; actif?: boolean }]));
  const parMembre = new Map<string, string>();
  const parEmail = new Map<string, string>();
  const tries = [...(members ?? [])].sort((a, b) => Number(b.committee_id === clubId) - Number(a.committee_id === clubId));
  for (const m of tries) {
    const p = fiche.get(`${m.committee_id}|${m.person_id}`);
    if (!p) continue;
    if (p.membreId && !parMembre.has(p.membreId)) parMembre.set(p.membreId, m.user_id);
    const e = String(p.email ?? '').trim().toLowerCase();
    if (e && !parEmail.has(e)) parEmail.set(e, m.user_id);
  }
  for (const a of arrivees) {
    const user = (a.membreId && parMembre.get(a.membreId)) || (a.email && parEmail.get(a.email));
    if (!user) continue;
    const ici = (members ?? []).filter((m) => m.committee_id === a.committee_id);
    const sien = ici.find((m) => m.user_id === user);
    if (ici.some((m) => m.person_id === a.id && m.user_id !== user)) continue;
    if (!sien) await db.from('gsa_members').insert({ committee_id: a.committee_id, user_id: user, person_id: a.id });
    else if (sien.person_id !== a.id && !sien.owner && (fiche.get(`${a.committee_id}|${sien.person_id}`)?.actif ?? false) === false)
      // Son compte était lié à une fiche retirée de l'entité : il passe à la nouvelle.
      await db.from('gsa_members').update({ person_id: a.id }).eq('committee_id', a.committee_id).eq('user_id', user);
  }
}

// ---------- Annuler : ce que la modification a remplacé, chiffré (clé dérivée de la clé secrète) ----------

async function cle(secret: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}|gsa-organigramme`));
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const enB64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
async function sceller(secret: string, v: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cle(secret), new TextEncoder().encode(JSON.stringify(v))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return enB64(out);
}
async function desceller<T>(secret: string, jeton: unknown): Promise<T> {
  try {
    const raw = Uint8Array.from(atob(String(jeton)), (x) => x.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, await cle(secret), raw.subarray(12));
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    throw new Erreur('Annulation impossible.');
  }
}

interface Jeton {
  u: string;
  club: string;
  exp: number;
  l: { c: string; k: string; id: string; t?: string; avant: Ligne | null; pos: number; apres?: unknown }[];
}

/** Écrit les modifications, ouvre les entités aux comptes des personnes arrivées ; renvoie le jeton pour annuler. */
async function appliquerEcritures(db: Db, secret: string, userId: string, k: Awaited<ReturnType<typeof chargerClub>>, ecr: Ecriture[]) {
  if (!ecr.length) return { unites: [] as string[], annuler: undefined };
  await ecrire(db, ecr.map((e) => e.ligne));
  await ouvrirAcces(db, k.clubId, k.entites.map((e) => e.id), fichesArrivees(ecr)).catch(() => {});
  const t = await dates(db, ecr.map((e) => ({ c: e.ligne.committee_id, k: e.ligne.kind, id: e.ligne.id })));
  const jeton: Jeton = {
    u: userId,
    club: k.clubId,
    exp: Date.now() + 30 * 60_000,
    l: ecr.map((e) => ({ c: e.ligne.committee_id, k: e.ligne.kind, id: e.ligne.id, t: t.get(cleDe(e.ligne.committee_id, e.ligne.kind, e.ligne.id)), avant: e.avant, pos: e.ligne.pos, apres: e.avant ? undefined : e.ligne.data })),
  };
  return { unites: [...new Set(ecr.map((e) => e.ligne.committee_id))], annuler: await sceller(secret, jeton) };
}

/** Les entités sans postes : déduits de leurs fiches (une fois, prudemment : personne ne devient ★). */
async function convertirSiBesoin(db: Db, committeeId: string, userId: string) {
  let k = await chargerClub(db, committeeId, userId);
  const conv = convertir(k.club) as Ecriture[];
  if (conv.length) {
    await ecrire(db, conv.map((e) => e.ligne));
    k = await chargerClub(db, committeeId, userId);
  }
  return { k, converti: conv.length > 0 };
}

/**
 * La personne à placer : celle du registre des membres du club (ses coordonnées font foi), ou une nouvelle personne
 * (fiche du registre créée avec la modification, pour la retrouver d'une entité à l'autre).
 */
async function quiDuRegistre(db: Db, clubId: string, qui: { prenom: string; nom: string; email: string; telephone?: string; couleur: string; membreId?: string }) {
  let r: { id: string; data: Record<string, unknown> } | null = null;
  if (qui.membreId) r = (await db.from('gsa_club_membres').select('id, data').eq('club_id', clubId).eq('id', qui.membreId).maybeSingle()).data;
  const email = qui.email.trim().toLowerCase();
  if (!r && email) {
    const { data } = await db.from('gsa_club_membres').select('id, data').eq('club_id', clubId).ilike('data->>email', email.replace(/[\\%_]/g, (x) => `\\${x}`)).limit(1);
    r = data?.[0] ?? null;
  }
  if (r) {
    const d = r.data;
    const s = (v: unknown) => (typeof v === 'string' ? v : '');
    return { qui: { prenom: s(d.prenom), nom: s(d.nom), email: s(d.email), telephone: s(d.telephone) || undefined, couleur: s(d.couleur) || qui.couleur, membreId: r.id }, nouveau: null };
  }
  if (!qui.prenom.trim() && !qui.nom.trim()) throw new Erreur('Indique au moins son prénom ou son nom.');
  const membreId = `m${hasard(16)}`;
  return { qui: { ...qui, membreId }, nouveau: { club_id: clubId, id: membreId, data: { prenom: qui.prenom.trim(), nom: qui.nom.trim(), email, telephone: qui.telephone ?? '', couleur: qui.couleur, groupes: [] } } };
}

/** Une action de l'organigramme ; renvoie { message, unites, annuler? }. */
export async function actionOrganigramme(db: Db, secret: string, userId: string, action: string, committeeId: string, body: Record<string, unknown>) {
  if (action === 'postes') {
    const { converti } = await convertirSiBesoin(db, committeeId, userId);
    return { converti };
  }

  if (action === 'organiser') {
    const { k } = await convertirSiBesoin(db, committeeId, userId);
    let op = lireOp(body.op);
    let nouveau = null;
    if (op.type === 'placer') {
      const r = await quiDuRegistre(db, k.clubId, op.qui);
      op = { ...op, qui: r.qui };
      nouveau = r.nouveau;
    }
    const r = organiser(k.club, op, k.droits) as { message: string; ecritures: Ecriture[] };
    if (nouveau && r.ecritures.length) {
      const { error } = await db.from('gsa_club_membres').insert(nouveau);
      if (error) throw new Erreur(`Registre des membres : ${error.message}`);
    }
    return { message: r.message, ...(await appliquerEcritures(db, secret, userId, k, r.ecritures)) };
  }

  if (action === 'annulerOrga') {
    const { k } = { k: await chargerClub(db, committeeId, userId) };
    const j = await desceller<Jeton>(secret, body.jeton);
    if (j.u !== userId || j.club !== k.clubId) throw new Erreur('Annulation impossible.', 403);
    if (Date.now() > j.exp) throw new Erreur('Trop tard pour annuler.');
    const t = await dates(db, j.l);
    if (j.l.some((x) => t.get(cleDe(x.c, x.k, x.id)) !== x.t)) throw new Erreur('L’organigramme a changé entre-temps : annulation impossible.', 409);
    // Une fiche créée par la modification est retirée (comme dans l'appli), les autres reprennent leur état d'avant.
    await ecrire(db, j.l.map((x) => (x.avant ? { ...x.avant, deleted: false } : { committee_id: x.c, kind: x.k, id: x.id, pos: x.pos, data: x.apres ?? {}, deleted: true })));
    return { message: 'Annulé.', unites: [...new Set(j.l.map((x) => x.c))] };
  }

  if (action === 'suivre') {
    const { k } = await convertirSiBesoin(db, committeeId, userId);
    if (!k.membre.has(committeeId)) throw new Erreur('Réservé aux membres de l’entité.', 403);
    const ecr = suivreFiches(k.club, committeeId, body.avant, k.droits) as Ecriture[];
    const r = await appliquerEcritures(db, secret, userId, k, ecr);
    return { unites: r.unites };
  }

  if (action === 'lierEntite') {
    const { k } = await convertirSiBesoin(db, committeeId, userId);
    if (!k.droits.central && !k.admin.has(committeeId)) throw new Erreur('Réservé aux admins de l’entité ou du comité central.', 403);
    const r = lierEntiteServeur(k.club, committeeId, k.droits) as { message: string; ecritures: Ecriture[] };
    const e = await appliquerEcritures(db, secret, userId, k, r.ecritures);
    return { message: r.message, unites: e.unites };
  }

  throw new Erreur('Action inconnue.');
}
