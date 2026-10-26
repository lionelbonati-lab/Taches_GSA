// Service worker de l'application installée (PWA).
// - Pages : réseau d'abord, repli sur la dernière version en cache (hors-ligne).
// - Fichiers /assets/ (noms uniques à chaque build) : cache d'abord. Ceux des versions précédentes restent sur le site
//   (scripts/anciens-assets.mjs) : une appli ouverte avant une publication charge encore le PDF, la carte…
// Seules les réponses valides sont gardées (pas un fichier introuvable).
const CACHE = 'taches-gsa-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './favicon-32.png', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.url.includes('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});

// Notification envoyée par le serveur (version réelle, fonction gsa-push), même l'appli fermée. Contenu : { titre,
// corps, url, tag } ; une notification de même tag remplace la précédente.
self.addEventListener('push', (e) => {
  let m = {};
  try {
    m = e.data ? e.data.json() : {};
  } catch {
    m = { corps: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(m.titre || 'Nouvelle notification', {
      body: m.corps || '',
      icon: './icon-192.png',
      badge: './badge-96.png',
      tag: m.tag || 'taches-gsa',
      data: { url: m.url || './' },
    }),
  );
});

// Clic sur une notification : ouvre (ou ramène au premier plan) l'application sur la bonne page.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => c.url.startsWith(self.registration.scope));
      if (win) return win.focus().then(() => win.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
