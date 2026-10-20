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
