// @ts-check
import { CATEGORIES, COMMON_PANTRY, INGREDIENTS } from '../lib/catalog/ingredients.js';
import { $, el } from './dom.js';
import { state } from './state.js';

/** @type {Record<string, string>} */
const CATEGORY_EMOJI = {
  viande: '🍗',
  legume: '🥕',
  laitier: '🧀',
  feculent: '🍝',
  conserve: '🥫',
  condiment: '🍯',
  epice: '🌿',
  base: '🫒',
};

// Counts are refreshed in place so toggling a chip doesn't replay every chip's animation.
function updateCounts() {
  $('#pantry-count').textContent = `${state.pantry.size} coché${state.pantry.size > 1 ? 's' : ''}`;
  for (const group of document.querySelectorAll('.pantry-group')) {
    const chips = group.querySelectorAll('.chip');
    const checked = group.querySelectorAll('.chip[aria-pressed="true"]').length;
    const count = group.querySelector('h3 small');
    if (count) count.textContent = `${checked}/${chips.length}`;
  }
}

/**
 * @param {import('../lib/catalog/ingredients.js').Ingredient} ingredient
 * @param {() => void} onChange
 */
function chip(ingredient, onChange) {
  return el(
    'button',
    {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(state.pantry.has(ingredient.id)),
      title: `As-tu : ${ingredient.name.toLowerCase()}?`,
      onclick: (/** @type {MouseEvent} */ event) => {
        if (state.pantry.has(ingredient.id)) state.pantry.delete(ingredient.id);
        else state.pantry.add(ingredient.id);
        /** @type {HTMLElement} */ (event.currentTarget).setAttribute('aria-pressed', String(state.pantry.has(ingredient.id)));
        updateCounts();
        onChange();
      },
    },
    ingredient.name,
    ingredient.hint ? el('small', { text: ingredient.hint }) : null,
  );
}

/** @param {() => void} onChange */
export function renderPantry(onChange) {
  $('#pantry-groups').replaceChildren(
    ...Object.entries(CATEGORIES).map(([cat, label]) =>
      el(
        'div',
        { class: 'pantry-group' },
        el('h3', {}, el('span', { class: 'emoji', text: CATEGORY_EMOJI[cat] }), label, el('small')),
        el(
          'div',
          { class: 'chips' },
          INGREDIENTS.filter((ingredient) => ingredient.cat === cat).map((ingredient) => chip(ingredient, onChange)),
        ),
      ),
    ),
  );
  updateCounts();
}

/** @param {() => void} onChange */
export function wirePantry(onChange) {
  $('#pantry-common').addEventListener('click', () => {
    for (const id of COMMON_PANTRY) state.pantry.add(id);
    renderPantry(onChange);
    onChange();
  });
  $('#pantry-clear').addEventListener('click', () => {
    state.pantry.clear();
    renderPantry(onChange);
    onChange();
  });
}
