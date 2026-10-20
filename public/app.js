import { CATEGORIES, COMMON_PANTRY, INGREDIENTS, INGREDIENTS_BY_ID } from './lib/catalog/ingredients.js';
import { STORES } from './lib/flipp.js';
import { recommend } from './lib/recommend.js';
import { getSnapshot, getWeek, isStale, refresh } from './lib/store.js';

const STORAGE = { maxBuy: 'pfq.maxBuy', sortBy: 'pfq.sortBy', postalCode: 'pfq.postalCode' };
const DEFAULT_POSTAL_CODE = 'G2G1B8';
const POSTAL_CODE_PATTERN = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
// Pantry and list used to be saved; every visit now starts with nothing selected.
const RETIRED_KEYS = ['pfq.pantry', 'pfq.list', 'pfq.showAll'];

const CATEGORY_EMOJI = {
  viande: '🍗', legume: '🥕', laitier: '🧀', feculent: '🍝', conserve: '🥫', condiment: '🍯', epice: '🌿', base: '🫒',
};
const STORE_LABEL = { IGA: 'IGA', 'Super C': 'SC', Maxi: 'MAXI', Walmart: 'W' };
const STATUS_ICON = { deal: '🏷️', have: '✅', buy: '🛒', optional: '➕' };
const MEDALS = ['🥇 Le moins cher', '🥈 2e moins cher', '🥉 3e moins cher'];
// On phones each section is its own screen, picked by the URL hash so Android's back button works.
const SCREENS = ['garde-manger', 'recettes', 'prix'];

const state = {
  status: null,
  catalog: { categories: CATEGORIES, commonPantry: COMMON_PANTRY, ingredients: INGREDIENTS },
  postalCode: readStorage(STORAGE.postalCode, DEFAULT_POSTAL_CODE),
  refreshing: false,
  error: null,
  pantry: new Set(),
  list: new Map(),
  week: 'current',
  recipes: [],
  deals: [],
};

const $ = (selector) => document.querySelector(selector);

const money = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });
const shortDate = new Intl.DateTimeFormat('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long', timeStyle: 'short' });

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing: preferences just won't persist.
  }
}

// Optional children are written as `condition ? node : null`; drop them so the DOM never shows "null".
function compact(children) {
  return children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...compact(children));
  return node;
}

function storeLogo(store) {
  return el('span', { class: 'store-logo', 'data-store': store, title: store, text: STORE_LABEL[store] ?? store });
}

// Flyer cutouts occasionally 404; hide them instead of showing a broken image.
function productImage(src, className) {
  if (!src) return null;
  return el('img', { class: className, src, alt: '', loading: 'lazy', onerror: (event) => event.currentTarget.remove() });
}

function range(from, to) {
  return `${shortDate.format(new Date(from))} – ${shortDate.format(new Date(to))}`;
}

// Latest start and earliest end, so a multi-week flyer (e.g. Walmart thematic) doesn't stretch the label.
function weekRange(stores) {
  if (!stores.length) return null;
  return range(stores.map((s) => s.validFrom).sort().at(-1), stores.map((s) => s.validTo).sort()[0]);
}

// ---------- Status & hero ----------

function renderStatus() {
  const { status } = state;
  const text = $('#status-text');
  const pc = state.postalCode.replace(/^(...)(...)$/, '$1 $2');
  if (status.refreshing) {
    text.textContent = `📍 ${pc} · récupération des circulaires…`;
  } else if (state.error && status.fetchedAt) {
    text.textContent = `📍 ${pc} · hors ligne, circulaires du ${longDate.format(new Date(status.fetchedAt))}`;
  } else if (state.error) {
    text.textContent = `Impossible de joindre les circulaires (${state.error}). Vérifie ta connexion.`;
  } else if (status.fetchedAt) {
    text.textContent = `📍 ${pc} · mis à jour le ${longDate.format(new Date(status.fetchedAt))}`;
  } else {
    text.textContent = 'Aucune circulaire en cache.';
  }
  $('#refresh-btn').disabled = status.refreshing;

  for (const tab of document.querySelectorAll('.tab')) {
    const stores = status.weeks[tab.dataset.week];
    const label = tab.dataset.week === 'current' ? '📅 Cette semaine' : '🔮 Semaine prochaine';
    tab.replaceChildren(label, el('small', { text: weekRange(stores) ?? 'pas encore publiée' }));
    tab.disabled = stores.length === 0;
  }

  const published = status.weeks[state.week];
  $('#week-stores').replaceChildren(...status.stores.map((store) => {
    const flyer = published.find((entry) => entry.store === store);
    return el('span', { class: `store-pill${flyer ? '' : ' missing'}` },
      storeLogo(store), flyer ? `${store} · ${range(flyer.validFrom, flyer.validTo)}` : `${store} · pas encore publiée`);
  }));
}

