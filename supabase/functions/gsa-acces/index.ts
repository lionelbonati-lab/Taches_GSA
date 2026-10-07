// Tâches GSA – accès des membres à la version réelle (fonction Supabase « gsa-acces »).
// Appelée depuis la console admin : un admin du comité crée, réinitialise ou retire l'accès d'un responsable.
// Depuis l'organigramme, un admin du comité central crée une entité du club (sous-comité, groupe, équipe)
// avec ses données de départ, et l'accès de son président / responsable.
// Les comptes sont créés ici (clé secrète, jamais dans le navigateur), adresse confirmée d'office :
// aucun email n'est envoyé, l'admin transmet lui-même le mot de passe provisoire, à changer à la 1re connexion.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

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

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function tempPassword() {
  const s = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

type Db = SupabaseClient;

async function isAdmin(db: Db, committeeId: string, userId: string) {
  const { data: m } = await db.from('gsa_members').select('owner, person_id').eq('committee_id', committeeId).eq('user_id', userId).maybeSingle();
  if (!m) return false;
  if (m.owner) return true;
  if (!m.person_id) return false;
  const { data: p } = await db.from('gsa_items').select('data, deleted').eq('committee_id', committeeId).eq('kind', 'people').eq('id', m.person_id).maybeSingle();
  return !!p && !p.deleted && p.data?.actif !== false && Array.isArray(p.data?.roles) && p.data.roles.includes('admin');
}

async function findUser(db: Db, email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return null;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
  }
  return null;
}

