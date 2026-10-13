// Tâches GSA – suppression définitive d'une entité archivée (action « supprimerUnite » de la fonction gsa-acces).
// Réservée aux admins du comité central et aux super-admins ; seulement une entité du club déjà archivée.
// • `apercu` : ce qui serait supprimé (nombres), sans rien toucher.
// • Sinon `nom` doit être le nom de l'entité, retapé pour confirmer. Sont alors supprimés : l'entité et toutes ses données
//   (tâches, tickets, séances avec ordres du jour et PV, événements, sondages, fiches, réglages, journal : gsa_items, en
//   cascade), les accès de ses membres à elle (gsa_members), ses fichiers (stockage, dossier de l'entité). Les postes
//   liés ⛓ à elle dans les autres entités sont déliés (ils restent, avec leur titulaire) ; elle est retirée des groupes du
//   registre « Membres du club ». Restent : les tickets qu'elle a envoyés à une autre caisse, les copies de ses tâches,
//   les photos des années passées de l'organigramme. Le journal du comité central note la suppression.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Db = SupabaseClient;

export class ErreurSuppression extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const BUCKET = 'gsa-fichiers';

/** Fichiers du dossier de l'entité (et de ses sous-dossiers, s'il y en a). */
async function fichiers(db: Db, dossier: string, profondeur = 0): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(dossier, { limit: 1000, offset });
    if (error) throw new ErreurSuppression(`Fichiers illisibles : ${error.message}`, 500);
    for (const f of data ?? []) {
      if (f.id) out.push(`${dossier}/${f.name}`);
      else if (profondeur < 3) out.push(...(await fichiers(db, `${dossier}/${f.name}`, profondeur + 1)));
    }
    if (!data || data.length < 1000) return out;
  }
}

async function compter(db: Db, uniteId: string, kind: string, ticket?: boolean) {
  let q = db.from('gsa_items').select('id', { count: 'exact', head: true }).eq('committee_id', uniteId).eq('kind', kind).eq('deleted', false);
  if (ticket === true) q = q.not('data->paiement', 'is', null);
  if (ticket === false) q = q.is('data->paiement', null);
  const { count, error } = await q;
  if (error) throw new ErreurSuppression(error.message, 500);
  return count ?? 0;
}

type Poste = { id: string; lien?: string; [k: string]: unknown };

/** Listes de postes des autres entités du club qui ont un poste lié ⛓ à l'entité. */
async function postesLies(db: Db, club: string, uniteId: string) {
  const { data: ids } = await db.from('committees').select('id').or(`id.eq.${club},parent_id.eq.${club}`);
  const autres = (ids ?? []).map((x) => x.id as string).filter((id) => id !== uniteId);
  if (!autres.length) return [];
  const { data, error } = await db
    .from('gsa_items')
    .select('committee_id, data')
    .in('committee_id', autres)
    .eq('kind', 'meta')
    .eq('id', 'postes')
    .eq('deleted', false)
    // (Chaîne JSON : un tableau passé tel quel deviendrait un tableau Postgres.)
    .contains('data', JSON.stringify([{ lien: uniteId }]));
  if (error) throw new ErreurSuppression(error.message, 500);
  return (data ?? []).filter((r) => Array.isArray(r.data)) as { committee_id: string; data: Poste[] }[];
}

