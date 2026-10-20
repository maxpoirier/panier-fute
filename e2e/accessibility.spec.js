// Automated WCAG 2.1 AA audit (axe-core) of every screen, in light and dark mode. Animations are turned off so colours
// are measured at rest, not mid-fade. Contrast on the header gradient can't be computed by axe ("incomplete"); its
// colours were chosen to keep white text above 5:1 from one end of the gradient to the other.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockFlipp, rememberName, startSite } from './support.js';

let site;
test.beforeAll(async () => {
  site = await startSite();
});
test.afterAll(async () => {
  await site.close();
});

const SCREENS = [
  { name: 'ordinateur', width: 1280, hash: '#recettes' },
  { name: 'cellulaire, garde-manger', width: 412, hash: '#garde-manger' },
  { name: 'cellulaire, recettes', width: 412, hash: '#recettes' },
  { name: 'cellulaire, prix', width: 412, hash: '#prix' },
  { name: 'semaine prochaine (épiceries sans circulaire)', width: 412, hash: '#recettes', nextWeek: true },
  { name: 'liste d’épicerie', width: 1280, hash: '#recettes', openList: true },
  { name: 'demande du prénom', width: 1280, hash: '#recettes', firstLaunch: true },
];

for (const screen of SCREENS) {
  test(`no WCAG 2.1 AA violation: ${screen.name}`, async ({ page, context }) => {
    if (!screen.firstLaunch) await rememberName(context);
    await mockFlipp(context);
    await page.setViewportSize({ width: screen.width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(site.url + screen.hash);
    if (screen.firstLaunch) await page.locator('#welcome-screen').waitFor();
    else await page.locator('#status-text', { hasText: 'mis à jour' }).waitFor();
    if (screen.nextWeek) await page.getByRole('tab', { name: /Semaine prochaine/ }).click();
    if (screen.openList) {
      await page.locator('.recipe').first().getByRole('button', { name: '+ Ma liste' }).click();
      await page.locator('#list-fab').click();
    }

    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const summary = violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`));
      expect(summary, `${colorScheme} mode`).toEqual([]);
    }
  });
}
