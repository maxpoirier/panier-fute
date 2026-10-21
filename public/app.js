// @ts-check
// Entry point: wires the UI modules together. Rendering lives in ui/, the deal and recipe logic in lib/.
import { flyersForWeek } from './lib/deals.js';
import { removePref } from './lib/prefs.js';
import { recommend } from './lib/recommend.js';
import { getSnapshot, getWeek, isStale, refresh } from './lib/store.js';
import { watchForUpdates } from './pwa/updates.js';
import { dealsFrom, renderDeals, wireDeals } from './ui/deals.js';
import { renderStats, renderStatus, renderUserName, renderVersion, wireHeader } from './ui/header.js';
import { bumpListButton, renderList, wireList } from './ui/list.js';
import { renderPantry, wirePantry } from './ui/pantry.js';
import { RECIPES_PAGE_SIZE, renderRecipes, visibleRecipes, wireRecipeFilters } from './ui/recipes.js';
import { wireScreens } from './ui/screens.js';
import { RETIRED_PREFS, state } from './ui/state.js';
import { renderWeeks, wireWeeks } from './ui/weeks.js';
import { askUserName } from './ui/welcome.js';

// Android resumes an installed app instead of relaunching it, so coming back to it counts as opening it.
// The guard only absorbs the duplicate events a single return can fire.
const REOPEN_GUARD_MS = 60 * 1000;

let lastOpenedAt = Date.now();
let checkForUpdate = () => {};

// ---------- Rendering ----------

function showRecipes() {
  const visible = visibleRecipes();
  renderRecipes(visible, toggleList);
  renderStats(visible);
  renderList();
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let recipeTimer;
function recomputeRecipes() {
  state.recipes = state.status.fetchedAt ? recommend({ pantry: [...state.pantry], offers: getWeek(state.week).offers }) : [];
  showRecipes();
}

// Debounced so ticking several pantry items in a row recomputes once.
function scheduleRecipes() {
  clearTimeout(recipeTimer);
  recipeTimer = setTimeout(recomputeRecipes, 250);
}

function loadStatus() {
  const snapshot = getSnapshot();
  const usable = snapshot?.postalCode === state.postalCode;
  state.status = {
    fetchedAt: usable ? snapshot.fetchedAt : null,
    weeks: usable ? { current: getWeek('current').stores, next: getWeek('next').stores } : { current: [], next: [] },
  };
  state.failedFlyers = usable ? (snapshot.failed ?? []) : [];
  if (state.week === 'next' && state.status.weeks.next.length === 0) state.week = 'current';
  renderStatus();
}

/** @param {import('./ui/state.js').Week} week */
function selectWeek(week) {
  if (week !== state.week) state.recipesShown = RECIPES_PAGE_SIZE;
  state.week = week;
  renderWeeks();
  state.deals = state.status.fetchedAt ? dealsFrom(getWeek(week).offers) : [];
  renderDeals();
  recomputeRecipes();
}

// What the screen shows from the flyers. When a refresh doesn't change it, only the "mis à jour" time needs updating,
// so coming back to the app doesn't redraw the recipes under the user's eyes.
function shownFlyers() {
  const snapshot = getSnapshot();
  if (snapshot?.postalCode !== state.postalCode) return '';
  const ids = (/** @type {import('./ui/state.js').Week} */ week) =>
    flyersForWeek(snapshot.flyers, week)
      .map((flyer) => flyer.id)
      .join(',');
  return `${ids('current')}|${ids('next')}`;
}

// ---------- Actions ----------

/**
 * Downloads the flyers when forced (app opened, "Rafraîchir"), or when the cached ones are missing, for another
 * postal code, or a day old. Cached flyers stay on screen meanwhile, and flyers already downloaded aren't fetched again.
 */
async function syncFlyers({ force = false } = {}) {
  if (state.refreshing || (!force && !isStale(state.postalCode))) return;
  const postalCode = state.postalCode;
  const before = shownFlyers();
  state.refreshing = true;
  state.error = null;
  renderStatus();
  try {
    await refresh(postalCode);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.refreshing = false;
  }
  loadStatus();
  // Still redrawn without flyers, so an error replaces the "loading" message.
  if (shownFlyers() !== before || !state.status.fetchedAt) selectWeek(state.week);
  // The postal code changed while downloading: fetch the flyers for the new one.
  if (postalCode !== state.postalCode) syncFlyers({ force: true });
}

/** @param {import('./ui/state.js').RecipeView} recipe */
function toggleList(recipe) {
  if (state.list.has(recipe.id)) state.list.delete(recipe.id);
  else state.list.set(recipe.id, recipe.name);
  showRecipes();
  bumpListButton();
}

function clearList() {
  state.list.clear();
  showRecipes();
}

function onAppReopened() {
  if (Date.now() - lastOpenedAt < REOPEN_GUARD_MS) return;
  lastOpenedAt = Date.now();
  checkForUpdate();
  syncFlyers({ force: true });
}

// ---------- Startup ----------

function init() {
  for (const key of RETIRED_PREFS) removePref(key);

  wireScreens();
  wireHeader({
    onPostalCodeChange: () => syncFlyers(),
    onRefresh: () => syncFlyers({ force: true }),
    onEditName: () => askUserName(renderUserName),
  });
  wireWeeks(selectWeek);
  wirePantry(scheduleRecipes);
  wireRecipeFilters(showRecipes);
  wireDeals();
  wireList(clearList);

  loadStatus();
  renderVersion();
  renderUserName();
  renderPantry(scheduleRecipes);
  selectWeek(state.week);
  syncFlyers({ force: true });
  if (!state.userName) askUserName(renderUserName);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onAppReopened();
  });
  // Pages restored from Chrome's back-forward cache don't run any script again.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) onAppReopened();
  });
  watchForUpdates()
    .then((check) => {
      checkForUpdate = check;
    })
    .catch(() => {});
}

init();
