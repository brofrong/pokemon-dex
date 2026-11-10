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
