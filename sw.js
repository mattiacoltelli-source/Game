// Service worker: tutta l'app è in cache (offline). Una nuova versione si installa in background
// e resta in attesa finché l'utente tocca "Aggiorna" (messaggio SKIP_WAITING).
// __VERSION__ e __DATA_HASH__ vengono sostituiti dal workflow di deploy.
const VERSION = '__VERSION__';
const DATA_HASH = '__DATA_HASH__';
const APP_CACHE = `taxi-app-${VERSION}`;
const DATA_CACHE = `taxi-data-${DATA_HASH}`; // i dati cambiano di rado: non si riscaricano a ogni versione
const APP_FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'lib/three.module.min.js',
  'js/main.js', 'js/config.js', 'js/world.js', 'js/collider.js', 'js/car.js', 'js/input.js', 'js/carmodel.js', 'js/fx.js',
  'js/minimap.js', 'js/marker.js', 'js/labels.js', 'js/pwa.js', 'js/version.js', 'js/geom.js', 'js/nos.js', 'js/atmosphere.js', 'js/traffic.js', 'js/props.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
const DATA_FILES = ['data/roads.json', 'data/buildings.json', 'data/areas.json', 'data/labels.json', 'data/extras.json', 'data/details.json'];

const fresh = (u) => new Request(u, { cache: 'reload' }); // salta la cache HTTP: niente file misti tra versioni

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await Promise.all(APP_FILES.map(async (u) => { const r = await fetch(fresh(u)); if (!r.ok) throw new Error(`${u}: ${r.status}`); await app.put(u, r); }));
    const data = await caches.open(DATA_CACHE); // i dati sono facoltativi: se la rete fallisce si scaricano al primo uso
    await Promise.allSettled(DATA_FILES.map(async (u) => { if (await data.match(u)) return; const r = await fetch(fresh(u)); if (r.ok) await data.put(u, r); }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP_CACHE && k !== DATA_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok && DATA_FILES.some((u) => req.url.endsWith(u))) { const c = await caches.open(DATA_CACHE); c.put(req, r.clone()); }
      return r;
    } catch (err) {
      if (req.mode === 'navigate') { const idx = await caches.match('index.html'); if (idx) return idx; }
      throw err;
    }
  })());
});
