// Tâches GSA – abonnement à l'agenda par lien privé (fonction Supabase « gsa-agenda », sans connexion : verify_jwt off).
// L'agenda de la personne (Google Agenda, Calendrier d'Apple, Outlook) relit …/functions/v1/gsa-agenda/<jeton>.ics
// quand il veut. Le jeton (migration 045) dit qui et quel espace ; les données sont lues comme la personne
// elle-même : rôle « authenticated » et son identité dans la transaction, donc mêmes règles d'accès (RLS) que dans
// l'appli. Un seul espace, le club (PLAN_APPLI_SIMPLE.md, D4) : un lien d'avant la reprise, vers une ancienne entité
// (archivée, `info.reprise`), sert l'espace du club. Plus membre, compte au mot de passe provisoire, lien réinitialisé
// ou supprimé : 404.
// Le contenu (agenda.js) vient de src/data/agendaServeur.ts par `npm run fonction`.
import postgres from 'npm:postgres@3.4.5';
import { agendaAbonnement } from './agenda.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 20 });

const JETON = /^[0-9a-f]{64}$/;
const KINDS = ['people', 'roles', 'sections', 'statuses', 'meetings', 'events', 'tasks', 'polls', 'etiquettes'];

const texte = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Jeton du lien : …/gsa-agenda/<jeton>.ics, ou …/gsa-agenda?t=<jeton>. */
function jetonDe(req: Request) {
  const u = new URL(req.url);
  const j = u.pathname.match(/\/([0-9a-f]{64})(?:\.ics)?$/)?.[1] ?? u.searchParams.get('t') ?? '';
  return JETON.test(j) ? j : null;
}

type Lu = { lignes: { kind: string; id: string; pos: number; data: unknown }[]; fiche: string | null; courante: string; options: Record<string, unknown> };

async function lire(jeton: string): Promise<Lu | null> {
  return await sql.begin(async (tx) => {
    const [a] = await tx`update public.gsa_agenda_abonnements set lu_le = now() where jeton = ${jeton} returning user_id, committee_id, options`;
    if (!a) return null;
    const [u] = await tx`select coalesce(raw_app_meta_data, '{}'::jsonb) as app, email from auth.users where id = ${a.user_id}`;
    // L'espace : celui du lien ; une ancienne entité reprise (059) : l'espace du club.
    const [c] = await tx`select case when parent_id is not null and coalesce(info, '{}'::jsonb) ? 'reprise' then parent_id else id end as espace
      from public.committees where id = ${a.committee_id}`;
    if (!u || !c) return null;
    const [m] = await tx`select person_id from public.gsa_members where committee_id = ${c.espace} and user_id = ${a.user_id}`;
    if (!m) return null;
    // La suite : comme la personne (auth.uid(), auth.jwt() et les règles d'accès de la base).
    const claims = { sub: a.user_id, role: 'authenticated', aud: 'authenticated', email: u.email, app_metadata: u.app };
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await tx`set local role authenticated`;
    const [ok] = await tx`select public.gsa_is_member(${c.espace}) as membre`;
    if (!ok.membre) return null;
    const lignes = await tx`select kind, id, pos, data from public.gsa_items
      where committee_id = ${c.espace} and not deleted and kind in ${tx(KINDS)}`;
    return {
      lignes: lignes.map((r) => ({ kind: r.kind, id: r.id, pos: Number(r.pos), data: r.data })),
      fiche: m.person_id ?? null,
      courante: c.espace,
      options: a.options ?? {},
    };
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return texte('Méthode non autorisée', 405);
  const jeton = jetonDe(req);
  if (!jeton) return texte('Lien d’agenda inconnu ou supprimé.', 404);
  try {
    const lu = await lire(jeton);
    if (!lu) return texte('Lien d’agenda inconnu ou supprimé.', 404);
    const ics = agendaAbonnement({ ...lu, maintenant: new Date() });
    return new Response(req.method === 'HEAD' ? null : ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="agenda.ics"',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    console.error('gsa-agenda', e instanceof Error ? e.message : e);
    return texte('Agenda momentanément indisponible.', 503);
  }
});
