import { supabase } from '../lib/supabase';
import { isCouleur, teintes } from './couleur';

// Icône de l'appli installée (écran d'accueil, accès rapides, notifications) : fichiers fixes du site (public/),
// seuls fiables pour l'installation. Par défaut le logo du G.S. Ajoie ; les admins du comité central peuvent
// la remplacer par le logo du club (Console admin › Logo, couleur et nom). L'appli prépare alors les images et les dépose
// dans le stockage public du serveur (bucket « gsa-public », dossier du comité central, migration 017) ;
// la publication du site les reprend (scripts/icones-club.mjs, vérifié toutes les heures). Le nom de l'appli suit le même chemin.

export const BUCKET_PUBLIC = 'gsa-public';
/** Raccourcis sans couleur de l'appli choisie : vert du G.S. Ajoie (comme les icônes d'origine). */
export const VERT_RACCOURCIS = '#24866d';

type Fond = { couleur: string; forme: 'rond' | 'arrondi' | 'carre' };
type Image = { nom: string; taille: number; marge: number; fond?: Fond; silhouette?: boolean };

/** Images tirées du logo (noms des fichiers du site). */
const IMAGES: Image[] = [
  { nom: 'icon-192.png', taille: 192, marge: 0.1, fond: { couleur: '#ffffff', forme: 'arrondi' } },
  { nom: 'icon-512.png', taille: 512, marge: 0.1, fond: { couleur: '#ffffff', forme: 'arrondi' } },
  // Android découpe l'icône (rond, goutte…) : le logo reste dans la zone de sécurité.
  { nom: 'icon-maskable-512.png', taille: 512, marge: 0.2, fond: { couleur: '#ffffff', forme: 'carre' } },
  // iPhone / iPad : carré plein, iOS arrondit lui-même les coins.
  { nom: 'apple-touch-icon.png', taille: 180, marge: 0.1, fond: { couleur: '#ffffff', forme: 'carre' } },
  { nom: 'favicon-32.png', taille: 32, marge: 0.02 },
  { nom: 'favicon-192.png', taille: 192, marge: 0.04 },
  // Notifications Android : seule la forme compte (silhouette blanche).
  { nom: 'badge-96.png', taille: 96, marge: 0.06, silhouette: true },
];

/** Pictogrammes des accès rapides (dessins au trait, grille de 24). */
const RACCOURCIS: Record<string, string> = {
  'raccourci-tache': '<rect width="18" height="18" x="3" y="3" rx="3"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  'raccourci-mes-taches': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  'raccourci-remboursement': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  'raccourci-paiement': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8"/><path d="M8 17h5"/>',
};

/** Tous les fichiers de l'icône, dans l'ordre du dépôt (version.json en dernier : le jeu est alors complet). */
export const FICHIERS_ICONE = [
  ...IMAGES.map((i) => i.nom),
  ...Object.keys(RACCOURCIS).flatMap((n) => [`${n}.png`, `${n}-maskable.png`]),
  'version.json',
];

function charger(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Logo illisible'));
    img.src = src;
  });
}

const toile = (taille: number) => {
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  return { c, ctx };
};

function dessinerFond(ctx: CanvasRenderingContext2D, s: number, fond: Fond) {
  ctx.fillStyle = fond.couleur;
  ctx.beginPath();
  if (fond.forme === 'rond') ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  else if (fond.forme === 'arrondi') ctx.roundRect(0, 0, s, s, s * 0.1875);
  else ctx.rect(0, 0, s, s);
  ctx.fill();
}

/** Logo centré dans le carré (marge relative) ; agrandi en deux temps, plus doux qu'un seul grand pas. */
function dessinerLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement, s: number, marge: number) {
  const w0 = img.naturalWidth || s;
  const h0 = img.naturalHeight || s;
  const k = (s * (1 - 2 * marge)) / Math.max(w0, h0);
  let src: CanvasImageSource = img;
  let [sw, sh] = [w0, h0];
  if (k > 1.4) {
    const t = document.createElement('canvas');
    t.width = Math.round(w0 * Math.sqrt(k));
    t.height = Math.round(h0 * Math.sqrt(k));
    const tx = t.getContext('2d')!;
    tx.imageSmoothingQuality = 'high';
    tx.drawImage(img, 0, 0, t.width, t.height);
    [src, sw, sh] = [t, t.width, t.height];
  }
  const [w, h] = [w0 * k, h0 * k];
  ctx.drawImage(src, 0, 0, sw, sh, (s - w) / 2, (s - h) / 2, w, h);
}

