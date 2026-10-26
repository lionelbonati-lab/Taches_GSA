import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseUrl } from '../lib/supabase';
import type { AppData, Carte, CentralAccess, ClubMembre, FichesEntite, MonRegistre, MyRequest, NouvelleProposition, OrgMember, OrganigrammeAnnuel, OrgUnit, Person, Poste, Proposition, Role, SondagePartage, SuiviTicket, SeancesDuComite, SectionsDependantes, TachePartagee, Task, TicketCentral, UnitType, VisaVerifie, AgendaClubEvent, TachesDependance, PeriodeDependance } from './types';
import { lireCarte, lireHistorique, lireRangement, lireTachesDependance, UNIT_COLORS } from './units';
import { isImage } from './logo';
import { isCouleur } from './couleur';
import type { OpOrga } from './organigramme';
import type { OptionsAbonnement } from './agendaIcs';

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
  dateFin?: string;
  archive?: boolean;
  /** Ancien réglage « Accès du comité central » (006), plus proposé : gardé tel quel. */
  central?: CentralAccess;
  /** Logo (data URL PNG, JPEG ou WebP, 200 Ko au plus : contrôlé par le serveur). */
  logo?: string;
  /** Couleur de l'appli (#rrggbb). */
  couleurAppli?: string;
  /** Icône choisie dans la bibliothèque de l'appli (sa clé). */
  icone?: string;
  /** Entité dont elle dépend dans l'organigramme (et ses tâches, selon tachesDependance : 027). */
  dependDe?: string;
  /** Ses tâches dans l'entité dont elle dépend : « toutes », « rien » ; sans valeur : celles partagées avec elle (027). */
  tachesDependance?: TachesDependance;
  /** Périodes terminées de sa dépendance (tenues par le serveur, 030 ; seul le droit de copie de la dernière change d'ici). */
  historiqueDependance?: PeriodeDependance[];
  /** Place de sa carte dans l'organigramme, posée à la main (affichage seulement). */
  carte?: Carte;
  /** Comité : ordre des cartes de son cadre dans l'organigramme par postes (affichage seulement). */
  rangement?: string[];
}

/** Collections de l'appli enregistrées élément par élément. */
const ARRAY_KINDS = ['people', 'statuses', 'sections', 'roles', 'tasks', 'meetings', 'events', 'polls', 'emails', 'notifications', 'log', 'propositions'] as const;
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
    window.addEventListener(RATTRAPER, onOnline);
    return () => {
      clearTimeout(tick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(RATTRAPER, onOnline);
      if (this.channel) void sb().removeChannel(this.channel);
      this.channel = null;
    };
  }
}

const RATTRAPER = 'gsa-rattraper';
/** Relit ce qui a changé dans l'entité ouverte (après une modification faite par le serveur, sans attendre le direct). */
export function rattraper() {
  window.dispatchEvent(new Event(RATTRAPER));
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

/** Clé d'une icône de la bibliothèque (une clé inconnue de cette version de l'appli affiche l'icône du type). */
const lireIcone = (x: unknown) => (typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x) ? x : undefined);
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
    dateFin: m.info.dateFin,
    archive: !!m.info.archive,
    central: m.info.central,
    logo: isImage(m.info.logo) ? m.info.logo : undefined,
    couleurAppli: isCouleur(m.info.couleurAppli) ? m.info.couleurAppli : undefined,
    icone: lireIcone(m.info.icone),
    dependDe: typeof m.info.dependDe === 'string' ? m.info.dependDe : undefined,
    tachesDependance: lireTachesDependance(m.info.tachesDependance),
    historiqueDependance: lireHistorique(m.info.historiqueDependance),
    carte: lireCarte(m.info.carte),
    rangement: lireRangement(m.info.rangement),
    membres: [],
    moi: true,
    moiAdmin: false,
  };
}

/**
 * Organigramme du club : toutes ses entités et leurs membres. `postes` : le serveur tient les postes des fiches
 * (migration 023 : organigramme à glisser-déposer).
 */
