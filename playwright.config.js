import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    // Locally, use the installed Chrome instead of downloading Playwright's browser; CI installs Chromium.
    channel: process.env.CI ? undefined : 'chrome',
    locale: 'fr-CA',
    timezoneId: 'America/Toronto',
  },
});
