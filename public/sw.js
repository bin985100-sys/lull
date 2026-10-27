// Lull: приложение открывается мгновенно и без сети (оболочка из кэша), обложки кэшируются.
const SHELL = 'lull-shell-__BUILD__';
const IMG = 'lull-img-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('lull-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Звук и API — всегда из сети (перемотка, свежие данные)
  if (url.pathname.startsWith('/api/stream/') || req.headers.has('range')) return;
  // Обложки — сначала кэш
  if (url.pathname === '/api/img') {
    e.respondWith(
      caches.open(IMG).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const r = await fetch(req);
        if (r.ok) {
          c.put(req, r.clone());
          trim(c, 600);
        }
        return r;
      })
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Страница — сеть, без сети — из кэша
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => (caches.open(SHELL).then((c) => c.put('/', r.clone())), r)).catch(() => caches.match('/')));
    return;
  }
  // Файлы сборки (имена с хешем) — кэш навсегда
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/splash/'))) caches.open(SHELL).then((c) => c.put(req, r.clone()));
          return r;
        })
    )
  );
});
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
