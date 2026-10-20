// @ts-check
import { normalize } from './text.js';

/** @typedef {{ id: number, store: string, title: string, validFrom: string, validTo: string }} Flyer */
/**
 * @typedef {object} FlyerItem
 * @property {number} id
 * @property {string} store
 * @property {string} name French name as printed in the flyer.
 * @property {string | null} nameEn
 * @property {string} searchText Normalized name + brand, used for ingredient matching.
 * @property {number} price
 * @property {number | null} discount Percentage, when the flyer states one.
 * @property {string | null} image
 */

// Flipp aggregates the weekly circulaires of every major Québec grocer by postal code, and allows browser (CORS) requests.
const BASE_URL = 'https://backflipp.wishabi.com/flipp';
const LOCALE = 'fr-ca';

export const STORES = ['IGA', 'Super C', 'Maxi', 'Walmart'];

const RETRY_DELAY_MS = 1000;

class FlippError extends Error {
  /** @param {number} status @param {string} url */
  constructor(status, url) {
    super(`Flipp ${status} for ${url}`);
    this.status = status;
  }
}

/** @param {string} url */
async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new FlippError(response.status, url);
  return response.json();
}

/**
 * One retry after a short pause absorbs a network blip when the app comes back to the screen. A 4xx answer won't get
 * better by asking again, so it isn't retried.
 * @param {string} url
 */
async function getJson(url) {
  try {
    return await fetchJson(url);
  } catch (error) {
    if (error instanceof FlippError && error.status < 500) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchJson(url);
  }
}

/** @param {string} merchant */
function storeOf(merchant) {
  const wanted = normalize(merchant);
  return STORES.find((store) => normalize(store) === wanted);
}

/**
 * @param {string} postalCode
 * @returns {Promise<Flyer[]>}
 */
export async function listGroceryFlyers(postalCode) {
  const data = await getJson(`${BASE_URL}/flyers?locale=${LOCALE}&postal_code=${encodeURIComponent(postalCode)}`);
  return data.flyers
    .filter((/** @type {any} */ flyer) => storeOf(flyer.merchant) && flyer.categories?.includes('Groceries'))
    .map((/** @type {any} */ flyer) => ({
      id: flyer.id,
      store: /** @type {string} */ (storeOf(flyer.merchant)),
      title: flyer.name,
      validFrom: flyer.valid_from,
      validTo: flyer.valid_to,
    }));
}

/**
 * @param {any} raw An item as returned by Flipp.
 * @param {string} store
 * @returns {FlyerItem | null}
 */
export function toItem(raw, store) {
  const price = Number.parseFloat(raw.price);
  // display_type 1 is a product; the others are banners, coupons and contests.
  if (raw.display_type !== 1 || !Number.isFinite(price) || price <= 0) return null;
  // Some chains publish "nom français | english name" in a single field.
  const [nameFr, nameEn] = raw.name.split(' | ');
  return {
    id: raw.id,
    store,
    name: nameFr.trim(),
    nameEn: nameEn?.trim() ?? null,
    searchText: normalize(`${raw.name} ${raw.brand ?? ''}`),
    price,
    discount: raw.discount ?? null,
    image: raw.cutout_image_url?.replace(/^http:/, 'https:') ?? null,
  };
}

/**
 * @param {Flyer} flyer
 * @returns {Promise<FlyerItem[]>}
 */
export async function getFlyerItems(flyer) {
  const data = await getJson(`${BASE_URL}/flyers/${flyer.id}?locale=${LOCALE}`);
  return data.items
    .map((/** @type {any} */ raw) => toItem(raw, flyer.store))
    .filter((/** @type {FlyerItem | null} */ item) => item !== null);
}
