// Nom et icône de l'appli installée choisis dans la console admin (comité central), repris à la publication du site.
// Les admins du comité central déposent version.json (icône tirée du logo et/ou nom) et les images dans le stockage
// public du serveur (migration 017) ; ce script les copie dans dist/ à la place des icônes d'origine (public/), après
// contrôle (PNG à la bonne taille), et écrit le nom dans le manifest et la page (titre, meta).
//
//   node scripts/icones-club.mjs publier dist   → applique le nom et l'icône du club à dist/ (ou garde ceux d'origine)
//   node scripts/icones-club.mjs verifier        → changement=true|false (GITHUB_OUTPUT) : version déposée ≠ version en ligne
//
// Serveur injoignable : on reprend ce qui est actuellement en ligne plutôt que de revenir à l'origine.
// Envoi refusé (image ou nom non valable) : nom et icône d'origine, et la version refusée est notée
// (pas de nouvelle publication à chaque vérification).
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

/** version.json d'un dossier : objet, null (rien de personnalisé). */
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

/** Version déposée sur le serveur ; serveur injoignable : celle en ligne. */
async function iconeVoulue() {
  if (!SOURCE) return { version: null };
  try {
    const v = await lireVersion(`${SOURCE}version.json`);
    return v ? { ...v, base: SOURCE } : { version: null };
  } catch (e) {
    if (!(e instanceof Injoignable) || !SITE) throw e;
    console.warn(`Serveur injoignable (${e.message}) : version actuellement en ligne gardée.`);
    const v = await lireVersion(`${SITE}icone-version.json`).catch(() => null);
    return v ? { ...v, base: SITE } : { version: null };
  }
}

const NOM_MAX = 30;
/** Nom choisi : texte propre de 30 caractères au plus ; undefined sans nom, null s'il n'est pas valable. */
function nomChoisi(v) {
  if (v.nom === undefined || v.nom === null) return undefined;
  if (typeof v.nom !== 'string') return null;
  const n = v.nom.replace(/\s+/g, ' ').trim();
  return n && n.length <= NOM_MAX && !/[\u0000-\u001f\u007f<>]/.test(n) ? n : null;
}
const html = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function publier(dist) {
  const voulue = await iconeVoulue();
  const ecrire = (v) => fs.writeFileSync(path.join(dist, 'icone-version.json'), `${JSON.stringify(v)}\n`);
  if (!voulue.version) {
    ecrire({ version: null });
    console.log("Nom et icône d'origine.");
    return;
  }
  const icone = voulue.icone !== false;
  const nom = nomChoisi(voulue);
  const images = nom === null ? null : icone ? await telecharger(voulue.base, voulue.version) : {};
  if (!images) {
    ecrire({ version: null, refusee: voulue.version });
    console.log(`Envoi ${voulue.version} refusé (${nom === null ? 'nom non valable' : 'images non valables'}) : nom et icône d'origine.`);
    return;
  }
  for (const [n, buf] of Object.entries(images)) fs.writeFileSync(path.join(dist, n), buf);
  const { base: _base, ...version } = voulue;
  ecrire({ ...version, icone, nom });
  const v = version.version;

  // Manifest : nom, et nouvelles adresses des icônes (les navigateurs et Android voient qu'elles ont changé).
  const pm = path.join(dist, 'manifest.webmanifest');
  const man = JSON.parse(fs.readFileSync(pm, 'utf8'));
  if (nom) man.name = man.short_name = nom;
  if (icone) [...man.icons, ...(man.shortcuts ?? []).flatMap((r) => r.icons ?? [])].forEach((i) => (i.src = `${i.src}?v=${v}`));
  fs.writeFileSync(pm, `${JSON.stringify(man, null, 2)}\n`);

  // Page : titre et nom de l'appli (iPhone, appli), adresses des icônes.
  const ph = path.join(dist, 'index.html');
  let page = fs.readFileSync(ph, 'utf8');
  if (nom) {
    page = page
      .replace(/<title>[^<]*<\/title>/, () => `<title>${html(nom)}</title>`)
      .replace(/(<meta name="(?:apple-mobile-web-app-title|application-name)" content=")[^"]*"/g, (_, debut) => `${debut}${html(nom)}"`);
  }
  if (icone) for (const n of Object.keys(TAILLES)) page = page.replace(new RegExp(`(["/])${n.replaceAll('.', '\\.')}"`, 'g'), (_, a) => `${a}${n}?v=${v}"`);
  fs.writeFileSync(ph, page);

  const sw = path.join(dist, 'sw.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const CACHE = '([^']+)'/, (_, c) => `const CACHE = '${c}-${v}'`));
  console.log(`Version ${v} du ${version.date} : ${nom ? `nom « ${nom} »` : "nom d'origine"}, ${icone ? 'icône du club' : "icône d'origine"}.`);
}

async function verifier() {
  let changement = false;
  try {
    const deposee = SOURCE ? await lireVersion(`${SOURCE}version.json`) : null;
    const enLigne = await lireJson(`${SITE}icone-version.json`).catch(() => null);
    // Version traitée par la dernière publication : en ligne, ou refusée (envoi non valable).
    const traitee = [enLigne?.version, enLigne?.refusee].find(versionValide) ?? null;
    changement = (deposee?.version ?? null) !== traitee;
    console.log(`Version déposée : ${deposee?.version ?? "d'origine"} ; dernière publication : ${traitee ?? "d'origine"}.`);
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