/** Tous les comptes, par adresse email. */
async function usersByEmail(db: Db) {
  const map = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;
    data.users.forEach((u) => u.email && map.set(u.email.toLowerCase(), u.id));
    if (data.users.length < 200) break;
  }
  return map;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Comptes déjà liés à une fiche du club (comité central d'abord), par adresse de la fiche.
 * On peut se connecter avec une autre adresse que celle de sa fiche : sans cela, choisir quelqu'un
 * dans l'annuaire lui créait un second compte au lieu de lui ouvrir l'entité avec le sien.
 */
async function clubAccounts(db: Db, committeeId: string) {
  const map = new Map<string, string>();
  const { data: c } = await db.from('committees').select('id, parent_id').eq('id', committeeId).maybeSingle();
  const clubId = (c?.parent_id ?? c?.id) as string | undefined;
  if (!clubId) return map;
  const { data: units } = await db.from('committees').select('id').or(`id.eq.${clubId},parent_id.eq.${clubId}`);
  const ids = (units ?? []).map((u) => u.id as string);
  const { data: members } = await db.from('gsa_members').select('committee_id, user_id, person_id').in('committee_id', ids);
  const { data: people } = await db.from('gsa_items').select('committee_id, id, data').eq('kind', 'people').eq('deleted', false).in('committee_id', ids);
  const email = new Map((people ?? []).map((p) => [`${p.committee_id}|${p.id}`, String(p.data?.email ?? '').trim().toLowerCase()]));
  const sorted = [...(members ?? [])].sort((a, b) => Number(b.committee_id === clubId) - Number(a.committee_id === clubId));
  for (const m of sorted) {
    const e = email.get(`${m.committee_id}|${m.person_id}`);
    if (e && EMAIL.test(e) && !map.has(e)) map.set(e, m.user_id as string);
  }
  return map;
}
const UNIT_TYPES = ['sous-comite', 'groupe', 'equipe'];
const KINDS = new Set(['people', 'statuses', 'sections', 'roles', 'tasks', 'meetings', 'events', 'polls', 'emails', 'notifications', 'log', 'prefs', 'notifLues', 'meta']);
type Row = { kind: string; id: string; pos: number; data: Record<string, unknown> };

/** Nouvelle entité du club : contrôle de ce qu'envoie l'appli (données de départ, fiche du président). */
function checkUnit(body: Record<string, unknown>) {
  const u = (body.unite ?? {}) as Record<string, unknown>;
  const nom = String(u.nom ?? '').trim().slice(0, 120);
  if (!nom) return { error: 'Donne un nom à l’entité.' };
  const type = String(u.type ?? '');
  if (!UNIT_TYPES.includes(type)) return { error: 'Type d’entité inconnu.' };
  const raw = (u.info ?? {}) as Record<string, unknown>;
  const info: Record<string, unknown> = {};
  if (typeof raw.couleur === 'string' && /^#[0-9a-f]{6}$/i.test(raw.couleur)) info.couleur = raw.couleur;
  if (typeof raw.description === 'string' && raw.description.trim()) info.description = raw.description.trim().slice(0, 1000);
  if (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) info.date = raw.date;
  const rows = body.rows as Row[];
  if (!Array.isArray(rows) || !rows.length || rows.length > 3000 || JSON.stringify(rows).length > 3_000_000) return { error: 'Données de départ invalides.' };
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r || !KINDS.has(r.kind) || typeof r.id !== 'string' || !r.id || r.id.length > 200 || typeof r.pos !== 'number' || !Number.isFinite(r.pos) || r.data === undefined) return { error: 'Données de départ invalides.' };
    const key = `${r.kind}|${r.id}`;
    if (seen.has(key)) return { error: 'Données de départ en double.' };
    seen.add(key);
  }
  const chef = rows.find((r) => r.kind === 'people' && r.id === body.chefId);
  const roles = chef?.data?.roles;
  if (!chef || !Array.isArray(roles) || !roles.includes('admin')) return { error: 'Le président / responsable doit être admin de l’entité.' };
  const email = String(chef.data.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: 'Adresse email du président / responsable invalide.' };
  return { nom, type, info, rows, chef, email };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: me } = await db.auth.getUser(token);
  if (!me?.user) return json({ error: 'Connexion requise.' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }
  const action = String(body.action ?? '');
  const committeeId = String(body.committeeId ?? '');
  const personId = body.personId ? String(body.personId) : '';
  if (!committeeId || !(await isAdmin(db, committeeId, me.user.id))) return json({ error: 'Réservé aux administrateurs du comité.' }, 403);

  // Liste des accès du comité (avec l'adresse du compte et la dernière connexion).
  if (action === 'liste') {
    const { data: rows } = await db.from('gsa_members').select('user_id, person_id, owner').eq('committee_id', committeeId);
    const out = [];
    for (const r of rows ?? []) {
      const { data: u } = await db.auth.admin.getUserById(r.user_id);
      out.push({ personId: r.person_id, owner: r.owner, email: u.user?.email, derniereConnexion: u.user?.last_sign_in_at, provisoire: !!u.user?.user_metadata?.doit_changer_mdp });
    }
    return json({ acces: out });
  }

  // Nouvelle entité du club (sous-comité, groupe, équipe d'événement) : réservé aux admins du comité central.
  if (action === 'creerUnite') {
    const { data: club } = await db.from('committees').select('id, parent_id').eq('id', committeeId).maybeSingle();
    if (!club || club.parent_id) return json({ error: 'Les entités se créent depuis le comité central.' }, 400);
    const u = checkUnit(body);
    if ('error' in u) return json({ error: u.error }, 400);
    const { data: created, error } = await db.from('committees').insert({ name: u.nom, type: u.type, parent_id: committeeId, info: u.info, created_by: me.user.id }).select('id').single();
    if (error || !created) return json({ error: error?.message ?? 'Création impossible.' }, 400);
    const unitId = created.id as string;
    for (let i = 0; i < u.rows.length; i += 500) {
      const { error: e } = await db.from('gsa_items').insert(u.rows.slice(i, i + 500).map((r) => ({ committee_id: unitId, kind: r.kind, id: r.id, pos: r.pos, data: r.data })));
      if (e) {
        // Entité inutilisable : on la range dans les archives plutôt que de laisser une entité vide active.
        await db.from('committees').update({ info: { ...u.info, archive: true } }).eq('id', unitId);
        return json({ error: `Données de départ refusées : ${e.message}` }, 400);
      }
    }
    // Président : son compte (créé au besoin). Autres membres : leur compte s'ils en ont déjà un (même adresse).
    const users = await usersByEmail(db);
    const linked = await clubAccounts(db, committeeId);
    const account = (email: string) => linked.get(email) ?? users.get(email);
    let password: string | undefined;
    let chefUser = account(u.email);
    if (!chefUser) {
      password = tempPassword();
      const fullName = `${u.chef.data.prenom ?? ''} ${u.chef.data.nom ?? ''}`.trim();
      const { data, error: e } = await db.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { full_name: fullName, doit_changer_mdp: true } });
      if (e || !data.user) return json({ unitId, email: u.email, error: `Entité créée, mais pas l’accès : ${e?.message ?? 'erreur'}. Crée-le depuis sa console admin.` }, 200);
      chefUser = data.user.id;
    }
    const links = new Map<string, string>([[chefUser, u.chef.id]]);
    for (const r of u.rows) {
      if (r.kind !== 'people' || r.id === u.chef.id || r.data?.actif === false) continue;
      const id = account(String(r.data?.email ?? '').trim().toLowerCase());
      if (id && !links.has(id)) links.set(id, r.id);
    }
    const { error: e } = await db.from('gsa_members').insert([...links].map(([user_id, person_id]) => ({ committee_id: unitId, user_id, person_id })));
    if (e) return json({ unitId, email: u.email, error: `Entité créée, mais pas les accès : ${e.message}` }, 200);
    // Adresse de connexion du compte (peut différer de celle de la fiche).
    const login = password ? u.email : (await db.auth.admin.getUserById(chefUser)).data.user?.email ?? u.email;
    return json({ unitId, email: login, password, existant: !password, lies: links.size - 1 });
  }

  // Organigramme câblé : une personne tirée sur une entité en devient le responsable (★, rôle Admin).
  // Admin du comité central (committeeId = comité central) ou de l'entité elle-même (committeeId = l'entité).
  // Sa fiche est reprise (même fiche du registre, ou même adresse) ou créée ; même règle que l'appli (src/data/cablage.ts).
  // Son compte, s'il en a déjà un au club, lui ouvre l'entité ; sinon, l'accès se crée depuis sa fiche.
  if (action === 'responsable') {
    const uniteId = String(body.uniteId ?? '');
    const { data: u } = await db.from('committees').select('id, parent_id, type, info').eq('id', uniteId).maybeSingle();
    if (!u || !u.parent_id) return json({ error: 'Le responsable se désigne pour une entité du club (pas le comité central).' }, 400);
    if (u.id !== committeeId && u.parent_id !== committeeId) return json({ error: 'Réservé aux admins du comité central ou de l’entité.' }, 403);
    if (u.info?.archive) return json({ error: 'Cette entité est archivée.' }, 400);
    const r = (body.responsable ?? {}) as Record<string, unknown>;
    const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const prenom = txt(r.prenom, 80);
    const nom = txt(r.nom, 80);
    const email = txt(r.email, 200).toLowerCase();
    const membreId = txt(r.membreId, 100) || undefined;
    if (!prenom && !nom) return json({ error: 'Nom de la personne manquant.' }, 400);
    if (email && !EMAIL.test(email)) return json({ error: 'Adresse email invalide.' }, 400);
    const chef = u.type === 'sous-comite' ? 'Président' : 'Responsable';
    const poste = txt(r.poste, 80) || chef;
    const couleur = typeof r.couleur === 'string' && /^#[0-9a-f]{6}$/i.test(r.couleur) ? r.couleur : '#64748b';
    const cle = (s: unknown) => String(s ?? '').trim().toLowerCase();

    const { data: rows } = await db.from('gsa_items').select('id, pos, data').eq('committee_id', uniteId).eq('kind', 'people').eq('deleted', false);
    const people = (rows ?? []) as { id: string; pos: number; data: Record<string, unknown> }[];
    const meme = (p: { data: Record<string, unknown> }) => (!!membreId && p.data.membreId === membreId) || (!!email && cle(p.data.email) === email);
    const found = people.find((p) => meme(p) && p.data.actif !== false) ?? people.find(meme);
    const roles = (p: { data: Record<string, unknown> }) => (Array.isArray(p.data.roles) ? (p.data.roles as string[]) : []);
    let fiche: string;
    if (found) {
      const ancien = String(found.data.poste ?? '').trim();
      const autres = [...new Set([...(ancien && cle(ancien) !== cle(poste) ? [ancien] : []), ...String(found.data.autresPostes ?? '').split(',').map((x) => x.trim()).filter(Boolean)])].filter((x) => cle(x) !== cle(poste));
      // Fiche venue d'une autre entité (lien « Membres de ») : elle devient la sienne, un lien n'est jamais admin.
      const { viaEntite: _v, viaFiche: _f, exclu: _e, ...data } = found.data;
      const next = {
        ...data,
        actif: true,
        roles: ['admin', ...roles(found).filter((x) => x !== 'admin')],
        poste,
        autresPostes: autres.length ? autres.join(', ') : undefined,
        membreId: found.data.membreId || membreId,
        telephone: found.data.telephone || txt(r.telephone, 40),
      };
      const { error } = await db.from('gsa_items').update({ data: JSON.parse(JSON.stringify(next)) }).eq('committee_id', uniteId).eq('kind', 'people').eq('id', found.id);
      if (error) return json({ error: error.message }, 400);
      fiche = found.id;
    } else {
      fiche = `p${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const data = JSON.parse(JSON.stringify({ id: fiche, prenom, nom, email, telephone: txt(r.telephone, 40), couleur, poste, roles: ['admin'], actif: true, membreId }));
      const pos = people.reduce((n, p) => Math.max(n, p.pos), 0) + 1;
      const { error } = await db.from('gsa_items').insert({ committee_id: uniteId, kind: 'people', id: fiche, pos, data });
      if (error) return json({ error: error.message }, 400);
    }
    // Responsables actuels : ils restent membres, sans ★ (sauf s'ils doivent le rester aussi).
    let retires = 0;
    if (r.garder !== true) {
      const { data: rr } = await db.from('gsa_items').select('id, data').eq('committee_id', uniteId).eq('kind', 'roles').eq('deleted', false);
      const autresRoles = ((rr ?? []) as { id: string; data: Record<string, unknown> }[]).filter((x) => x.id !== 'admin');
      const defaut =
        autresRoles.find((x) => x.id === 'comite' || x.id === 'membre')?.id ??
        [...autresRoles].sort((a, b) => (Array.isArray(a.data.permissions) ? a.data.permissions.length : 0) - (Array.isArray(b.data.permissions) ? b.data.permissions.length : 0))[0]?.id ??
        'admin';
      for (const p of people) {
        if (p.id === fiche || !roles(p).includes('admin')) continue;
        const reste = roles(p).filter((x) => x !== 'admin');
        const ex = String(p.data.poste ?? '').trim();
        const etaitChef = !!ex && (cle(ex) === cle(chef) || cle(ex) === cle(poste));
        const { error } = await db.from('gsa_items').update({ data: { ...p.data, roles: reste.length ? reste : [defaut], poste: etaitChef ? '' : p.data.poste } }).eq('committee_id', uniteId).eq('kind', 'people').eq('id', p.id);
        if (!error) retires++;
      }
    }
    // Accès : son compte au club (même adresse que l'une de ses fiches), s'il en a un.
    let compte = false;
    if (email) {
      const userId = (await clubAccounts(db, uniteId)).get(email);
      if (userId) {
        const { data: m } = await db.from('gsa_members').select('person_id').eq('committee_id', uniteId).eq('user_id', userId).maybeSingle();
        const { data: autre } = await db.from('gsa_members').select('user_id').eq('committee_id', uniteId).eq('person_id', fiche).maybeSingle();
        if (!m && !autre) compte = !(await db.from('gsa_members').insert({ committee_id: uniteId, user_id: userId, person_id: fiche })).error;
        else if (m && !m.person_id && !autre) compte = !(await db.from('gsa_members').update({ person_id: fiche }).eq('committee_id', uniteId).eq('user_id', userId)).error;
        else compte = m?.person_id === fiche || autre?.user_id === userId;
      }
    }
    return json({ personId: fiche, compte, retires });
  }

  if (!personId) return json({ error: 'Responsable manquant.' }, 400);
  const { data: person } = await db.from('gsa_items').select('data, deleted').eq('committee_id', committeeId).eq('kind', 'people').eq('id', personId).maybeSingle();
  const { data: link } = await db.from('gsa_members').select('user_id, owner').eq('committee_id', committeeId).eq('person_id', personId).maybeSingle();

  if (action === 'creer') {
    if (!person || person.deleted) return json({ error: 'Fiche introuvable : enregistre d’abord le responsable.' }, 404);
    if (person.data?.actif === false) return json({ error: 'Ce responsable est désactivé.' }, 400);
    if (link) return json({ error: 'Ce responsable a déjà un accès.' }, 409);
    const email = String(body.email ?? person.data?.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Adresse email invalide.' }, 400);
    const fullName = `${person.data?.prenom ?? ''} ${person.data?.nom ?? ''}`.trim();
    const linkedId = (await clubAccounts(db, committeeId)).get(email);
    let user = linkedId ? (await db.auth.admin.getUserById(linkedId)).data.user : await findUser(db, email);
    let password: string | undefined;
    if (user) {
      const { data: other } = await db.from('gsa_members').select('person_id').eq('committee_id', committeeId).eq('user_id', user.id).maybeSingle();
      if (other) return json({ error: 'Ce compte est déjà lié à une autre fiche de ce comité.' }, 409);
    } else {
      password = tempPassword();
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, doit_changer_mdp: true } });
      if (error || !data.user) return json({ error: error?.message ?? 'Création du compte impossible.' }, 400);
      user = data.user;
    }
    const { error } = await db.from('gsa_members').insert({ committee_id: committeeId, user_id: user.id, person_id: personId });
    if (error) return json({ error: error.message }, 400);
    return json({ email: user.email ?? email, password, existant: !password });
  }

  if (action === 'reinitialiser') {
    if (!link) return json({ error: 'Ce responsable n’a pas d’accès.' }, 404);
    if (link.owner && link.user_id !== me.user.id) return json({ error: 'Seul le propriétaire peut réinitialiser son propre mot de passe.' }, 403);
    // Un même compte peut servir dans plusieurs entités du club : il faut être admin de chacune
    // (sinon le responsable d'un groupe pourrait prendre le compte du président du club).
    if (link.user_id !== me.user.id) {
      const { data: all } = await db.from('gsa_members').select('committee_id, owner').eq('user_id', link.user_id);
      for (const o of all ?? []) {
        if (o.owner || !(await isAdmin(db, o.committee_id, me.user.id)))
          return json({ error: 'Ce compte sert aussi dans une autre entité du club : seul un admin de chacune de ses entités peut lui donner un nouveau mot de passe.' }, 403);
      }
    }
    const { data: u } = await db.auth.admin.getUserById(link.user_id);
    const password = tempPassword();
    const { error } = await db.auth.admin.updateUserById(link.user_id, { password, user_metadata: { ...(u.user?.user_metadata ?? {}), doit_changer_mdp: true } });
    if (error) return json({ error: error.message }, 400);
    return json({ email: u.user?.email, password });
  }

  if (action === 'retirer') {
    if (!link) return json({ ok: true });
    if (link.owner) return json({ error: 'L’accès du propriétaire ne peut pas être retiré.' }, 403);
    const { error } = await db.from('gsa_members').delete().eq('committee_id', committeeId).eq('user_id', link.user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Action inconnue.' }, 400);
});
