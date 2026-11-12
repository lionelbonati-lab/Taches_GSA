import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fusionner } from '../src/data/fusion';

// Synchronisation de la version réelle (cloud.ts) : deux personnes sur le même élément, un appareil hors ligne, une version
// ancienne. cloud.ts est compilé avec un faux serveur (tests/fauxSupabase.ts, règle de la migration 070), sans navigateur.

type Cloud = typeof import('../src/data/cloud');
type Faux = typeof import('./fauxSupabase');
let cloud: Cloud;
let faux: Faux['serveur'];

const ICI = fileURLToPath(new URL('.', import.meta.url));
const C = 'club';
type Sondage = { id: string; question: string; votants: string[]; votes: Record<string, string[]>; textes?: Record<string, string> };
type Seance = { id: string; titre: string; lieu?: string; date?: string };
const sondage = (): Sondage => ({ id: 's1', question: 'Date du souper ?', votants: [], votes: {} });

test.beforeAll(async () => {
  const esbuild = await import('esbuild');
  const chemin = resolve(ICI, 'fauxSupabase.ts');
  const r = await esbuild.build({
    stdin: { contents: `export * as cloud from './src/data/cloud'; export { serveur } from ${JSON.stringify(chemin)};`, resolveDir: resolve(ICI, '..'), loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'faux-serveur', setup: (b) => b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: chemin })) }],
  });
  const fichier = join(mkdtempSync(join(tmpdir(), 'synchro-')), 'cloud.mjs');
  writeFileSync(fichier, r.outputFiles[0].text);
  // Ce que cloud.ts attend du navigateur.
  const stock = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.localStorage = { getItem: (k: string) => stock.get(k) ?? null, setItem: (k: string, v: string) => stock.set(k, v), removeItem: (k: string) => stock.delete(k) };
  const rien = { addEventListener() {}, removeEventListener() {}, querySelector: () => null, visibilityState: 'visible' };
  g.document ??= rien;
  g.window ??= rien;
  const m = (await import(pathToFileURL(fichier).href)) as { cloud: Cloud; serveur: Faux['serveur'] };
  cloud = m.cloud;
  faux = m.serveur;
});

test.beforeEach(() => faux.vider());

/** Un appareil : sa synchronisation, ses données, ce qu'il a affiché après une fusion. */
async function appareil(personne: string) {
  const sync = new cloud.CloudSync(C, personne);
  const fusions: string[] = [];
  const { data } = await sync.load();
  const a = { sync, data: data as unknown as { polls: Sondage[]; meetings: Seance[] }, fusions };
  // Comme l'appli (store.tsx) : la version fusionnée remplace celle affichée.
  sync.onFusion = (rows, sorte) => {
    fusions.push(sorte);
    a.data = cloud.applyRows(a.data as never, rows, sync.posOf) as never;
  };
  return a;
}
type Appareil = Awaited<ReturnType<typeof appareil>>;
/** Modifie les données de l'appareil et les envoie. */
async function modifier(a: Appareil, fn: (d: Appareil['data']) => void) {
  const next = structuredClone(a.data);
  fn(next);
  a.data = next;
  await a.sync.flushNow(next as never);
}
const voter = (qui: string, choix: string) => (d: Appareil['data']) => {
  const s = d.polls.find((x) => x.id === 's1')!;
  s.votes[qui] = [choix];
  if (!s.votants.includes(qui)) s.votants.push(qui);
};
const auServeur = <T>(kind: string, id: string) => faux.lire(C, kind, id)?.data as T;

test('deux votes partis de la même version : les deux restent', async () => {
  faux.ecrire(C, 'polls', 's1', sondage());
  const anna = await appareil('anna');
  const ben = await appareil('ben');
  await modifier(anna, voter('anna', 'vendredi'));
  // Ben vote sans avoir encore reçu le vote d'Anna : le serveur refuse, l'appli fusionne et renvoie.
  await modifier(ben, voter('ben', 'samedi'));
  const s = auServeur<Sondage>('polls', 's1');
  expect(s.votes).toEqual({ anna: ['vendredi'], ben: ['samedi'] });
  expect(s.votants.sort()).toEqual(['anna', 'ben']);
  expect(ben.fusions).toEqual(['fusion']);
  expect(ben.sync.pendingCount).toBe(0);
  // La marque de version n'est jamais enregistrée.
  expect(JSON.stringify(s)).not.toContain('versionDe');
  // L'appareil de Ben garde la version fusionnée : un nouvel envoi ne remet pas l'ancienne.
  await ben.sync.flushNow();
  expect(auServeur<Sondage>('polls', 's1').votes).toEqual({ anna: ['vendredi'], ben: ['samedi'] });
});

