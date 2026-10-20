import { GLOBAL_EXCLUDES, INGREDIENTS } from './catalog/ingredients.js';
import { phraseRegex } from './text.js';

const globalExcludes = GLOBAL_EXCLUDES.map(phraseRegex);

const compiled = INGREDIENTS.map((ingredient) => ({
  id: ingredient.id,
  include: ingredient.kw.map(phraseRegex),
  exclude: (ingredient.ex ?? []).map(phraseRegex),
}));

// Returns every ingredient id a flyer item counts as, e.g. "Pâtes et sauce Catelli" → pates + sauce_tomate.
export function matchIngredients(searchText) {
  if (globalExcludes.some((re) => re.test(searchText))) return [];
  return compiled
    .filter(({ include, exclude }) => include.some((re) => re.test(searchText)) && !exclude.some((re) => re.test(searchText)))
    .map(({ id }) => id);
}