export async function fetchOrg(clubId: string): Promise<{ units: OrgUnit[]; postes: boolean }> {
  const { data, error } = await sb().rpc('gsa_organigramme', { club: clubId });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LigneOrg[];
  return { units: lireOrg(rows), postes: rows.some((u) => 'postes' in u) };
}

/** Une entité telle que la donnent gsa_organigramme et les photos de l'organigramme (026). */
type LigneOrg = { id: string; nom: string; type: UnitType; parentId: string | null; info: UnitInfo | null; moi: boolean; moiAdmin: boolean; membres: OrgMember[]; sections?: { id: string; nom: string }[] | null; liens?: string[] | null; postes?: Poste[] | null };

function lireOrg(rows: LigneOrg[]): OrgUnit[] {
  return rows.map((u) => {
    const info = u.info ?? {};
    return {
      id: u.id,
      nom: u.nom,
      type: u.type,
      parentId: u.parentId ?? undefined,
      couleur: unitColor(u.type, info),
      description: info.description,
      date: info.date,
      dateFin: info.dateFin,
      archive: !!info.archive,
      central: info.central,
      logo: isImage(info.logo) ? info.logo : undefined,
      couleurAppli: isCouleur(info.couleurAppli) ? info.couleurAppli : undefined,
      icone: lireIcone(info.icone),
      dependDe: typeof info.dependDe === 'string' ? info.dependDe : undefined,
      tachesDependance: lireTachesDependance(info.tachesDependance),
      historiqueDependance: lireHistorique(info.historiqueDependance),
      carte: lireCarte(info.carte),
      rangement: lireRangement(info.rangement),
      membres: (u.membres ?? []).map((m) => ({ ...m, autresPostes: m.autresPostes ?? undefined, membreId: m.membreId ?? undefined, viaEntite: m.viaEntite ?? undefined, viaFiche: m.viaFiche ?? undefined })),
      moi: !!u.moi,
      moiAdmin: !!u.moiAdmin,
      sections: u.sections ?? undefined,
      // Avant la migration 020 : pas de liens (undefined) ; ensuite, [] pour une entité sans lien.
      liens: Array.isArray(u.liens) ? u.liens : undefined,
      postes: Array.isArray(u.postes) ? u.postes : undefined,
    };
  });
}

/**
 * Photo de l'organigramme de l'année en cours, prise par le serveur (migration 026) ; rien n'est écrit s'il n'a pas
 * changé. Une année passée ne change plus.
 */
export async function photographierOrganigramme(club: string) {
  const { error } = await sb().rpc('gsa_photo_organigramme', { club });
  if (error) throw new Error(error.message);
}

