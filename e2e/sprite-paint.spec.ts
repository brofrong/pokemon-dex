/**
 * QA bug #1 / R-B1, fix round 2: the placeholder (`.spr-fill`) must stay visible for however long
 * a sprite (or, for the list grid, the shared atlas) actually takes to download and decode --
 * fix round 1 tied its fade to DOM/attribute presence instead, which hid it at parse time, before
 * a slow connection had even started fetching the real pixels.
 *
 * `page.route()` artificially delays the real sprite/atlas response so these tests can observe
 * the "still loading" state directly, rather than relying on eyeballing DevTools network
 * throttling by hand: shortly after navigation, with the delayed request still in flight, the
 * fill must still be opaque; once the delayed response resolves and the image/atlas has actually
 * painted, it must be gone. Covers all four contexts the fix touches: an atlas-backed rb list
 * card, the bw hero (plain `<img>`, no atlas), an evolution-tree node (plain `<img>`, native
 * `loading="lazy"`), and a HOME-set (sv) card's soft disc placeholder (also atlas-backed).
 *
 * `waitUntil: "domcontentloaded"` throughout: the atlas is `<link rel="preload">`-ed and the
 * hero/first cards' sprites are eager, non-lazy `<img>`s, both of which the `load` event (the
 * default `page.goto` waits for) blocks on -- exactly the in-flight request these tests need to
 * still be pending when they make their first assertion, so waiting for `load` would deadlock.
 */
import { test, expect } from "./fixtures";
import { detailPath, listPath } from "./helpers";

const FILL_OPACITY_HIDDEN = "0";

