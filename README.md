# Le panier futé de Max

Compare the weekly circulaires of **IGA, Super C, Maxi and Walmart** in Québec City, find the best price per ingredient,
and suggest recipes (cheapest first) based on what's on sale **and** what you already have at home. When next week's
circulaires are published, they show up in a second tab.

It's one static site that works two ways:

- **Website:** open the link in any browser.
- **Android app (PWA):** open the link in Chrome on Android, then choose _⋮ → Installer l'application_. You get a home-screen
  icon and a full-screen app that also works offline with the last downloaded circulaires.

There is no backend. The browser downloads the circulaires straight from Flipp, which allows cross-origin requests, and caches them for a day.

## Run it locally

```bash
npm install
npm start              # http://localhost:3000 (no service worker here, so edits show on a plain reload)
npm run check          # everything CI runs: format, lint, types, unit tests, browser tests
```

| Command             | What it does                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`          | Unit tests (`node:test`): matching, prices, recipes, cache, offline file list                                                                        |
| `npm run test:e2e`  | Browser tests (Playwright) against a fake Flipp, never the real API, including a WCAG 2.1 AA audit (axe-core) of every screen in light and dark mode |
| `npm run lint`      | ESLint                                                                                                                                               |
| `npm run format`    | Prettier (`format:check` only checks)                                                                                                                |
| `npm run typecheck` | Type-checks all of `public/` (the service worker with its own Worker config) from JSDoc annotations; no build step                                   |

Locally the browser tests use your installed Chrome; CI installs Chromium.

## Publish

Push to `main`. `.github/workflows/pages.yml` runs every check, then publishes `public/` to GitHub Pages. Nothing is
published if a check fails. Pull requests run the checks without publishing.

There is no version number to bump: the deploy stamps `VERSION` in `sw.js` with a hash of the app files
(`scripts/stamp-version.mjs`). When an app file changed, the next time someone opens the app online, or brings it back
to the screen, they get a blocking "Nouvelle version disponible" screen with a single **Installer la mise à jour** button.
A push that doesn't touch `public/` (e.g. this README) prompts nobody.

If you add a file to `public/`, add it to `APP_FILES` in `public/sw.js`; a test fails until you do.

## Keeping it healthy

- **Accessibility:** colours are chosen for WCAG AA contrast (4.5:1), including white text across the header gradient,
  which axe can't measure; keep new colours above that ratio.

## License

MIT, see `LICENSE`. The fonts in `public/fonts/` are under the SIL Open Font License.

## How it works

```
Flipp (circulaires by postal code)  ── fetched by the browser each time the app is opened, or with "Rafraîchir"
   │
   ▼
lib/store.js     ── keeps only items that match an ingredient (fits in localStorage on a phone); splits this week / next week
   │
   ▼
lib/matcher.js   ── flyer item name → ingredient ids (French/English keywords, accents ignored, exclusions)
   │
   ▼
lib/deals.js     ── per ingredient: the cheapest item at each store
   │
   ▼
lib/recommend.js ── each recipe ingredient accepts substitutes (e.g. long or short pasta); cost = flyer price if on sale,
                    typical regular price otherwise, 0 $ if you have it; listed cheapest first
```

- `public/lib/catalog/ingredients.js`: the ingredient catalogue. `kw` are match phrases, `ex` are exclusions, `hint` gives the examples shown in the pantry, and `price` is the regular price estimate.
- `public/lib/catalog/recipes.js`: the recipes. `need(['pates_longues', 'pates_courtes'], …)` means "long pasta preferred, short pasta accepted". Every recipe serves at least 4.
- `public/app.js`: entry point; wires the UI modules together.
- `public/ui/`: one module per part of the screen (`header`, `pantry`, `recipes`, `deals`, `list`, `weeks`, `screens`, `welcome`), the shared `state`, and `overlays` for full-screen prompts.
- `public/pwa/updates.js`: service worker registration and the forced-update screen.
- `public/sw.js`: the service worker, for offline support and installability. The installed app runs from its cache until the user installs an update.
- `public/fonts/`: self-hosted fonts (SIL Open Font License), so the app looks the same offline.
- `server.js`: a tiny local static server, only used by `npm start`.
- `e2e/`: browser tests; `e2e/support.js` holds the fake Flipp data and a re-deployable copy of the site.

### Adding a recipe or fixing a bad match

1. Add the recipe to `RECIPES`. Every ingredient and substitute must exist in `INGREDIENTS` (a test checks this).
2. If a flyer item matches the wrong ingredient, add an `ex` phrase to that ingredient and a case to `test/matcher.test.js`.

## Caveats

- Flipp's API is unofficial and undocumented. It may change. Keep this to personal use.
- Flyer prices mix units (/lb, /kg, per pack), so "best price" means the cheapest advertised price, not a strict unit-price comparison.