/** Organigrammes des années enregistrées, de la plus récente à la plus ancienne ; null : pas encore de migration 026. */
export async function fetchOrganigrammesAnnuels(club: string): Promise<OrganigrammeAnnuel[] | null> {
  const { data, error } = await sb().from('gsa_organigrammes').select('annee, maj, data').eq('club_id', club).order('annee', { ascending: false });
  if (error) return null;
  return (data ?? []).map((r) => ({ annee: r.annee as number, maj: r.maj as string, units: lireOrg(Array.isArray(r.data) ? (r.data as LigneOrg[]) : []) }));
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

/** Ticket envoyé depuis une entité à la caisse qui reçoit les siens (photo déjà déposée dans le dossier de cette caisse ; 030). */
export async function sendCentralTicket(source: string, ticket: TicketCentral) {
  const { data, error } = await sb().rpc('gsa_ticket_central', { source, ticket });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Tickets que la personne connectée a envoyés à une autre caisse (comité dont l'entité dépend, caisse centrale), avec leur état. */
export async function myCentralTickets(): Promise<SuiviTicket[]> {
  const { data, error } = await sb().rpc('gsa_mes_tickets_centraux');
  if (error) throw new Error(error.message);
  return (data ?? []) as SuiviTicket[];
}

/** Ticket visé qui porte ce n° de visa (membres du club) ; null : inconnu, visa retiré ou ticket supprimé. */
export async function verifyVisa(code: string): Promise<VisaVerifie | null> {
  const { data, error } = await sb().rpc('gsa_verifier_visa', { code });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Le serveur ne vérifie pas encore les visas (migration 043 à appliquer).');
    throw new Error(error.message);
  }
  return (data as VisaVerifie | null) ?? null;
}

/** Date de la prochaine édition d'une entité (contrôlée par le serveur : gsa_date_edition). */
export async function setEditionDate(c: string, debut: string, fin?: string) {
  const { error } = await sb().rpc('gsa_date_edition', { c, debut, fin: fin ?? null });
  if (error) throw new Error(error.message);
}

/** Agenda du club : événements de toutes ses entités (gsa_agenda_club). */
export async function fetchAgendaClub(club: string): Promise<AgendaClubEvent[]> {
  const { data, error } = await sb().rpc('gsa_agenda_club', { club });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgendaClubEvent[];
}

// ---------- Abonnement à l'agenda par lien privé (migration 045, fonction gsa-agenda) ----------

/** Lien privé de la personne connectée pour une entité : jeton, choix, dernière lecture par un agenda. */
export interface AbonnementAgenda { jeton: string; options: OptionsAbonnement; luLe: string | null }

/** Erreur lisible : abonnement pas encore installé sur le serveur (migration 045). */
function abonnementErreur(e: { message: string; code?: string }): Error {
  return new Error(['42P01', '42883', 'PGRST202', 'PGRST205'].includes(e.code ?? '') || (/gsa_agenda_abonnements|gsa_abonnement_agenda/.test(e.message) && /exist|find|schema cache/i.test(e.message))
    ? 'L’abonnement à l’agenda n’est pas encore installé sur le serveur (mise à jour 045).'
    : e.message);
}

export async function fetchAbonnementAgenda(c: string): Promise<AbonnementAgenda | null> {
  const { data, error } = await sb().from('gsa_agenda_abonnements').select('jeton, options, lu_le').eq('committee_id', c).maybeSingle();
  if (error) throw abonnementErreur(error);
  return data ? { jeton: data.jeton as string, options: (data.options ?? {}) as OptionsAbonnement, luLe: (data.lu_le as string | null) ?? null } : null;
}

/** Crée le lien ou change ses choix ; `nouveau` : nouveau jeton, l'ancien lien ne marche plus. Renvoie le jeton. */
export async function abonnerAgenda(c: string, options: OptionsAbonnement, nouveau = false): Promise<string> {
  const { data, error } = await sb().rpc('gsa_abonnement_agenda', { c, options, nouveau });
  if (error) throw abonnementErreur(error);
  return data as string;
}

export async function supprimerAbonnementAgenda(c: string) {
  const { error } = await sb().rpc('gsa_abonnement_agenda_supprimer', { c });
  if (error) throw abonnementErreur(error);
}

/** Adresse que l'agenda relit (https ; « webcal: » pour l'ouvrir directement dans Calendrier d'Apple). */
export const lienAbonnementAgenda = (jeton: string) => `${supabaseUrl}/functions/v1/gsa-agenda/${jeton}.ics`;

// ---------- Membres du club (registre commun, migration 016) ----------

/** Erreur lisible : registre pas encore installé sur le serveur (migration 016). */
function registreErreur(e: { message: string; code?: string }): Error {
  return new Error(e.code === '42P01' || (/gsa_club_membres|gsa_membres_acces/.test(e.message) && /exist|find|schema cache/i.test(e.message))
    ? 'Le registre des membres du club n’est pas encore installé sur le serveur (mise à jour 016).'
    : e.message);
}

/** L'utilisateur a-t-il accès au registre du club (droit « club.membres » ou admin d'une entité) ? */
export async function membresAcces(club: string): Promise<boolean> {
  const { data, error } = await sb().rpc('gsa_membres_acces', { club });
  return !error && data === true;
}

/** Fonction du serveur absente : migration pas encore appliquée. */
const absente = (e: { code?: string }) => e.code === 'PGRST202' || e.code === '42883';

/**
 * Liste des membres du club (gsa_membres_liste, 034) : données masquées par une personne vides, IBAN aux caissiers et
 * à la personne elle-même. Avant la migration 034 : la table, telle quelle.
 */
export async function fetchMembres(club: string): Promise<ClubMembre[]> {
  const { data, error } = await sb().rpc('gsa_membres_liste', { club });
  if (!error) return ((data ?? []) as ClubMembre[]).map((m) => ({ ...m, groupes: m.groupes ?? [] }));
  if (!absente(error)) throw registreErreur(error);
  const out: ClubMembre[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from('gsa_club_membres').select('id,data').eq('club_id', club).range(from, from + 999);
    if (error) throw registreErreur(error);
    out.push(...(data ?? []).map((r: { id: string; data: Omit<ClubMembre, 'id'> }) => ({ ...r.data, groupes: r.data.groupes ?? [], id: r.id })));
    if ((data ?? []).length < 1000) return out;
  }
}

/**
 * Enregistre des membres (nouveaux ou modifiés) ; le serveur recopie leurs coordonnées dans les fiches liées. L'IBAN lu
 * (avant 034) est renvoyé tel quel ; ensuite le serveur l'ignore, comme les coordonnées masquées et la confidentialité.
 */
export async function saveMembres(club: string, list: ClubMembre[]) {
  for (let i = 0; i < list.length; i += 200) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const rows = list.slice(i, i + 200).map(({ id, masque, moi, prive, ...data }) => ({ club_id: club, id, data }));
    const { error } = await sb().from('gsa_club_membres').upsert(rows, { onConflict: 'club_id,id' });
    if (error) throw registreErreur(error);
  }
}

const PAS_034 = 'Le serveur ne gère pas encore l’IBAN ni la confidentialité des membres (mise à jour 034 à appliquer).';

/** Ma fiche du registre (nom, IBAN, confidentialité) ; null : pas dans le registre du club. */
export async function monRegistre(club: string): Promise<MonRegistre | null> {
  const { data, error } = await sb().rpc('gsa_mon_registre', { club });
  if (error) throw new Error(absente(error) ? PAS_034 : error.message);
  return (data as MonRegistre | null) ?? null;
}

/** Enregistre (ou efface, vide) mon IBAN : la personne elle-même seulement. Renvoie l'IBAN enregistré. */
export async function monIban(club: string, valeur: string): Promise<string> {
  const { data, error } = await sb().rpc('gsa_mon_iban', { club, valeur });
  if (error) throw new Error(absente(error) ? PAS_034 : error.message);
  return (data as string | null) ?? '';
}

/** Masque (ou non) mes données personnelles dans la liste des membres. */
export async function maConfidentialite(club: string, masquer: boolean) {
  const { error } = await sb().rpc('gsa_ma_confidentialite', { club, masquer });
  if (error) throw new Error(absente(error) ? PAS_034 : error.message);
}

/** Caissier du club (rôle qui donne « paiements.payer » dans l'une de ses entités) ; faux avant la migration 034. */
export async function caissierClub(club: string): Promise<boolean> {
  const { data, error } = await sb().rpc('gsa_caissier_club', { club });
  return !error && data === true;
}

/** Fiches et rôles d'une entité dont on est membre (gestion des accès depuis la page « Membres du club »). */
export async function fichesEntite(unite: string): Promise<FichesEntite> {
  const { data, error } = await sb().from('gsa_items').select('kind, id, pos, data').eq('committee_id', unite).in('kind', ['roles', 'people']).eq('deleted', false).order('pos');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { kind: string; data: unknown }[];
  return {
    roles: rows.filter((r) => r.kind === 'roles').map((r) => r.data as Role),
    people: rows.filter((r) => r.kind === 'people').map((r) => r.data as Person),
  };
}

/** Enregistre une fiche dans une entité (ses admins) ; le serveur la lie au registre et vérifie les rôles. */
export async function enregistrerFiche(unite: string, p: Person, pos: number) {
  const { error } = await sb().from('gsa_items').upsert({ committee_id: unite, kind: 'people', id: p.id, pos, data: p, deleted: false }, { onConflict: 'committee_id,kind,id' });
  if (error) throw new Error(error.message);
}

export async function deleteMembre(club: string, id: string) {
  const { error } = await sb().from('gsa_club_membres').delete().eq('club_id', club).eq('id', id);
  if (error) throw registreErreur(error);
}

/** Tâches que d'autres entités du club partagent avec l'entité (migration 019). */
export async function fetchTachesPartagees(unite: string): Promise<TachePartagee[]> {
  const { data, error } = await sb().rpc('gsa_taches_partagees', { unite });
  if (error) throw new Error(error.message);
  return (data ?? []) as TachePartagee[];
}

/** Séances du comité dont dépend l'entité, pour y lier une tâche (032) ; null si le serveur ne les donne pas encore. */
export async function fetchSeancesComite(unite: string): Promise<SeancesDuComite | null> {
  const { data, error } = await sb().rpc('gsa_seances_comite', { unite });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw new Error(error.message);
  }
  const r = (data ?? {}) as Partial<SeancesDuComite>;
  return { comite: typeof r.comite === 'string' ? r.comite : '', seances: Array.isArray(r.seances) ? r.seances : [] };
}

