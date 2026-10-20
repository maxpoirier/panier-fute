// @ts-check
import { writePref } from '../lib/prefs.js';
import { $, el, money, productImage, storeLogo } from './dom.js';
import { PREFS, state } from './state.js';

/** @typedef {import('./state.js').RecipeView} RecipeView */
/** @typedef {RecipeView['items'][number]} RecipeItem */
/** @typedef {(recipe: RecipeView) => void} ToggleList */

/** @type {Record<string, string>} */
const STATUS_ICON = { deal: '🏷️', have: '✅', buy: '🛒', optional: '➕' };
const MEDALS = ['🥇 Le moins cher', '🥈 2e moins cher', '🥉 3e moins cher'];

/** @type {Record<import('./state.js').State['sortBy'], (a: RecipeView, b: RecipeView) => number>} */
const SORTS = {
  total: (a, b) => a.totalCost - b.totalCost || b.score - a.score,
  serving: (a, b) => a.costPerServing - b.costPerServing || b.score - a.score,
  score: (a, b) => b.score - a.score,
};

export function visibleRecipes() {
  return state.recipes.filter((recipe) => recipe.toBuyCount <= state.maxBuy).sort(SORTS[state.sortBy] ?? SORTS.total);
}

/** @param {RecipeItem} item */
function ingredientRow(item) {
  const offer = item.offers[0];
  let where;
  if (item.status === 'deal') {
    where = el(
      'span',
      { class: 'where' },
      storeLogo(offer.store),
      money.format(offer.price),
      offer.discount ? el('span', { class: 'discount', text: `−${offer.discount} %` }) : null,
    );
  } else if (item.status === 'have') {
    where = el('span', { class: 'where', text: item.ownedName ? `tu as : ${item.ownedName.toLowerCase()}` : 'tu l’as' });
  } else if (item.status === 'buy') {
    where = el('span', { class: 'where', text: `≈ ${money.format(item.cost)}` });
  } else {
    where = el('span', { class: 'where', text: 'facultatif' });
  }
  const alternatives = item.offers
    .slice(1)
    .map((alt) => `${alt.store} ${money.format(alt.price)}`)
    .join(' · ');
  return el(
    'li',
    { class: `${item.status}${item.optional ? ' optional' : ''}` },
    el('span', { class: 'icon', text: STATUS_ICON[item.status] }),
    el('span', {}, item.main ? el('strong', { text: item.name }) : item.name, ' ', el('span', { class: 'qty', text: item.qty })),
    where,
    item.substitutes.length && item.status !== 'have'
      ? el('span', { class: 'substitutes', text: `ou : ${item.substitutes.join(', ').toLowerCase()}` })
      : null,
    offer ? el('span', { class: 'product-name', title: alternatives ? `Aussi : ${alternatives}` : null, text: offer.itemName }) : null,
  );
}

/**
 * @param {RecipeView} recipe
 * @param {number} index Position in the list, for the medal and the staggered animation.
 * @param {boolean} showMedal
 * @param {ToggleList} onToggleList
 * @param {Set<string>} openSteps Recipes whose steps were open before this redraw.
 */
