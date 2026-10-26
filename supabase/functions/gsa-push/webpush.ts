// Envoi d'une notification « Web Push » (RFC 8030), sans bibliothèque : identification du serveur par VAPID (RFC 8292,
// jeton ES256) et contenu chiffré pour le seul appareil abonné (RFC 8291, « aes128gcm » de la RFC 8188).
// Uniquement l'API Web Crypto : fonctionne dans Deno (fonction Supabase) comme dans Node (essais).

export interface Abonnement { endpoint: string; p256dh: string; auth: string }
export interface ClesVapid { publique: string; privee: JsonWebKey }

const texte = new TextEncoder();

export const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hkdf(sel: Uint8Array, ikm: Uint8Array, info: Uint8Array, octets: number) {
  const cle = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sel, info }, cle, octets * 8));
}

/** Nouvelle paire de clés VAPID : la publique (65 octets, base64url) pour les navigateurs, la privée pour signer. */
export async function nouvellesClesVapid(): Promise<ClesVapid> {
  const p = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publique = new Uint8Array(await crypto.subtle.exportKey('raw', p.publicKey));
  return { publique: b64url(publique), privee: await crypto.subtle.exportKey('jwk', p.privateKey) };
}

/** En-tête Authorization : jeton signé pour le service de notifications de l'appareil (valable 12 h). */
export async function vapid(endpoint: string, cles: ClesVapid, sujet: string) {
  const entete = b64url(texte.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corps = b64url(texte.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujet })));
  const cle = await crypto.subtle.importKey('jwk', { ...cles.privee, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle, texte.encode(`${entete}.${corps}`)));
  return `vapid t=${entete}.${corps}.${b64url(signature)}, k=${cles.publique}`;
}

/** Contenu chiffré pour l'appareil (un seul bloc : sel, taille de bloc, clé publique éphémère, puis le texte chiffré). */
export async function chiffrer(a: Pick<Abonnement, 'p256dh' | 'auth'>, contenu: Uint8Array) {
  const cleAppareil = deB64url(a.p256dh);
  const secret = deB64url(a.auth);
  const ephemere = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publique = new Uint8Array(await crypto.subtle.exportKey('raw', ephemere.publicKey));
  const appareil = await crypto.subtle.importKey('raw', cleAppareil, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const partage = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: appareil }, ephemere.privateKey, 256));
  const ikm = await hkdf(secret, partage, concat(texte.encode('WebPush: info\0'), cleAppareil, publique), 32);
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sel, ikm, texte.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sel, ikm, texte.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(contenu, new Uint8Array([2]))));
  const entete = new Uint8Array(16 + 4 + 1 + publique.length);
  entete.set(sel);
  new DataView(entete.buffer).setUint32(16, 4096);
  entete[20] = publique.length;
  entete.set(publique, 21);
  return concat(entete, chiffre);
}

/**
 * Envoie `message` (JSON) à l'appareil. Réponse du service : 201 envoyé ; 404 / 410 abonnement expiré ou retiré
 * (à supprimer) ; autre : échec passager.
 */
export async function envoyer(a: Abonnement, message: unknown, cles: ClesVapid, sujet: string, ttl = 24 * 3600): Promise<number> {
  const corps = await chiffrer(a, texte.encode(JSON.stringify(message)));
  const r = await fetch(a.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapid(a.endpoint, cles, sujet),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body: corps,
  });
  await r.body?.cancel();
  return r.status;
}