/** Sections des entités qui dépendent de l'entité (033) ; null si le serveur ne les donne pas encore. */
export async function fetchSectionsDependantes(unite: string): Promise<SectionsDependantes | null> {
  const { data, error } = await sb().rpc('gsa_sections_dependantes', { unite });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw new Error(error.message);
  }
  const out: SectionsDependantes = {};
  for (const r of Array.isArray(data) ? (data as { uniteId?: unknown; sections?: unknown }[]) : []) {
    if (typeof r?.uniteId !== 'string' || !Array.isArray(r.sections)) continue;
    out[r.uniteId] = (r.sections as { id?: unknown; nom?: unknown }[])
      .filter((x) => typeof x?.id === 'string' && typeof x.nom === 'string')
      .map((x) => ({ id: x.id as string, nom: x.nom as string }));
  }
  return out;
}

/** Anciennes tâches des entités qui dépendent de l'entité (lecture et copie, 030) ; null si le serveur ne les gère pas encore. */
export async function fetchAnciennesTaches(unite: string): Promise<TachePartagee[] | null> {
  const { data, error } = await sb().rpc('gsa_anciennes_taches', { unite });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw new Error(error.message);
  }
  return (data ?? []) as TachePartagee[];
}

/** Tâches d'autres entités « pour info » de l'entité (037) ; null si le serveur ne les donne pas encore. */
export async function fetchTachesPourInfo(unite: string): Promise<TachePartagee[] | null> {
  const { data, error } = await sb().rpc('gsa_taches_pour_info', { unite });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw new Error(error.message);
  }
  return Array.isArray(data) ? (data as TachePartagee[]) : [];
}

