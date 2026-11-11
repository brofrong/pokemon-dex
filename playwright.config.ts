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

// `PW_PORT` overrides the default so two worktrees (each with their own `dist/`) never fight
// over the same `astro preview` port: the controller has repeatedly hit a *stale* preview server
// left running on 4321 by another worktree/session, silently serving e2e an old build instead of
// the one this run just produced. `bun run e2e` (and CI) use the default; a worktree that knows
// 4321 is taken locally can run `PW_PORT=4322 bun run e2e` instead.
const PORT = Number(process.env.PW_PORT) || 4321;
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
    // `--ignore-lock`: `astro preview` otherwise refuses to start at all ("Another astro preview
    // server is already running") the moment *any* preview process anywhere on the machine is
    // holding `.astro/preview.json`'s lock file -- even one on a totally different port in another
    // worktree/session that this run has nothing to do with. The flag opts this one-off instance
    // out of that lock file entirely (it neither checks nor writes it), which is exactly right
    // here since Playwright itself is what tracks and tears down this server.
    command: `bun run preview -- --port ${PORT} --host ${HOST} --ignore-lock`,
    url: BASE_URL,
    // Always starts a fresh `astro preview` for this run instead of reusing whatever is already
    // listening on the port: a reused server has repeatedly turned out to be a *stale* one from
    // another worktree/session serving its own old `dist/`, which made e2e pass or fail against
    // the wrong build with no obvious signal. Picking a different `PW_PORT` (see above) is the
    // supported way to run alongside another `astro preview` instance instead of reusing it.
    reuseExistingServer: false,
    // Astro 7's preview CLI auto-backgrounds itself (forks a daemon and exits almost immediately)
    // when it detects it's being launched by an AI coding agent (`am-i-vibing`'s
    // `detectAgenticEnvironment`) -- harmless for a human at a terminal, but it races Playwright's
    // own "did config.webServer's process exit before the URL came up" check and fails nearly
    // every time with "Process from config.webServer exited early." Setting this env var short-
    // circuits that auto-detection (see `astro/dist/cli/agent.js`'s `isRunByAgent`/`agentDetected`)
    // so the command stays a normal foreground, blocking server the way Playwright expects,
    // whether it's an agent, a human, or CI launching it.
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
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
        "header-and-dropdown.spec.ts",
        "view-transition-names.spec.ts",
        "data-i18n.spec.ts",
        "sprite-paint.spec.ts",
        "sprite-atlas-behind-animation.spec.ts",
        "gen-dropdown-layout.spec.ts",
        "sprite-placeholder.spec.ts",
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
