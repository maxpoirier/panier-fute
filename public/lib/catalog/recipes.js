// @ts-check
// Every recipe, one file per theme in recipes/. They are written independently of any week's flyers: the app prices
// each one with whatever is on sale (or the regular-price estimate) when it is shown.
import CLASSIQUES from './recipes/classiques.js';
import POULET from './recipes/poulet.js';
import BOEUF_PORC from './recipes/boeuf-porc.js';
import POISSONS from './recipes/poissons.js';
import VEGE from './recipes/vege.js';
import PATES from './recipes/pates.js';
import SOUPES_SALADES from './recipes/soupes-salades.js';
import MEXICAIN_SANDWICHS from './recipes/mexicain-sandwichs.js';
import MONDE from './recipes/monde.js';

/** @typedef {import('./recipe-kit.js').Recipe} Recipe */
/** @typedef {import('./recipe-kit.js').RecipeIngredient} RecipeIngredient */

/** @type {Recipe[]} */
export const RECIPES = [
  ...CLASSIQUES,
  ...POULET,
  ...BOEUF_PORC,
  ...POISSONS,
  ...VEGE,
  ...PATES,
  ...SOUPES_SALADES,
  ...MEXICAIN_SANDWICHS,
  ...MONDE,
];
