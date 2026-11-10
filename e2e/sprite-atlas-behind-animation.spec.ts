/**
 * The list cards stack the static first frame (`.spr-atlas`, cut from the shared atlas) under the
 * real animated sprite (`.spr-img`). Animated frames have transparent pixels wherever the Pokémon
 * has moved away from its first-frame pose, so once the animation is playing the static first
 * frame must no longer paint underneath it -- otherwise a frozen copy of the Pokémon shows
 * through behind the animation. While the animated image is still loading, the atlas frame must
 * stay visible (it is the instant first paint).
 */
import { test, expect } from "./fixtures";
import { listPath } from "./helpers";

async function atlasVisibility(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<string> {
  return page
    .locator(`${selector} .spr-atlas`)
    .first()
    .evaluate((el) => getComputedStyle(el).visibility);
}

test("the static atlas frame stops painting once the card's animated sprite has loaded", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/sprites/bw/front/1.webp", async (route) => {
    await gate;
    await route.continue();
  });

  await page.goto(listPath("en", "bw"), { waitUntil: "domcontentloaded" });
  const card = '.card[data-id="1"]';

  // Animated sprite still in flight: the atlas first frame is the visible stand-in.
  expect(await atlasVisibility(page, card)).toBe("visible");

  release();
  await expect(page.locator(`${card} .spr`)).toHaveClass(/\bloaded\b/);
  expect(await atlasVisibility(page, card)).toBe("hidden");
});

test("toggling shiny shows the shiny atlas frame again until the shiny sprite loads", async ({
  page,
}) => {
  await page.goto(listPath("en", "bw"));
  const card = '.card[data-id="1"]';
  await expect(page.locator(`${card} .spr`)).toHaveClass(/\bloaded\b/);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/sprites/bw/front-shiny/1.webp", async (route) => {
    await gate;
    await route.continue();
  });

  await page.locator("#pdx-shiny").click();
  await expect(page.locator(`${card} .spr`)).not.toHaveClass(/\bloaded\b/);
  expect(await atlasVisibility(page, card)).toBe("visible");

  release();
  await expect(page.locator(`${card} .spr`)).toHaveClass(/\bloaded\b/);
  expect(await atlasVisibility(page, card)).toBe("hidden");
});
