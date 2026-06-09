import { defineConfig, devices } from '@playwright/test'

// Tests E2E des parcours critiques. Lance l'app en mode dev et pilote un navigateur mobile.
// Prérequis : base de données seedée (npm run db:seed) et `npx playwright install chromium`.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    ...devices['iPhone 13'],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
