import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AppData, MyRequest, OrgMember, OrgUnit, UnitType } from './types';
import { UNIT_COLORS } from './units';

// Version réelle : synchronisation des données du comité avec Supabase.
// Chaque élément de l'appli (tâche, séance, responsable, entrée du journal…) est une ligne de la table
// gsa_items. Après chaque modification, seuls les éléments changés sont envoyés (en petits lots, avec
// une file d'attente gardée hors ligne) ; les modifications des autres membres arrivent en direct (Realtime).

export function sb() {
  if (!supabase) throw new Error('Serveur indisponible.');
  return supabase;
}

export interface Membership {
  committeeId: string;
  committeeName: string;
  personId: string | null;
  owner: boolean;
  /** Entité du club : comité central, sous-comité, groupe, équipe d'événement. */
  type: UnitType;
  /** Comité central dont dépend l'entité. */
  parentId: string | null;
  info: UnitInfo;
}

/** Fiche d'une entité (colonne info de la table committees). */
export interface UnitInfo {
  couleur?: string;
  description?: string;
  date?: string;
  archive?: boolean;
}

/** Collections de l'appli enregistrées élément par élément. */
const ARRAY_KINDS = ['people', 'statuses', 'sections', 'roles', 'tasks', 'meetings', 'events', 'polls', 'emails', 'notifications', 'log'] as const;
/** Tables personne → valeur (réglages, notifications vues). */
const MAP_KINDS = ['prefs', 'notifLues'] as const;
/** Listes dont l'ordre est choisi par l'utilisateur (sinon l'ordre d'ajout est conservé). */
const ORDERED = new Set<string>(['people', 'statuses', 'sections', 'roles']);

export interface Row {
  kind: string;
  id: string;
  pos: number;
  data: unknown;
  deleted?: boolean;
}
interface DbRow extends Row {
  committee_id: string;
  client_id?: string | null;
  updated_at?: string;
}
interface Known {
  json: string;
  pos: number;
}

const keyOf = (kind: string, id: string) => `${kind}|${id}`;

/** JSON à clés triées : jsonb ne garde pas l'ordre des clés, la comparaison doit l'ignorer. */
export function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stable(x))).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

type Entry = { kind: string; id: string; data: unknown; json: string; pos?: number };

/** Découpe les données de l'appli en éléments (la position des listes non ordonnées est calculée au diff). */
function entries(d: AppData): Entry[][] {
  const out: Entry[][] = [];
  const rec = d as unknown as Record<string, unknown>;
  for (const [kind, value] of Object.entries(rec)) {
    if (value === undefined || value === null) continue;
    if ((ARRAY_KINDS as readonly string[]).includes(kind) && Array.isArray(value)) {
      out.push((value as { id: string }[]).map((x, i) => ({ kind, id: String(x.id), data: x, json: stable(x), pos: ORDERED.has(kind) ? i : undefined })));
    } else if ((MAP_KINDS as readonly string[]).includes(kind) && value && typeof value === 'object') {
      out.push(Object.entries(value as Record<string, unknown>).map(([id, x]) => ({ kind, id, data: x, json: stable(x), pos: 0 })));
    } else {
      out.push([{ kind: 'meta', id: kind, data: value, json: stable(value), pos: 0 }]);
    }
  }
  return out;
}

/** Données complètes d'un comité en lignes (création d'une entité avec ses données de départ). */
export function toRows(d: AppData): Row[] {
  return entries(d).flatMap((list) => list.map((e, i) => ({ kind: e.kind, id: e.id, pos: e.pos ?? i, data: e.data })));
}

/** Reconstruit les données de l'appli à partir des lignes du serveur. */
export function fromRows(rows: Row[]): AppData {
  const d: Record<string, unknown> = { prefs: {}, notifLues: {} };
  ARRAY_KINDS.forEach((k) => (d[k] = []));
  const sorted = [...rows].sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1));
  for (const r of sorted) {
    if (r.deleted) continue;
    if (r.kind === 'meta') d[r.id] = r.data;
    else if ((MAP_KINDS as readonly string[]).includes(r.kind)) (d[r.kind] as Record<string, unknown>)[r.id] = r.data;
    else if ((ARRAY_KINDS as readonly string[]).includes(r.kind)) (d[r.kind] as unknown[]).push(r.data);
  }
  return d as unknown as AppData;
}

