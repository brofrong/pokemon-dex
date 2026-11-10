/**
 * Header interactions the final QA fix wave covers:
 *  - bug #4: the theme-toggle icon used to freeze on whatever theme the page loaded with (only
 *    `aria-label` ever updated) -- `ThemeToggle.astro`'s pre-hydration CSS keys off
 *    `html[data-theme-pref]`, which `initThemeToggle` now updates on every click.
 *  - bug #5: the generation `<details>` dropdown never closed on Escape or an outside click.
 */
import { test, expect } from "./fixtures";
import { listPath } from "./helpers";

test.describe("theme toggle (bug #4)", () => {
  test("the icon glyph matches the preference after each click, not just aria-label", async ({
    page,
  }) => {
    await page.goto(listPath("en", "bw"));
    const button = page.locator("#pdx-theme-toggle");
    const icon = button.locator("[data-icon]");

    // Cycles auto -> light -> dark -> auto; each step's *visible* glyph (the pre-hydration CSS's
    // `::before`, not just the real but possibly collapsed `textContent`) must track the click.
    await button.click();
    await expect(button).toHaveAttribute("aria-label", "Light");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-pref",
      "light",
    );
    await expect(icon).toHaveCSS("font-size", "0px"); // collapsed; the CSS `::before` shows "☀" instead
    expect(
      await icon.evaluate((el) => getComputedStyle(el, "::before").content),
    ).toBe('"☀"');

    await button.click();
    await expect(button).toHaveAttribute("aria-label", "Dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-pref",
      "dark",
    );
    expect(
      await icon.evaluate((el) => getComputedStyle(el, "::before").content),
    ).toBe('"☾"');

    await button.click();
    await expect(button).toHaveAttribute("aria-label", "Auto");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-pref",
      "auto",
    );
    // "auto" has no CSS override -- the real (now full-size) glyph shows through instead.
    await expect(icon).toHaveCSS("font-size", "15px");
    await expect(icon).toHaveText("◐");
  });
});

test.describe("generation dropdown (bug #5)", () => {
  test("closes on Escape and returns focus to the summary", async ({
    page,
  }) => {
    await page.goto(listPath("en", "bw"));
    const details = page.locator("details.gen");
    const summary = details.locator("summary");

    await summary.click();
    await expect(details).toHaveJSProperty("open", true);

    await page.keyboard.press("Escape");
    await expect(details).toHaveJSProperty("open", false);
    await expect(summary).toBeFocused();
  });

  test("closes on a click outside it", async ({ page }) => {
    await page.goto(listPath("en", "bw"));
    const details = page.locator("details.gen");

    await details.locator("summary").click();
    await expect(details).toHaveJSProperty("open", true);

    await page.mouse.click(10, 10); // the logo corner -- well outside the dropdown
    await expect(details).toHaveJSProperty("open", false);
  });

  test("a click on one of its own links still works (not swallowed as 'outside')", async ({
    page,
  }) => {
    await page.goto(listPath("en", "bw"));
    const details = page.locator("details.gen");
    await details.locator("summary").click();
    await details.locator('a[data-gen="rb"]').click();
    await expect(page).toHaveURL(/\/en\/rb\/?(\?.*)?$/);
  });
});
