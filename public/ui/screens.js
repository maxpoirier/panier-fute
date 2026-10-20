// @ts-check
// On phones each section is its own screen, picked by the URL hash so Android's back button works.
// On wider screens the CSS ignores this and shows every section.
const SCREENS = ['garde-manger', 'recettes', 'prix'];

function showScreen() {
  const requested = location.hash.slice(1);
  const screen = SCREENS.includes(requested) ? requested : SCREENS[0];
  const changed = document.body.dataset.screen !== screen;
  document.body.dataset.screen = screen;
  for (const tab of document.querySelectorAll('.tabbar [data-screen]')) {
    if (!(tab instanceof HTMLElement)) continue;
    tab.setAttribute('aria-current', tab.dataset.screen === screen ? 'page' : 'false');
  }
  if (changed) window.scrollTo(0, 0);
}

export function wireScreens() {
  window.addEventListener('hashchange', showScreen);
  showScreen();
}
