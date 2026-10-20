// Bump on every release: phones then show the "Nouvelle version disponible" screen and drop the old app files.
const VERSION = 'v6';
const APP_CACHE = `panier-app-${VERSION}`;
const IMAGE_CACHE = 'panier-images';

// New photos arrive every week; keep the most recent ones only.
const MAX_IMAGES = 300;

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_IMAGES)).map((key) => cache.delete(key)));
}

const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './lib/text.js',
  './lib/flipp.js',
  './lib/matcher.js',
  './lib/deals.js',
  './lib/recommend.js',
  './lib/store.js',
  './lib/catalog/ingredients.js',
  './lib/catalog/recipes.js',
];

// A new version waits until the user taps "Installer la mise à jour" (see app.js), so the running app never
// changes under their feet. On a first install nothing is running yet, so the browser activates it right away.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('panier-app-') && key !== APP_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Flyer data is cached by the app itself (localStorage); always ask Flipp for fresh data.
  if (url.hostname.endsWith('wishabi.com')) return;

  // Product photos rarely change: serve from cache, fetch once.
  if (url.hostname === 'f.wishabi.net') {
    event.respondWith(caches.open(IMAGE_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
        trim(cache);
      }
      return response;
    }));
    return;
  }

  // App files come from this version's cache, so the installed version is what runs until the user updates.
  if (url.origin === self.location.origin) {
    event.respondWith(caches.open(APP_CACHE).then(async (cache) => (await cache.match(request, { ignoreSearch: true })) ?? fetch(request)));
  }
});
