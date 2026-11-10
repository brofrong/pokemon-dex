/**
 * The ⌘K/Ctrl+K search palette, only present on detail pages (`SearchPalette.astro`'s module doc
 * -- the list page binds the same hotkeys to its own always-visible search field instead).
 */
import { test, expect } from "./fixtures";
import { detailPath } from "./helpers";

test.describe("search palette (detail page)", () => {
  test("Ctrl/Cmd+K opens, typing + Enter navigates, Esc closes", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "bw", "charmander"));
    const dialog = page.locator("#pdx-palette");
    await expect(dialog).not.toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#pdx-palette-input")).toBeFocused();

    await page.locator("#pdx-palette-input").fill("eevee");
    await expect(page.locator(".pal-opt").first()).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/pokemon\/eevee\/?$/);
  });

  test("Esc closes the palette without navigating", async ({ page }) => {
    await page.goto(detailPath("en", "bw", "charmander"));
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.locator("#pdx-palette")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#pdx-palette")).not.toBeVisible();
    await expect(page).toHaveURL(/\/pokemon\/charmander\/?$/);
  });
});