function recipeCard(recipe, index, showMedal, onToggleList, openSteps) {
  const selected = state.list.has(recipe.id);
  const mainDeal = recipe.items.find((item) => item.main && item.status === 'deal');
  return el(
    'article',
    { class: `recipe theme-${recipe.theme}${selected ? ' selected' : ''}`, style: `--i: ${index}`, 'data-id': recipe.id },
    el(
      'div',
      { class: 'recipe-hero' },
      showMedal && index < MEDALS.length ? el('span', { class: 'rank', text: MEDALS[index] }) : null,
      el('span', { class: 'recipe-emoji', text: recipe.emoji ?? '🍽️' }),
      productImage(mainDeal?.offers[0].image, 'product'),
      el(
        'span',
        { class: 'price-tag' },
        el('strong', { text: money.format(recipe.totalCost) }),
        el('small', { text: `${money.format(recipe.costPerServing)} / portion` }),
      ),
    ),
    el(
      'div',
      { class: 'recipe-body' },
      el(
        'div',
        {},
        el('h3', { text: recipe.name }),
        el('p', { class: 'meta', text: `⏱️ ${recipe.time} min · 🍽️ ${recipe.servings} portions` }),
      ),
      el(
        'div',
        { class: 'badges' },
        el('span', { class: 'badge', text: `🏷️ ${recipe.dealCount} en rabais` }),
        recipe.mainOnSale ? el('span', { class: 'badge star', text: '⭐ vedette en rabais' }) : null,
        recipe.toBuyCount ? el('span', { class: 'badge warn', text: `🛒 ${recipe.toBuyCount} au prix régulier` }) : null,
        recipe.tags.map((tag) => el('span', { class: 'badge tag', text: tag })),
      ),
      el('ul', { class: 'ingredients' }, recipe.items.map(ingredientRow)),
      el(
        'details',
        { open: openSteps.has(recipe.id) },
        el('summary', { text: '👩‍🍳 Préparation' }),
        el(
          'ol',
          {},
          recipe.steps.map((step) => el('li', { text: step })),
        ),
      ),
    ),
    el(
      'div',
      { class: 'recipe-foot' },
      el('span', { class: 'savings', text: `dont ${money.format(recipe.dealCost)} en rabais` }),
      el('button', {
        type: 'button',
        class: `btn${selected ? ' added' : ''}`,
        text: selected ? '✓ Dans ma liste' : '+ Ma liste',
        onclick: () => onToggleList(recipe),
      }),
    ),
  );
}

/** @param {string} icon @param {string} text */
function emptyMessage(icon, text) {
  return el('p', { class: 'empty' }, el('span', { class: 'big', text: icon }), text);
}

/**
 * @param {RecipeView[]} visible
 * @param {ToggleList} onToggleList
 */
export function renderRecipes(visible, onToggleList) {
  const container = $('#recipes');
  // Keep the steps the user is reading open across redraws.
  const openSteps = new Set(
    [...container.querySelectorAll('.recipe details[open]')]
      .map((details) => /** @type {HTMLElement | null} */ (details.closest('.recipe'))?.dataset.id)
      .filter((id) => id !== undefined),
  );
  $('#to-recipes').textContent = `Voir les ${visible.length} recettes →`;
  if (!state.status.fetchedAt) {
    container.replaceChildren(
      state.error
        ? emptyMessage('📡', 'Pas de circulaires pour l’instant : vérifie ta connexion puis touche « Rafraîchir ».')
        : emptyMessage('⏳', 'Les circulaires se chargent…'),
    );
    return;
  }
  if (!visible.length) {
    container.replaceChildren(
      emptyMessage(
        '🤔',
        'Aucune recette ne correspond. Coche plus d’ingrédients que tu as, ou accepte plus d’ingrédients au prix régulier.',
      ),
    );
    return;
  }
  const showMedal = state.sortBy !== 'score';
  container.replaceChildren(...visible.map((recipe, index) => recipeCard(recipe, index, showMedal, onToggleList, openSteps)));
}

/** @param {() => void} onChange */
export function wireRecipeFilters(onChange) {
  /** @type {HTMLSelectElement} */
  const sortBy = $('#sort-by');
  /** @type {HTMLSelectElement} */
  const maxBuy = $('#max-buy');
  sortBy.value = state.sortBy;
  maxBuy.value = String(state.maxBuy);
  sortBy.addEventListener('change', () => {
    state.sortBy = /** @type {import('./state.js').State['sortBy']} */ (sortBy.value);
    writePref(PREFS.sortBy, state.sortBy);
    onChange();
  });
  maxBuy.addEventListener('change', () => {
    state.maxBuy = Number(maxBuy.value);
    writePref(PREFS.maxBuy, state.maxBuy);
    onChange();
  });
}
