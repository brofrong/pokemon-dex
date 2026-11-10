/**
 * QA bug #8: no reverse shared-element morph from a detail page back to the list. Root cause:
 * Chromium fires `pagereveal` as soon as the document is `interactive` (QA measured ~27ms), well
 * before the list page's own `<script type="module">` -- deferred like `defer` per the HTML spec
 * -- ever runs (QA measured `DOMContentLoaded` at ~85ms on the same navigation). By the time that
 * deferred script tried to register a `pagereveal` listener, the event had already fired to zero
 * listeners and was gone for good. The fix moves that listener into `pageRevealScript`
 * (`src/scripts/card-vt-names.ts`), injected as a plain, synchronous, non-deferred inline script
 * in the list page's `<head>` (`index.astro`) -- ahead of every deferred script.
 *
 * Fix round 4 (CI-only failure): on a slow CPU Chromium fired `pagereveal` while the ~400 KB
 * list was still being parsed, before Eevee's card existed, so nothing got named even though a
 * transition ran. The head script now adds `<link rel="expect" href="#pdx-grid-end"
 * blocking="render">` on detail -> list navigations so the first render (and `pagereveal`) waits
 * for every card; this spec asserts that link too.
 *
 * This is a real browser timing race, so instead of asserting on the settled (and by-then-cleared)
 * end state, `page.addInitScript` wraps `window.addEventListener` *before* any page script runs --
 * on every document this `page` loads, including the one navigated to -- so it can record whether
 * the real `pagereveal` listener actually fired and named the right card, synchronously inside
 * that same handler, before this module's own `clear()` (gated on the transition settling) removes
 * the name again.
 */
import { test, expect } from "./fixtures";
import { detailPath, listPath } from "./helpers";

test.describe("reverse list<->detail view-transition naming (bug #8)", () => {
  test("pagereveal names the list card the visitor came back from", async ({
    page,
  }) => {
    // `pagereveal` fires on literally every navigation (its `viewTransition` is just `null` when
    // the browser didn't start one for this particular navigation -- e.g. under a heavily loaded
    // parallel test run, which is an environment/perf decision the engine makes, not something
    // this fix controls). So the log below records every invocation with whether it carried one,
    // rather than requiring a transition to have actually happened: the regression this guards
    // against is the listener never firing *at all* (too-late registration), not the browser's own
    // transition heuristics.
    await page.addInitScript(() => {
      interface RevealEntry {
        hadViewTransition: boolean;
        namedStyle: string | null;
      }
      (window as unknown as { __pdxRevealLog: RevealEntry[] }).__pdxRevealLog =
        [];
      const realAdd = window.addEventListener.bind(window);
      window.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type !== "pagereveal" || typeof listener !== "function") {
          return realAdd(type, listener, options);
        }
        const wrapped = (event: Event) => {
          (listener as (e: Event) => void)(event);
          // Captured synchronously, right as the real handler ran -- before its own `clear()`
          // (gated on the view transition settling) can remove the name again.
          const named = document.querySelector(
            '[style*="view-transition-name: sprite-"]',
          );
          (
            window as unknown as { __pdxRevealLog: RevealEntry[] }
          ).__pdxRevealLog.push({
            hadViewTransition: Boolean(
              (event as { viewTransition?: unknown }).viewTransition,
            ),
            namedStyle: named ? named.getAttribute("style") : null,
          });
        };
        return realAdd(type, wrapped, options);
      }) as typeof window.addEventListener;
    });

    // Eevee (#133, bw) -- present on the bw list page `initCardViewTransitionNames` names forward.
    await page.goto(detailPath("en", "bw", "eevee"));
    await page.locator('a[href*="/bw/"]:has-text("All")').first().click();
    await expect(page).toHaveURL(/\/en\/bw\/?$/);

    const log = await page.evaluate(
      () =>
        (
          window as unknown as {
            __pdxRevealLog: {
              hadViewTransition: boolean;
              namedStyle: string | null;
            }[];
          }
        ).__pdxRevealLog,
    );
    // The listener must have run at all -- this is what the original bug got wrong (registered
    // too late to ever see the real event).
    expect(log.length).toBeGreaterThan(0);
    // Coming from a detail page, the head script must have render-blocked on the sentinel after
    // the grid (fix round 4, `pageRevealScript`): on a slow CPU Chromium otherwise fires
    // `pagereveal` mid-parse, before Eevee's card exists, and the morph silently degrades.
    await expect(
      page.locator('head link[rel="expect"][blocking="render"]'),
    ).toHaveAttribute("href", "#pdx-grid-end");
    // Whenever a real transition did happen, it must have named Eevee's card (`sprite-133`).
    for (const entry of log) {
      if (!entry.hadViewTransition) continue;
      expect(entry.namedStyle).toContain("sprite-133");
    }

    // And the name doesn't leak into a later, unrelated navigation -- nor does a direct visit
    // pay for the render block, which only detail -> list navigations need.
    await page.goto(listPath("en", "bw"));
    await expect(page.locator('head link[rel="expect"]')).toHaveCount(0);
    const leftoverName = await page
      .locator('.card[data-id="133"] .spr')
      .evaluate((el) => (el as HTMLElement).style.viewTransitionName);
    expect(leftoverName).toBe("");
  });

  test("the inline reveal-capture script is registered ahead of every deferred script", async ({
    page,
  }) => {
    await page.goto(listPath("en", "bw"));
    const order = await page.evaluate(() =>
      Array.from(document.scripts).map((s) => ({
        deferred: s.type === "module" || s.defer,
        inline: !s.src,
        snippet: s.src ? "" : s.textContent?.slice(0, 60),
      })),
    );
    const captureIndex = order.findIndex((s) =>
      s.snippet?.includes('"onpageswap" in window'),
    );
    expect(captureIndex).toBeGreaterThanOrEqual(0);
    expect(order[captureIndex]!.deferred).toBe(false);
    // Every deferred (module) script comes after it.
    for (let i = 0; i < captureIndex; i++) {
      expect(order[i]!.deferred).toBe(false);
    }
  });
});
