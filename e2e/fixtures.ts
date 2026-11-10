/**
 * Shared Playwright fixtures for the e2e smoke suite (Task 9). Every spec imports `test`/`expect`
 * from here instead of `@playwright/test` directly, so every test automatically fails on:
 *  - a `console.error` (an uncaught warning the app logged on its own),
 *  - an uncaught `pageerror` (an unhandled exception in page JS),
 *  - a same-origin response with a 4xx/5xx status (a broken asset/request).
 *
 * A test that deliberately exercises a 4xx (the custom 404 page, `not-found.spec.ts`) calls
 * `errorGuard.allow404(pattern)` *before* triggering that navigation/request so the guard doesn't
 * fail the test over the one response it's intentionally checking.
 */
import { test as base, expect } from "@playwright/test";

type Pattern = string | RegExp;

export interface ErrorGuard {
  /** Exempts any same-origin response whose URL matches `pattern` from the 4xx/5xx guard. */
  allow404(pattern: Pattern): void;
}

/** What the `errorGuard` fixture actually hands back: `ErrorGuard` plus the backing array the
 *  `page` fixture reads from (both fixtures close over the very same array). */
interface ErrorGuardInternal extends ErrorGuard {
  readonly allowed: readonly Pattern[];
}

function matches(pattern: Pattern, url: string): boolean {
  return typeof pattern === "string"
    ? url.includes(pattern)
    : pattern.test(url);
}

/**
 * Chromium's native cross-document `@view-transition { navigation: auto }` (`tokens.css`, from an
 * earlier plan's Task 13) combined with its speculation-rules prerendering of detail-page links
 * (`Base.astro`'s `SPECULATION_RULES`) has a known engine-level interaction: navigating again
 * while a transition from the *previous* navigation hasn't fully settled yet (two key presses in
 * quick succession, a prerendered page activating instead of a fresh navigation, ...) makes
 * Chromium dispatch an uncaught `InvalidStateError` ("Transition was aborted because of invalid
 * state. ViewTransition opt-in disabled" / "... Page already revealed") on the window -- there is
 * no JS promise a page script could even attach a handler to, since the browser initiated this
 * transition itself from the CSS rule, not from `document.startViewTransition`. It doesn't affect
 * the navigation's outcome (the destination URL is still correct), so it's filtered here as a
 * known false positive rather than silencing `pageerror` checking altogether; a real app
 * exception still fails the guard.
 */
function isBenignAbortedViewTransitionError(err: Error): boolean {
  return (
    err.name === "InvalidStateError" &&
    err.message.startsWith("Transition was aborted because of invalid state")
  );
}

export const test = base.extend<{ errorGuard: ErrorGuard }>({
  errorGuard: async ({}, use) => {
    const allowed: Pattern[] = [];
    const guard: ErrorGuardInternal = {
      allow404: (pattern) => allowed.push(pattern),
      allowed,
    };
    await use(guard);
  },

  // Overrides the built-in `page` fixture so the guard attaches to every test for free -- a spec
  // never has to opt in, only opt a specific URL *out* via `errorGuard.allow404`.
  page: async ({ page, baseURL, errorGuard }, use) => {
    const { allowed } = errorGuard as ErrorGuardInternal;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const origin = baseURL ? new URL(baseURL).origin : undefined;

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      // A failed same-origin resource load (including the top-level navigation document itself,
      // e.g. a 404 page) logs both a browser-generated console error *and* fires the `response`
      // listener below for the same URL -- `msg.location().url` is that resource's URL, even
      // though `msg.text()` itself never includes it, so `allow404` covers both from one call.
      const url = msg.location().url;
      if (url && allowed.some((p) => matches(p, url))) return;
      consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      if (isBenignAbortedViewTransitionError(err)) return;
      pageErrors.push(err.stack || err.message || String(err));
    });
    page.on("response", (response) => {
      const status = response.status();
      if (status < 400) return;
      const url = response.url();
      if (origin && !url.startsWith(origin)) return; // third-party/cross-origin: not ours to fix
      if (allowed.some((p) => matches(p, url))) return;
      failedRequests.push(`${status} ${response.request().method()} ${url}`);
    });

    await use(page);

    const problems = [
      ...consoleErrors.map((e) => `console.error: ${e}`),
      ...pageErrors.map((e) => `pageerror: ${e}`),
      ...failedRequests.map((e) => `failed request: ${e}`),
    ];
    expect(problems, problems.join("\n")).toEqual([]);
  },
});

export { expect };
