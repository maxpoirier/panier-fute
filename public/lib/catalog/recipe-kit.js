// @ts-check
// Building blocks for the recipe files in recipes/.
// An ingredient is either an id or a list [preferred, ...acceptable substitutes]: having or finding any of them on sale counts.
// main: the star ingredient; a recipe ranks much higher when it is on sale.
// optional: nice to have, never counted as something to buy.
// Salt, pepper and water are assumed to be on hand. Every recipe serves at least 4.

/**
 * @typedef {object} RecipeIngredient
 * @property {string} id Preferred ingredient.
 * @property {string[]} alt Acceptable substitutes.
 * @property {string} qty
 * @property {boolean} [main]
 * @property {boolean} [optional]
 */
/**
 * @typedef {object} Recipe
 * @property {string} id
 * @property {string} emoji
 * @property {string} name
 * @property {number} time Minutes.
 * @property {number} servings
 * @property {string[]} tags
 * @property {RecipeIngredient[]} ingredients
 * @property {string[]} steps
 */
/** @typedef {string | string[]} IngredientSpec */

/** @param {IngredientSpec} ids */
export const spec = (ids) => (Array.isArray(ids) ? { id: ids[0], alt: ids.slice(1) } : { id: ids, alt: [] });
/** @param {IngredientSpec} ids @param {string} qty @returns {RecipeIngredient} */
export const main = (ids, qty) => ({ ...spec(ids), qty, main: true });
/** @param {IngredientSpec} ids @param {string} qty @returns {RecipeIngredient} */
export const need = (ids, qty) => ({ ...spec(ids), qty });
/** @param {IngredientSpec} ids @param {string} qty @returns {RecipeIngredient} */
export const opt = (ids, qty) => ({ ...spec(ids), qty, optional: true });

// Puts the preferred variant first and keeps the rest of the family as substitutes.
/** @param {string} first @param {string[]} family */
export const prefer = (first, family) => [first, ...family.filter((id) => id !== first)];

export const RICE = ['riz_blanc', 'riz_basmati', 'riz_jasmin', 'riz_brun'];
export const BUTTER = ['beurre_sale', 'beurre_demi_sel', 'beurre_non_sale'];
export const MILK = ['lait', 'lait_entier', 'lait_sans_lactose'];
export const CHICKEN = ['poulet_poitrine', 'poulet_cuisses'];
export const ONION = ['oignon_jaune', 'oignon_rouge', 'echalote'];
export const CANNED_TOMATOES = ['tomates_des', 'tomates_broyees', 'tomates_entieres'];
export const DRIED_HERBS = ['thym', 'herbes_italiennes', 'origan'];
export const HOT_SAUCE = ['sriracha', 'sauce_piquante'];
export const POTATO = ['pomme_de_terre', 'grelots'];
export const BEANS = ['haricots_rouges', 'haricots_noirs'];
export const PASTA = ['pates_courtes', 'pates_longues'];
export const CREAM = ['creme_15', 'creme_35', 'creme_10'];
export const MUSTARD = ['moutarde_dijon', 'moutarde_jaune'];
export const VINEGAR = ['vinaigre_vin', 'vinaigre_cidre', 'vinaigre_blanc', 'vinaigre_balsamique', 'vinaigre_riz'];
export const MELTING_CHEESE = ['fromage_rape', 'cheddar', 'mozzarella'];
export const BROTH = ['bouillon_poulet', 'bouillon_legumes', 'bouillon_boeuf'];
export const SUGAR = ['cassonade', 'sucre', 'miel', 'sirop_erable'];
export const FLOUR = ['farine', 'farine_ble_entier'];
export const BREAD = ['pain_tranche', 'baguette'];
export const GROUND_MEAT = ['boeuf_hache', 'dinde_hachee', 'porc_hache'];
