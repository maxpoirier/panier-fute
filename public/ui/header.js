// @ts-check
import { STORES } from '../lib/flipp.js';
import { writePref } from '../lib/prefs.js';
import { APP_VERSION } from '../version.js';
import { $, el, formatPostalCode, longDate, money } from './dom.js';
import { PREFS, state } from './state.js';

const POSTAL_CODE_PATTERN = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;

function statusMessage() {
  const pc = formatPostalCode(state.postalCode);
  const { fetchedAt } = state.status;
  if (state.refreshing) return `📍 ${pc} · récupération des circulaires…`;
  if (state.error && fetchedAt) return `📍 ${pc} · hors ligne, circulaires du ${longDate.format(new Date(fetchedAt))}`;
  if (state.error) return `Impossible de joindre les circulaires (${state.error}). Vérifie ta connexion.`;
  if (!fetchedAt) return 'Aucune circulaire en cache.';
  const updated = `📍 ${pc} · mis à jour le ${longDate.format(new Date(fetchedAt))}`;
  if (!state.failedFlyers.length) return updated;
  const stores = [...new Set(state.failedFlyers.map((flyer) => flyer.store))].join(', ');
  return `${updated} · ⚠️ ${stores} non téléchargé, nouvel essai à la prochaine ouverture`;
}

export function renderStatus() {
  $('#status-text').textContent = statusMessage();
  /** @type {HTMLButtonElement} */ (document.querySelector('#refresh-btn')).disabled = state.refreshing;
}

/** @param {string} icon @param {string} value @param {string} label */
function stat(icon, value, label) {
  return el(
    'div',
    { class: 'stat' },
    el('span', { class: 'icon', text: icon }),
    el('div', {}, el('strong', { text: value }), el('small', { text: label })),
  );
}

/** @param {import('./state.js').RecipeView[]} visibleRecipes */
export function renderStats(visibleRecipes) {
  const cheapest = visibleRecipes.reduce(
    (/** @type {import('./state.js').RecipeView | null} */ best, recipe) => (!best || recipe.totalCost < best.totalCost ? recipe : best),
    null,
  );
  const storeCount = state.status.weeks[state.week].length;
  $('#stats').replaceChildren(
    stat('🏷️', String(state.deals.length), 'ingrédients en rabais'),
    stat('🥇', cheapest ? money.format(cheapest.totalCost) : '—', cheapest ? cheapest.name : 'aucune recette'),
    stat('🍽️', String(visibleRecipes.length), 'recettes possibles'),
    stat(
      '🏪',
      `${storeCount} / ${STORES.length}`,
      state.week === 'current' ? 'circulaires cette semaine' : 'circulaires la semaine prochaine',
    ),
  );
}

export function renderVersion() {
  const version = $('#app-version');
  version.textContent = `v${APP_VERSION}`;
  version.setAttribute('aria-label', `Version ${APP_VERSION} de l’application`);
}

export function renderUserName() {
  const name = state.userName;
  const hello = $('#hello');
  hello.textContent = name ? `Salut ${name}! 👋 ✏️` : 'Salut! 👋';
  // The emoji would otherwise be read aloud as the button's purpose.
  hello.setAttribute('aria-label', name ? `Salut ${name}! Changer de prénom` : 'Entrer mon prénom');
  $('.user-name-suffix').textContent = name ? `, ${name}` : '';
  $('#list-title').textContent = name ? `🛒 La liste d’épicerie de ${name}` : '🛒 Ma liste d’épicerie';
}

/**
 * @param {{ onPostalCodeChange: () => void, onRefresh: () => void, onEditName: () => void }} handlers
 */
export function wireHeader({ onPostalCodeChange, onRefresh, onEditName }) {
  /** @type {HTMLInputElement} */
  const input = $('#postal-input');
  input.value = formatPostalCode(state.postalCode);
  $('#postal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const postalCode = input.value.replace(/\s+/g, '').toUpperCase();
    if (!POSTAL_CODE_PATTERN.test(postalCode)) {
      input.setCustomValidity('Format attendu : G2G 1B8');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    state.postalCode = postalCode;
    writePref(PREFS.postalCode, postalCode);
    onPostalCodeChange();
  });
  $('#refresh-btn').addEventListener('click', onRefresh);
  $('#hello').addEventListener('click', onEditName);
}