function stat(icon, value, label) {
  return el('div', { class: 'stat' }, el('span', { class: 'icon', text: icon }), el('div', {}, el('strong', { text: value }), el('small', { text: label })));
}

function renderStats() {
  const visible = visibleRecipes();
  const cheapest = [...visible].sort(SORTS.total)[0];
  const storeCount = state.status.weeks[state.week].length;
  $('#stats').replaceChildren(
    stat('🏷️', String(state.deals.length), 'ingrédients en rabais'),
    stat('🥇', cheapest ? money.format(cheapest.totalCost) : '—', cheapest ? `${cheapest.name}` : 'aucune recette'),
    stat('🍽️', String(visible.length), 'recettes possibles'),
    stat('🏪', `${storeCount} / ${state.status.stores.length}`, state.week === 'current' ? 'circulaires cette semaine' : 'circulaires la semaine prochaine'),
  );
}

function loadStatus() {
  const snapshot = getSnapshot();
  const usable = snapshot?.postalCode === state.postalCode;
  state.status = {
    fetchedAt: usable ? snapshot.fetchedAt : null,
    refreshing: state.refreshing,
    stores: STORES,
    weeks: usable ? { current: getWeek('current').stores, next: getWeek('next').stores } : { current: [], next: [] },
  };
  if (state.week === 'next' && state.status.weeks.next.length === 0) state.week = 'current';
  renderStatus();
}

// Downloads the flyers when forced (app opened, "Rafraîchir"), or when the cached ones are missing, for another postal code, or a day old.
// Cached flyers stay on screen meanwhile, and flyers already downloaded are not fetched again.
async function syncFlyers({ force = false } = {}) {
  if (state.refreshing || (!force && !isStale(state.postalCode))) return;
  state.refreshing = true;
  state.error = null;
  loadStatus();
  try {
    await refresh(state.postalCode);
  } catch (error) {
    state.error = error.message;
  } finally {
    state.refreshing = false;
  }
  loadStatus();
  selectWeek(state.week);
}

// ---------- Pantry ----------

function updatePantryCounts() {
  $('#pantry-count').textContent = `${state.pantry.size} coché${state.pantry.size > 1 ? 's' : ''}`;
  for (const group of document.querySelectorAll('.pantry-group')) {
    const chips = group.querySelectorAll('.chip');
    const checked = group.querySelectorAll('.chip[aria-pressed="true"]').length;
    group.querySelector('h3 small').textContent = `${checked}/${chips.length}`;
  }
}

function renderPantry() {
  const { categories, ingredients } = state.catalog;
  $('#pantry-groups').replaceChildren(...Object.entries(categories).map(([cat, label]) => el('div', { class: 'pantry-group' },
    el('h3', {}, el('span', { class: 'emoji', text: CATEGORY_EMOJI[cat] }), label, el('small')),
    el('div', { class: 'chips' }, ingredients.filter((ingredient) => ingredient.cat === cat).map((ingredient) => el('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(state.pantry.has(ingredient.id)),
      title: `As-tu : ${ingredient.name.toLowerCase()}?`,
      onclick: (event) => {
        if (state.pantry.has(ingredient.id)) state.pantry.delete(ingredient.id);
        else state.pantry.add(ingredient.id);
        event.currentTarget.setAttribute('aria-pressed', String(state.pantry.has(ingredient.id)));
        updatePantryCounts();
        scheduleRecipes();
      },
    }, ingredient.name, ingredient.hint ? el('small', { text: ingredient.hint }) : null))))));
  updatePantryCounts();
}

// ---------- Recipes ----------

let recipeTimer;
function scheduleRecipes() {
  clearTimeout(recipeTimer);
  recipeTimer = setTimeout(loadRecipes, 250);
}

