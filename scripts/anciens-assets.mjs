// Publication : garde sur le site les fichiers /assets/ des versions publiées avant (20 dernières, 14 jours au plus).
// Une appli restée ouverte pendant une publication (sur téléphone surtout) charge ses modules à la demande (PDF,
// carte…) : sans les anciens fichiers, « Failed to fetch dynamically imported module ».
// Liste des versions publiée avec le site (versions-assets.json) ; sans elle, les fichiers de la version en ligne
// sont retrouvés depuis sa page d'accueil. Rien ne bloque la publication : en cas d'échec, seule la version du jour part.
//
//   node scripts/anciens-assets.mjs dist https://lionelbonati-lab.github.io/Taches_GSA

import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [dist = 'dist', adresse] = process.argv.slice(2);
const LISTE = 'versions-assets.json';
const MAX_VERSIONS = 20;
const MAX_JOURS = 14;
// Fichiers produits par Vite : nom-<empreinte de 8 caractères>.ext
const NOM = /[\w.-]+-[\w-]{8}\.(?:js|mjs|css|ttf|otf|woff2?|png|jpe?g|svg|webp|wasm)\b/g;

const site = adresse ? adresse.replace(/\/?$/, '/') : '';
const lire = async (chemin) => {
  const r = await fetch(new URL(chemin, site));
  return r.ok ? r : null;
};

/** Fichiers /assets/ de la version en ligne : sa page d'accueil, puis chaque script ou feuille de style cité. */
async function versionEnLigne() {
  const page = await lire(`index.html?t=${Date.now()}`);
  if (!page) return [];
  const vus = new Set();
  let suite = [...(await page.text()).matchAll(NOM)].map((m) => m[0]);
  while (suite.length) {
    const nouveaux = suite.filter((n) => !vus.has(n));
    nouveaux.forEach((n) => vus.add(n));
    const textes = await Promise.all(
      nouveaux.filter((n) => /\.(m?js|css)$/.test(n)).map(async (n) => (await lire(`assets/${n}`))?.text() ?? ''),
    );
    suite = textes.flatMap((t) => [...t.matchAll(NOM)].map((m) => m[0]));
  }
  // Noms trouvés dans le code mais absents du site : écartés au téléchargement.
  return [...vus].sort();
}

async function main() {
  const actuels = (await readdir(join(dist, 'assets'))).sort();
  const maintenant = new Date().toISOString();
  let anciennes = [];
  if (site) {
    try {
      const r = await lire(`${LISTE}?t=${Date.now()}`);
      if (r) anciennes = (await r.json()).versions ?? [];
      else {
        const fichiers = await versionEnLigne();
        if (fichiers.length) anciennes = [{ date: maintenant, fichiers }];
      }
    } catch (e) {
      console.log(`Anciennes versions illisibles (${e.message}) : seule la version du jour est publiée.`);
    }
  }
  const limite = Date.now() - MAX_JOURS * 864e5;
  anciennes = anciennes.filter((v) => Date.parse(v.date) >= limite).slice(0, MAX_VERSIONS - 1);

  // Téléchargement des fichiers des anciennes versions absents de la nouvelle (6 à la fois).
  const ici = new Set(actuels);
  const manquants = [...new Set(anciennes.flatMap((v) => v.fichiers))].filter((n) => !ici.has(n));
  const absents = new Set();
  for (let i = 0; i < manquants.length; i += 6) {
    await Promise.all(
      manquants.slice(i, i + 6).map(async (n) => {
        try {
          const r = await lire(`assets/${n}`);
          if (!r) throw new Error('absent');
          await writeFile(join(dist, 'assets', n), Buffer.from(await r.arrayBuffer()));
        } catch {
          absents.add(n);
        }
      }),
    );
  }
  const versions = [
    { date: maintenant, fichiers: actuels },
    ...anciennes.map((v) => ({ date: v.date, fichiers: v.fichiers.filter((n) => !absents.has(n)) })),
  ];
  await writeFile(join(dist, LISTE), JSON.stringify({ versions }, null, 1));
  console.log(
    `${versions.length} version(s) gardée(s) : ${manquants.length - absents.size} ancien(s) fichier(s) repris` +
      (absents.size ? `, ${absents.size} introuvable(s)` : '') +
      '.',
  );
}

main().catch((e) => console.log(`Anciennes versions non reprises : ${e.message}`));
