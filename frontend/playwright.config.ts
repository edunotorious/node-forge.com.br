import { defineConfig, devices } from "@playwright/test";

import { AUTH_STATE_FILE } from "./tests/e2e/helpers";

/**
 * Smoke E2E suite. Runs against an already-running stack — start it with
 * `docker compose up -d` from the repo root, then `pnpm test:e2e` here.
 *
 * Tests are intentionally NOT parallel: they share the same Postgres,
 * each one creates its own user with a timestamped email, but rate
 * limits on /auth/login and /auth/register would trip if we fired
 * everything in parallel.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // The app uses next-intl with `as-needed` + default pt-BR. Without
    // pinning Accept-Language, Chromium sends en-US and the locale
    // detection serves the English variant — our selectors target the
    // Brazilian strings, so we lock the browser to pt-BR.
    locale: "pt-BR",
    extraHTTPHeaders: { "Accept-Language": "pt-BR" },
  },
  projects: [
    // Registers + logs in one shared user and saves its session; every
    // chromium spec starts already authenticated (see auth.setup.ts).
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE_FILE },
      dependencies: ["setup"],
    },
  ],
});
