import { INGREDIENTS_BY_ID, REGULAR_PRICES } from './catalog/ingredients.js';
import { RECIPES } from './catalog/recipes.js';

const WEIGHTS = { mainOnSale: 12, sideOnSale: 5, optionalOnSale: 1.5, alreadyHave: 2, mustBuy: -4, discountPoint: 0.2 };

function costOf(id, status, offers) {
  if (status === 'deal') return offers[0].price;
  if (status === 'buy') return REGULAR_PRICES[id];
  return 0;
}

const SEAFOOD = new Set(['saumon', 'crevettes', 'poisson_blanc', 'thon']);

// Drives the card colour in the UI: meat, seafood or veggie.
function themeOf(recipe) {
  const mains = recipe.ingredients.filter((entry) => entry.main);
  if (mains.some((entry) => SEAFOOD.has(entry.id))) return 'mer';
  if (mains.some((entry) => INGREDIENTS_BY_ID.get(entry.id).cat === 'viande' && entry.id !== 'tofu')) return 'viande';
  return 'vege';
}

const round = (amount) => Math.round(amount * 100) / 100;

// Cheapest offer per store across every accepted variant, cheapest store first.
function bestOffers(ids, offers) {
  const byStore = new Map();
  for (const offer of ids.flatMap((id) => offers.get(id) ?? [])) {
    const current = byStore.get(offer.store);
    if (!current || offer.price < current.price) byStore.set(offer.store, offer);
  }
  return [...byStore.values()].sort((a, b) => a.price - b.price);
}

function describe(entry, pantry, offers) {
  const accepted = [entry.id, ...entry.alt];
  const ownedId = accepted.find((id) => pantry.has(id));
  const ingredientOffers = bestOffers(accepted, offers);
  let status;
  if (ownedId) status = 'have';
  else if (ingredientOffers.length) status = 'deal';
  else status = entry.optional ? 'optional' : 'buy';
  return {
    id: entry.id,
    name: INGREDIENTS_BY_ID.get(entry.id).name,
    substitutes: entry.alt.map((id) => INGREDIENTS_BY_ID.get(id).name),
    ownedName: ownedId && ownedId !== entry.id ? INGREDIENTS_BY_ID.get(ownedId).name : null,
    qty: entry.qty,
    main: Boolean(entry.main),
    optional: Boolean(entry.optional),
    status,
    offers: status === 'deal' ? ingredientOffers : [],
    cost: costOf(entry.id, status, ingredientOffers),
  };
}

export function scoreRecipe(recipe, pantry, offers) {
  const items = recipe.ingredients.map((entry) => describe(entry, pantry, offers));
  let score = 0;
  for (const item of items) {
    if (item.status === 'deal') {
      if (item.main) score += WEIGHTS.mainOnSale;
      else score += item.optional ? WEIGHTS.optionalOnSale : WEIGHTS.sideOnSale;
      score += (item.offers[0].discount ?? 0) * WEIGHTS.discountPoint;
    } else if (item.status === 'have') {
      score += WEIGHTS.alreadyHave;
    } else if (item.status === 'buy') {
      score += WEIGHTS.mustBuy;
    }
  }
  const deals = items.filter((item) => item.status === 'deal');
  return {
    id: recipe.id,
    name: recipe.name,
    emoji: recipe.emoji,
    theme: themeOf(recipe),
    time: recipe.time,
    servings: recipe.servings,
    tags: recipe.tags,
    steps: recipe.steps,
    items,
    score: Math.round(score * 10) / 10,
    dealCount: deals.length,
    mainOnSale: deals.some((item) => item.main),
    toBuyCount: items.filter((item) => item.status === 'buy').length,
    dealCost: round(deals.reduce((sum, item) => sum + item.cost, 0)),
    totalCost: round(items.reduce((sum, item) => sum + item.cost, 0)),
    costPerServing: round(items.reduce((sum, item) => sum + item.cost, 0) / recipe.servings),
  };
}

// Cheapest first; among equal costs, the recipe that makes better use of the deals wins.
export function recommend({ pantry = [], offers }) {
  const owned = new Set(pantry);
  return RECIPES.map((recipe) => scoreRecipe(recipe, owned, offers))
    .filter((recipe) => recipe.dealCount > 0)
    .sort((a, b) => a.totalCost - b.totalCost || b.score - a.score);
}
