const CACHE = 'piatto-privat-v3';
const PHOTO_CACHE = 'piatto-fotos-v1';
const PHOTO_MAX = 300;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== PHOTO_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rezeptfotos von Wikimedia Commons: einmal laden, dann aus dem Gerätespeicher (auch offline)
async function photoFetch(req) {
  const cache = await caches.open(PHOTO_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  let res = null;
  try { res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); } catch (e) { res = null; }
  if (!res || !res.ok) {
    try { res = await fetch(req); } catch (e) { return Response.error(); }
  }
  if (res && (res.ok || res.type === 'opaque')) {
    try {
      await cache.put(req.url, res.clone());
      const keys = await cache.keys();
      for (let i = 0; i < keys.length - PHOTO_MAX; i++) await cache.delete(keys[i]);
    } catch (e) { /* Speicher voll: Foto trotzdem anzeigen */ }
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'upload.wikimedia.org') { e.respondWith(photoFetch(req)); return; }
  if (url.origin !== self.location.origin) return; // andere Fremdanfragen (Preise, Fotosuche) nie abfangen

  // App-Seite: online immer die neueste Version laden, offline die gespeicherte Kopie nutzen
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Icons, Manifest usw.: aus dem Speicher, im Hintergrund aktualisieren
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const fresh = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
