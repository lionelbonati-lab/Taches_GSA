// Icône de l'appli installée choisie dans la console admin (logo du club), reprise à la publication du site.
// Les admins du comité central déposent les images dans le stockage public du serveur (migration 017) ;
// ce script les copie dans dist/ à la place des icônes d'origine (public/), après contrôle (PNG à la bonne taille).
//
//   node scripts/icones-club.mjs publier dist   → copie l'icône du club dans dist/ (ou garde celle d'origine)
//   node scripts/icones-club.mjs verifier        → changement=true|false (GITHUB_OUTPUT) : icône déposée ≠ icône en ligne
//
// Serveur injoignable : on reprend l'icône actuellement en ligne plutôt que de revenir à celle d'origine.
// Images refusées : icône d'origine, et la version refusée est notée (pas de nouvelle publication à chaque vérification).
import fs from 'node:fs';
import path from 'node:path';

const TAILLES = {
  'icon-192.png': 192,
  'icon-512.png': 512,
  'icon-maskable-512.png': 512,
  'apple-touch-icon.png': 180,
  'favicon-32.png': 32,
  'favicon-192.png': 192,
  'badge-96.png': 96,
};
for (const n of ['raccourci-tache', 'raccourci-mes-taches', 'raccourci-remboursement', 'raccourci-paiement']) {
  TAILLES[`${n}.png`] = 192;
  TAILLES[`${n}-maskable.png`] = 192;
}

// Dossier public des icônes du club (bucket gsa-public, dossier du comité central) et site publié.
const avecSlash = (u) => (u && !u.endsWith('/') ? `${u}/` : u);
const SOURCE = avecSlash(process.env.ICONE_SOURCE ?? 'https://akmpyrikdudvkbwdhesr.supabase.co/storage/v1/object/public/gsa-public/75bf769b-761b-4b46-ac0c-b4aa41e76afb/');
const SITE = avecSlash(process.env.SITE_URL ?? 'https://lionelbonati-lab.github.io/Taches_GSA/');

class Injoignable extends Error {}

const versionValide = (v) => typeof v === 'string' && /^[0-9a-f]{8,64}$/.test(v);

/** Fichier JSON : objet, null s'il n'existe pas ; Injoignable si le serveur ne répond pas. */
async function lireJson(url) {
  let res;
  try {
    res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new Injoignable(`${url} : ${e.message}`);
  }
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Injoignable(`${url} : ${res.status}`);
  const v = await res.json().catch(() => null);
  return v && typeof v === 'object' ? v : null;
}

/** version.json d'un dossier : objet, null (aucune icône). */
async function lireVersion(url) {
  const v = await lireJson(url);
  return v && versionValide(v.version) ? v : null;
}

/** PNG de la taille attendue (signature et en-tête IHDR). */
function pngValide(buf, taille) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return (
    buf.length > 24 &&
    buf.length <= 1_048_576 &&
    sig.every((b, i) => buf[i] === b) &&
    buf.toString('ascii', 12, 16) === 'IHDR' &&
    buf.readUInt32BE(16) === taille &&
    buf.readUInt32BE(20) === taille
  );
}

/** Toutes les images d'un dossier (null si l'une manque ou n'est pas valable). */
async function telecharger(base, version) {
  const images = {};
  for (const [nom, taille] of Object.entries(TAILLES)) {
    const res = await fetch(`${base}${nom}?v=${version}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) }).catch(() => null);
    const buf = res?.ok ? await res.arrayBuffer().then(Buffer.from, () => null) : null;
    if (!buf || !pngValide(buf, taille)) {
      console.warn(`Icône du club : ${nom} manquant ou non valable (${base}).`);
      return null;
    }
    images[nom] = buf;
  }
  return images;
}

/** Icône déposée sur le serveur ; serveur injoignable : celle en ligne. */
async function iconeVoulue() {
  if (!SOURCE) return { version: null };
  try {
    const v = await lireVersion(`${SOURCE}version.json`);
    return v ? { ...v, base: SOURCE } : { version: null };
  } catch (e) {
    if (!(e instanceof Injoignable) || !SITE) throw e;
    console.warn(`Serveur injoignable (${e.message}) : icône actuellement en ligne gardée.`);
    const v = await lireVersion(`${SITE}icone-version.json`).catch(() => null);
    return v ? { ...v, base: SITE } : { version: null };
  }
}

async function publier(dist) {
  const voulue = await iconeVoulue();
  const images = voulue.version ? await telecharger(voulue.base, voulue.version) : null;
  if (!images) {
    fs.writeFileSync(path.join(dist, 'icone-version.json'), `${JSON.stringify({ version: null, refusee: voulue.version ?? undefined })}\n`);
    console.log(voulue.version ? `Icône du club ${voulue.version} refusée : icône d'origine (public/).` : "Icône d'origine (public/).");
    return;
  }
  for (const [nom, buf] of Object.entries(images)) fs.writeFileSync(path.join(dist, nom), buf);
  const { base: _base, ...version } = voulue;
  fs.writeFileSync(path.join(dist, 'icone-version.json'), `${JSON.stringify(version)}\n`);
  // Nouvelles adresses : les navigateurs et Android voient que l'icône a changé.
  for (const f of ['manifest.webmanifest', 'index.html']) {
    const p = path.join(dist, f);
    let s = fs.readFileSync(p, 'utf8');
    for (const nom of Object.keys(TAILLES)) s = s.replace(new RegExp(`(["/])${nom.replaceAll('.', '\\.')}"`, 'g'), `$1${nom}?v=${version.version}"`);
    fs.writeFileSync(p, s);
  }
  const sw = path.join(dist, 'sw.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const CACHE = '([^']+)'/, `const CACHE = '$1-${version.version}'`));
  console.log(`Icône du club ${version.version} (déposée le ${version.date}).`);
}

async function verifier() {
  let changement = false;
  try {
    const deposee = SOURCE ? await lireVersion(`${SOURCE}version.json`) : null;
    const enLigne = await lireJson(`${SITE}icone-version.json`).catch(() => null);
    // Version traitée par la dernière publication : en ligne, ou refusée (images non valables).
    const traitee = [enLigne?.version, enLigne?.refusee].find(versionValide) ?? null;
    changement = (deposee?.version ?? null) !== traitee;
    console.log(`Icône déposée : ${deposee?.version ?? "d'origine"} ; dernière publication : ${traitee ?? "d'origine"}.`);
  } catch (e) {
    console.warn(`Vérification impossible : ${e.message}`);
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changement=${changement}\n`);
  console.log(`changement=${changement}`);
}

const [mode, dist = 'dist'] = process.argv.slice(2);
if (mode === 'publier') await publier(dist);
else if (mode === 'verifier') await verifier();
else {
  console.error('Usage : node scripts/icones-club.mjs publier <dist> | verifier');
  process.exit(1);
}
