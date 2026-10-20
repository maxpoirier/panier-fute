// @ts-check
// Replaced at deploy time by APP_VERSION from version.js (scripts/stamp-version.mjs): a new version number is what
// shows phones the "Nouvelle version disponible" screen, and the deploy fails if app files change without one.
const VERSION = 'dev';
const APP_CACHE = `panier-app-${VERSION}`;
const IMAGE_CACHE = 'panier-images';

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

// New photos arrive every week; keep the most recent ones only.
const MAX_IMAGES = 300;

/** @param {Cache} cache */
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_IMAGES)).map((key) => cache.delete(key)));
}

// Everything the app needs offline. A test checks that every file in public/ is listed here.
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './version.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/dm-sans-latin.woff2',
  './fonts/fraunces-latin.woff2',
  './lib/text.js',
  './lib/prefs.js',
  './lib/flipp.js',
  './lib/matcher.js',
  './lib/deals.js',
  './lib/recommend.js',
  './lib/store.js',
  './lib/catalog/ingredients.js',
  './lib/catalog/recipes.js',
  './ui/dom.js',
  './ui/state.js',
  './ui/overlays.js',
  './ui/header.js',
  './ui/weeks.js',
  './ui/pantry.js',
  './ui/recipes.js',
  './ui/deals.js',
  './ui/list.js',
  './ui/screens.js',
  './ui/welcome.js',
  './pwa/updates.js',
];

// A new version waits until the user taps "Installer la mise à jour" (see pwa/updates.js), so the running app never
// changes under their feet. On a first install nothing is running yet, so the browser activates it right away.
sw.addEventListener('install', (event) => {
  // Bypass the browser's HTTP cache: GitHub Pages lets it keep files for 10 minutes, which would otherwise store the
  // previous version's files under this new version.
  const fresh = APP_FILES.map((file) => new Request(file, { cache: 'reload' }));
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(fresh)));
});

sw.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') sw.skipWaiting();
  // Lets the update screen show which version is about to be installed.
  if (event.data === 'GET_VERSION') event.ports[0]?.postMessage(VERSION);
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('panier-app-') && key !== APP_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Flyer data is cached by the app itself (localStorage); always ask Flipp for fresh data.
  if (url.hostname.endsWith('wishabi.com')) return;

  // Product photos rarely change: serve from cache, fetch once.
  if (url.hostname === 'f.wishabi.net') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
          await cache.put(request, response.clone());
          trim(cache);
        }
        return response;
      }),
    );
    return;
  }

  // App files come from this version's cache, so the installed version is what runs until the user updates.
  if (url.origin === sw.location.origin) {
    event.respondWith(caches.open(APP_CACHE).then(async (cache) => (await cache.match(request, { ignoreSearch: true })) ?? fetch(request)));
  }
});
