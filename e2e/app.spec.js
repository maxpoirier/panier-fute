import { expect, test } from '@playwright/test';
import { mockFlipp, rememberName, startSite } from './support.js';

let site;
test.beforeAll(async () => {
  site = await startSite();
});
test.afterAll(async () => {
  await site.close();
});

const priceOf = (text) => Number(text.replace(/[^\d,]/g, '').replace(',', '.'));

test('asks for the name on first launch only, then greets the user', async ({ page, context }) => {
  await mockFlipp(context);
  await page.goto(site.url);

  const welcome = page.locator('#welcome-screen');
  await expect(welcome).toBeVisible();
  await expect(page.locator('main')).toHaveJSProperty('inert', true);
  await page.getByRole('button', { name: 'C’est parti' }).click();
  await expect(welcome, 'an empty name is refused').toBeVisible();

  await page.getByLabel('Comment t’appelles-tu?').fill('  Julie  ');
  await page.getByRole('button', { name: 'C’est parti' }).click();
  await expect(welcome).toBeHidden();
  await expect(page.locator('#hello')).toHaveText('Salut Julie! 👋 ✏️');
  await expect(page.getByRole('button', { name: 'Salut Julie! Changer de prénom' })).toBeVisible();
  await expect(page.locator('#pantry h2')).toContainText('Qu’as-tu déjà à la maison, Julie?');
  await expect(page.locator('h1')).toHaveText('Le panier futé de Max');

  await page.reload();
  await expect(page.locator('#hello')).toHaveText('Salut Julie! 👋 ✏️');
  await expect(welcome).toBeHidden();
});

test('suggests recipes from the deals, cheapest first, and counts what is already at home', async ({ page, context }) => {
  await rememberName(context);
  await mockFlipp(context);
  await page.goto(`${site.url}#recettes`);

  const prices = page.locator('.recipe .price-tag strong');
  await expect(prices.first()).toBeVisible();
  const values = (await prices.allTextContents()).map(priceOf);
  expect(values.length).toBeGreaterThan(1);
  expect(values).toEqual([...values].sort((a, b) => a - b));

  const bolognaise = page.locator('.recipe', { has: page.getByRole('heading', { name: 'Spaghetti bolognaise' }) });
  const garlic = bolognaise.locator('li', { hasText: 'Ail frais' });
  await expect(garlic).toHaveClass(/buy/);
  await page.getByRole('button', { name: /^Ail frais/ }).click();
  await expect(garlic).toHaveClass(/have/);
  await expect(bolognaise.locator('li', { hasText: 'Bœuf haché' })).toContainText('SC');
});

test('on a phone, each section is its own screen', async ({ page, context }) => {
  await rememberName(context);
  await mockFlipp(context);
  await page.setViewportSize({ width: 412, height: 860 });
  await page.goto(site.url);

  await expect(page.locator('#pantry')).toBeVisible();
  await expect(page.locator('#plan')).toBeHidden();
  await page.locator('.tabbar').getByRole('link', { name: 'Recettes' }).click();
  await expect(page.locator('#plan')).toBeVisible();
  await expect(page.locator('#pantry')).toBeHidden();
  await page.goBack();
  await expect(page.locator('#pantry')).toBeVisible();
});

test('week tabs work with the keyboard', async ({ page, context }) => {
  await rememberName(context);
  await mockFlipp(context);
  await page.goto(`${site.url}#recettes`);

  const current = page.getByRole('tab', { name: /Cette semaine/ });
  const next = page.getByRole('tab', { name: /Semaine prochaine/ });
  await expect(next).toBeEnabled();
  await current.focus();
  await page.keyboard.press('ArrowRight');
  await expect(next).toHaveAttribute('aria-selected', 'true');
  await expect(next).toBeFocused();
  // Next week's only deal in the fixtures.
  await expect(page.locator('#deals-table tbody tr')).toHaveText([/Crevettes crues/]);
});

