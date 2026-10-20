// @ts-check
import { $, el } from '../ui/dom.js';
import { closeOverlay, showOverlay } from '../ui/overlays.js';
import { APP_VERSION } from '../version.js';

/** @type {HTMLElement | null} */
let screen = null;
/** @type {ServiceWorker | null} */
let pendingWorker = null;
let installRequested = false;

/** @param {boolean} ready */
function setButton(ready) {
  /** @type {HTMLButtonElement} */
  const button = $('#update-screen button');
  button.disabled = !ready;
  button.textContent = ready ? 'Installer la mise à jour' : 'Téléchargement de la mise à jour…';
  if (ready) button.focus();
}

/**
 * The version the new service worker carries (stamped from version.js at deploy), or null if it doesn't answer.
 * @param {ServiceWorker} worker
 * @returns {Promise<string | null>}
 */
function versionOf(worker) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => resolve(null), 3000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(typeof event.data === 'string' ? event.data : null);
    };
    worker.postMessage('GET_VERSION', [channel.port2]);
  });
}

// Blocks the app as soon as a new version is detected; the button unlocks once it's downloaded. There is no way to dismiss it.
/** @param {ServiceWorker} worker */
function showUpdateScreen(worker) {
  pendingWorker = worker;
  if (!screen) {
    screen = el(
      'div',
      { id: 'update-screen', class: 'update-screen', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'update-title' },
      el(
        'div',
        { class: 'update-card' },
        el('img', { class: 'update-icon', src: 'icons/icon-192.png', alt: '' }),
        el('h2', { id: 'update-title', text: 'Nouvelle version disponible 🎉' }),
        el('p', { id: 'update-versions', class: 'update-versions', text: `v${APP_VERSION}` }),
        el('p', { text: 'Une mise à jour du panier futé est disponible. Installe-la pour continuer.' }),
        el('button', {
          type: 'button',
          class: 'btn update-btn',
          onclick: (/** @type {MouseEvent} */ event) => {
            const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
            button.disabled = true;
            button.textContent = 'Installation…';
            installRequested = true;
            pendingWorker?.postMessage('SKIP_WAITING');
          },
        }),
      ),
    );
    showOverlay(screen);
  }
  setButton(worker.state === 'installed');
  versionOf(worker).then((next) => {
    if (next && pendingWorker === worker) $('#update-versions').textContent = `v${APP_VERSION} → v${next}`;
  });
}

// Only used when the download fails: the installed version keeps working until the next check.
function hideUpdateScreen() {
  if (screen) closeOverlay(screen);
  screen = null;
  pendingWorker = null;
}

/**
 * Makes the site installable as an Android app, usable offline, and blocks it until new versions are installed.
 * @returns {Promise<() => void>} A function that checks for a new version now.
 */
export async function watchForUpdates() {
  // Locally, files change on every save; the cache-first service worker would only get in the way.
  if (!('serviceWorker' in navigator) || ['localhost', '127.0.0.1'].includes(location.hostname)) return () => {};
  const registration = await navigator.serviceWorker.register('./sw.js');

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A first install also takes control, but there's no new version to load then.
    if (!installRequested || reloading) return;
    reloading = true;
    location.reload();
  });

  /** @param {ServiceWorker | null} worker */
  const track = (worker) => {
    // Without a controller this is the first install, not an update.
    if (!worker || !navigator.serviceWorker.controller) return;
    showUpdateScreen(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && pendingWorker === worker) setButton(true);
      if (worker.state === 'redundant' && pendingWorker === worker) {
        hideUpdateScreen();
        track(registration.installing ?? registration.waiting);
      }
    });
  };
  track(registration.installing ?? registration.waiting);
  registration.addEventListener('updatefound', () => track(registration.installing));
  return () => registration.update().catch(() => {});
}
