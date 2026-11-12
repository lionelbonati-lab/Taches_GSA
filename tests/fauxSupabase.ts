// Faux serveur Supabase pour tester la synchronisation (cloud.ts) sans réseau : la table gsa_items en mémoire, avec la
// règle de la migration 070 (modification partie d'une version dépassée refusée, code P0409). Remplace src/lib/supabase.ts
// dans tests/synchro.spec.ts (cloud.ts y est compilé avec esbuild).

type Ligne = { committee_id: string; kind: string; id: string; pos: number; data: unknown; deleted: boolean; client_id: string | null; updated_at: string };
type Res = { data: unknown; error: { message: string; code?: string } | null };

export const serveur = {
  lignes: new Map<string, Ligne>(),
  /** Coupé : chaque requête échoue comme sans réseau. */
  horsLigne: false,
  n: 0,
  cle: (c: string, k: string, i: string) => `${c}|${k}|${i}`,
  /** Nouvelle date de version (unique, au format de PostgREST). */
  version() {
    const t = new Date(Date.UTC(2026, 10, 12, 10, 0, 0) + ++this.n * 1000).toISOString().replace('Z', '');
    return `${t}123+00:00`;
  },
  vider() {
    this.lignes.clear();
    this.horsLigne = false;
  },
  /** Écriture directe (une appli pas encore à jour, sans marque de version). */
  ecrire(c: string, kind: string, id: string, data: unknown, deleted = false) {
    this.lignes.set(this.cle(c, kind, id), { committee_id: c, kind, id, pos: 0, data, deleted, client_id: null, updated_at: this.version() });
  },
  lire(c: string, kind: string, id: string) {
    return this.lignes.get(this.cle(c, kind, id));
  },
};

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const choisir = (l: Ligne, cols: string) => Object.fromEntries(cols.split(',').map((c) => c.trim()).map((c) => [c, structuredClone(l[c as keyof Ligne])]));

class Requete implements PromiseLike<Res> {
  private filtres: ((l: Ligne) => boolean)[] = [];
  private cols = '*';
  private une = false;
  private envoi: Ligne[] | null = null;
  private plage: [number, number] | null = null;

  select(cols: string) {
    this.cols = cols;
    return this;
  }
  upsert(rows: Omit<Ligne, 'updated_at'>[]) {
    this.envoi = rows.map((r) => ({ ...structuredClone(r), updated_at: '' }));
    return this;
  }
  eq(col: string, v: unknown) {
    this.filtres.push((l) => l[col as keyof Ligne] === v);
    return this;
  }
  gt(col: string, v: string) {
    this.filtres.push((l) => Date.parse(String(l[col as keyof Ligne])) > Date.parse(v));
    return this;
  }
  order() {
    return this;
  }
  range(a: number, b: number) {
    this.plage = [a, b];
    return this;
  }
  maybeSingle() {
    this.une = true;
    return this;
  }

  private executer(): Res {
    if (serveur.horsLigne) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
    if (this.envoi) {
      // Tout ou rien, comme une requête SQL : une ligne refusée, rien n'est écrit.
      const prets: Ligne[] = [];
      for (const r of this.envoi) {
        const avant = serveur.lire(r.committee_id, r.kind, r.id);
        let data = r.data;
        if (estObjet(data) && 'versionDe' in data) {
          const { versionDe, ...reste } = data;
          data = reste;
          if (avant && (avant.deleted || avant.updated_at !== versionDe))
            return { data: null, error: { message: 'Élément modifié entre-temps par quelqu’un d’autre', code: 'P0409' } };
        }
        prets.push({ ...r, data, updated_at: serveur.version() });
      }
      prets.forEach((l) => serveur.lignes.set(serveur.cle(l.committee_id, l.kind, l.id), l));
      return { data: prets.map((l) => choisir(l, this.cols)), error: null };
    }
    let lignes = [...serveur.lignes.values()].filter((l) => this.filtres.every((f) => f(l)));
    if (this.plage) lignes = lignes.slice(this.plage[0], this.plage[1] + 1);
    const data = lignes.map((l) => choisir(l, this.cols));
    return { data: this.une ? (data[0] ?? null) : data, error: null };
  }

  then<A = Res, B = never>(ok?: ((v: Res) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.executer()).then(ok, ko);
  }
}

const canal = { on: () => canal, subscribe: () => canal };

export const supabase = {
  from: () => new Requete(),
  channel: () => canal,
  removeChannel: async () => {},
  rpc: async () => ({ data: null, error: { message: 'non simulé' } }),
};
export const hasSupabase = true;
export const supabaseUrl = 'http://faux.invalid';
