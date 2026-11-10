/**
 * Sprite URL/size helpers shared by the build-time components and the client scripts. Kept
 * dependency-light (only `urls.ts`) so it's cheap to import into a client bundle.
 *
 * Pixel sets (`rb`-`bw`) render at their native pixel size, scaled by whole numbers with
 * `image-rendering: pixelated`. The Pokémon HOME set is a smooth 3D render stored at 192 px, twice
 * the 96 CSS px sprite box, so it renders at half its pixel size (2x density, sharp on HiDPI) with
 * normal smoothing -- see `src/styles/sprite.css`'s `[data-hd]` rules.
 */
import type { Size, SpriteSetId, Variant } from "../data/types";
import { withBase } from "./urls";

/** How many image pixels a non-pixel-art (HOME) sprite has per CSS pixel. */
export const HD_DENSITY = 2;

/** The directory a sprite set's files live in, e.g. `/pokemon-dex/sprites/home/`. */
export function spriteDir(set: SpriteSetId): string {
  return withBase(`sprites/${set}/`);
}

/** One sprite file's URL, e.g. `/pokemon-dex/sprites/bw/front-shiny/25.webp`. */
export function spriteUrl(
  set: SpriteSetId,
  variant: Variant,
  key: string,
): string {
  return `${spriteDir(set)}${variant}/${key}.webp`;
}

/** The CSS size a sprite of pixel size `size` renders at (before the component's own scale). */
export function displaySize(size: Size, pixelated: boolean): Size {
  return pixelated ? size : { w: size.w / HD_DENSITY, h: size.h / HD_DENSITY };
}

/** The hero's preferred whole-number sprite scale (`Hero.astro`). */
export const HERO_SCALE = 2;

/**
 * The narrowest the hero stage ever gets: a 320px phone, minus the hero's 12px margins and 12px
 * padding on each side (`Hero.astro`'s <=640px layout). On wider screens the stage column grows
 * to the sprite (`--hero-w`), so this is the binding width.
 */
export const HERO_MIN_STAGE_W = 320 - 2 * 12 - 2 * 12;

export interface HeroFit {
  /** Whole-number scale: `HERO_SCALE`, or 1 when the form's widest sprite wouldn't fit at it. */
  scale: 1 | typeof HERO_SCALE;
  /** The widest/tallest of the form's variants at that scale, in CSS px. */
  w: number;
  h: number;
}

/**
 * How the hero shows one form's sprites (Task 8 fix round 2). Sized over *every* variant the form
 * has, so toggling shiny/back/gender never resizes the stage. Pixel art keeps integer scaling, so
 * a form too wide for the narrowest stage at 2x (dp Scizor 140px, bw Lugia 153px, Swanna 137px)
 * drops to 1x instead of being squeezed; everything else stays at 2x.
 */
export function heroFit(
  entry: Partial<Record<Variant, Size>>,
  pixelated: boolean,
): HeroFit {
  let w = 0;
  let h = 0;
  for (const size of Object.values(entry)) {
    if (!size) continue;
    const d = displaySize(size, pixelated);
    w = Math.max(w, d.w);
    h = Math.max(h, d.h);
  }
  const scale = w * HERO_SCALE <= HERO_MIN_STAGE_W ? HERO_SCALE : 1;
  return { scale, w: w * scale, h: h * scale };
}
