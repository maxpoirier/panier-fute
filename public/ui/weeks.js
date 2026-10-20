// @ts-check
import { STORES } from '../lib/flipp.js';
import { $, el, range, storeLogo, weekRange } from './dom.js';
import { state } from './state.js';

/** @typedef {import('./state.js').Week} Week */

/** @type {Record<Week, string>} */
const LABELS = { current: '📅 Cette semaine', next: '🔮 Semaine prochaine' };

/** @returns {HTMLButtonElement[]} */
function tabs() {
  return [...document.querySelectorAll('.tabs [role="tab"]')].filter((tab) => tab instanceof HTMLButtonElement);
}

/** @param {HTMLElement} tab */
function weekOf(tab) {
  return /** @type {Week} */ (tab.dataset.week);
}

export function renderWeeks() {
  for (const tab of tabs()) {
    const week = weekOf(tab);
    const stores = state.status.weeks[week];
    const selected = week === state.week;
    tab.replaceChildren(LABELS[week], el('small', { text: weekRange(stores) ?? 'pas encore publiée' }));
    tab.disabled = stores.length === 0;
    tab.setAttribute('aria-selected', String(selected));
    // Roving tabindex: Tab reaches the selected week, the arrow keys move between weeks.
    tab.tabIndex = selected ? 0 : -1;
  }

  const published = state.status.weeks[state.week];
  $('#week-stores').replaceChildren(
    ...STORES.map((store) => {
      const flyer = published.find((entry) => entry.store === store);
      return el(
        'span',
        { class: `store-pill${flyer ? '' : ' missing'}` },
        storeLogo(store),
        flyer ? `${store} · ${range(flyer.validFrom, flyer.validTo)}` : `${store} · pas encore publiée`,
      );
    }),
  );
}

/** @param {(week: Week) => void} onSelect */
export function wireWeeks(onSelect) {
  for (const tab of tabs()) {
    tab.addEventListener('click', () => !tab.disabled && onSelect(weekOf(tab)));
    tab.addEventListener('keydown', (event) => {
      const enabled = tabs().filter((candidate) => !candidate.disabled);
      const index = enabled.indexOf(tab);
      /** @type {Record<string, HTMLButtonElement | undefined>} */
      const targets = {
        ArrowRight: enabled[(index + 1) % enabled.length],
        ArrowLeft: enabled[(index - 1 + enabled.length) % enabled.length],
        Home: enabled[0],
        End: enabled[enabled.length - 1],
      };
      const target = targets[event.key];
      if (!target) return;
      event.preventDefault();
      onSelect(weekOf(target));
      target.focus();
    });
  }
}
