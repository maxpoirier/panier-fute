import { buildWeek } from './deals.js';
import { getFlyerItems, listGroceryFlyers } from './flipp.js';
import { matchIngredients } from './matcher.js';

// Bump when the cached shape changes, or when the catalogue changes enough that cached items should be re-fetched.
const CACHE_KEY = 'pfq.flyers.v2';
// Used when the app isn't forcing a refresh (e.g. after a postal code change): a day-old cache is refetched.
const STALE_AFTER_MS = 24 * 3600 * 1000;
const PARALLEL_DOWNLOADS = 4;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache(snapshot) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable: the app still works for this session.
  }
}

let snapshot = readCache();

export function getSnapshot() {
  return snapshot;
}

export function isStale(postalCode) {
  return !snapshot || snapshot.postalCode !== postalCode || Date.now() - Date.parse(snapshot.fetchedAt) > STALE_AFTER_MS;
}

async function mapLimit(items, limit, fn) {
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

// Only items that match an ingredient are kept, which keeps the cache small enough for localStorage on a phone.
export async function refresh(postalCode) {
  const now = Date.now();
  const listed = (await listGroceryFlyers(postalCode)).filter((flyer) => Date.parse(flyer.validTo) >= now);
  const known = new Map(snapshot?.postalCode === postalCode ? snapshot.flyers.map((flyer) => [flyer.id, flyer]) : []);
  const flyers = await mapLimit(listed, PARALLEL_DOWNLOADS, async (flyer) => {
    if (known.has(flyer.id)) return known.get(flyer.id);
    try {
      const items = (await getFlyerItems(flyer)).filter((item) => matchIngredients(item.searchText).length > 0);
      return { ...flyer, items };
    } catch {
      return null;
    }
  });
  snapshot = { postalCode, fetchedAt: new Date().toISOString(), flyers: flyers.filter(Boolean) };
  writeCache(snapshot);
  return snapshot;
}

const weekCache = new Map();

export function getWeek(week) {
  if (!snapshot) return { week, stores: [], offers: new Map() };
  // Keyed by hour so the current/next split moves forward without a refetch.
  const key = `${snapshot.fetchedAt}|${week}|${new Date().toISOString().slice(0, 13)}`;
  if (!weekCache.has(key)) weekCache.set(key, buildWeek(snapshot.flyers, week));
  return weekCache.get(key);
}
