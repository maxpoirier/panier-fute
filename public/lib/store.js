// @ts-check
import { buildWeek } from './deals.js';
import { getFlyerItems, listGroceryFlyers } from './flipp.js';
import { MATCHER_VERSION, matchIngredients } from './matcher.js';
import { readPref, writePref } from './prefs.js';

/** @typedef {import('./flipp.js').Flyer} Flyer */
/** @typedef {import('./flipp.js').FlyerItem} FlyerItem */
/** @typedef {FlyerItem & { ingredients?: string[] }} MatchedItem `ingredients` holds the ids the item counts as. */
/** @typedef {Flyer & { items: MatchedItem[] }} FlyerWithItems */
/**
 * @typedef {object} Snapshot
 * @property {string} postalCode
 * @property {string} fetchedAt ISO date of the last successful refresh.
 * @property {FlyerWithItems[]} flyers
 * @property {{ store: string, title: string }[]} failed Flyers that could not be downloaded; retried on the next refresh.
 * @property {string} [matcherVersion] Matching rules the items' `ingredients` were computed with.
 */

// Bump when the cached shape changes, or when the catalogue changes enough that cached items should be re-fetched.
const CACHE_KEY = 'pfq.flyers.v2';
// Used when the app isn't forcing a refresh (e.g. after a postal code change): a day-old cache is refetched.
const STALE_AFTER_MS = 24 * 3600 * 1000;
const PARALLEL_DOWNLOADS = 4;

/**
 * Ingredient ids for each item, dropping items that match nothing (which keeps the cache small).
 * @param {MatchedItem[]} items
 * @returns {MatchedItem[]}
 */
function withIngredients(items) {
  return items.map((item) => ({ ...item, ingredients: matchIngredients(item.searchText) })).filter((item) => item.ingredients.length > 0);
}

let snapshot = readPref(CACHE_KEY, /** @type {Snapshot | null} */ (null));
// The catalogue changed since these flyers were cached: re-match them instead of downloading them again.
if (snapshot && snapshot.matcherVersion !== MATCHER_VERSION) {
  snapshot = {
    ...snapshot,
    flyers: snapshot.flyers.map((flyer) => ({ ...flyer, items: withIngredients(flyer.items) })),
    matcherVersion: MATCHER_VERSION,
  };
  writePref(CACHE_KEY, snapshot);
}

export function getSnapshot() {
  return snapshot;
}

/** @param {string} postalCode */
export function isStale(postalCode) {
  return !snapshot || snapshot.postalCode !== postalCode || Date.now() - Date.parse(snapshot.fetchedAt) > STALE_AFTER_MS;
}

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapLimit(items, limit, fn) {
  /** @type {R[]} */
  const results = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Downloads the flyer list and any flyer not already cached. Only items that match an ingredient are kept, which keeps
 * the cache small enough for localStorage on a phone. A flyer that fails to download is reported in `failed` and, since
 * it isn't cached, is tried again on the next refresh.
 * @param {string} postalCode
 * @returns {Promise<Snapshot>}
 */
export async function refresh(postalCode) {
  const now = Date.now();
  const listed = (await listGroceryFlyers(postalCode)).filter((flyer) => Date.parse(flyer.validTo) >= now);
  const known = new Map(snapshot?.postalCode === postalCode ? snapshot.flyers.map((flyer) => [flyer.id, flyer]) : []);
  /** @type {Snapshot['failed']} */
  const failed = [];
  const flyers = await mapLimit(listed, PARALLEL_DOWNLOADS, async (flyer) => {
    const cached = known.get(flyer.id);
    if (cached) return cached;
    try {
      return { ...flyer, items: withIngredients(await getFlyerItems(flyer)) };
    } catch {
      failed.push({ store: flyer.store, title: flyer.title });
      return null;
    }
  });
  snapshot = {
    postalCode,
    fetchedAt: new Date().toISOString(),
    flyers: flyers.filter((flyer) => flyer !== null),
    failed,
    matcherVersion: MATCHER_VERSION,
  };
  writePref(CACHE_KEY, snapshot);
  return snapshot;
}

/** @type {{ key: string, weeks: Map<string, ReturnType<typeof buildWeek>> }} */
let weekCache = { key: '', weeks: new Map() };

/**
 * Deals for this week or next week, from the cached flyers.
 * @param {'current' | 'next'} week
 */
export function getWeek(week) {
  if (!snapshot) return { week, stores: [], offers: new Map() };
  // Keyed by hour so the current/next split moves forward without a refetch; older entries are dropped.
  const key = `${snapshot.fetchedAt}|${new Date().toISOString().slice(0, 13)}`;
  if (weekCache.key !== key) weekCache = { key, weeks: new Map() };
  let result = weekCache.weeks.get(week);
  if (!result) {
    result = buildWeek(snapshot.flyers, week);
    weekCache.weeks.set(week, result);
  }
  return result;
}
