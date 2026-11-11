/**
 * The loading placeholder and the sprite's real pixels must never paint at the same time. The list
 * grid's shared first-frame atlas is one large file Chromium paints progressively while it
 * downloads (top rows first), long before it has fully decoded and the grid flips `.atlas-ready`
 * -- so a card used to show its first frame on top of the still-visible type-colored square. The
 * atlas layer now stays hidden until `.atlas-ready`, and the placeholder is a light Pokéball
 * silhouette (an SVG mask), not a solid box.
 */
import { test, expect } from "./fixtures";
import { listPath } from "./helpers";

async function holdRoute(
  page: import("@playwright/test").Page,
  pattern: string,
): Promise<{ release: () => void }> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(pattern, async (route) => {
    await gate;
    await route.continue();
  });
  return { release };
}

function layers(page: import("@playwright/test").Page, card: string) {
  return page.locator(`${card} .spr`).evaluate((spr) => {
    const style = (sel: string) => getComputedStyle(spr.querySelector(sel)!);
    return {
      fillOpacity: Number(style(".spr-fill").opacity),
      fillMask: style(".spr-fill").maskImage,
      atlasVisibility: style(".spr-atlas").visibility,
    };
  });
}

test("a card's atlas frame stays hidden behind the placeholder until the whole atlas is ready", async ({
  page,
}) => {
  const atlas = await holdRoute(page, "**/sprites/bw/atlas-front*.webp");
  const ownImage = await holdRoute(page, "**/sprites/bw/front/1.webp");
  await page.goto(listPath("en", "bw"), { waitUntil: "domcontentloaded" });
  const card = '.card[data-id="1"]';

  const loading = await layers(page, card);
  expect(loading.fillOpacity).toBeGreaterThan(0);
  expect(loading.fillMask).toContain("svg");
  // A progressively painted atlas must not show through on top of the placeholder.
  expect(loading.atlasVisibility).toBe("hidden");

  atlas.release();
  await expect(page.locator("#pdx-grid")).toHaveClass(/atlas-ready/);
  const ready = await layers(page, card);
  expect(ready.atlasVisibility).toBe("visible");
  expect(ready.fillOpacity).toBe(0);
  ownImage.release();
});
