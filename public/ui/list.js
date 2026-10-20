// @ts-check
import { $, compact, el, isStore, money, storeLogo } from './dom.js';
import { state } from './state.js';

const ELSEWHERE = 'Ailleurs (prix régulier)';

/** @typedef {{ name: string, offer: import('./state.js').Offer | null, cost: number }} ListEntry */

// Rebuilt from the latest recommendations so prices follow the selected week.
function buildList() {
  /** @type {Map<string, ListEntry[]>} */
  const byStore = new Map();
  const seen = new Set();
  let total = 0;
  for (const recipe of state.recipes.filter((candidate) => state.list.has(candidate.id))) {
    for (const item of recipe.items) {
      if (seen.has(item.id) || (item.status !== 'deal' && item.status !== 'buy')) continue;
      seen.add(item.id);
      total += item.cost;
      const store = item.status === 'deal' ? item.offers[0].store : ELSEWHERE;
      const entries = byStore.get(store) ?? [];
      entries.push({ name: item.name, offer: item.status === 'deal' ? item.offers[0] : null, cost: item.cost });
      byStore.set(store, entries);
    }
  }
  return { byStore, total };
}

function listAsText() {
  const { byStore, total } = buildList();
  const lines = [state.userName ? `Liste d’épicerie de ${state.userName}` : 'Ma liste d’épicerie', ''];
  for (const [store, entries] of byStore) {
    lines.push(store);
    for (const { name, offer, cost } of entries) {
      lines.push(`  - ${name} (${offer ? `${offer.itemName}, ${money.format(offer.price)}` : `≈ ${money.format(cost)}`})`);
    }
  }
  lines.push('', `Total estimé : ${money.format(total)}`);
  return lines.join('\n');
}

export function renderList() {
  $('#list-count').textContent = String(state.list.size);
  $('#list-fab').hidden = state.list.size === 0;
  $('#tab-list-count').textContent = String(state.list.size);
  $('#tab-list-count').hidden = state.list.size === 0;
  if (state.list.size === 0) {
    $('#list-body').replaceChildren(el('p', { class: 'hint', text: 'Ta liste est vide. Ajoute des recettes avec « + Ma liste ».' }));
    return;
  }
  const missing = [...state.list.entries()].filter(([id]) => !state.recipes.some((recipe) => recipe.id === id));
  const { byStore, total } = buildList();
  $('#list-body').replaceChildren(
    ...compact([
      el('p', { class: 'hint', text: `Recettes : ${[...state.list.values()].join(', ')}` }),
      el('p', { class: 'list-total', text: `Total estimé : ${money.format(total)}` }),
      [...byStore.entries()].map(([store, entries]) =>
        el(
          'section',
          { class: 'list-store' },
          el('h3', {}, isStore(store) ? storeLogo(store) : '🛒', store),
          el(
            'ul',
            {},
            entries.map(({ name, offer, cost }) =>
              el(
                'li',
                {},
                name,
                el('small', { text: offer ? ` — ${offer.itemName}, ${money.format(offer.price)}` : ` — ≈ ${money.format(cost)}` }),
              ),
            ),
          ),
        ),
      ),
      missing.length
        ? el('p', { class: 'hint', text: `Plus en rabais cette semaine : ${missing.map(([, name]) => name).join(', ')}` })
        : null,
    ]),
  );
}

export function bumpListButton() {
  const fab = $('#list-fab');
  fab.classList.remove('bump');
  void fab.offsetWidth; // restart the animation
  fab.classList.add('bump');
}

/** @param {HTMLElement} button */
async function copyList(button) {
  const text = listAsText();
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = '✓ Copiée!';
    setTimeout(() => {
      button.textContent = '📋 Copier la liste';
    }, 1500);
  } catch {
    // Clipboard refused (permissions, older WebView): hand over the text, selected, for a manual copy.
    const area = /** @type {HTMLTextAreaElement} */ (
      el('textarea', { class: 'list-text', readonly: 'readonly', rows: '8', 'aria-label': 'Liste à copier' })
    );
    area.value = text;
    $('#list-body').append(
      el('p', { class: 'hint', text: 'Copie automatique impossible : sélectionne le texte ci-dessous et copie-le.' }),
      area,
    );
    area.focus();
    area.select();
  }
}

/** @param {() => void} onClear */
export function wireList(onClear) {
  /** @type {HTMLDialogElement} */
  const dialog = $('#list-dialog');
  const open = () => dialog.showModal();
  $('#list-fab').addEventListener('click', open);
  $('#tab-list').addEventListener('click', open);
  const copy = $('#list-copy');
  copy.addEventListener('click', () => copyList(copy));
  $('#list-clear').addEventListener('click', () => {
    onClear();
    dialog.close();
  });
}
