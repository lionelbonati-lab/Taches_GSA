// Tâches GSA – notifications sur téléphone, même l'appli fermée (fonction Supabase « gsa-push », verify_jwt off).
// Trois demandes (POST, JSON { action }) :
//   - « cle » : la clé publique du serveur (VAPID), créée à la première demande, pour inscrire un appareil ;
//   - « essai » (personne connectée) : une notification d'essai sur ses appareils inscrits ;
//   - « tourner » (planification de la migration 047, avec sa clé de lancement) : pour chaque personne inscrite, ses
//     notifications de la cloche 🔔 dans chacune de ses entités, lues comme elle (mêmes règles d'accès que dans
//     l'appli), puis l'envoi de celles qui ne l'ont pas encore été et qu'elle n'a pas lues. Rien la nuit (22 h – 7 h).
// Le calcul (notifs.js) vient de src/data/pushServeur.ts par `npm run fonction`.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cleEnvoi, luesCommunes, messagesPush, notificationsPush } from './notifs.js';
import { envoyer, nouvellesClesVapid, type Abonnement, type ClesVapid } from './webpush.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20 });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** Adresse de l'appli : sujet des jetons VAPID (le service de notification peut y trouver qui envoie). */
const SUJET = 'https://lionelbonati-lab.github.io/Taches_GSA/';
const KINDS = ['people', 'roles', 'sections', 'statuses', 'meetings', 'events', 'tasks', 'polls', 'emails', 'notifications', 'propositions'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Clés VAPID ; créées (une seule fois, même si deux demandes arrivent ensemble) si elles n'existent pas encore. */
async function clesVapid(): Promise<ClesVapid> {
  const [r] = await sql`select vapid_publique, vapid_privee from public.gsa_push_reglages where id = 1`;
  if (r?.vapid_publique) return { publique: r.vapid_publique, privee: r.vapid_privee };
  const n = await nouvellesClesVapid();
  await sql`update public.gsa_push_reglages set vapid_publique = ${n.publique}, vapid_privee = ${sql.json(JSON.parse(JSON.stringify(n.privee)))} where id = 1 and vapid_publique is null`;
  const [r2] = await sql`select vapid_publique, vapid_privee from public.gsa_push_reglages where id = 1`;
  return { publique: r2.vapid_publique, privee: r2.vapid_privee };
}

type AbonnementLu = Abonnement & { user_id: string };
/** Voir src/data/pushServeur.ts. */
type MessagePush = { titre: string; corps: string; url: string; tag: string };
type Notif = { key: string; icon: string; text: string; sub?: string; link: string };

/** Envoie les messages aux appareils ; retire ceux que le service dit expirés (404, 410). Renvoie le nombre d'envois réussis. */
async function diffuser(appareils: AbonnementLu[], messages: MessagePush[], cles: ClesVapid) {
  let ok = 0;
  for (const a of appareils)
    for (const m of messages) {
      let statut = 0;
      try {
        statut = await envoyer(a, m, cles, SUJET);
      } catch (e) {
        console.error('gsa-push envoi', e instanceof Error ? e.message : e);
      }
      if (statut === 404 || statut === 410) {
        await sql`delete from public.gsa_push_abonnements where endpoint = ${a.endpoint}`;
        break;
      }
      if (statut >= 200 && statut < 300) {
        ok++;
        await sql`update public.gsa_push_abonnements set envoye_le = now(), echecs = 0 where endpoint = ${a.endpoint}`;
      } else {
        const [r] = await sql`update public.gsa_push_abonnements set echecs = echecs + 1 where endpoint = ${a.endpoint} returning echecs`;
        if ((r?.echecs ?? 0) > 10) await sql`delete from public.gsa_push_abonnements where endpoint = ${a.endpoint}`;
        break;
      }
    }
  return ok;
}

/** Notifications non lues de la personne dans une entité, lues comme elle (règles d'accès de la base). */
async function notifsDe(userId: string, committee: string, fiche: string, mesFiches: Record<string, string>, lues: Record<string, string>): Promise<Notif[]> {
  return await sql.begin(async (tx) => {
    const [u] = await tx`select coalesce(raw_app_meta_data, '{}'::jsonb) as app, email from auth.users where id = ${userId}`;
    if (!u) return [];
    const claims = { sub: userId, role: 'authenticated', aud: 'authenticated', email: u.email, app_metadata: u.app };
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await tx`set local role authenticated`;
    const [ok] = await tx`select public.gsa_is_member(${committee}) as membre`;
    if (!ok?.membre) return [];
    const lignes = await tx`select kind, id, pos, data from public.gsa_items
      where committee_id = ${committee} and not deleted and (kind in ${tx(KINDS)} or (kind in ('prefs', 'notifLues') and id = ${fiche}))`;
    // Tâches d'autres entités « pour info » et mots de passe oubliés (admins) : comme dans l'appli, si le serveur les donne.
    const facultatif = async <T,>(f: (sp: typeof tx) => Promise<T>, defaut: T): Promise<T> => {
      try {
        return (await tx.savepoint((sp) => f(sp as unknown as typeof tx))) as T;
      } catch {
        return defaut;
      }
    };
    const pourInfo = await facultatif<unknown>(async (sp) => (await sp`select public.gsa_taches_pour_info(${committee}) as r`)[0]?.r ?? [], []);
    const demandes = await facultatif(
      async (sp) => (await sp`select id, person_id, email, le, peut from public.gsa_demandes_mdp_entite(${committee})`).map((d) => ({ id: d.id as string, personId: d.person_id as string | null, email: d.email as string, le: new Date(d.le).toISOString(), peut: !!d.peut })),
      [] as { id: string; personId: string | null; email: string; le: string; peut: boolean }[],
    );
    return notificationsPush({
      lignes: lignes.map((r) => ({ kind: r.kind, id: r.id, pos: Number(r.pos), data: r.data })),
      fiche,
      courante: committee,
      pourInfo: Array.isArray(pourInfo) ? pourInfo : [],
      demandesMdp: demandes,
      mesFiches,
      lues,
    });
  });
}

/** Heure de Suisse (0–23). */
const heureSuisse = () => Number(new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));

