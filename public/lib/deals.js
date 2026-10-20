// @ts-check
import { matchIngredients } from './matcher.js';

/** @typedef {import('./store.js').FlyerWithItems} FlyerWithItems */
/** @typedef {'current' | 'next'} Week */
/**
 * @typedef {object} Offer The cheapest flyer item for one ingredient at one store.
 * @property {string} ingredientId
 * @property {string} store
 * @property {string} itemName
 * @property {number} price
 * @property {number | null} discount
 * @property {string | null} image
 * @property {string} validTo
 */
/** @typedef {{ store: string, validFrom: string, validTo: string, itemCount: number }} StoreWeek */

const NEXT_WEEK_HORIZON_MS = 10 * 24 * 3600 * 1000;

// Classified at read time so a cached "next week" flyer becomes "this week" on Thursday without refetching.
/**
 * @param {FlyerWithItems[]} flyers
 * @param {Week} week
 */
export function flyersForWeek(flyers, week, now = new Date()) {
  const t = now.getTime();
  return flyers.filter((flyer) => {
    const from = Date.parse(flyer.validFrom);
    const to = Date.parse(flyer.validTo);
    if (week === 'current') return from <= t && t <= to;
    return from > t && from - t < NEXT_WEEK_HORIZON_MS;
  });
}

/**
 * @param {FlyerWithItems[]} flyers
 * @returns {StoreWeek[]}
 */
function weekSummary(flyers) {
  /** @type {Map<string, StoreWeek>} */
  const byStore = new Map();
  for (const flyer of flyers) {
    const entry = byStore.get(flyer.store) ?? { store: flyer.store, validFrom: flyer.validFrom, validTo: flyer.validTo, itemCount: 0 };
    if (flyer.validFrom < entry.validFrom) entry.validFrom = flyer.validFrom;
    if (flyer.validTo > entry.validTo) entry.validTo = flyer.validTo;
    entry.itemCount += flyer.items.length;
    byStore.set(flyer.store, entry);
  }
  return [...byStore.values()];
}

// Map of ingredient id → offers sorted cheapest first, keeping only the cheapest item per store.
// Flyer prices mix units (/lb, /pack), so the ranking is indicative rather than a strict unit-price comparison.
/**
 * @param {FlyerWithItems[]} flyers
 * @returns {Map<string, Offer[]>}
 */
export function buildOffers(flyers) {
  /** @type {Map<string, Offer>} */
  const best = new Map();
  for (const flyer of flyers) {
    for (const item of flyer.items) {
      // Matched once at download time; computed here for items that don't carry it (tests, older caches).
      for (const ingredientId of item.ingredients ?? matchIngredients(item.searchText)) {
        const key = `${ingredientId}|${item.store}`;
        const current = best.get(key);
        if (!current || item.price < current.price) {
          best.set(key, {
            ingredientId,
            store: item.store,
            itemName: item.name,
            price: item.price,
            discount: item.discount,
            image: item.image,
            validTo: flyer.validTo,
          });
        }
      }
    }
  }
  /** @type {Map<string, Offer[]>} */
  const offers = new Map();
  for (const offer of best.values()) {
    const list = offers.get(offer.ingredientId) ?? [];
    list.push(offer);
    offers.set(offer.ingredientId, list);
  }
  for (const list of offers.values()) list.sort((a, b) => a.price - b.price);
  return offers;
}

/**
 * @param {FlyerWithItems[]} flyers
 * @param {Week} week
 */
export function buildWeek(flyers, week, now = new Date()) {
  const selected = flyersForWeek(flyers, week, now);
  return { week, stores: weekSummary(selected), offers: buildOffers(selected) };
}
