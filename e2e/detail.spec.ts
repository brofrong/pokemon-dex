/**
 * The Pokémon detail page (en/bw): S/B/G variant hotkeys, keyboard/evolution navigation, a cold
 * `?form=` deep link, and (feature-gated -- Task 7 may not be merged yet) ability descriptions.
 *
 * Charmander (no front-female sprite in this set) covers shiny/back; Pikachu (which does have a
 * front-female sprite in the bw set) covers the gender hotkey -- picking one species per toggle
 * it actually supports, rather than assuming every species has all three, per `VariantSwitcher`'s
 * own `available` gating.
 */
import { test, expect } from "./fixtures";
import { detailPath } from "./helpers";

test.describe("detail page (en/bw)", () => {
  test("S and B hotkeys change the hero sprite (Charmander)", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "bw", "charmander"));
    const img = page.locator("#pdx-stage .spr-img");
    await expect(img).toBeVisible();

    const front = await img.getAttribute("src");
    expect(front).toContain("/front/");

    await page.keyboard.press("s");
    await expect.poll(() => img.getAttribute("src")).toContain("/front-shiny/");

    await page.keyboard.press("b");
    await expect.poll(() => img.getAttribute("src")).toContain("/back-shiny/");

    await page.keyboard.press("s"); // shiny off
    await expect.poll(() => img.getAttribute("src")).toContain("/back/");
    expect(await img.getAttribute("src")).not.toContain("shiny");

    await page.keyboard.press("b"); // back off
    await expect.poll(() => img.getAttribute("src")).toContain("/front/");
  });

  test("G hotkey changes the hero sprite (Pikachu, which has a gender-diff sprite)", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "bw", "pikachu"));
    const img = page.locator("#pdx-stage .spr-img");
    await expect(img).toBeVisible();
    expect(await img.getAttribute("src")).not.toContain("female");

    await page.keyboard.press("g");
    await expect.poll(() => img.getAttribute("src")).toContain("front-female");
  });

  test("ArrowLeft/ArrowRight navigate to neighbouring species", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "bw", "charmander")); // #004
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/\/pokemon\/charmeleon\/?$/); // #005
    // Waits for each cross-document navigation to fully settle before the next key press -- firing
    // two in a row without that can abort Chromium's native view transition mid-flight (a known,
    // harmless engine quirk filtered in `fixtures.ts`'s error guard; avoided here regardless so
    // this test asserts the simplest possible case).
    await page.keyboard.press("ArrowLeft");
    await expect(page).toHaveURL(/\/pokemon\/charmander\/?$/); // back to #004
  });

  test("an evolution-tree link navigates to that species", async ({ page }) => {
    await page.goto(detailPath("en", "bw", "charmander"));
    // The current species renders as a plain (unlinked) `.mon.cur`; its evolutions are links.
    const nextLink = page.locator(".evo a.mon").first();
    await expect(nextLink).toBeVisible();
    await nextLink.click();
    await expect(page).toHaveURL(/\/pokemon\/charmeleon\/?$/);
  });

  test("a cold ?form= deep link switches to that form (Rotom Heat)", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "bw", "rotom", "heat"));
    const types = page.locator("#pdx-types .tb");
    await expect(types).toHaveCount(2);
    await expect(page.locator("#pdx-types .tb.t-fire")).toBeVisible();
    await expect(page.locator("#pdx-types .tb.t-electric")).toBeVisible();
    // The matching form tile is marked active.
    await expect(page.locator('.form[data-form-slug="heat"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("abilities section lists Charmander's abilities, with descriptions if Task 7 has landed", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "bw", "charmander"));
    const abilities = page.locator("#pdx-abilities");
    await expect(abilities).toBeVisible();
    // Always true regardless of Task 7: the ability names themselves are in the box.
    await expect(abilities).toContainText(/Blaze/i);

    const details = abilities.locator("details");
    const detailsCount = await details.count();
    if (detailsCount === 0) {
      // Task 7 (ability `<details>` with descriptions) hasn't landed in this checkout yet --
      // nothing more to assert.
      return;
    }
    const first = details.first();
    await expect(first.locator("summary")).toBeVisible();
    const before = await first.evaluate((el: HTMLDetailsElement) => el.open);
    await first.locator("summary").click();
    await expect
      .poll(() => first.evaluate((el: HTMLDetailsElement) => el.open))
      .toBe(!before);
    const text = (await first.textContent()) ?? "";
    expect(text.trim().length).toBeGreaterThan(0);
  });
});