/** Copie des données d'une entité gardée par le serveur (036) : chaque nuit si elles ont changé, 30 jours. */
export interface CopieAuto {
  id: number;
  faiteLe: string;
  /** Faite par « Copier maintenant » (ou avant une restauration), pas par la copie de la nuit. */
  manuelle: boolean;
  lignes: number;
  taille: number;
}

/** Copies de l'entité, la plus récente d'abord (admins) ; null si le serveur ne les fait pas encore (036). */
export async function copiesAuto(unite: string): Promise<CopieAuto[] | null> {
  const { data, error } = await sb().rpc('gsa_copies_liste', { unite });
  if (error) {
    if (absente(error)) return null;
    throw new Error(error.message);
  }
  return Array.isArray(data) ? (data as CopieAuto[]) : [];
}

/** Données de l'entité au moment d'une copie (admins). */
export async function copieAuto(unite: string, copie: number): Promise<AppData> {
  const { data, error } = await sb().rpc('gsa_copie', { unite, copie });
  if (error) throw new Error(error.message);
  return fromRows(Array.isArray(data) ? (data as Row[]) : []);
}

/** Copie tout de suite (admins) : vrai si faite, faux si rien n'a changé depuis la dernière, null avant la 036. */
export async function copierMaintenant(unite: string): Promise<boolean | null> {
  const { data, error } = await sb().rpc('gsa_copier_maintenant', { unite });
  if (error) {
    if (absente(error)) return null;
    throw new Error(error.message);
  }
  return data === true;
}

