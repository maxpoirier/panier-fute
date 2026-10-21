// @ts-check
import { readPref } from '../lib/prefs.js';

export const PREFS = { maxBuy: 'pfq.maxBuy', sortBy: 'pfq.sortBy', postalCode: 'pfq.postalCode', userName: 'pfq.userName' };
// Pantry and list used to be saved; every visit now starts with nothing selected.
export const RETIRED_PREFS = ['pfq.pantry', 'pfq.list', 'pfq.showAll'];
export const DEFAULT_POSTAL_CODE = 'G2G1B8';

/** @typedef {import('../lib/deals.js').Week} Week */
/** @typedef {import('../lib/deals.js').StoreWeek} StoreWeek */
/** @typedef {import('../lib/deals.js').Offer} Offer */
/** @typedef {ReturnType<typeof import('../lib/recommend.js').scoreRecipe>} RecipeView A recipe priced for the current pantry and week. */
/** @typedef {{ id: string, name: string, offers: Offer[] }} Deal */
/**
 * @typedef {object} State
 * @property {string} postalCode
 * @property {string} userName
 * @property {'total' | 'serving' | 'score'} sortBy
 * @property {number} maxBuy Most ingredients a recipe may need at regular price.
 * @property {boolean} refreshing
 * @property {string | null} error Why the last refresh failed.
 * @property {{ store: string, title: string }[]} failedFlyers
 * @property {Set<string>} pantry Ingredient ids the user has.
 * @property {Map<string, string>} list Recipe id → name, for the shopping list.
 * @property {Set<string>} listChecked Ingredient ids ticked off in the shopping list.
 * @property {Set<string>} listRemoved Ingredient ids taken off the shopping list.
 * @property {Week} week
 * @property {{ fetchedAt: string | null, weeks: Record<Week, StoreWeek[]> }} status
 * @property {RecipeView[]} recipes
 * @property {number} recipesShown How many recipe cards are drawn; grows with « Voir plus ».
 * @property {Deal[]} deals
 */

/**
 * The single source of truth for the UI; the DOM only reflects it.
 * @type {State}
 */
export const state = {
  postalCode: readPref(PREFS.postalCode, DEFAULT_POSTAL_CODE),
  userName: readPref(PREFS.userName, ''),
  sortBy: readPref(PREFS.sortBy, 'total'),
  maxBuy: readPref(PREFS.maxBuy, 2),
  refreshing: false,
  error: null,
  failedFlyers: [],
  pantry: new Set(),
  list: new Map(),
  listChecked: new Set(),
  listRemoved: new Set(),
  week: 'current',
  status: { fetchedAt: null, weeks: { current: [], next: [] } },
  recipes: [],
  recipesShown: 30,
  deals: [],
};