/** Applique des modifications reçues du serveur aux données affichées. */
export function applyRows(d: AppData, rows: Row[], posOf: (kind: string, id: string) => number): AppData {
  const next = { ...d } as unknown as Record<string, unknown>;
  const byKind = new Map<string, Row[]>();
  rows.forEach((r) => byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]));
  for (const [kind, list] of byKind) {
    if (kind === 'meta') {
      list.forEach((r) => (next[r.id] = r.deleted ? undefined : r.data));
    } else if ((MAP_KINDS as readonly string[]).includes(kind)) {
      const obj = { ...((next[kind] as Record<string, unknown>) ?? {}) };
      list.forEach((r) => (r.deleted ? delete obj[r.id] : (obj[r.id] = r.data)));
      next[kind] = obj;
    } else if ((ARRAY_KINDS as readonly string[]).includes(kind)) {
      let arr = [...((next[kind] as { id: string }[]) ?? [])];
      for (const r of list) {
        const i = arr.findIndex((x) => x.id === r.id);
        if (r.deleted) {
          if (i >= 0) arr.splice(i, 1);
        } else if (i >= 0) arr[i] = r.data as { id: string };
        else {
          const j = arr.findIndex((x) => posOf(kind, x.id) > r.pos);
          arr.splice(j < 0 ? arr.length : j, 0, r.data as { id: string });
        }
      }
      if (ORDERED.has(kind)) arr = arr.sort((a, b) => posOf(kind, a.id) - posOf(kind, b.id));
      next[kind] = arr;
    }
  }
  return next as unknown as AppData;
}

export type SyncStatus = 'ok' | 'envoi' | 'horsLigne';

/** Erreur définitive (refus des règles d'accès, données invalides) : inutile de réessayer. */
const permanent = (e: { code?: string }) => !!e.code && /^(42|23|22|P0)/.test(e.code);

export class CloudSync {
  readonly clientId = crypto.randomUUID();
  private known = new Map<string, Known>();
  private pending = new Map<string, Row>();
  private latest: AppData | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private flushing: Promise<void> | null = null;
  private channel: RealtimeChannel | null = null;
  private lastSeen = '';
  private listeners = new Set<() => void>();
  status: SyncStatus = 'ok';
  /** Modifications refusées par le serveur (message à afficher, éléments à recharger). */
  onRejected: (message: string, rows: Row[]) => void = () => {};

  constructor(
    readonly committeeId: string,
    readonly userId: string,
  ) {
    try {
      const saved = JSON.parse(localStorage.getItem(this.outboxKey) ?? '[]') as Row[];
      saved.forEach((r) => this.pending.set(keyOf(r.kind, r.id), r));
    } catch {
      /* file d'attente illisible : ignorée */
    }
  }

