/**
 * `reducedMotion: 'reduce'` project (constraints' Review Focus #5): a filter/sort change must
 * apply synchronously with no lingering `::view-transition` overlay, and cards must never carry a
 * running cascade-in animation. Both assertions are written to hold whether or not Task 8
 * (animations) has landed in this checkout yet -- today, with no JS-driven view transitions and
 * no card cascade at all, both are trivially true; once Task 8 lands, they pin the actual
 * reduced-motion behavior it must preserve.
 */
import { test, expect } from "./fixtures";
import { listPath, waitForListSettled } from "./helpers";

/** Whether any currently-running animation targets a `::view-transition*` pseudo-element -- the
 *  only reliable, version-proof signal that a view transition is actually mid-flight (Chromium's
 *  `::view-transition` root pseudo-element itself always computes `display: block` once the
 *  pseudo-tree exists at all, transition finished or not, so that alone can't tell "lingering"
 *  apart from "never happened"). */
function hasRunningViewTransitionAnimation(
  page: import("@playwright/test").Page,
) {
  return page.evaluate(() =>
    // `Document.getAnimations()` already returns every animation in the whole document (no
    // `{ subtree }` option on `Document` -- that's only an `Element` method's option).
    document.getAnimations().some((a) => {
      if (!(a.effect instanceof KeyframeEffect)) return false;
      const target = a.effect.target;
      const pseudo =
        target && "pseudoElement" in target ? target.pseudoElement : null;
      return (
        typeof pseudo === "string" && pseudo.startsWith("::view-transition")
      );
    }),
  );
}

test("filter change applies instantly with no lingering view-transition overlay", async ({
  page,
}) => {
  await page.goto(listPath("en", "bw"));
  expect(await hasRunningViewTransitionAnimation(page)).toBe(false);

  await page.locator('.tf[data-type="fire"]').click();
  await waitForListSettled(page);

  // Applied already -- no requestAnimationFrame-queued async step left reduced-motion users
  // staring at a stale filter result.
  const visible = page.locator(".card:not([hidden])");
  await expect(visible.first().locator(".types .tb.t-fire")).toHaveCount(1);
  expect(await hasRunningViewTransitionAnimation(page)).toBe(false);
});

test("cards carry no running cascade-in animation", async ({ page }) => {
  await page.goto(listPath("en", "bw"));

  const cards = page.locator(".card");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  const sampleIndexes = [0, Math.min(11, count - 1), count - 1];
  for (const i of sampleIndexes) {
    const animationName = await cards
      .nth(i)
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe("none");
  }
});
