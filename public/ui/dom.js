// @ts-check
// Tiny DOM helpers. Everything is rendered with textContent, so flyer text can never inject markup.

/**
 * The element matching `selector`. A missing element is a bug in index.html, so it fails loudly here rather than as a
 * "cannot read properties of null" somewhere else. The element type follows the variable it's assigned to.
 * @template {HTMLElement} [T=HTMLElement]
 * @param {string} selector
 * @returns {T}
 */
export function $(selector) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return /** @type {T} */ (node);
}

export const money = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });
const shortDate = new Intl.DateTimeFormat('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
export const longDate = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long', timeStyle: 'short' });

/** @type {Record<string, string>} */
const STORE_LABEL = { IGA: 'IGA', 'Super C': 'SC', Maxi: 'MAXI', Walmart: 'W' };

/** @typedef {Node | string | null | undefined | false} Child A falsy child is skipped. */
/** @typedef {Child | Child[] | Child[][]} Children */

/**
 * Optional children are written as `condition ? node : null`; drop them so the DOM never shows "null".
 * @param {Children[]} children
 * @returns {(Node | string)[]}
 */
export function compact(children) {
  return /** @type {(Node | string)[]} */ (
    children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false)
  );
}

/**
 * @param {string} tag
 * @param {Record<string, any>} [props] `class`, `text`, `style`, `on<event>` handlers, or any attribute; falsy values are skipped.
 * @param {...Children} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    // Through the CSSOM rather than a style attribute, which the Content-Security-Policy blocks.
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...compact(children));
  return node;
}

/** @param {string} name */
export function isStore(name) {
  return name in STORE_LABEL;
}

/** @param {string} store */
export function storeLogo(store) {
  return el('span', { class: 'store-logo', 'data-store': store, title: store, text: STORE_LABEL[store] ?? store });
}

/**
 * Flyer cutouts occasionally 404; hide them instead of showing a broken image.
 * @param {string | null | undefined} src
 * @param {string} [className]
 */
export function productImage(src, className) {
  if (!src) return null;
  return el('img', {
    class: className,
    src,
    alt: '',
    loading: 'lazy',
    onerror: (/** @type {Event} */ event) => /** @type {HTMLElement} */ (event.currentTarget).remove(),
  });
}

/** @param {string} from @param {string} to */
export function range(from, to) {
  return `${shortDate.format(new Date(from))} – ${shortDate.format(new Date(to))}`;
}

/**
 * Latest start and earliest end, so a multi-week flyer (e.g. Walmart thematic) doesn't stretch the label.
 * @param {import('../lib/deals.js').StoreWeek[]} stores
 */
export function weekRange(stores) {
  if (!stores.length) return null;
  const starts = stores.map((store) => store.validFrom).sort();
  const ends = stores.map((store) => store.validTo).sort();
  return range(starts[starts.length - 1], ends[0]);
}

/** @param {string} postalCode */
export function formatPostalCode(postalCode) {
  return postalCode.replace(/^(...)(...)$/, '$1 $2');
}
