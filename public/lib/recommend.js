// @ts-check
import { INGREDIENTS_BY_ID, REGULAR_PRICES } from './catalog/ingredients.js';
import { RECIPES } from './catalog/recipes.js';

/** @typedef {import('./deals.js').Offer} Offer */
/** @typedef {import('./catalog/recipes.js').Recipe} Recipe */
/** @typedef {import('./catalog/recipes.js').RecipeIngredient} RecipeIngredient */
/** @typedef {'deal' | 'have' | 'buy' | 'optional'} Status */

const WEIGHTS = { mainOnSale: 12, sideOnSale: 5, optionalOnSale: 1.5, alreadyHave: 2, mustBuy: -4, discountPoint: 0.2 };

/**
 * @param {string} id
 * @param {Status} status
 * @param {Offer[]} offers
 */
function costOf(id, status, offers) {
  if (status === 'deal') return offers[0].price;
  if (status === 'buy') return REGULAR_PRICES[id];
  return 0;
}

const SEAFOOD = new Set(['saumon', 'crevettes', 'poisson_blanc', 'thon']);

// Drives the card colour in the UI: meat, seafood or veggie.
/**
 * Fails loudly on a typo in a recipe; a test also checks every recipe ingredient exists.
 * @param {string} id
 */
function ingredient(id) {
  const found = INGREDIENTS_BY_ID.get(id);
  if (!found) throw new Error(`Unknown ingredient: ${id}`);
  return found;
}

/** @param {Recipe} recipe */
function themeOf(recipe) {
  const mains = recipe.ingredients.filter((entry) => entry.main);
  if (mains.some((entry) => SEAFOOD.has(entry.id))) return 'mer';
  if (mains.some((entry) => ingredient(entry.id).cat === 'viande' && entry.id !== 'tofu')) return 'viande';
  return 'vege';
}

/** @param {number} amount */
const round = (amount) => Math.round(amount * 100) / 100;

// Cheapest offer per store across every accepted variant, cheapest store first.
/**
 * @param {string[]} ids
 * @param {Map<string, Offer[]>} offers
 */
function bestOffers(ids, offers) {
  /** @type {Map<string, Offer>} */
  const byStore = new Map();
  for (const offer of ids.flatMap((id) => offers.get(id) ?? [])) {
    const current = byStore.get(offer.store);
    if (!current || offer.price < current.price) byStore.set(offer.store, offer);
  }
  return [...byStore.values()].sort((a, b) => a.price - b.price);
}

/**
 * @param {RecipeIngredient} entry
 * @param {Set<string>} pantry
 * @param {Map<string, Offer[]>} offers
 */
function describe(entry, pantry, offers) {
  const accepted = [entry.id, ...entry.alt];
  const ownedId = accepted.find((id) => pantry.has(id));
  const ingredientOffers = bestOffers(accepted, offers);
  /** @type {Status} */
  let status;
  if (ownedId) status = 'have';
  else if (ingredientOffers.length) status = 'deal';
  else status = entry.optional ? 'optional' : 'buy';
  return {
    id: entry.id,
    name: ingredient(entry.id).name,
    substitutes: entry.alt.map((id) => ingredient(id).name),
    ownedName: ownedId && ownedId !== entry.id ? ingredient(ownedId).name : null,
    qty: entry.qty,
    main: Boolean(entry.main),
    optional: Boolean(entry.optional),
    status,
    offers: status === 'deal' ? ingredientOffers : [],
    cost: costOf(entry.id, status, ingredientOffers),
  };
}

/**
 * @param {Recipe} recipe
 * @param {Set<string>} pantry
 * @param {Map<string, Offer[]>} offers
 */
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

/**
 * Recipes with at least one ingredient on sale, cheapest first; among equal costs, the better use of deals wins.
 * @param {{ pantry?: string[], offers: Map<string, Offer[]> }} options
 */
export function recommend({ pantry = [], offers }) {
  const owned = new Set(pantry);
  return RECIPES.map((recipe) => scoreRecipe(recipe, owned, offers))
    .filter((recipe) => recipe.dealCount > 0)
    .sort((a, b) => a.totalCost - b.totalCost || b.score - a.score);
}