/** Sondages d'autres entités ouverts à l'entité (migration 021) ; null si le serveur ne les gère pas encore. */
export async function fetchSondagesPartages(unite: string): Promise<SondagePartage[] | null> {
  const { data, error } = await sb().rpc('gsa_sondages_partages', { unite });
  if (error) {
    // Fonction absente : migration 021 pas encore appliquée.
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw new Error(error.message);
  }
  return (data ?? []) as SondagePartage[];
}

/** Réponse à un sondage d'une autre entité, enregistrée dans son entité (le serveur retrouve la clé de vote). */
export async function voterSondagePartage(unite: string, source: string, sondage: string, choix: string[], texte?: string) {
  const { error } = await sb().rpc('gsa_voter_sondage_partage', { unite, source, sondage, choix, texte: texte?.trim() || null });
  if (error) throw new Error(error.message);
}

/** Modification d'une tâche partagée, enregistrée dans son entité (le serveur ne garde que les champs modifiables). */
export async function saveTachePartagee(unite: string, source: string, task: Task) {
  const { error } = await sb().rpc('gsa_modifier_tache_partagee', { unite, source, tache: task.id, modif: task });
  if (error) throw new Error(error.message);
}

/**
 * Tâche du comité `unite` attribuée à l'entité `cible` qui dépend de lui : enregistrée chez elle, partagée avec le comité
 * (gsa_attribuer_tache, 035). `statut` : celui du comité, pour retrouver le même chez elle.
 */
export async function attribuerTache(unite: string, cible: string, task: Task, statut: { label: string; done: boolean }) {
  const { error } = await sb().rpc('gsa_attribuer_tache', { unite, cible, tache: task, statut });
  if (error) throw new Error(absente(error) ? 'Le serveur ne sait pas encore enregistrer une tâche dans l’entité qui dépend du comité (mise à jour 035 à appliquer).' : error.message);
}

/** « 🙋 Je m'en charge » sur une tâche à prendre de l'entité `unite` : la personne connectée en devient responsable (038). */
export async function prendreTache(unite: string, tache: string) {
  const { error } = await sb().rpc('gsa_prendre_tache', { unite, tache });
  if (error) throw new Error(absente(error) ? 'Le serveur ne gère pas encore les tâches à prendre (mise à jour 038 à appliquer).' : error.message);
}

/** « 🙋 Je m'en charge » ou « Pas dispo » sur une tâche à prendre de l'entité `source`, partagée avec `unite` (040). */
export async function repondreTachePartagee(unite: string, source: string, tache: string, prend: boolean) {
  const { error } = await sb().rpc('gsa_repondre_partagee', { unite, source, tache, prend });
  if (error) throw new Error(absente(error) ? 'Le serveur ne gère pas encore les tâches à prendre partagées (mise à jour 040 à appliquer).' : error.message);
}

/** « Pas dispo » sur une tâche à prendre de l'entité `unite` (039). */
export async function pasDispoTache(unite: string, tache: string) {
  const { error } = await sb().rpc('gsa_pas_dispo', { unite, tache });
  if (error) throw new Error(absente(error) ? 'Le serveur ne gère pas encore « Pas dispo » (mise à jour 039 à appliquer).' : error.message);
}

