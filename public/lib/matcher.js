// @ts-check
import { GLOBAL_EXCLUDES, INGREDIENTS } from './catalog/ingredients.js';
import { phraseRegex } from './text.js';

const globalExcludes = GLOBAL_EXCLUDES.map(phraseRegex);

/**
 * Identifies the matching rules, so ingredients saved with cached flyer items are recomputed when the catalogue changes.
 * @param {string} text
 */
function fingerprint(text) {
  let hash = 5381;
  for (let index = 0; index < text.length; index++) hash = (hash * 33) ^ text.charCodeAt(index);
  return (hash >>> 0).toString(36);
}
export const MATCHER_VERSION = fingerprint(JSON.stringify([GLOBAL_EXCLUDES, INGREDIENTS.map(({ id, kw, ex }) => [id, kw, ex])]));

const compiled = INGREDIENTS.map((ingredient) => ({
  id: ingredient.id,
  include: ingredient.kw.map(phraseRegex),
  exclude: (ingredient.ex ?? []).map(phraseRegex),
}));

/**
 * Every ingredient id a flyer item counts as, e.g. "Pâtes et sauce Catelli" → pates + sauce_tomate.
 * @param {string} searchText Normalized item text.
 * @returns {string[]}
 */
export function matchIngredients(searchText) {
  if (globalExcludes.some((re) => re.test(searchText))) return [];
  return compiled
    .filter(({ include, exclude }) => include.some((re) => re.test(searchText)) && !exclude.some((re) => re.test(searchText)))
    .map(({ id }) => id);
}