/** Silhouette blanche : le fond transparent ou blanc du logo disparaît, le reste devient blanc. */
function silhouette(ctx: CanvasRenderingContext2D, s: number) {
  const d = ctx.getImageData(0, 0, s, s);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const blancheur = Math.min(p[i], p[i + 1], p[i + 2]);
    p[i + 3] = Math.round(p[i + 3] * Math.min(1, (255 - blancheur) / 60));
    p[i] = p[i + 1] = p[i + 2] = 255;
  }
  ctx.putImageData(d, 0, 0);
}

const enBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Image non créée'))), 'image/png'));

/** Icône d'un accès rapide : pictogramme blanc sur rond (« any ») ou carré plein (« maskable ») de la couleur donnée. */
async function raccourci(trace: string, couleur: string, masquable: boolean): Promise<HTMLCanvasElement> {
  const s = 192;
  const echelle = masquable ? 3.6 : 4.4;
  const t = s / 2 - 12 * echelle;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><g transform="translate(${t} ${t}) scale(${echelle})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${trace}</g></svg>`;
  const img = await charger(`data:image/svg+xml;base64,${btoa(svg)}`);
  const { c, ctx } = toile(s);
  dessinerFond(ctx, s, { couleur, forme: masquable ? 'carre' : 'rond' });
  ctx.drawImage(img, 0, 0, s, s);
  return c;
}

/** Couleur des accès rapides : celle de l'appli du club (lisible sous le blanc), sinon le vert du G.S. Ajoie. */
export const couleurRaccourcis = (couleurAppli?: string) => (isCouleur(couleurAppli) ? teintes(couleurAppli).clair : VERT_RACCOURCIS);

/** Aperçu (data URL) de l'icône de l'appli tirée du logo. */
export async function apercuIcone(logo: string, taille = 96): Promise<string> {
  const img = await charger(logo);
  const { c, ctx } = toile(taille);
  dessinerFond(ctx, taille, { couleur: '#ffffff', forme: 'arrondi' });
  dessinerLogo(ctx, img, taille, 0.1);
  return c.toDataURL('image/png');
}

/** Aperçu (data URL) d'un accès rapide. */
export async function apercuRaccourci(nom: keyof typeof RACCOURCIS | string, couleurAppli?: string): Promise<string> {
  return (await raccourci(RACCOURCIS[nom], couleurRaccourcis(couleurAppli), false)).toDataURL('image/png');
}
export const NOMS_RACCOURCIS = Object.keys(RACCOURCIS);

/** Appli installée personnalisée pour le club (version.json) : icône tirée du logo (icone) et/ou nom. */
export type VersionIcone = { version: string; date: string; icone: boolean; logo?: string; couleur?: string; nom?: string };
type Contenu = Omit<VersionIcone, 'version' | 'date'>;

