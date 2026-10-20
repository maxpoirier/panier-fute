import { expect, test } from '@playwright/test';
import { mockFlipp, rememberName, startSite } from './support.js';

// Each test redeploys its own copy of the site.
let site;
test.beforeEach(async ({ context }) => {
  site = await startSite();
  await rememberName(context);
});
test.afterEach(async () => {
  await site.close();
});

async function openInstalledApp(page) {
  await page.goto(site.url);
  // The first visit installs the service worker; it controls the page from then on.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test('a new version blocks the app until the user installs it', async ({ page, context }) => {
  await mockFlipp(context);
  await openInstalledApp(page);
  await expect(page.locator('#update-screen')).toHaveCount(0);

  await site.publish('1.1.0');
  await page.reload();
  const screen = page.locator('#update-screen');
  await expect(screen.getByRole('button', { name: 'Installer la mise à jour' })).toBeEnabled();
  await expect(screen.locator('#update-versions'), 'the screen names both versions').toHaveText('v1.0.0 → v1.1.0');
  await expect(page.locator('main')).toHaveJSProperty('inert', true);
  await page.keyboard.press('Escape');
  await expect(screen).toBeVisible();
  expect(await page.evaluate(() => window.appVersion), 'the old version keeps running until then').toBe('1.0.0');

  await Promise.all([page.waitForEvent('load'), screen.getByRole('button').click()]);
  expect(await page.evaluate(() => window.appVersion), 'never stale files from the browser cache').toBe('1.1.0');
  await expect(page.locator('#update-screen')).toHaveCount(0);
  await expect(page.locator('#app-version'), 'the version shown is the one installed').toHaveText('v1.1.0');
});

test('coming back to the app refreshes the flyers and checks for updates, without a reload', async ({ page, context }) => {
  const listRequests = await mockFlipp(context);
  await page.clock.install();
  await openInstalledApp(page);
  await expect(page.locator('#status-text')).toContainText('mis à jour');
  const before = listRequests.length;

  await site.publish('1.2.0');
  await page.clock.fastForward('01:05');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  await expect(page.locator('#update-screen')).toBeVisible();
  await expect.poll(() => listRequests.length).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.appVersion), 'no reload happened').toBe('1.0.0');
});