test('when the clipboard is refused, the list is shown ready to copy by hand', async ({ page, context }) => {
  await rememberName(context);
  await mockFlipp(context);
  await context.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
  });
  await page.goto(`${site.url}#recettes`);

  await page.locator('.recipe').first().getByRole('button', { name: '+ Ma liste' }).click();
  await page.locator('#list-fab').click();
  await page.getByRole('button', { name: '📋 Copier la liste' }).click();
  await expect(page.getByLabel('Liste à copier')).toHaveValue(/^Liste d’épicerie de Max/);
});

test('changing the postal code during a download fetches the new one afterwards', async ({ page, context }) => {
  await rememberName(context);
  const listRequests = await mockFlipp(context, { delayListMs: 1500 });
  await page.goto(site.url);

  await page.locator('#postal-input').fill('H2X 1Y4');
  await page.locator('#postal-form').getByRole('button', { name: 'OK' }).click();
  await expect(page.locator('#status-text')).toContainText('H2X 1Y4 · mis à jour', { timeout: 10_000 });
  expect(listRequests).toEqual(['G2G1B8', 'H2X1Y4']);
});

test('a flyer that fails to download is reported in the status', async ({ page, context }) => {
  await rememberName(context);
  await mockFlipp(context, { failFlyers: [4] });
  await page.goto(site.url);

  await expect(page.locator('#status-text')).toContainText('⚠️ Walmart non téléchargé');
});

test('loads without console errors, Content-Security-Policy violations or missing fonts', async ({ page, context }) => {
  await rememberName(context);
  await mockFlipp(context);
  const problems = [];
  page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto(`${site.url}#recettes`);
  await expect(page.locator('.recipe').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  expect(problems).toEqual([]);
  expect(await page.evaluate(() => document.fonts.check('16px "DM Sans"') && document.fonts.check('700 16px Fraunces'))).toBe(true);
  expect(await page.evaluate(() => [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family))).toEqual(
    expect.arrayContaining(['DM Sans', 'Fraunces']),
  );
});

test('coming back to the app keeps the recipe being read open when the flyers did not change', async ({ page, context }) => {
  await rememberName(context);
  const listRequests = await mockFlipp(context);
  await page.clock.install();
  await page.goto(`${site.url}#recettes`);
  await expect(page.locator('#status-text')).toContainText('mis à jour');

  const steps = page.locator('.recipe details').first();
  await steps.locator('summary').click();
  await expect(steps).toHaveAttribute('open', '');
  await steps.evaluate((details) => {
    details.dataset.marker = 'same-node';
  });

  const before = listRequests.length;
  await page.clock.fastForward('01:05');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => listRequests.length).toBeGreaterThan(before);
  await expect(page.locator('#status-text')).toContainText('mis à jour');

  await expect(steps).toHaveAttribute('open', '');
  await expect(steps).toHaveAttribute('data-marker', 'same-node');
});