/** Empreinte courte (logo, version publiée). */
async function empreinte(texte: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const empreinteLogo = (logo: string) => empreinte(logo);

async function nouvelleVersion(contenu: Contenu): Promise<VersionIcone> {
  const date = new Date().toISOString();
  return { version: await empreinte(`${JSON.stringify(contenu)}|${date}`), date, ...contenu };
}

/** Prépare toutes les images de l'icône à partir du logo et de la couleur de l'appli du club. */
export async function preparerIcone(logo: string, couleurAppli?: string): Promise<{ fichiers: [string, Blob][]; logo: string; couleur: string }> {
  const img = await charger(logo);
  const fichiers: [string, Blob][] = [];
  for (const i of IMAGES) {
    const { c, ctx } = toile(i.taille);
    if (i.fond) dessinerFond(ctx, i.taille, i.fond);
    dessinerLogo(ctx, img, i.taille, i.marge);
    if (i.silhouette) silhouette(ctx, i.taille);
    fichiers.push([i.nom, await enBlob(c)]);
  }
  const couleur = couleurRaccourcis(couleurAppli);
  for (const [nom, trace] of Object.entries(RACCOURCIS)) {
    fichiers.push([`${nom}.png`, await enBlob(await raccourci(trace, couleur, false))]);
    fichiers.push([`${nom}-maskable.png`, await enBlob(await raccourci(trace, couleur, true))]);
  }
  return { fichiers, logo: await empreinte(logo), couleur };
}

// ---------- Serveur (version réelle) ----------

const sb = () => {
  if (!supabase) throw new Error('Serveur indisponible');
  return supabase;
};
const store = () => sb().storage.from(BUCKET_PUBLIC);
const chemin = (club: string, nom: string) => `${club}/${nom}`;

/** Personnalisation déposée pour le club (null : icône et nom d'origine), lue sans cache. */
export async function iconeDeposee(club: string): Promise<VersionIcone | null> {
  const url = store().getPublicUrl(chemin(club, 'version.json')).data.publicUrl;
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Icône du club illisible (${res.status})`);
  const v = (await res.json()) as VersionIcone;
  return { ...v, icone: v.icone !== false };
}

/** Adresse publique d'une image de l'icône déposée. */
export const imageDeposee = (club: string, nom: string, version: string) => `${store().getPublicUrl(chemin(club, nom)).data.publicUrl}?v=${version}`;

/** Dernière publication du site : version en ligne (null : icône et nom d'origine) et version refusée (envoi non valable). */
export async function iconePubliee(): Promise<{ version: string | null; refusee?: string } | null> {
  try {
    const res = await fetch(`./icone-version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const v = (await res.json()) as { version?: string | null; refusee?: string };
    return { version: v.version ?? null, refusee: v.refusee };
  } catch {
    return null;
  }
}

async function envoyer(club: string, nom: string, corps: Blob, type: string) {
  const { error } = await store().upload(chemin(club, nom), corps, { upsert: true, contentType: type, cacheControl: '60' });
  if (error) throw new Error(`Non enregistré : ${error.message}`);
}
async function ecrireVersion(club: string, contenu: Contenu): Promise<VersionIcone> {
  const v = await nouvelleVersion(contenu);
  await envoyer(club, 'version.json', new Blob([JSON.stringify(v)], { type: 'application/json' }), 'application/json');
  return v;
}
async function retirer(club: string, noms: string[]) {
  const { error } = await store().remove(noms.map((n) => chemin(club, n)));
  if (error) throw new Error(`Non retiré : ${error.message}`);
}
const IMAGES_ICONE = FICHIERS_ICONE.filter((n) => n !== 'version.json');

/** Dépose l'icône tirée du logo du club (images d'abord, version.json en dernier), en gardant le nom choisi. */
export async function deposerIcone(club: string, logo: string, couleurAppli?: string, nom?: string): Promise<VersionIcone> {
  const icone = await preparerIcone(logo, couleurAppli);
  for (const [n, blob] of icone.fichiers) await envoyer(club, n, blob, 'image/png');
  return ecrireVersion(club, { icone: true, logo: icone.logo, couleur: icone.couleur, nom });
}

/** Revient à l'icône d'origine, en gardant le nom choisi (sans nom : plus rien de personnalisé). */
export async function retirerIcone(club: string, nom?: string) {
  if (nom) await ecrireVersion(club, { icone: false, nom });
  else await retirer(club, ['version.json']);
  await retirer(club, IMAGES_ICONE);
}

/** Change le nom de l'appli (sans nom : celui d'origine), en gardant l'icône déposée. */
export async function deposerNom(club: string, deposee: VersionIcone | null, nom?: string) {
  if (deposee?.icone) return ecrireVersion(club, { icone: true, logo: deposee.logo, couleur: deposee.couleur, nom });
  if (nom) return ecrireVersion(club, { icone: false, nom });
  await retirer(club, ['version.json']);
  return null;
}