/** Proposition d'amélioration de l'appli, enregistrée au comité central (le serveur y met le nom et l'entité de l'auteur). */
export async function proposerAmelioration(club: string, source: string, p: NouvelleProposition) {
  const { data, error } = await sb().rpc('gsa_proposer_amelioration', { club, source, proposition: p });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Le serveur ne reçoit pas encore les propositions (migration 022 à appliquer).');
    throw new Error(error.message);
  }
  return data as string;
}

/** Propositions envoyées par la personne connectée ; null : le serveur ne les gère pas encore (migration 022). */
export async function mesPropositions(club: string): Promise<Proposition[] | null> {
  const { data, error } = await sb().rpc('gsa_mes_propositions', { club });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw new Error(error.message);
  }
  return (data ?? []) as Proposition[];
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
  | { action: 'creerUnite'; committeeId: string; unite: { nom: string; type: UnitType; info: UnitInfo }; rows: Row[]; chefId: string }
  /** Entité archivée supprimée définitivement (`committeeId` : comité central) ; `apercu` : ce qui serait supprimé. */
  | { action: 'supprimerUnite'; committeeId: string; uniteId: string; apercu?: boolean; nom?: string }
  /** Organigramme câblé : `committeeId` est l'entité dont l'appelant est admin (comité central, ou l'entité elle-même). */
  /**
   * Organigramme à glisser-déposer (supabase/functions/gsa-acces/orga.ts) : `committeeId` est l'entité ouverte (son club
   * est celui de la modification) ; pour « suivre » et « lierEntite », l'entité concernée.
   */
  | { action: 'organiser'; committeeId: string; op: OpOrga }
  | { action: 'annulerOrga'; committeeId: string; jeton: string }
  | { action: 'postes' | 'lierEntite'; committeeId: string }
  | { action: 'suivre'; committeeId: string; avant: Person[] }
  /** Comptes du club (supabase/functions/gsa-acces/comptes.ts, migration 025). */
  | { action: 'approuverMdp' | 'refuserMdp'; demandeId: string }
  | { action: 'comptes' }
  | { action: 'reinitialiserCompte' | 'bloquer' | 'debloquer'; userId: string }
  | { action: 'fusionner'; userId: string; absorber: string };

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

/** Mot de passe oublié, sans connexion : demande aux admins des entités du compte (même réponse s'il n'existe pas). */
export async function demanderMdp(email: string) {
  const { error } = await sb().functions.invoke('gsa-acces', { body: { action: 'demandeMdp', email } });
  if (error) throw new Error(error.message);
}

/** Demande « mot de passe oublié » d'un membre de l'entité (pour ses admins). */
export interface DemandeMdp {
  id: string;
  personId: string | null;
  email: string;
  le: string;
  /** La personne connectée peut la valider (sinon : compte d'un admin d'une autre entité, d'un propriétaire…). */
  peut: boolean;
}

/** Demandes en attente des membres de l'entité (admins) ; rien si le serveur ne les gère pas encore (migration 025). */
export async function demandesMdp(c: string): Promise<DemandeMdp[]> {
  const { data, error } = await sb().rpc('gsa_demandes_mdp_entite', { c });
  if (error) return [];
  return ((data ?? []) as { id: string; person_id: string | null; email: string; le: string; peut: boolean }[]).map((d) => ({
    id: d.id,
    personId: d.person_id,
    email: d.email,
    le: d.le,
    peut: d.peut,
  }));
}

export async function estSuperAdmin(): Promise<boolean> {
  const { data, error } = await sb().rpc('gsa_est_super_admin');
  return !error && data === true;
}

/** Compte du club, vu par un super-admin (page « Comptes du club »). */
export interface CompteClub {
  user_id: string;
  email: string;
  cree_le: string;
  derniere_connexion: string | null;
  bloque: boolean;
  provisoire: boolean;
  super_admin: boolean;
  entites: { committeeId: string; nom: string; type: UnitType; archive: boolean; personId: string | null; owner: boolean; fiche: string | null; actif: boolean; admin: boolean }[];
  demande: string | null;
  demande_le: string | null;
}
