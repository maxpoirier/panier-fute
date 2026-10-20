// @ts-check
// Full-screen prompts (first-launch name, app update) block everything behind them. Several can be open at once, so
// the app becomes usable again only when the last one closes.

const BLOCKED_REGIONS = 'header, main, nav, dialog, .list-fab';
/** @type {Set<HTMLElement>} */
const open = new Set();

function applyInert() {
  const blocked = open.size > 0;
  for (const region of document.querySelectorAll(BLOCKED_REGIONS)) /** @type {HTMLElement} */ (region).inert = blocked;
}

/** @param {HTMLElement} node */
export function showOverlay(node) {
  open.add(node);
  document.body.append(node);
  applyInert();
}

/** @param {HTMLElement} node */
export function closeOverlay(node) {
  open.delete(node);
  node.remove();
  applyInert();
}
