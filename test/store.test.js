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
      { id: 1, merchant: 'Maxi', name: 'Circulaire', categories: ['Groceries'], valid_from: '2026-10-15T00:00:00-04:00', valid_to: '2099-01-01T00:00:00-05:00' },
      { id: 2, merchant: 'Pharmaprix', name: 'Circulaire', categories: ['Pharmacy'], valid_from: '2026-10-15T00:00:00-04:00', valid_to: '2099-01-01T00:00:00-05:00' },
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
  assert.deepEqual(snapshot.flyers[0].items.map((item) => item.name), ['POITRINES DE POULET']);
  assert.equal(isStale('G2G1B8'), false);
  assert.equal(isStale('H2X1Y4'), true, 'another postal code needs a new download');
  assert.equal(getWeek('current').offers.get('poulet_poitrine')[0].price, 4.99);

  requests.length = 0;
  await refresh('G2G1B8');
  assert.equal(requests.filter((url) => url.includes('/flyers/1')).length, 0, 'a flyer already downloaded is not fetched again');
});
