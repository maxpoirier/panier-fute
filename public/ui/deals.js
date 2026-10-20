// @ts-check
import { INGREDIENTS_BY_ID } from '../lib/catalog/ingredients.js';
import { STORES } from '../lib/flipp.js';
import { $, el, money, productImage, storeLogo } from './dom.js';
import { state } from './state.js';

/**
 * @param {Map<string, import('./state.js').Offer[]>} offers
 * @returns {import('./state.js').Deal[]}
 */
export function dealsFrom(offers) {
  return [...offers.entries()]
    .map(([id, list]) => ({ id, name: INGREDIENTS_BY_ID.get(id)?.name ?? id, offers: list }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** @param {import('./state.js').Deal} deal @param {string} store */
function priceCell(deal, store) {
  const offer = deal.offers.find((candidate) => candidate.store === store);
  if (!offer) return el('td', { class: 'none', text: '—' });
  const isBest = offer === deal.offers[0] && deal.offers.length > 1;
  return el(
    'td',
    { class: `price${isBest ? ' best' : ''}` },
    isBest ? '🏆 ' : null,
    el('strong', { text: money.format(offer.price) }),
    offer.discount ? ` (−${offer.discount} %)` : null,
    el('small', { text: offer.itemName }),
  );
}

export function renderDeals() {
  /** @type {HTMLInputElement} */
  const search = $('#deal-search');
  const query = search.value.trim().toLowerCase();
  const rows = state.deals.filter(
    (deal) =>
      !query || deal.name.toLowerCase().includes(query) || deal.offers.some((offer) => offer.itemName.toLowerCase().includes(query)),
  );
  const table = $('#deals-table');
  if (!rows.length) {
    table.replaceChildren(el('tbody', {}, el('tr', {}, el('td', { class: 'empty', text: 'Aucune aubaine trouvée.' }))));
    return;
  }
  table.replaceChildren(
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: 'Ingrédient' }),
        STORES.map((store) => el('th', {}, storeLogo(store), store)),
      ),
    ),
    el(
      'tbody',
      {},
      rows.map((deal) =>
        el(
          'tr',
          {},
          el('td', {}, el('div', { class: 'ingredient-cell' }, productImage(deal.offers[0].image), el('strong', { text: deal.name }))),
          STORES.map((store) => priceCell(deal, store)),
        ),
      ),
    ),
  );
}

export function wireDeals() {
  $('#deal-search').addEventListener('input', renderDeals);
}
