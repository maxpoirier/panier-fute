// Shared helpers for the browser tests: a throwaway copy of the site that can be "redeployed", and a fake Flipp API.
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { appHash, stampVersion } from '../scripts/stamp-version.mjs';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
// 1×1 transparent PNG standing in for product photos.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const DAY = 24 * 3600 * 1000;

/**
 * Serves a copy of public/ on [::1], which browsers treat as secure (service workers run) but which isn't "localhost"
 * (where the app skips its service worker). Caching mimics GitHub Pages: browsers may reuse files for 10 minutes.
 */
export async function startSite() {
  const dir = await mkdtemp(join(tmpdir(), 'panier-e2e-'));
  await cp(PUBLIC, dir, { recursive: true });
  const server = await new Promise((resolve) => {
    const instance = express()
      .use(express.static(dir, { maxAge: 600_000, etag: false, lastModified: false }))
      .listen(0, '::1', () => resolve(instance));
  });
  const swPath = join(dir, 'sw.js');
  const site = {
    url: `http://[::1]:${server.address().port}/`,
    /**
     * Same as a release: new number in version.js, then the deploy's stamping step. Also leaves a marker so the test
     * can tell which app.js is running.
     */
    async publish(version) {
      const versionPath = join(dir, 'version.js');
      const source = await readFile(versionPath, 'utf8');
      await writeFile(versionPath, source.replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${version}'`));
      const appPath = join(dir, 'app.js');
      await writeFile(appPath, `${await readFile(appPath, 'utf8')}\nwindow.appVersion = '${version}';\n`);
      await writeFile(swPath, (await readFile(swPath, 'utf8')).replace(/^const VERSION = '[^']*';$/m, "const VERSION = 'dev';"));
      await stampVersion(dir, version, await appHash(dir));
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    },
  };
  await site.publish('1.0.0');
  return site;
}

function flyer(id, merchant, fromDays, toDays) {
  const now = Date.now();
  return {
    id,
    merchant,
    name: 'Circulaire',
    categories: ['Groceries'],
    valid_from: new Date(now + fromDays * DAY).toISOString(),
    valid_to: new Date(now + toDays * DAY).toISOString(),
  };
}

const item = (id, name, price, discount = null) => ({ id, name, price: String(price), discount, display_type: 1 });

// This week at all four stores, next week at Maxi only.
const FLYERS = [
  flyer(1, 'IGA', -2, 5),
  flyer(2, 'Super C', -2, 5),
  flyer(3, 'Maxi', -2, 5),
  flyer(4, 'Walmart', -2, 5),
  flyer(5, 'Maxi', 6, 13),
];
const ITEMS = {
  1: [item(11, 'POITRINES DE POULET FRAIS', 4.99, 30), item(12, 'BROCOLI', 1.99)],
  2: [item(21, 'BOEUF HACHÉ MI-MAIGRE', 5.44, 25), item(22, 'PÂTES ALIMENTAIRES CATELLI', 1.33, 40)],
  3: [item(31, 'POIVRONS ASSORTIS', 2.99), item(32, 'SAUCE POUR PÂTES CLASSICO', 2.98)],
  4: [item(41, 'OIGNONS JAUNES', 1.88), item(42, 'Litière pour chat', 9.97)],
  5: [item(51, 'CREVETTES CRUES SURGELÉES', 7.99, 20)],
};

/**
 * Answers every Flipp call with the fixtures above. Options:
 * - failFlyers: flyer ids whose download returns 503;
 * - delayListMs: holds the flyer list response, to test what happens during a refresh.
 * Returns the postal codes of every flyer-list request, in order.
 */
export async function mockFlipp(context, { failFlyers = [], delayListMs = 0 } = {}) {
  const listRequests = [];
  await context.route('https://backflipp.wishabi.com/**', async (route) => {
    const url = new URL(route.request().url());
    const flyerId = url.pathname.match(/\/flyers\/(\d+)/)?.[1];
    if (flyerId) {
      if (failFlyers.includes(Number(flyerId))) return route.fulfill({ status: 503, body: 'unavailable' });
      return route.fulfill({ json: { items: ITEMS[flyerId] ?? [] } });
    }
    listRequests.push(url.searchParams.get('postal_code'));
    if (delayListMs) await new Promise((resolve) => setTimeout(resolve, delayListMs));
    return route.fulfill({ json: { flyers: FLYERS } });
  });
  await context.route('https://f.wishabi.net/**', (route) => route.fulfill({ contentType: 'image/png', body: PIXEL }));
  return listRequests;
}

/** Skips the first-launch name prompt. */
export async function rememberName(context, name = 'Max') {
  await context.addInitScript((value) => localStorage.setItem('pfq.userName', JSON.stringify(value)), name);
}