function loadRecipes() {
  state.recipes = state.status.fetchedAt ? recommend({ pantry: [...state.pantry], offers: getWeek(state.week).offers }) : [];
  renderRecipes();
  renderList();
}

const SORTS = {
  total: (a, b) => a.totalCost - b.totalCost || b.score - a.score,
  serving: (a, b) => a.costPerServing - b.costPerServing || b.score - a.score,
  score: (a, b) => b.score - a.score,
};

function visibleRecipes() {
  const maxBuy = Number($('#max-buy').value);
  return state.recipes.filter((recipe) => recipe.toBuyCount <= maxBuy).sort(SORTS[$('#sort-by').value]);
}

function ingredientRow(item) {
  const offer = item.offers[0];
  let where;
  if (item.status === 'deal') {
    where = el('span', { class: 'where' },
      storeLogo(offer.store), money.format(offer.price), offer.discount ? el('span', { class: 'discount', text: `−${offer.discount} %` }) : null);
  } else if (item.status === 'have') {
    where = el('span', { class: 'where', text: item.ownedName ? `tu as : ${item.ownedName.toLowerCase()}` : 'tu l’as' });
  } else if (item.status === 'buy') {
    where = el('span', { class: 'where', text: `≈ ${money.format(item.cost)}` });
  } else {
    where = el('span', { class: 'where', text: 'facultatif' });
  }
  const alternatives = item.offers.slice(1).map((alt) => `${alt.store} ${money.format(alt.price)}`).join(' · ');
  return el('li', { class: `${item.status}${item.optional ? ' optional' : ''}` },
    el('span', { class: 'icon', text: STATUS_ICON[item.status] }),
    el('span', {}, item.main ? el('strong', { text: item.name }) : item.name, ' ', el('span', { class: 'qty', text: item.qty })),
    where,
    item.substitutes.length && item.status !== 'have'
      ? el('span', { class: 'substitutes', text: `ou : ${item.substitutes.join(', ').toLowerCase()}` })
      : null,
    offer ? el('span', { class: 'product-name', title: alternatives ? `Aussi : ${alternatives}` : null, text: offer.itemName }) : null);
}

function recipeCard(recipe, index, showMedal) {
  const selected = state.list.has(recipe.id);
  const mainDeal = recipe.items.find((item) => item.main && item.status === 'deal');
  return el('article', { class: `recipe theme-${recipe.theme}${selected ? ' selected' : ''}`, style: `--i: ${index}` },
    el('div', { class: 'recipe-hero' },
      showMedal && index < MEDALS.length ? el('span', { class: 'rank', text: MEDALS[index] }) : null,
      el('span', { class: 'recipe-emoji', text: recipe.emoji ?? '🍽️' }),
      productImage(mainDeal?.offers[0].image, 'product'),
      el('span', { class: 'price-tag' },
        el('strong', { text: money.format(recipe.totalCost) }),
        el('small', { text: `${money.format(recipe.costPerServing)} / portion` }))),
    el('div', { class: 'recipe-body' },
      el('div', {},
        el('h3', { text: recipe.name }),
        el('p', { class: 'meta', text: `⏱️ ${recipe.time} min · 🍽️ ${recipe.servings} portions` })),
      el('div', { class: 'badges' },
        el('span', { class: 'badge', text: `🏷️ ${recipe.dealCount} en rabais` }),
        recipe.mainOnSale ? el('span', { class: 'badge star', text: '⭐ vedette en rabais' }) : null,
        recipe.toBuyCount ? el('span', { class: 'badge warn', text: `🛒 ${recipe.toBuyCount} au prix régulier` }) : null,
        recipe.tags.map((tag) => el('span', { class: 'badge tag', text: tag }))),
      el('ul', { class: 'ingredients' }, recipe.items.map(ingredientRow)),
      el('details', {},
        el('summary', { text: '👩‍🍳 Préparation' }),
        el('ol', {}, recipe.steps.map((step) => el('li', { text: step }))))),
    el('div', { class: 'recipe-foot' },
      el('span', { class: 'savings', text: `dont ${money.format(recipe.dealCost)} en rabais` }),
      el('button', {
        type: 'button',
        class: `btn${selected ? ' added' : ''}`,
        text: selected ? '✓ Dans ma liste' : '+ Ma liste',
        onclick: () => toggleList(recipe),
      })));
}

