// @ts-check
import { $, compact, el, isStore, money, storeLogo } from './dom.js';
import { state } from './state.js';

const ELSEWHERE = 'Ailleurs (prix régulier)';

/** @typedef {{ id: string, name: string, offer: import('./state.js').Offer | null, cost: number }} ListEntry */

// Rebuilt from the latest recommendations so prices follow the selected week. Ticked and removed items are kept by
// ingredient id, so they stay ticked or removed when the week or the chosen recipes change.
function buildList() {
  /** @type {Map<string, ListEntry[]>} */
  const byStore = new Map();
  const seen = new Set();
  let total = 0;
  for (const recipe of state.recipes.filter((candidate) => state.list.has(candidate.id))) {
    for (const item of recipe.items) {
      if (seen.has(item.id) || (item.status !== 'deal' && item.status !== 'buy')) continue;
      seen.add(item.id);
      if (state.listRemoved.has(item.id)) continue;
      total += item.cost;
      const store = item.status === 'deal' ? item.offers[0].store : ELSEWHERE;
      const entries = byStore.get(store) ?? [];
      entries.push({ id: item.id, name: item.name, offer: item.status === 'deal' ? item.offers[0] : null, cost: item.cost });
      byStore.set(store, entries);
    }
  }
  return { byStore, total, entries: [...byStore.values()].flat() };
}

function listAsText() {
  const { byStore, total } = buildList();
  const lines = [state.userName ? `Liste d’épicerie de ${state.userName}` : 'Ma liste d’épicerie', ''];
  for (const [store, entries] of byStore) {
    lines.push(store);
    for (const { id, name, offer, cost } of entries) {
      const mark = state.listChecked.has(id) ? '✓' : '-';
      lines.push(`  ${mark} ${name} (${offer ? `${offer.itemName}, ${money.format(offer.price)}` : `≈ ${money.format(cost)}`})`);
    }
  }
  lines.push('', `Total estimé : ${money.format(total)}`);
  return lines.join('\n');
}

/**
 * The cart buttons (bottom tab on phones, floating button on wider screens) show the number of recipes and the total.
 * @param {number} total
 */
function renderCartBadges(total) {
  const empty = state.list.size === 0;
  const count = String(state.list.size);
  const price = money.format(total);
  $('#list-fab').hidden = empty;
  $('#list-count').textContent = count;
  $('#list-fab-total').textContent = price;
  $('#tab-list-count').textContent = count;
  $('#tab-list-count').hidden = empty;
  $('#tab-list-total').textContent = price;
  $('#tab-list-total').hidden = empty;
  const label = empty ? 'Ma liste, vide' : `Ma liste : ${count} recette${state.list.size > 1 ? 's' : ''}, environ ${price}`;
  $('#list-fab').setAttribute('aria-label', label);
  $('#tab-list').setAttribute('aria-label', label);
}

/** @param {ListEntry} entry */
function listItem(entry) {
  const { id, name, offer, cost } = entry;
  const checked = state.listChecked.has(id);
  const row = el(
    'li',
    { class: checked ? 'done' : null, 'data-id': id },
    el(
      'label',
      {},
      el('input', {
        type: 'checkbox',
        checked,
        onchange: (/** @type {Event} */ event) => {
          const box = /** @type {HTMLInputElement} */ (event.currentTarget);
          if (box.checked) state.listChecked.add(id);
          else state.listChecked.delete(id);
          // Updated in place so the keyboard focus stays on this checkbox.
          row.classList.toggle('done', box.checked);
          renderListActions();
        },
      }),
      el(
        'span',
        { class: 'list-name' },
        name,
        el('small', { text: offer ? ` — ${offer.itemName}, ${money.format(offer.price)}` : ` — ≈ ${money.format(cost)}` }),
      ),
    ),
    el('button', {
      type: 'button',
      class: 'list-remove',
      'aria-label': `Retirer ${name} de la liste`,
      text: '✕',
      onclick: () => removeItem(id),
    }),
  );
  return row;
}

// "Remove ticked" and "restore" buttons under the list; refreshed on their own when an item is ticked.
function renderListActions() {
  const container = document.querySelector('#list-actions');
  if (!container) return;
  const ticked = buildList().entries.filter((entry) => state.listChecked.has(entry.id));
  const removed = state.listRemoved.size;
  container.replaceChildren(
    ...compact([
      ticked.length
        ? el('button', {
            type: 'button',
            class: 'btn ghost',
            text: `Retirer les articles cochés (${ticked.length})`,
            onclick: () => {
              for (const entry of ticked) state.listRemoved.add(entry.id);
              renderList();
              $('#list-copy').focus();
            },
          })
        : null,
      removed
        ? el('button', {
            type: 'button',
            class: 'btn ghost',
            text: `Tout rétablir (${removed} retiré${removed > 1 ? 's' : ''})`,
            onclick: () => {
              state.listRemoved.clear();
              renderList();
              $('#list-copy').focus();
            },
          })
        : null,
    ]),
  );
}

/**
 * Removes one item; the focus moves to a neighbouring item's checkbox so a keyboard user doesn't lose their place.
 * @param {string} id
 */
function removeItem(id) {
  const { entries } = buildList();
  const index = entries.findIndex((entry) => entry.id === id);
  const neighbour = entries[index + 1] ?? entries[index - 1];
  state.listRemoved.add(id);
  renderList();
  const target = neighbour && document.querySelector(`#list-body li[data-id="${neighbour.id}"] input`);
  if (target instanceof HTMLElement) target.focus();
  else $('#list-copy').focus();
}

export function renderList() {
  const { byStore, total, entries } = buildList();
  renderCartBadges(total);
  if (state.list.size === 0) {
    $('#list-body').replaceChildren(el('p', { class: 'hint', text: 'Ta liste est vide. Ajoute des recettes avec « + Ma liste ».' }));
    return;
  }
  const missing = [...state.list.entries()].filter(([id]) => !state.recipes.some((recipe) => recipe.id === id));
  $('#list-body').replaceChildren(
    ...compact([
      el('p', { class: 'hint', text: `Recettes : ${[...state.list.values()].join(', ')}` }),
      el('p', { class: 'list-total', text: `Total estimé : ${money.format(total)}` }),
      entries.length ? null : el('p', { class: 'hint', text: 'Tous les articles ont été retirés.' }),
      [...byStore.entries()].map(([store, storeEntries]) =>
        el(
          'section',
          { class: 'list-store' },
          el('h3', {}, isStore(store) ? storeLogo(store) : '🛒', store),
          el('ul', {}, storeEntries.map(listItem)),
        ),
      ),
      el('div', { id: 'list-actions', class: 'list-actions' }),
      missing.length
        ? el('p', { class: 'hint', text: `Plus en rabais cette semaine : ${missing.map(([, name]) => name).join(', ')}` })
        : null,
    ]),
  );
  renderListActions();
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
    state.listChecked.clear();
    state.listRemoved.clear();
    onClear();
    dialog.close();
  });
}