test('appareil hors ligne, rouvert plus tard : ses changements s’ajoutent à ceux des autres au lieu de les remplacer', async () => {
  faux.ecrire(C, 'polls', 's1', sondage());
  faux.ecrire(C, 'meetings', 'm1', { id: 'm1', titre: 'Comité', lieu: 'Salle 1', date: '2026-11-20' });
  const claire = await appareil('claire');
  // Claire, sans réseau, vote et change le lieu de la séance ; ses envois attendent.
  faux.horsLigne = true;
  await expect(modifier(claire, (d) => {
    voter('claire', 'jeudi')(d);
    d.meetings[0].lieu = 'Salle 2';
  })).rejects.toThrow();
  expect(claire.sync.pendingCount).toBe(2);
  faux.horsLigne = false;

  // Pendant ce temps, deux autres votent et la date de la séance change.
  const dan = await appareil('dan');
  await modifier(dan, voter('dan', 'vendredi'));
  const eve = await appareil('eve');
  await modifier(eve, (d) => {
    voter('eve', 'samedi')(d);
    d.meetings[0].date = '2026-11-27';
  });

  // Claire rouvre l'appli (sa file d'attente a été gardée) et retrouve le réseau.
  const claire2 = await appareil('claire');
  await claire2.sync.flushNow();
  expect(auServeur<Sondage>('polls', 's1').votes).toEqual({ claire: ['jeudi'], dan: ['vendredi'], eve: ['samedi'] });
  expect(auServeur<Sondage>('polls', 's1').votants.sort()).toEqual(['claire', 'dan', 'eve']);
  expect(auServeur<Seance>('meetings', 'm1')).toEqual({ id: 'm1', titre: 'Comité', lieu: 'Salle 2', date: '2026-11-27' });
  expect(claire2.fusions.sort()).toEqual(['fusion', 'fusion']);
});

test('le même champ changé des deux côtés : la dernière saisie l’emporte, et c’est signalé', async () => {
  faux.ecrire(C, 'meetings', 'm1', { id: 'm1', titre: 'Comité', lieu: 'Salle 1' });
  const anna = await appareil('anna');
  const ben = await appareil('ben');
  await modifier(anna, (d) => void (d.meetings[0].lieu = 'Salle 2'));
  await modifier(ben, (d) => {
    d.meetings[0].lieu = 'Salle 3';
    d.meetings[0].titre = 'Comité de novembre';
  });
  expect(auServeur<Seance>('meetings', 'm1')).toEqual({ id: 'm1', titre: 'Comité de novembre', lieu: 'Salle 3' });
  expect(ben.fusions).toEqual(['conflit']);
});

test('élément supprimé entre-temps par quelqu’un d’autre : la suppression est gardée, et c’est signalé', async () => {
  faux.ecrire(C, 'polls', 's1', sondage());
  const anna = await appareil('anna');
  faux.ecrire(C, 'polls', 's1', sondage(), true);
  await modifier(anna, voter('anna', 'vendredi'));
  expect(faux.lire(C, 'polls', 's1')?.deleted).toBe(true);
  expect(anna.fusions).toEqual(['efface']);
  expect(anna.sync.pendingCount).toBe(0);
});

test('une appli pas encore à jour (sans version) écrit comme avant ; la suivante part de sa version', async () => {
  faux.ecrire(C, 'polls', 's1', sondage());
  const anna = await appareil('anna');
  faux.ecrire(C, 'polls', 's1', { ...sondage(), votes: { vieux: ['jeudi'] }, votants: ['vieux'] });
  await modifier(anna, voter('anna', 'vendredi'));
  expect(auServeur<Sondage>('polls', 's1').votes).toEqual({ vieux: ['jeudi'], anna: ['vendredi'] });
  // Deux modifications de suite du même appareil : la seconde part de la première, sans refus.
  await modifier(anna, voter('anna', 'samedi'));
  expect(auServeur<Sondage>('polls', 's1').votes).toEqual({ vieux: ['jeudi'], anna: ['samedi'] });
  expect(anna.fusions).toEqual(['fusion']);
});

test('fusion : objets champ par champ, listes de fiches par id, listes simples par ajouts et retraits', () => {
  const base = { a: 1, b: { x: 1, y: 1 }, opts: [{ id: 'o1', t: 'A' }, { id: 'o2', t: 'B' }], resp: ['p1', 'p2'] };
  const locale = { a: 2, b: { x: 2, y: 1 }, opts: [{ id: 'o1', t: 'A!' }, { id: 'o2', t: 'B' }, { id: 'o3', t: 'C' }], resp: ['p1', 'p2', 'p3'] };
  const serveur = { a: 1, b: { x: 1, y: 2 }, opts: [{ id: 'o1', t: 'A' }, { id: 'o4', t: 'D' }], resp: ['p2', 'p4'] };
  expect(fusionner(base, locale, serveur)).toEqual({
    valeur: { a: 2, b: { x: 2, y: 2 }, opts: [{ id: 'o1', t: 'A!' }, { id: 'o3', t: 'C' }, { id: 'o4', t: 'D' }], resp: ['p2', 'p3', 'p4'] },
    conflit: false,
  });
  // Champ retiré d'un côté, inchangé de l'autre : retiré.
  expect(fusionner({ a: 1, n: 'x' }, { a: 2, n: 'x' }, { a: 1 }).valeur).toEqual({ a: 2 });
  // Même champ des deux côtés : la version locale, conflit signalé.
  expect(fusionner({ a: 1 }, { a: 2 }, { a: 3 })).toEqual({ valeur: { a: 2 }, conflit: true });
  // Fiche retirée d'un côté mais modifiée de l'autre : gardée, signalé.
  expect(fusionner([{ id: 'o1', t: 'A' }], [], [{ id: 'o1', t: 'A!' }])).toEqual({ valeur: [{ id: 'o1', t: 'A!' }], conflit: true });
});