function renderRecipes() {
  const container = $('#recipes');
  const visible = visibleRecipes();
  renderStats();
  if (!state.status.fetchedAt) {
    const message = state.error ? 'Pas de circulaires pour l’instant : vérifie ta connexion puis touche « Rafraîchir ».' : 'Les circulaires se chargent…';
    container.replaceChildren(el('p', { class: 'empty' }, el('span', { class: 'big', text: state.error ? '📡' : '⏳' }), message));
    return;
  }
  if (!visible.length) {
    container.replaceChildren(el('p', { class: 'empty' }, el('span', { class: 'big', text: '🤔' }),
      'Aucune recette ne correspond. Coche plus d’ingrédients que tu as, ou accepte plus d’ingrédients au prix régulier.'));
    return;
  }
  $('#to-recipes').textContent = `Voir les ${visible.length} recettes →`;
  const showMedal = $('#sort-by').value !== 'score';
  container.replaceChildren(...visible.map((recipe, index) => recipeCard(recipe, index, showMedal)));
}

// ---------- Deals table ----------

function loadDeals() {
  const offers = state.status.fetchedAt ? getWeek(state.week).offers : new Map();
  state.deals = [...offers.entries()]
    .map(([id, list]) => ({ id, name: INGREDIENTS_BY_ID.get(id).name, offers: list }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  renderDeals();
  renderStats();
}

function renderDeals() {
  const query = $('#deal-search').value.trim().toLowerCase();
  const stores = state.status.stores;
  const rows = state.deals.filter((deal) =>
    !query || deal.name.toLowerCase().includes(query) || deal.offers.some((offer) => offer.itemName.toLowerCase().includes(query)));
  const table = $('#deals-table');
  if (!rows.length) {
    table.replaceChildren(el('tbody', {}, el('tr', {}, el('td', { class: 'empty', text: 'Aucune aubaine trouvée.' }))));
    return;
  }
  table.replaceChildren(
    el('thead', {}, el('tr', {}, el('th', { text: 'Ingrédient' }), stores.map((store) => el('th', {}, storeLogo(store), store)))),
    el('tbody', {}, rows.map((deal) => {
      const cheapest = deal.offers[0];
      return el('tr', {},
        el('td', {}, el('div', { class: 'ingredient-cell' }, productImage(cheapest.image), el('strong', { text: deal.name }))),
        stores.map((store) => {
          const offer = deal.offers.find((candidate) => candidate.store === store);
          if (!offer) return el('td', { class: 'none', text: '—' });
          const isBest = offer === cheapest && deal.offers.length > 1;
          return el('td', { class: `price${isBest ? ' best' : ''}` },
            isBest ? '🏆 ' : null,
            el('strong', { text: money.format(offer.price) }),
            offer.discount ? ` (−${offer.discount} %)` : null,
            el('small', { text: offer.itemName }));
        }));
    })),
  );
}

// ---------- Shopping list ----------

function toggleList(recipe) {
  if (state.list.has(recipe.id)) state.list.delete(recipe.id);
  else state.list.set(recipe.id, recipe.name);
  renderRecipes();
  renderList();
  const fab = $('#list-fab');
  fab.classList.remove('bump');
  void fab.offsetWidth; // restart the animation
  fab.classList.add('bump');
}

// Rebuilt from the latest recommendations so prices follow the selected week.
function buildList() {
  const byStore = new Map();
  const seen = new Set();
  let total = 0;
  for (const recipe of state.recipes.filter((candidate) => state.list.has(candidate.id))) {
    for (const item of recipe.items) {
      if (seen.has(item.id) || (item.status !== 'deal' && item.status !== 'buy')) continue;
      seen.add(item.id);
      total += item.cost;
      const store = item.status === 'deal' ? item.offers[0].store : 'Ailleurs (prix régulier)';
      const entries = byStore.get(store) ?? [];
      entries.push({ name: item.name, offer: item.status === 'deal' ? item.offers[0] : null, cost: item.cost });
      byStore.set(store, entries);
    }
  }
  return { byStore, total };
}

function renderList() {
  $('#list-count').textContent = state.list.size;
  $('#list-fab').hidden = state.list.size === 0;
  $('#tab-list-count').textContent = state.list.size;
  $('#tab-list-count').hidden = state.list.size === 0;
  if (state.list.size === 0) {
    $('#list-body').replaceChildren(el('p', { class: 'hint', text: 'Ta liste est vide. Ajoute des recettes avec « + Ma liste ».' }));
    return;
  }
  const missing = [...state.list.entries()].filter(([id]) => !state.recipes.some((recipe) => recipe.id === id));
  const { byStore, total } = buildList();
  $('#list-body').replaceChildren(...compact([
    el('p', { class: 'hint', text: `Recettes : ${[...state.list.values()].join(', ')}` }),
    el('p', { class: 'list-total', text: `Total estimé : ${money.format(total)}` }),
    [...byStore.entries()].map(([store, entries]) => el('section', { class: 'list-store' },
      el('h3', {}, STORE_LABEL[store] ? storeLogo(store) : '🛒', store),
      el('ul', {}, entries.map(({ name, offer, cost }) => el('li', {}, name,
        el('small', { text: offer ? ` — ${offer.itemName}, ${money.format(offer.price)}` : ` — ≈ ${money.format(cost)}` })))))),
    missing.length ? el('p', { class: 'hint', text: `Plus en rabais cette semaine : ${missing.map(([, name]) => name).join(', ')}` }) : null,
  ]));
}

function listAsText() {
  const { byStore, total } = buildList();
  const lines = ['Liste d’épicerie de Max', ''];
  for (const [store, entries] of byStore) {
    lines.push(store);
    for (const { name, offer, cost } of entries) {
      lines.push(`  - ${name} (${offer ? `${offer.itemName}, ${money.format(offer.price)}` : `≈ ${money.format(cost)}`})`);
    }
  }
  lines.push('', `Total estimé : ${money.format(total)}`);
  return lines.join('\n');
}

// ---------- Screens (phone layout) ----------

function showScreen() {
  const requested = location.hash.slice(1);
  const screen = SCREENS.includes(requested) ? requested : SCREENS[0];
  const changed = document.body.dataset.screen !== screen;
  document.body.dataset.screen = screen;
  for (const tab of document.querySelectorAll('.tabbar [data-screen]')) {
    tab.setAttribute('aria-current', tab.dataset.screen === screen ? 'page' : 'false');
  }
  if (changed) window.scrollTo(0, 0);
}

// ---------- Wiring ----------

function selectWeek(week) {
  state.week = week;
  for (const tab of document.querySelectorAll('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.week === week));
  renderStatus();
  loadDeals();
  loadRecipes();
}

function wire() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => !tab.disabled && selectWeek(tab.dataset.week));
  }
  $('#pantry-common').addEventListener('click', () => {
    for (const id of state.catalog.commonPantry) state.pantry.add(id);
    renderPantry();
    scheduleRecipes();
  });
  $('#pantry-clear').addEventListener('click', () => {
    state.pantry.clear();
    renderPantry();
    scheduleRecipes();
  });
  $('#max-buy').value = String(readStorage(STORAGE.maxBuy, 2));
  $('#max-buy').addEventListener('change', (event) => {
    writeStorage(STORAGE.maxBuy, Number(event.target.value));
    renderRecipes();
  });
  $('#sort-by').value = readStorage(STORAGE.sortBy, 'total');
  $('#sort-by').addEventListener('change', (event) => {
    writeStorage(STORAGE.sortBy, event.target.value);
    renderRecipes();
  });
  $('#deal-search').addEventListener('input', renderDeals);
  $('#refresh-btn').addEventListener('click', () => syncFlyers({ force: true }));
  $('#postal-input').value = state.postalCode.replace(/^(...)(...)$/, '$1 $2');
  $('#postal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const postalCode = $('#postal-input').value.replace(/\s+/g, '').toUpperCase();
    if (!POSTAL_CODE_PATTERN.test(postalCode)) {
      $('#postal-input').setCustomValidity('Format attendu : G2G 1B8');
      $('#postal-input').reportValidity();
      return;
    }
    $('#postal-input').setCustomValidity('');
    state.postalCode = postalCode;
    writeStorage(STORAGE.postalCode, postalCode);
    syncFlyers();
  });
  $('#list-fab').addEventListener('click', () => $('#list-dialog').showModal());
  $('#tab-list').addEventListener('click', () => $('#list-dialog').showModal());
  window.addEventListener('hashchange', showScreen);
  $('#list-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(listAsText());
    $('#list-copy').textContent = '✓ Copiée!';
    setTimeout(() => { $('#list-copy').textContent = '📋 Copier la liste'; }, 1500);
  });
  $('#list-clear').addEventListener('click', () => {
    state.list.clear();
    renderRecipes();
    renderList();
    $('#list-dialog').close();
  });
}

