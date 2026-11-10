/**
 * Language and generation switching (constraints' Review Focus #1-3): the EN/RU switch must
 * preserve the current page and (on the list page) its live filter/sort query; the generation
 * switcher must never land on a 404 even when the current species doesn't exist in the target
 * generation; and generation-specific UI (abilities, shiny, back sprites, forms) must actually be
 * hidden rather than rendered empty/broken.
 */
import { test, expect } from "./fixtures";
import { detailPath, listPath } from "./helpers";

test.describe("language switch", () => {
  test("keeps the list page and its filter/sort query", async ({ page }) => {
    await page.goto(listPath("en", "bw", "type=fire&sort=spe&dir=desc"));
    await page.locator('a.lang[data-lang="ru"]').click();
    await expect(page).toHaveURL(/\/ru\/bw\/\?.*sort=spe/);
    await expect(page).toHaveURL(/type=fire/);
    await expect(page).toHaveURL(/dir=desc/);
  });

  test("keeps the same species on a detail page", async ({ page }) => {
    await page.goto(detailPath("en", "bw", "charmander"));
    await page.locator('a.lang[data-lang="ru"]').click();
    await expect(page).toHaveURL(/\/ru\/bw\/pokemon\/charmander\/?$/);
  });
});

test.describe("generation switch", () => {
  test("Snivy (bw-only) switching to Red/Blue lands on the rb list, not a 404", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "bw", "snivy"));
    await page.locator(".gen summary").click();
    await page.locator('.gen .dd a[data-gen="rb"]').click();
    await expect(page).toHaveURL(/\/en\/rb\/?$/);
    await expect(page.locator("#pdx-grid")).toBeVisible();
  });
});

test.describe("generation-specific UI", () => {
  test("gen I (rb) detail page has no abilities box and no shiny toggle", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "rb", "pikachu"));
    await expect(page.locator("#pdx-abilities")).toHaveCount(0);
    await expect(page.locator('.vseg[data-axis="shiny"]')).toHaveCount(0);
  });

  test("a HOME generation (sv) detail page has no back toggle", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "sv", "eevee"));
    await expect(page.locator('.vseg[data-axis="back"]')).toHaveCount(0);
  });

  test("xy Charizard has mega-x and mega-y form tiles", async ({ page }) => {
    await page.goto(detailPath("en", "xy", "charizard"));
    await expect(page.locator('.form[data-form-slug="mega-x"]')).toBeVisible();
    await expect(page.locator('.form[data-form-slug="mega-y"]')).toBeVisible();
  });

  test("sv Wooper has a paldea form", async ({ page }) => {
    await page.goto(detailPath("en", "sv", "wooper"));
    await expect(page.locator('.form[data-form-slug="paldea"]')).toBeVisible();
  });
});