async function fillOpacity(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<string> {
  return page
    .locator(`${selector} .spr-fill`)
    .first()
    .evaluate((el) => getComputedStyle(el).opacity);
}

/** Holds every request matching `pattern` until `release()` is called -- a real condition the
 *  test controls, not a timer, so "still loading" is still loading however slow the machine is. */
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

/**
 * Card #1's own `<img>` and the grid's atlas are both held: its fill must be opaque (and its own
 * image demonstrably not the thing that painted), then fade once -- and only because -- the atlas
 * is released and the grid flips `.atlas-ready`.
 */
async function expectAtlasGatedFill(
  page: import("@playwright/test").Page,
  releaseAtlas: () => void,
): Promise<void> {
  const card = '.card[data-id="1"]';
  const grid = page.locator("#pdx-grid");
  await expect(page.locator(`${card} .spr-atlas`)).toBeAttached();
  expect(await fillOpacity(page, card)).not.toBe(FILL_OPACITY_HIDDEN);
  await expect(grid).not.toHaveClass(/atlas-ready/);
  await expect(page.locator(`${card} .spr`)).not.toHaveClass(/\bloaded\b/);

  releaseAtlas();
  await expect(grid).toHaveClass(/atlas-ready/);
  await expect.poll(() => fillOpacity(page, card)).toBe(FILL_OPACITY_HIDDEN);
  // Still not `.loaded`: the fade above came from the atlas, not the card's own image.
  await expect(page.locator(`${card} .spr`)).not.toHaveClass(/\bloaded\b/);
}

test.describe("sprite placeholder fades on paint, not on parse (bug #1 round 2)", () => {
  test("rb list: an atlas-backed card's fill stays visible until the shared atlas resolves", async ({
    page,
  }) => {
    // Card #1 is one of the first-screen priority cards (`PRIORITY_COUNT` in the list page), so it
    // also has its own real `src`: delaying only the atlas let that tiny rb image finish loading
    // first on a slower (CI) machine, its own `.loaded` hid the fill -- correct app behaviour, but
    // it made the first assertion fail and proved nothing about the atlas path. Hold both, release
    // only the atlas, so the fade can only come from `.atlas-ready`.
    const atlas = await holdRoute(page, "**/sprites/rb/atlas-front*.webp");
    const ownImage = await holdRoute(page, "**/sprites/rb/front/1.webp");

    await page.goto(listPath("en", "rb"), { waitUntil: "domcontentloaded" });
    await expectAtlasGatedFill(page, atlas.release);
    ownImage.release();
  });

  test("bw hero: the priority sprite's fill stays visible until its own image loads", async ({
    page,
  }) => {
    let releaseSprite: (() => void) | undefined;
    const spriteDelay = new Promise<void>(
      (resolve) => (releaseSprite = resolve),
    );
    await page.route("**/sprites/bw/front/133.webp", async (route) => {
      await spriteDelay;
      await route.continue();
    });

    await page.goto(detailPath("en", "bw", "eevee"), {
      waitUntil: "domcontentloaded",
    });
    expect(await fillOpacity(page, "#pdx-stage")).not.toBe(FILL_OPACITY_HIDDEN);

    releaseSprite!();
    await expect
      .poll(() => fillOpacity(page, "#pdx-stage"))
      .toBe(FILL_OPACITY_HIDDEN);
  });

  test("evolution tree: a lazy-loaded node's fill stays visible until it loads", async ({
    page,
  }) => {
    // Eevee's tree branches to Vaporeon (#134) among others; delay only that one node's sprite
    // so the hero's own (#133) loads normally and doesn't also hold up `domcontentloaded`.
    let releaseSprite: (() => void) | undefined;
    const spriteDelay = new Promise<void>(
      (resolve) => (releaseSprite = resolve),
    );
    await page.route("**/sprites/bw/front/134.webp", async (route) => {
      await spriteDelay;
      await route.continue();
    });

    await page.goto(detailPath("en", "bw", "eevee"), {
      waitUntil: "domcontentloaded",
    });
    const node = page.locator("#pdx-detail .evo-wrap .spr").filter({
      has: page.locator('img[alt="Vaporeon"]'),
    });
    // Native `loading="lazy"` (`Sprite.astro`'s `lazy` mode): the browser won't even request this
    // image until it's near the viewport, so scroll to it first -- otherwise the delayed route
    // below would never actually be hit, and the assertion would pass for the wrong reason.
    await node.scrollIntoViewIfNeeded();
    await expect(node).toBeVisible();
    expect(
      await node
        .locator(".spr-fill")
        .evaluate((el) => getComputedStyle(el).opacity),
    ).not.toBe(FILL_OPACITY_HIDDEN);

    releaseSprite!();
    await expect
      .poll(() =>
        node
          .locator(".spr-fill")
          .evaluate((el) => getComputedStyle(el).opacity),
      )
      .toBe(FILL_OPACITY_HIDDEN);
  });

  test("sv card: the HOME-set soft-disc fill also stays visible until the shared atlas resolves", async ({
    page,
  }) => {
    // xy/sm/swsh/sv all share the "home" sprite *set* (Pokémon HOME renders), not a per-generation
    // directory -- `spriteDir`/`spriteUrl` key off `SpriteSetId`, not `GenId`.
    //
    // Card #1 also has its own real `src` here (see the rb test): hold both, release only the atlas.
    const atlas = await holdRoute(page, "**/sprites/home/atlas-front*.webp");
    const ownImage = await holdRoute(page, "**/sprites/home/front/1.webp");

    await page.goto(listPath("en", "sv"), { waitUntil: "domcontentloaded" });
    await expectAtlasGatedFill(page, atlas.release);
    ownImage.release();
  });

  test("no layout shift: the sprite box keeps its size whether the fill is shown or hidden", async ({
    page,
  }) => {
    await page.goto(detailPath("en", "bw", "eevee"));
    const spr = page.locator("#pdx-stage .spr");
    const before = await spr.boundingBox();
    await expect
      .poll(() => fillOpacity(page, "#pdx-stage"))
      .toBe(FILL_OPACITY_HIDDEN);
    const after = await spr.boundingBox();
    expect(after?.width).toBe(before?.width);
    expect(after?.height).toBe(before?.height);
  });
});