for (const width of [412, 1280]) {
  test(`shows the app version at the top right without covering anything (${width}px)`, async ({ page, context }) => {
    await rememberName(context);
    await mockFlipp(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${site.url}#recettes`);

    const version = page.locator('#app-version');
    await expect(version).toHaveText(/^v\d+\.\d+\.\d+$/);
    const box = await version.boundingBox();
    expect(box.y).toBeLessThan(40);
    expect(box.x + box.width).toBeGreaterThan(width - 40);
    for (const neighbour of ['#hello', '#status-text']) {
      const other = await page.locator(neighbour).boundingBox();
      const overlaps =
        box.x < other.x + other.width && other.x < box.x + box.width && box.y < other.y + other.height && other.y < box.y + box.height;
      expect(overlaps, `overlaps ${neighbour}`).toBe(false);
    }
  });
}

test('in the shopping list, items can be ticked (struck through), removed one by one or several at once, and restored', async ({
  page,
  context,
}) => {
  await rememberName(context);
  await mockFlipp(context);
  await page.goto(`${site.url}#recettes`);
  // .all() doesn't wait: make sure the recipes are drawn first (slower on CI).
  await expect(page.locator('.recipe').nth(1)).toBeVisible();
  for (const card of (await page.locator('.recipe').all()).slice(0, 2)) await card.getByRole('button', { name: '+ Ma liste' }).click();
  await page.locator('#list-fab').click();

  const items = page.locator('#list-body li');
  const total = page.locator('.list-total');
  const count = await items.count();
  expect(count).toBeGreaterThan(3);
  const totalBefore = await total.textContent();

  const first = items.first();
  await first.getByRole('checkbox').check();
  await expect(first).toHaveClass(/done/);
  await expect(first.locator('.list-name')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(first.getByRole('checkbox'), 'focus stays on the box').toBeFocused();

  const removedName = await items
    .nth(1)
    .locator('.list-name')
    .evaluate((node) => node.firstChild.textContent);
  await page.getByRole('button', { name: `Retirer ${removedName} de la liste` }).click();
  await expect(items).toHaveCount(count - 1);
  await expect(total).not.toHaveText(totalBefore);

  await items.nth(1).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Retirer les articles cochés (2)' }).click();
  await expect(items).toHaveCount(count - 3);

  await page.getByRole('button', { name: /Tout rétablir \(3 retirés\)/ }).click();
  await expect(items).toHaveCount(count);
  await expect(total).toHaveText(totalBefore);
  await expect(items.first(), 'still ticked after being restored').toHaveClass(/done/);
});

test('the cart shows the number of recipes and the estimated total, on the pantry screen too', async ({ page, context }) => {
  await rememberName(context);
  await mockFlipp(context);
  await page.setViewportSize({ width: 412, height: 860 });
  await page.goto(`${site.url}#recettes`);
  await page.locator('.recipe').first().getByRole('button', { name: '+ Ma liste' }).click();
  await page.locator('.recipe').nth(1).getByRole('button', { name: '+ Ma liste' }).click();

  await page.locator('.tabbar').getByRole('link', { name: 'Garde-manger' }).click();
  const tab = page.locator('#tab-list');
  await expect(tab.locator('.count')).toHaveText('2');
  const shown = await tab.locator('.cart-total').textContent();
  expect(shown).toMatch(/^\d+,\d{2}\s\$$/);
  await expect(tab).toHaveAccessibleName(`Ma liste : 2 recettes, environ ${shown}`);

  await tab.click();
  await expect(page.locator('.list-total')).toHaveText(`Total estimé : ${shown}`);
  await page
    .getByRole('button', { name: /^Retirer .* de la liste$/ })
    .first()
    .click();
  await expect(tab.locator('.cart-total'), 'follows removals').not.toHaveText(shown);
  await expect(tab.locator('.count'), 'still counts recipes').toHaveText('2');
});

for (const textSize of ['normal', 'large']) {
  test(`on a phone, "Voir les recettes" is never hidden behind the tab bar (${textSize} text)`, async ({ page, context }) => {
    await rememberName(context);
    await mockFlipp(context);
    await page.setViewportSize({ width: 412, height: 860 });
    await page.goto(site.url);
    // Android's "large text" setting scales the root font size.
    if (textSize === 'large') await page.evaluate(() => (document.documentElement.style.fontSize = '22px'));
    // A recipe in the list shows the total pill, which sticks out above the "Liste" tab.
    await page.locator('.tabbar').getByRole('link', { name: 'Recettes' }).click();
    await page.locator('.recipe').first().getByRole('button', { name: '+ Ma liste' }).click();
    await page.locator('.tabbar').getByRole('link', { name: 'Garde-manger' }).click();
    await expect(page.locator('#tab-list-total')).toBeVisible();
    await page.getByRole('button', { name: /^Ail frais/ }).click();

    const button = page.locator('#to-recipes');
    const tabbar = page.locator('.tabbar');
    for (const where of ['top', 'bottom']) {
      await page.evaluate((to) => window.scrollTo(0, to === 'top' ? 0 : document.body.scrollHeight), where);
      await page.waitForTimeout(100);
      const box = await button.boundingBox();
      const bar = await tabbar.boundingBox();
      const pill = await page.locator('#tab-list-total').boundingBox();
      const coveredTop = Math.min(bar.y, pill ? pill.y : bar.y);
      expect(box.y, `${where}: fully on screen`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${where}: entirely above the tab bar`).toBeLessThanOrEqual(coveredTop);
    }
    await button.click();
    await expect(page.locator('#plan')).toBeVisible();
  });
}
