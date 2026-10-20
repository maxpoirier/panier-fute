import { normalize } from './text.js';

// Flipp aggregates the weekly circulaires of every major Québec grocer by postal code, and allows browser (CORS) requests.
const BASE_URL = 'https://backflipp.wishabi.com/flipp';
const LOCALE = 'fr-ca';

export const STORES = ['IGA', 'Super C', 'Maxi', 'Walmart'];

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Flipp ${response.status} for ${url}`);
  return response.json();
}

function storeOf(merchant) {
  const wanted = normalize(merchant);
  return STORES.find((store) => normalize(store) === wanted);
}

export async function listGroceryFlyers(postalCode) {
  const data = await getJson(`${BASE_URL}/flyers?locale=${LOCALE}&postal_code=${encodeURIComponent(postalCode)}`);
  return data.flyers
    .filter((flyer) => storeOf(flyer.merchant) && flyer.categories?.includes('Groceries'))
    .map((flyer) => ({
      id: flyer.id,
      store: storeOf(flyer.merchant),
      title: flyer.name,
      validFrom: flyer.valid_from,
      validTo: flyer.valid_to,
    }));
}

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

export async function getFlyerItems(flyer) {
  const data = await getJson(`${BASE_URL}/flyers/${flyer.id}?locale=${LOCALE}`);
  return data.items.map((raw) => toItem(raw, flyer.store)).filter(Boolean);
}
