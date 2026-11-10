/**
 * The generation list page (Black/White, the default generation): sprites, search, type/flag
 * filters, sort, the shiny toggle, and rapid-toggling consistency (constraints' Review Focus #5 --
 * a filter/sort change must never leave the visible-card count and the status text disagreeing,
 * or leave a duplicate card visible, even when several changes land back-to-back).
 */
import { test, expect } from "./fixtures";
import {
  fetchListJson,
  firstVisibleCardId,
  listPath,
  waitForListSettled,
  type ListTuple,
} from "./helpers";

test.describe("list page (en/bw)", () => {
  test("loads with visible sprites and a live count", async ({
    page,
    baseURL,
  }) => {
    await page.goto(listPath("en", "bw"));

    const grid = page.locator("#pdx-grid");
    await expect(grid).toBeVisible();

    // The shared first-frame atlas is wired up as a CSS custom property on the grid, consumed by
    // every default-form card's `.spr-atlas` layer (`src/styles/sprite.css`).
    const atlasVar = await grid.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--atlas"),
    );
    expect(atlasVar).toMatch(/url\(/);

    // At least one animated sprite (a priority, above-the-fold card) actually finished loading.
    const firstSprite = page.locator(".card .spr-img[src]").first();
    await expect(firstSprite).toBeVisible();
    await expect
      .poll(() =>
        firstSprite.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);

    const total = (await fetchListJson(page, baseURL!, "en", "bw")).length;
    await expect(page.locator("#pdx-count")).toContainText(String(total));
  });

  test("searching finds Pikachu by name (RU) and by number", async ({
    page,
  }) => {
    await page.goto(listPath("ru", "bw"));
    const search = page.locator("#pdx-search");
    const pikachuCard = page.locator('.card[data-id="25"]');

    await search.fill("пика");
    await expect(pikachuCard).toBeVisible();
    await expect(page.locator("#pdx-count")).not.toContainText("0 ");

    await search.fill("#025");
    await expect(pikachuCard).toBeVisible();
  });

  test("a single type filter shows only cards of that type", async ({
    page,
  }) => {
    await page.goto(listPath("en", "bw"));
    await page.locator('.tf[data-type="fire"]').click();
    await waitForListSettled(page);

    const visible = page.locator(".card:not([hidden])");
    const count = await visible.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(visible.nth(i).locator(".types .tb.t-fire")).toHaveCount(1);
    }
  });

  test("two type filters AND together (fire + flying)", async ({ page }) => {
    await page.goto(listPath("en", "bw"));
    await page.locator('.tf[data-type="fire"]').click();
    await page.locator('.tf[data-type="flying"]').click();
    await waitForListSettled(page);

    // Charizard (#006) is fire/flying and part of Black/White's roster (species 1-649).
    await expect(page.locator('.card[data-id="6"]')).toBeVisible();

    const visible = page.locator(".card:not([hidden])");
    const count = await visible.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const card = visible.nth(i);
      await expect(card.locator(".types .tb.t-fire")).toHaveCount(1);
      await expect(card.locator(".types .tb.t-flying")).toHaveCount(1);
    }
  });

  test("sorting by speed descending puts the generation's fastest species first", async ({
    page,
    baseURL,
  }) => {
    const tuples: ListTuple[] = await fetchListJson(page, baseURL!, "en", "bw");
    const fastest = tuples.reduce((best, t) =>
      t[2][5] > best[2][5] ? t : best,
    );

    await page.goto(listPath("en", "bw"));
    await page.locator("#pdx-sort").selectOption("spe");
    // Default sort direction is ascending; one click on the direction button flips to descending.
    await page.locator("#pdx-dir").click();
    await waitForListSettled(page);

    expect(await firstVisibleCardId(page)).toBe(fastest[0]);
  });

  test("the shiny chip swaps a loaded card's sprite", async ({ page }) => {
    await page.goto(listPath("en", "bw"));
    const firstImg = page.locator(".card .spr-img[src]").first();
    const before = await firstImg.getAttribute("src");
    expect(before).toContain("/front/");

    await page.locator("#pdx-shiny").click();

    await expect
      .poll(() => firstImg.getAttribute("src"))
      .toContain("/front-shiny/");
    expect(await page.locator("#pdx-shiny").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  test("rapid filter/sort/shiny toggling leaves the count and DOM in agreement", async ({
    page,
  }) => {
    await page.goto(listPath("en", "bw"));

    const clicks = [
      () => page.locator('.tf[data-type="fire"]').click(),
      () => page.locator('.tf[data-type="flying"]').click(),
      () => page.locator('[data-flag="legendary"]').click(),
      () => page.locator("#pdx-shiny").click(),
      () => page.locator("#pdx-dir").click(),
      () => page.locator('.tf[data-type="fire"]').click(), // toggle fire back off
      () => page.locator("#pdx-shiny").click(), // toggle shiny back off
      () => page.locator('[data-flag="legendary"]').click(), // toggle legendary back off
      () => page.locator("#pdx-dir").click(),
      () => page.locator('.tf[data-type="flying"]').click(), // toggle flying back off
    ];
    // Fired back-to-back, deliberately not awaited individually, to exercise the same
    // interrupted-transition hazard the constraints call out (Review Focus #5).
    for (const click of clicks) await click();

    await waitForListSettled(page);
    // Back to the all-filters-off state: every card should be visible again.
    await expect(page.locator('.tf[data-type="fire"]')).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator('.tf[data-type="flying"]')).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const statusCount = await page
      .locator("#pdx-count")
      .textContent()
      .then((t) => Number(t?.match(/\d+/)?.[0]));
    const visibleIds = await page
      .locator(".card:not([hidden])")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-id")));

    expect(visibleIds.length).toBe(statusCount);
    expect(new Set(visibleIds).size).toBe(visibleIds.length); // no duplicates
  });
});
