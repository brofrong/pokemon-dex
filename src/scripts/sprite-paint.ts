/**
 * Ties `.spr-fill`'s fade (`src/styles/sprite.css`, QA bug #1 / R-B1 fix round 2) to a sprite
 * actually having *painted*, not to the DOM/attribute presence a pure-CSS `:has()` rule can only
 * see at parse time -- which hid the placeholder immediately, even on a slow connection where the
 * real sprite (or, for the list grid, the shared atlas) hadn't downloaded yet, leaving an empty
 * box behind for however long that took.
 *
 * Two independent paint signals, both landing as a plain class CSS can key off:
 *  - `wireSpritePaint`/`wireExistingSpritePaint`: a `.spr-img`'s own `load` event (or an
 *    already-complete image, handled synchronously) adds `.loaded` to its `.spr` wrapper. Used
 *    everywhere a sprite is a plain `<img>` -- list cards, the hero, the evolution tree.
 *  - `preloadAtlas`: the list grid's shared first-frame atlas file (`#pdx-grid` only -- see
 *    `sprite.css`'s doc) is preloaded and `decode()`d once; the caller (`list.ts`) adds
 *    `.atlas-ready` to the grid once the *currently active* atlas (front vs. front-shiny, which
 *    the shiny toggle swaps) has resolved.
 */

/** Marks `img`'s `.spr` ancestor painted once it has actually finished loading. Handles an
 *  already-complete image (cached, or this call happening after the browser already finished it)
 *  synchronously, since a `load` listener added at that point would never fire. Safe to call
 *  again for the same element right after assigning a fresh `src` (e.g. a variant/shiny swap):
 *  clears the class first, so the placeholder reappears until the new sprite paints too. */
export function wireSpritePaint(
  img: HTMLImageElement | null | undefined,
): void {
  if (!img) return;
  const spr = img.closest<HTMLElement>(".spr");
  if (!spr) return;
  spr.classList.remove("loaded");
  if (img.complete && img.naturalWidth > 0) {
    spr.classList.add("loaded");
    return;
  }
  img.addEventListener("load", () => spr.classList.add("loaded"), {
    once: true,
  });
}

/** `wireSpritePaint` for every `.spr-img` already under `root` -- the hero's and an evolution
 *  tree's sprites are rendered with a real `src` straight from the server, so nothing ever
 *  assigns one for `wireSpritePaint` to hook; this covers that initial state once at page load. */
export function wireExistingSpritePaint(root: ParentNode): void {
  for (const img of root.querySelectorAll<HTMLImageElement>(".spr-img")) {
    wireSpritePaint(img);
  }
}

/** The handful of `HTMLImageElement` members `preloadAtlas` touches -- injectable so it's
 *  unit-testable without a real `Image` constructor (no DOM in `bun test`). */
export interface PreloadableImage {
  src: string;
  decode?: () => Promise<void>;
  addEventListener(
    type: "load" | "error",
    listener: () => void,
    options?: { once?: boolean },
  ): void;
}

/**
 * Preloads `url` (a shared sprite atlas) and resolves once it has actually decoded -- `decode()`
 * where available, which (unlike a bare `load` event) waits for the image to be ready to paint,
 * not just fetched; falls back to `load`/`error` where it isn't. Never rejects: an atlas that
 * fails to load just leaves its cards' placeholders showing instead of hanging the ready state
 * forever.
 */
export function preloadAtlas(
  url: string,
  createImage: () => PreloadableImage = () => new Image(),
): Promise<void> {
  return new Promise((resolve) => {
    const img = createImage();
    img.src = url;
    const done = (): void => resolve();
    if (typeof img.decode === "function") {
      img.decode().then(done, done);
    } else {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }
  });
}