export async function supprimerUnite(db: Db, userId: string, club: string, body: Record<string, unknown>, droit: () => Promise<boolean>) {
  const uniteId = String(body.uniteId ?? '');
  const { data: u } = await db.from('committees').select('id, name, parent_id, info').eq('id', uniteId).maybeSingle();
  if (!u || !u.parent_id || u.parent_id !== club) throw new ErreurSuppression('Entité introuvable.', 404);
  if (!(await droit())) throw new ErreurSuppression('Réservé aux administrateurs du comité central.', 403);
  if (u.info?.archive !== true) throw new ErreurSuppression('Seule une entité archivée se supprime : archive-la d’abord.');
  const liste = await fichiers(db, uniteId);
  const lies = await postesLies(db, club, uniteId);

  if (body.apercu === true) {
    const [taches, tickets, seances, evenements, sondages, personnes] = await Promise.all([
      compter(db, uniteId, 'tasks', false),
      compter(db, uniteId, 'tasks', true),
      compter(db, uniteId, 'meetings'),
      compter(db, uniteId, 'events'),
      compter(db, uniteId, 'polls'),
      compter(db, uniteId, 'people'),
    ]);
    const { count: acces } = await db.from('gsa_members').select('user_id', { count: 'exact', head: true }).eq('committee_id', uniteId);
    const { data: dep } = await db.from('committees').select('name, info').eq('parent_id', club).eq('info->>dependDe', uniteId);
    return {
      nom: u.name as string,
      taches,
      tickets,
      seances,
      evenements,
      sondages,
      personnes,
      acces: acces ?? 0,
      fichiers: liste.length,
      dependantes: (dep ?? []).filter((x) => x.info?.archive !== true).map((x) => x.name as string),
      postesLies: lies.reduce((n, r) => n + r.data.filter((p) => p.lien === uniteId).length, 0),
    };
  }

  if (String(body.nom ?? '').trim() !== String(u.name).trim()) throw new ErreurSuppression('Le nom tapé n’est pas celui de l’entité : rien n’a été supprimé.');

  // L'entité et toutes ses données (gsa_items, gsa_members… en cascade).
  const { error } = await db.from('committees').delete().eq('id', uniteId);
  if (error) throw new ErreurSuppression(`Suppression impossible : ${error.message}`, 500);

  const avertissements: string[] = [];
  // Ses fichiers.
  let effaces = 0;
  for (let i = 0; i < liste.length; i += 100) {
    const lot = liste.slice(i, i + 100);
    const { error: e } = await db.storage.from(BUCKET).remove(lot);
    if (e) avertissements.push(`${liste.length - effaces} fichier(s) non effacé(s) : ${e.message}`);
    else effaces += lot.length;
    if (e) break;
  }
  // Postes liés à elle : déliés (le poste et son titulaire restent).
  for (const r of lies) {
    const data = r.data.map((p) => (p.lien === uniteId ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'lien')) : p));
    const { error: e } = await db.from('gsa_items').update({ data, client_id: null }).eq('committee_id', r.committee_id).eq('kind', 'meta').eq('id', 'postes');
    if (e) avertissements.push(`Postes liés non déliés : ${e.message}`);
  }
  // Registre « Membres du club » : plus dans ce groupe.
  const { data: membres } = await db.from('gsa_club_membres').select('id, data').eq('club_id', club).contains('data', { groupes: [uniteId] });
  for (const m of membres ?? []) {
    const groupes = (m.data.groupes as string[]).filter((g) => g !== uniteId);
    const { error: e } = await db.from('gsa_club_membres').update({ data: { ...m.data, groupes } }).eq('club_id', club).eq('id', m.id);
    if (e) avertissements.push(`Registre des membres non mis à jour : ${e.message}`);
  }
  // Journal du comité central.
  const { data: lien } = await db.from('gsa_members').select('person_id').eq('committee_id', club).eq('user_id', userId).maybeSingle();
  const { data: premier } = await db.from('gsa_items').select('pos').eq('committee_id', club).eq('kind', 'log').order('pos', { ascending: true }).limit(1).maybeSingle();
  const id = `l${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const action = `Entité « ${u.name} » supprimée définitivement (archivée ; ses données, ses accès et ${effaces} fichier(s))`;
  await db
    .from('gsa_items')
    .insert({ committee_id: club, kind: 'log', id, pos: (premier?.pos ?? 0) - 1, data: { id, at: new Date().toISOString(), userId: lien?.person_id ?? '', action } });
  return { ok: true, fichiers: effaces, avertissement: avertissements.join(' · ') || undefined };
}
