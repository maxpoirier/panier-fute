import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getWeek, isStale, refresh } from '../public/lib/store.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeFlipp(requests) {
  const flyers = {
    flyers: [
      {
        id: 1,
        merchant: 'Maxi',
        name: 'Circulaire',
        categories: ['Groceries'],
        valid_from: '2026-10-15T00:00:00-04:00',
        valid_to: '2099-01-01T00:00:00-05:00',
      },
      {
        id: 2,
        merchant: 'Pharmaprix',
        name: 'Circulaire',
        categories: ['Pharmacy'],
        valid_from: '2026-10-15T00:00:00-04:00',
        valid_to: '2099-01-01T00:00:00-05:00',
      },
    ],
  };
  const items = {
    items: [
      { id: 10, name: 'POITRINES DE POULET', price: '4.99', discount: 30, display_type: 1 },
      { id: 11, name: 'Dentifrice Colgate', price: '1.99', display_type: 1 },
    ],
  };
  return async (url) => {
    requests.push(String(url));
    const body = String(url).includes('/flyers/1') ? items : flyers;
    return { ok: true, json: async () => body };
  };
}

test('downloads grocery flyers, keeps only ingredient matches, and reuses known flyers', async () => {
  const requests = [];
  globalThis.fetch = fakeFlipp(requests);

  const snapshot = await refresh('G2G1B8');
  assert.equal(snapshot.flyers.length, 1, 'non-grocery flyers are skipped');
  assert.deepEqual(
    snapshot.flyers[0].items.map((item) => item.name),
    ['POITRINES DE POULET'],
  );
  assert.equal(isStale('G2G1B8'), false);
  assert.equal(isStale('H2X1Y4'), true, 'another postal code needs a new download');
  assert.equal(getWeek('current').offers.get('poulet_poitrine')[0].price, 4.99);

  requests.length = 0;
  await refresh('G2G1B8');
  assert.equal(requests.filter((url) => url.includes('/flyers/1')).length, 0, 'a flyer already downloaded is not fetched again');
});

test('a flyer that fails to download is reported and retried on the next refresh', async () => {
  const requests = [];
  const flipp = fakeFlipp(requests);
  let failItems = true;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/flyers/1') && failItems) return { ok: false, status: 503, json: async () => ({}) };
    return flipp(url);
  };

  const first = await refresh('G1A0A1');
  assert.deepEqual(first.failed, [{ store: 'Maxi', title: 'Circulaire' }]);
  assert.equal(first.flyers.length, 0);

  failItems = false;
  requests.length = 0;
  const second = await refresh('G1A0A1');
  assert.deepEqual(second.failed, []);
  assert.equal(second.flyers.length, 1);
  assert.equal(requests.filter((url) => url.includes('/flyers/1')).length, 1, 'the failed flyer is downloaded again');
});

test('a network blip is retried once, a 4xx answer is not', async () => {
  const requests = [];
  const flipp = fakeFlipp(requests);
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    if (calls === 1) throw new TypeError('Failed to fetch');
    return flipp(url);
  };
  const snapshot = await refresh('G1A0A2');
  assert.equal(snapshot.flyers.length, 1, 'the retry succeeded');

  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: false, status: 404, json: async () => ({}) };
  };
  await assert.rejects(refresh('G1A0A3'), /Flipp 404/);
  assert.equal(calls, 1, 'not retried');
});

test('ingredients are matched once at download time and saved with the items', async () => {
  globalThis.fetch = fakeFlipp([]);
  const snapshot = await refresh('G1A0A4');
  assert.deepEqual(snapshot.flyers[0].items[0].ingredients, ['poulet_poitrine']);
  assert.ok(snapshot.matcherVersion);
});

test('a cache saved with older matching rules is re-matched on load, without downloading', async () => {
  const saved = {
    postalCode: 'G2G1B8',
    fetchedAt: new Date().toISOString(),
    failed: [],
    matcherVersion: 'old-rules',
    flyers: [
      {
        id: 9,
        store: 'IGA',
        title: 'Circulaire',
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2099-01-01T00:00:00Z',
        items: [
          { id: 1, store: 'IGA', name: 'BROCOLI', searchText: 'brocoli', price: 1.99, discount: null, image: null, ingredients: ['stale'] },
          {
            id: 2,
            store: 'IGA',
            name: 'Dentifrice',
            searchText: 'dentifrice',
            price: 2,
            discount: null,
            image: null,
            ingredients: ['stale'],
          },
        ],
      },
    ],
  };
  const storage = new Map([['pfq.flyers.v2', JSON.stringify(saved)]]);
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.fetch = () => assert.fail('no download needed');
  try {
    const fresh = await import(`../public/lib/store.js?reload=${Date.now()}`);
    const items = fresh.getSnapshot().flyers[0].items;
    assert.deepEqual(
      items.map((item) => item.ingredients),
      [['brocoli']],
      'stale ids replaced, items matching nothing dropped',
    );
    assert.notEqual(JSON.parse(storage.get('pfq.flyers.v2')).matcherVersion, 'old-rules', 'saved back');
  } finally {
    delete globalThis.localStorage;
  }
});