function init() {
  wire();
  showScreen();
  for (const key of RETIRED_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable: nothing was saved anyway.
    }
  }
  loadStatus();
  renderPantry();
  selectWeek(state.week);
  syncFlyers({ force: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onAppReopened();
  });
  // Pages restored from Chrome's back-forward cache don't run any script again.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) onAppReopened();
  });
}

// ---------- Reopening ----------

// Android resumes an installed app instead of relaunching it, so coming back to it counts as opening it.
// The guard only absorbs the duplicate events a single return can fire.
const REOPEN_GUARD_MS = 60 * 1000;
let lastOpenedAt = Date.now();
let checkForUpdate = () => {};

function onAppReopened() {
  if (Date.now() - lastOpenedAt < REOPEN_GUARD_MS) return;
  lastOpenedAt = Date.now();
  checkForUpdate();
  syncFlyers({ force: true });
}

init();

// ---------- App updates ----------

const BLOCKED_REGIONS = 'header, main, nav, dialog, .list-fab';
let pendingWorker = null;
let installRequested = false;

function setUpdateButton(ready) {
  const button = $('#update-screen button');
  button.disabled = !ready;
  button.textContent = ready ? 'Installer la mise à jour' : 'Téléchargement de la mise à jour…';
  if (ready) button.focus();
}

