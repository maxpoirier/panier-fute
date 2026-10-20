import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWeek, flyersForWeek } from '../public/lib/deals.js';
import { toItem } from '../public/lib/flipp.js';
import { recommend } from '../public/lib/recommend.js';
import { REGULAR_PRICES } from '../public/lib/catalog/ingredients.js';

const now = new Date('2026-10-20T12:00:00-04:00');

function flyer(id, store, validFrom, validTo, items) {
  return {
    id,
    store,
    title: 'Circulaire',
    validFrom,
    validTo,
    items: items.map(([name, price, discount], index) =>
      toItem({ id: id * 100 + index, name, price: String(price), discount, display_type: 1 }, store),
    ),
  };
}

const flyers = [
  flyer(1, 'Maxi', '2026-10-15T00:00:00-04:00', '2026-10-21T23:59:59-04:00', [
    ['POITRINES DE POULET', 4.99, 30],
    ['BROCOLI', 1.25, 40],
  ]),
  flyer(2, 'IGA', '2026-10-15T00:00:00-04:00', '2026-10-21T23:59:59-04:00', [['POITRINES DE POULET FRAIS', 3.99, 20]]),
  flyer(3, 'IGA', '2026-10-22T00:00:00-04:00', '2026-10-28T23:59:59-04:00', [['BOEUF HACHÉ MAIGRE', 5.44, 25]]),
];

test('splits flyers into this week and next week', () => {
  assert.deepEqual(
    flyersForWeek(flyers, 'current', now).map((f) => f.id),
    [1, 2],
  );
  assert.deepEqual(
    flyersForWeek(flyers, 'next', now).map((f) => f.id),
    [3],
  );
  // On Thursday, next week's flyer becomes the current one without a refetch.
  assert.deepEqual(
    flyersForWeek(flyers, 'current', new Date('2026-10-22T09:00:00-04:00')).map((f) => f.id),
    [3],
  );
});

test('offers are sorted cheapest first across stores', () => {
  const { offers } = buildWeek(flyers, 'current', now);
  assert.deepEqual(
    offers.get('poulet_poitrine').map((o) => [o.store, o.price]),
    [
      ['IGA', 3.99],
      ['Maxi', 4.99],
    ],
  );
});

test('marks each ingredient as on sale, already owned or to buy, and prices it', () => {
  const { offers } = buildWeek(flyers, 'current', now);
  const pantry = ['sauce_soya', 'miel', 'riz_blanc', 'oignon_jaune', 'ail', 'huile_vegetale'];
  const teriyaki = recommend({ pantry, offers }).find((recipe) => recipe.id === 'saute-poulet-teriyaki');
  const byId = Object.fromEntries(teriyaki.items.map((item) => [item.id, item]));
  assert.equal(byId.poulet_poitrine.status, 'deal');
  assert.equal(byId.poulet_poitrine.cost, 3.99);
  assert.equal(byId.riz_jasmin.status, 'have');
  assert.equal(byId.riz_jasmin.ownedName, 'Riz blanc');
  assert.equal(byId.sauce_soya.status, 'have');
  assert.equal(byId.sauce_soya.cost, 0);
  assert.equal(byId.poivron.status, 'buy');
  assert.equal(byId.poivron.cost, REGULAR_PRICES.poivron);
  assert.equal(teriyaki.toBuyCount, 1);
  // poulet 3.99 + brocoli 1.25 + poivron at regular price; optional ingredients cost nothing.
  assert.equal(teriyaki.totalCost, 3.99 + 1.25 + REGULAR_PRICES.poivron);
  assert.equal(teriyaki.costPerServing, Math.round((teriyaki.totalCost / 4) * 100) / 100);
});

test('lists recipes from cheapest to most expensive', () => {
  const { offers } = buildWeek(flyers, 'current', now);
  const costs = recommend({ pantry: [], offers }).map((recipe) => recipe.totalCost);
  assert.ok(costs.length > 1);
  assert.deepEqual(
    costs,
    [...costs].sort((a, b) => a - b),
  );
});

test('skips banners and items without a price', () => {
  assert.equal(toItem({ id: 1, name: 'Maxi coupons', price: '', display_type: 5 }, 'Maxi'), null);
  assert.equal(toItem({ id: 2, name: 'DUO DE PAINS', price: '', display_type: 1 }, 'Maxi'), null);
  assert.equal(
    toItem({ id: 3, name: 'vinaigrette Kraft | Kraft salad dressing', price: '2.99', display_type: 1 }, 'Super C').name,
    'vinaigrette Kraft',
  );
});

test('every recommendation carries an emoji and a colour theme for the UI', () => {
  const { offers } = buildWeek(flyers, 'current', now);
  for (const recipe of recommend({ pantry: [], offers })) {
    assert.ok(recipe.emoji, `${recipe.id} has no emoji`);
    assert.ok(['viande', 'mer', 'vege'].includes(recipe.theme), `${recipe.id} has theme ${recipe.theme}`);
  }
});

test('owning rigatoni covers short-pasta recipes but not egg-noodle soup', () => {
  const { offers } = buildWeek(flyers, 'current', now);
  const recipes = recommend({ pantry: ['pates_courtes'], offers });
  const status = (recipeId, ingredientId) =>
    recipes.find((recipe) => recipe.id === recipeId).items.find((item) => item.id === ingredientId).status;
  assert.equal(status('alfredo-poulet-brocoli', 'pates_longues'), 'have');
  assert.equal(status('soupe-poulet-nouilles', 'nouilles_oeufs'), 'buy');
});

test('any butter works where a recipe asks for butter', () => {
  const { offers } = buildWeek(flyers, 'current', now);
  const alfredo = recommend({ pantry: ['beurre_non_sale'], offers }).find((recipe) => recipe.id === 'alfredo-poulet-brocoli');
  const butter = alfredo.items.find((item) => item.id === 'beurre_sale');
  assert.equal(butter.status, 'have');
  assert.equal(butter.ownedName, 'Beurre non salé');
});
