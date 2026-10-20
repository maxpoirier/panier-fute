# Le panier futé de Max

Compare the weekly circulaires of **IGA, Super C, Maxi and Walmart** in Québec City, find the best price per ingredient,
and suggest recipes (cheapest first) based on what's on sale **and** what you already have at home. When next week's
circulaires are published, they show up in a second tab.

It's one static site that works two ways:

- **Website:** open the link in any browser.
- **Android app (PWA):** open the link in Chrome on Android, then choose *⋮ → Installer l'application*. You get a home-screen
  icon and a full-screen app that also works offline with the last downloaded circulaires.

There is no backend. The browser downloads the circulaires straight from Flipp, which allows cross-origin requests, and caches them for a day.

## Run it locally

```bash
npm install
npm start            # http://localhost:3000
npm test             # node:test, no network needed
```

## Publish

`.github/workflows/pages.yml` runs the tests and publishes `public/` to GitHub Pages on every push to `main`.

### Releasing a new version

1. Change files in `public/` and **bump `VERSION` in `public/sw.js`** (e.g. `'v5'` → `'v6'`). If you add a file, also add it to `APP_FILES`.
2. Push to `main`.
3. The next time someone opens the app online, or brings it back to the screen, they get a blocking
   "Nouvelle version disponible" screen with a single **Installer la mise à jour** button. The app reloads on the new version.

The installed app runs from its own cache (cache-first), so nothing changes until the user taps that button. Offline, the
app keeps running the installed version. Without a `VERSION` bump the browser sees no new version, so nobody is prompted.

`npm start` (localhost) skips the service worker, so local changes show up on a plain reload.

## How it works

```
Flipp (circulaires by postal code)  ── fetched by the browser, at most once a day, or with "Rafraîchir"
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
- `public/sw.js`: the service worker, for offline support and installability.
- `server.js`: a tiny local static server, only used by `npm start`.

### Adding a recipe or fixing a bad match

1. Add the recipe to `RECIPES`. Every ingredient and substitute must exist in `INGREDIENTS` (a test checks this).
2. If a flyer item matches the wrong ingredient, add an `ex` phrase to that ingredient and a case to `test/matcher.test.js`.

## Caveats

- Flipp's API is unofficial and undocumented. It may change. Keep this to personal use.
- Flyer prices mix units (/lb, /kg, per pack), so "best price" means the cheapest advertised price, not a strict unit-price comparison.