  private get outboxKey() {
    return `taches-gsa-envois-${this.committeeId}-${this.userId}`;
  }
  private saveOutbox() {
    try {
      if (this.pending.size) localStorage.setItem(this.outboxKey, JSON.stringify([...this.pending.values()]));
      else localStorage.removeItem(this.outboxKey);
    } catch {
      /* stockage plein : la file reste en mémoire */
    }
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  get pendingCount() {
    return this.pending.size;
  }
  private setStatus(s: SyncStatus) {
    this.status = s;
    this.listeners.forEach((fn) => fn());
  }

  posOf = (kind: string, id: string) => this.known.get(keyOf(kind, id))?.pos ?? 0;

  private remember(r: Row) {
    const key = keyOf(r.kind, r.id);
    if (r.deleted) this.known.delete(key);
    else this.known.set(key, { json: stable(r.data), pos: r.pos });
  }
  private seen(rows: DbRow[]) {
    rows.forEach((r) => r.updated_at && r.updated_at > this.lastSeen && (this.lastSeen = r.updated_at));
  }

  /** Charge toutes les données du comité (les modifications encore en attente d'envoi passent par-dessus). */
  async load(): Promise<{ data: AppData; empty: boolean }> {
    const rows: DbRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb()
        .from('gsa_items')
        .select('kind, id, pos, data, deleted, updated_at')
        .eq('committee_id', this.committeeId)
        .eq('deleted', false)
        .order('kind')
        .order('id')
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as DbRow[]));
      if (!data || data.length < 1000) break;
    }
    this.known.clear();
    rows.forEach((r) => this.remember(r));
    this.seen(rows);
    const merged = new Map(rows.map((r) => [keyOf(r.kind, r.id), r as Row]));
    this.pending.forEach((r, k) => merged.set(k, r));
    if (this.pending.size) void this.flush();
    return { data: fromRows([...merged.values()]), empty: rows.length === 0 };
  }

  /** Différences entre les données de l'appli et ce que le serveur connaît. */
  private diff(next: AppData): Row[] {
    const out: Row[] = [];
    const present = new Set<string>();
    for (const list of entries(next)) {
      list.forEach((e, i) => {
        const key = keyOf(e.kind, e.id);
        present.add(key);
        const prev = this.known.get(key);
        let pos = e.pos ?? prev?.pos;
        if (pos === undefined) {
          // Nouvel élément d'une liste non ordonnée : placé entre ses voisins déjà connus.
          const before = i > 0 ? (list[i - 1].pos ?? this.known.get(keyOf(e.kind, list[i - 1].id))?.pos) : undefined;
          const after = list.slice(i + 1).map((x) => this.known.get(keyOf(x.kind, x.id))?.pos).find((p) => p !== undefined);
          pos = before !== undefined && after !== undefined ? (before + after) / 2 : before !== undefined ? before + 1 : after !== undefined ? after - 1 : i;
          e.pos = pos;
        }
        if (!prev || prev.json !== e.json || prev.pos !== pos) out.push({ kind: e.kind, id: e.id, pos, data: e.data });
      });
    }
    for (const [key, k] of this.known)
      if (!present.has(key)) {
        const [kind, ...id] = key.split('|');
        out.push({ kind, id: id.join('|'), pos: k.pos, data: JSON.parse(k.json), deleted: true });
      }
    return out;
  }

  /** À appeler après chaque changement des données : l'envoi part après une courte pause. */
  schedule(next: AppData) {
    this.latest = next;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.commit(), 400);
  }

  private commit() {
    clearTimeout(this.timer);
    if (!this.latest) return;
    const rows = this.diff(this.latest);
    if (!rows.length) return;
    rows.forEach((r) => {
      this.remember(r);
      this.pending.set(keyOf(r.kind, r.id), r);
    });
    this.saveOutbox();
    void this.flush();
  }

  /** Envoie immédiatement tout ce qui est en attente (ex. avant de créer l'accès d'un responsable). */
  async flushNow(next?: AppData) {
    if (next) this.latest = next;
    this.commit();
    while (this.flushing) await this.flushing;
    if (this.pending.size) await this.flush();
    if (this.pending.size) throw new Error('Connexion au serveur impossible : réessaie dans un instant.');
  }

  private flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (!this.pending.size) return Promise.resolve();
    this.flushing = this.send().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async upsert(rows: Row[]) {
    return sb()
      .from('gsa_items')
      .upsert(
        rows.map((r) => ({ committee_id: this.committeeId, kind: r.kind, id: r.id, pos: r.pos, data: r.data ?? null, deleted: !!r.deleted, client_id: this.clientId })),
        { onConflict: 'committee_id,kind,id' },
      );
  }

  private async send() {
    this.setStatus('envoi');
    clearTimeout(this.retry);
    while (this.pending.size) {
      const batch = [...this.pending.values()].slice(0, 150);
      let { error } = await this.upsert(batch);
      const rejected: Row[] = [];
      let message = '';
      if (error && permanent(error)) {
        // Un élément refusé ne doit pas bloquer les autres : envoi un par un.
        error = null;
        for (const r of batch) {
          const res = await this.upsert([r]);
          if (res.error && permanent(res.error)) {
            rejected.push(r);
            message = res.error.message;
          } else if (res.error) error = res.error;
        }
      }
      if (error) {
        this.setStatus('horsLigne');
        this.retry = setTimeout(() => void this.flush(), 15000);
        return;
      }
      batch.forEach((r) => {
        const key = keyOf(r.kind, r.id);
        if (this.pending.get(key) === r) this.pending.delete(key);
      });
      this.saveOutbox();
      // Élément refusé : il reste « connu » tel quel (pas de nouvel envoi) jusqu'à ce que la version du serveur soit relue.
      if (rejected.length) this.onRejected(message, rejected);
    }
    this.setStatus('ok');
  }

  /** Relit des éléments précis sur le serveur (après un refus). */
  async fetchRows(rows: { kind: string; id: string }[]): Promise<Row[]> {
    const out: Row[] = [];
    for (const r of rows) {
      const { data } = await sb().from('gsa_items').select('kind, id, pos, data, deleted').eq('committee_id', this.committeeId).eq('kind', r.kind).eq('id', r.id).maybeSingle();
      const row = (data as Row | null) ?? { ...r, pos: 0, data: null, deleted: true };
      this.remember(row);
      out.push(row);
    }
    return out;
  }

  /** Garde la ligne reçue si elle change quelque chose (et si aucune modification locale n'est en attente). */
  private incoming(r: DbRow): Row | null {
    if (r.client_id === this.clientId) return null;
    const key = keyOf(r.kind, r.id);
    if (this.pending.has(key)) return null;
    const prev = this.known.get(key);
    if (r.deleted ? !prev : prev && prev.json === stable(r.data) && prev.pos === r.pos) return null;
    this.remember(r);
    return { kind: r.kind, id: r.id, pos: r.pos, data: r.data, deleted: r.deleted };
  }

  /** Modifications des autres membres, en direct ; rattrapage après une coupure ou une mise en veille. */
  listen(apply: (rows: Row[]) => void) {
    let buffer: Row[] = [];
    let tick: ReturnType<typeof setTimeout> | undefined;
    const push = (rows: Row[]) => {
      buffer.push(...rows);
      clearTimeout(tick);
      tick = setTimeout(() => {
        const b = buffer;
        buffer = [];
        if (b.length) apply(b);
      }, 60);
    };
    const catchUp = async () => {
      if (!this.lastSeen) return;
      const since = new Date(new Date(this.lastSeen).getTime() - 5000).toISOString();
      const { data } = await sb()
        .from('gsa_items')
        .select('kind, id, pos, data, deleted, updated_at, client_id, committee_id')
        .eq('committee_id', this.committeeId)
        .gt('updated_at', since);
      const rows = (data ?? []) as DbRow[];
      this.seen(rows);
      push(rows.map((r) => this.incoming(r)).filter((r): r is Row => !!r));
      void this.flush();
    };
    let connectedOnce = false;
    this.channel = sb()
      .channel(`gsa-${this.committeeId}-${this.clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gsa_items', filter: `committee_id=eq.${this.committeeId}` }, async (payload) => {
        let r = payload.new as DbRow;
        if (!r?.kind) return;
        this.seen([r]);
        // Très gros élément : le contenu n'est pas transmis en direct, on le relit.
        if (r.data === undefined && !r.deleted) {
          const { data } = await sb().from('gsa_items').select('kind, id, pos, data, deleted, client_id, committee_id').eq('committee_id', this.committeeId).eq('kind', r.kind).eq('id', r.id).maybeSingle();
          if (!data) return;
          r = data as DbRow;
        }
        const row = this.incoming(r);
        if (row) push([row]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (connectedOnce) void catchUp();
          connectedOnce = true;
        }
      });
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30000) void catchUp();
    };
    const onOnline = () => void catchUp();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearTimeout(tick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      if (this.channel) void sb().removeChannel(this.channel);
      this.channel = null;
    };
  }
}

/** Comités auxquels le compte connecté a accès. */
export async function myMemberships(userId: string): Promise<Membership[]> {
  const { data, error } = await sb().from('gsa_members').select('committee_id, person_id, owner, committees(name, type, parent_id, info)').eq('user_id', userId);
  if (error) throw new Error(error.message);
  type C = { name?: string; type?: UnitType; parent_id?: string | null; info?: UnitInfo | null };
  return (data ?? []).map((m) => {
    const raw = m.committees as C | C[] | null;
    const c = (Array.isArray(raw) ? raw[0] : raw) ?? {};
    return {
      committeeId: m.committee_id as string,
      committeeName: c.name ?? 'Comité',
      personId: (m.person_id as string | null) ?? null,
      owner: !!m.owner,
      type: c.type ?? 'central',
      parentId: c.parent_id ?? null,
      info: c.info ?? {},
    };
  });
}

const unitColor = (type: UnitType, info: UnitInfo) => info.couleur ?? (type === 'central' ? UNIT_COLORS[0] : UNIT_COLORS[1]);

/** Entité telle que la connaît le compte sans l'organigramme (pendant le chargement, ou s'il échoue). */
export function membershipUnit(m: Membership): OrgUnit {
  return {
    id: m.committeeId,
    nom: m.committeeName,
    type: m.type,
    parentId: m.parentId ?? undefined,
    couleur: unitColor(m.type, m.info),
    description: m.info.description,
    date: m.info.date,
    archive: !!m.info.archive,
    membres: [],
    moi: true,
    moiAdmin: false,
  };
}

/** Organigramme du club : toutes ses entités et leurs membres. */
export async function fetchOrg(clubId: string): Promise<OrgUnit[]> {
  const { data, error } = await sb().rpc('gsa_organigramme', { club: clubId });
  if (error) throw new Error(error.message);
  type R = { id: string; nom: string; type: UnitType; parentId: string | null; info: UnitInfo | null; moi: boolean; moiAdmin: boolean; membres: OrgMember[]; sections: { id: string; nom: string }[] | null };
  return ((data ?? []) as R[]).map((u) => {
    const info = u.info ?? {};
    return {
      id: u.id,
      nom: u.nom,
      type: u.type,
      parentId: u.parentId ?? undefined,
      couleur: unitColor(u.type, info),
      description: info.description,
      date: info.date,
      archive: !!info.archive,
      membres: (u.membres ?? []).map((m) => ({ ...m, autresPostes: m.autresPostes ?? undefined })),
      moi: u.moi,
      moiAdmin: u.moiAdmin,
      sections: u.sections ?? undefined,
    };
  });
}

/** Nom et fiche d'une entité (admins de l'entité ou du comité central). */
export async function updateCommittee(id: string, patch: { name: string; type: UnitType; info: UnitInfo }) {
  const { data, error } = await sb().from('committees').update(patch).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Modification refusée : réservée aux admins de l’entité et du comité central.');
}

/** Tâche envoyée au comité central par une entité du club. */
export async function proposeTask(source: string, tache: { titre: string; remarque: string; delai: string; sectionId: string }) {
  const { data, error } = await sb().rpc('gsa_proposer_tache', { source, tache });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Suivi des demandes de l'entité au comité central. */
export async function myRequests(source: string): Promise<MyRequest[]> {
  const { data, error } = await sb().rpc('gsa_mes_demandes', { source });
  if (error) throw new Error(error.message);
  return (data ?? []) as MyRequest[];
}

/** Le propriétaire choisit sa fiche responsable. */
export async function linkMyPerson(committeeId: string, userId: string, personId: string) {
  const { error } = await sb().from('gsa_members').update({ person_id: personId }).eq('committee_id', committeeId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export interface AccessInfo {
  personId: string | null;
  owner: boolean;
  email?: string;
  derniereConnexion?: string;
  provisoire: boolean;
}

/** Gestion des accès (console admin) : fonction serveur gsa-acces. */
export type AccessRequest =
  | { action: 'liste'; committeeId: string }
  | { action: 'creer' | 'reinitialiser' | 'retirer'; committeeId: string; personId: string; email?: string }
  | { action: 'creerUnite'; committeeId: string; unite: { nom: string; type: UnitType; info: UnitInfo }; rows: Row[]; chefId: string };

export async function accessAction<T = Record<string, unknown>>(body: AccessRequest): Promise<T> {
  const { data, error } = await sb().functions.invoke('gsa-acces', { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg;
    } catch {
      /* message par défaut */
    }
    throw new Error(msg);
  }
  return data as T;
}
