import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke suite (Task 9, `.superpowers/sdd/2026-11-10-all-generations/task-9-brief.md`):
 * exercises the built site through `astro preview` (never `astro dev` -- the service worker,
 * precache list and real gzip sizes only exist in the production build). Locally, run
 * `bun run build` once, then `bun run e2e`; CI builds first and runs this right after (see
 * `.github/workflows/deploy.yml`).
 *
 * Three projects:
 *  - `chromium-desktop` (1280x800): the bulk of the suite (list, detail, palette, i18n/generation
 *    switching, 404, the delayed-`list.json` race).
 *  - `chromium-mobile` (390x844, touch): `e2e/mobile.spec.ts` only -- horizontal-overflow checks
 *    across generations/languages (the QA report's recurring narrow-viewport bug class).
 *  - `chromium-reduced-motion` (`reducedMotion: 'reduce'`): `e2e/reduced-motion.spec.ts` only --
 *    filter/sort changes apply with no lingering `::view-transition` pseudo-elements and no card
 *    cascade, per the constraints' Review Focus #5.
 * Keeping each extra project to its own narrow spec file (instead of re-running the whole suite
 * three times) is what keeps total runtime inside the brief's < 3 min CI budget.
 */

const PORT = 4321;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}/pokemon-dex/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Workers are split across three projects anyway; capping avoids overloading the single
  // `astro preview` server shared by every project in this config.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The production build registers a service worker (`src/scripts/sw-register.ts`) that can
    // intercept/cache requests (including `list.json`/`search.json`) at a layer `page.route()`
    // doesn't see through consistently -- `list-delayed.spec.ts`'s artificial network delay needs
    // its route interception to actually reach the request. The SW's own behavior is covered by
    // its unit tests (`tests/sw/*`), not this suite.
    serviceWorkers: "block",
  },
  webServer: {
    command: `bun run preview -- --port ${PORT} --host ${HOST}`,
    url: BASE_URL,
    // Reuses a server a developer already has running locally; CI always starts a fresh one
    // against the `dist/` the workflow just built.
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
      testMatch: [
        "list.spec.ts",
        "list-delayed.spec.ts",
        "detail.spec.ts",
        "palette.spec.ts",
        "i18n-generations.spec.ts",
        "not-found.spec.ts",
      ],
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
      testMatch: "mobile.spec.ts",
    },
    {
      name: "chromium-reduced-motion",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        reducedMotion: "reduce",
      },
      testMatch: "reduced-motion.spec.ts",
    },
  ],
});