async function tourner() {
  if (heureSuisse() < 7 || heureSuisse() >= 22) return { nuit: true };
  const cles = await clesVapid();
  await sql`delete from public.gsa_push_envois where envoye_le < now() - interval '60 days' and cle not like 'base|%'`;
  const appareils = (await sql`select endpoint, p256dh, auth, user_id from public.gsa_push_abonnements`) as unknown as AbonnementLu[];
  const parPersonne = new Map<string, AbonnementLu[]>();
  for (const a of appareils) parPersonne.set(a.user_id, [...(parPersonne.get(a.user_id) ?? []), a]);
  let envois = 0;
  for (const [userId, siens] of parPersonne) {
    try {
      const entites = await sql`select m.committee_id, m.person_id, c.name from public.gsa_members m join public.committees c on c.id = m.committee_id
        where m.user_id = ${userId} and m.person_id is not null and coalesce(c.info ->> 'archive', 'false') <> 'true'`;
      // Ses fiches : un message écrit depuis l'une de ses entités ne la prévient pas dans une autre.
      const mesFiches = Object.fromEntries(entites.map((e) => [e.committee_id as string, e.person_id as string]));
      // Ses discussions lues dans toutes ses entités : une discussion lue dans l'une ne prévient plus dans une autre.
      const lues = luesCommunes(Object.fromEntries(
        (await sql`select i.committee_id, i.data from public.gsa_items i
          join public.gsa_members m on m.committee_id = i.committee_id and m.person_id = i.id
          where m.user_id = ${userId} and i.kind = 'discussionsLues' and not i.deleted`).map((r) => [r.committee_id as string, r.data]),
      ));
      const deja = new Set((await sql`select cle from public.gsa_push_envois where user_id = ${userId}`).map((r) => r.cle as string));
      const nouvelles: (Notif & { unite: string; nomUnite: string })[] = [];
      const noter: string[] = [];
      for (const e of entites) {
        const items = await notifsDe(userId, e.committee_id, e.person_id, mesFiches, lues);
        const cle = (k: string) => `${e.committee_id}|${cleEnvoi(k)}`;
        const base = `base|${e.committee_id}`;
        if (!deja.has(base)) {
          // Première lecture de l'entité : ce qui est déjà là n'est pas envoyé (l'appareil vient d'être inscrit).
          noter.push(base, ...items.map((x) => cle(x.key)));
          continue;
        }
        for (const x of items) {
          if (deja.has(cle(x.key))) continue;
          deja.add(cle(x.key));
          noter.push(cle(x.key));
          nouvelles.push({ ...x, unite: e.committee_id, nomUnite: e.name });
        }
      }
      if (nouvelles.length) envois += await diffuser(siens, messagesPush(nouvelles, entites.length > 1), cles);
      const uniques = [...new Set(noter)];
      if (uniques.length) await sql`insert into public.gsa_push_envois (user_id, cle) select ${userId}, unnest(${sql.array(uniques)}::text[]) on conflict do nothing`;
    } catch (e) {
      console.error('gsa-push personne', e instanceof Error ? e.message : e);
    }
  }
  return { personnes: parPersonne.size, envois };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  try {
    const { action } = await req.json().catch(() => ({}));
    if (action === 'cle') return json({ cle: (await clesVapid()).publique });
    if (action === 'tourner') {
      const [r] = await sql`select cle_lancement from public.gsa_push_reglages where id = 1`;
      if (!r || req.headers.get('x-gsa-cle') !== r.cle_lancement) return json({ error: 'Non autorisé' }, 401);
      return json(await tourner());
    }
    if (action === 'essai') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: me } = await db.auth.getUser(token);
      if (!me?.user) return json({ error: 'Connexion requise' }, 401);
      const siens = (await sql`select endpoint, p256dh, auth, user_id from public.gsa_push_abonnements where user_id = ${me.user.id}`) as unknown as AbonnementLu[];
      if (!siens.length) return json({ error: 'Aucun appareil inscrit' }, 404);
      const n = await diffuser(siens, [{ titre: '🔔 Notification d’essai', corps: 'Les notifications arrivent sur cet appareil, même l’appli fermée.', url: './#/reglages', tag: 'essai' }], await clesVapid());
      return json({ appareils: siens.length, envois: n });
    }
    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    console.error('gsa-push', e instanceof Error ? e.message : e);
    return json({ error: 'Service momentanément indisponible' }, 503);
  }
});
