import { matchIngredients } from './matcher.js';

const NEXT_WEEK_HORIZON_MS = 10 * 24 * 3600 * 1000;

// Classified at read time so a cached "next week" flyer becomes "this week" on Thursday without refetching.
export function flyersForWeek(flyers, week, now = new Date()) {
  const t = now.getTime();
  return flyers.filter((flyer) => {
    const from = Date.parse(flyer.validFrom);
    const to = Date.parse(flyer.validTo);
    if (week === 'current') return from <= t && t <= to;
    return from > t && from - t < NEXT_WEEK_HORIZON_MS;
  });
}

function weekSummary(flyers) {
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
export function buildOffers(flyers) {
  const best = new Map();
  for (const flyer of flyers) {
    for (const item of flyer.items) {
      for (const ingredientId of matchIngredients(item.searchText)) {
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
  const offers = new Map();
  for (const offer of best.values()) {
    const list = offers.get(offer.ingredientId) ?? [];
    list.push(offer);
    offers.set(offer.ingredientId, list);
  }
  for (const list of offers.values()) list.sort((a, b) => a.price - b.price);
  return offers;
}

export function buildWeek(flyers, week, now = new Date()) {
  const selected = flyersForWeek(flyers, week, now);
  return { week, stores: weekSummary(selected), offers: buildOffers(selected) };
}