// Blocks the app as soon as a new version is detected; the button unlocks once it's downloaded. There is no way to dismiss it.
function showUpdateScreen(worker) {
  pendingWorker = worker;
  if (!$('#update-screen')) {
    for (const region of document.querySelectorAll(BLOCKED_REGIONS)) region.inert = true;
    document.body.append(el('div', { id: 'update-screen', class: 'update-screen', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'update-title' },
      el('div', { class: 'update-card' },
        el('img', { class: 'update-icon', src: 'icons/icon-192.png', alt: '' }),
        el('h2', { id: 'update-title', text: 'Nouvelle version disponible 🎉' }),
        el('p', { text: 'Une mise à jour du panier futé est disponible. Installe-la pour continuer.' }),
        el('button', {
          type: 'button',
          class: 'btn update-btn',
          onclick: (event) => {
            event.currentTarget.disabled = true;
            event.currentTarget.textContent = 'Installation…';
            installRequested = true;
            pendingWorker.postMessage('SKIP_WAITING');
          },
        }))));
  }
  setUpdateButton(worker.state === 'installed');
}

// Only used when the download fails: the installed version keeps working until the next check.
function hideUpdateScreen() {
  $('#update-screen')?.remove();
  for (const region of document.querySelectorAll(BLOCKED_REGIONS)) region.inert = false;
  pendingWorker = null;
}

// Makes the site installable as an Android app, usable offline, and checks for new versions.
async function watchForUpdates() {
  // Locally, files change on every save; the cache-first service worker would only get in the way.
  if (!('serviceWorker' in navigator) || ['localhost', '127.0.0.1'].includes(location.hostname)) return;
  const registration = await navigator.serviceWorker.register('./sw.js');

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A first install also takes control, but there's no new version to load then.
    if (!installRequested || reloading) return;
    reloading = true;
    location.reload();
  });

  const track = (worker) => {
    // Without a controller this is the first install, not an update.
    if (!worker || !navigator.serviceWorker.controller) return;
    showUpdateScreen(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && pendingWorker === worker) setUpdateButton(true);
      if (worker.state === 'redundant' && pendingWorker === worker) {
        hideUpdateScreen();
        track(registration.installing ?? registration.waiting);
      }
    });
  };
  track(registration.installing ?? registration.waiting);
  registration.addEventListener('updatefound', () => track(registration.installing));
  checkForUpdate = () => registration.update().catch(() => {});
}

watchForUpdates().catch(() => {});
