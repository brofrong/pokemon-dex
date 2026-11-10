/** One rectangle to place, identified by `key` (the key the result's placement is keyed by). */
export interface PackRect {
  key: string;
  w: number;
  h: number;
}

export interface PackResult {
  width: number;
  height: number;
  placements: Record<string, { x: number; y: number }>;
}

/**
 * A simple shelf packer for the sprite atlas: sorts `rects` tallest-first (ties broken by `key`,
 * so the result is deterministic regardless of input order), then lays them left-to-right in
 * rows ("shelves") at most `maxWidth` wide, starting a new shelf whenever the next rect would
 * overflow the current one. `pad` pixels of empty space separate every rect from its right and
 * bottom neighbors, so a cropped sprite can never bleed into its neighbor's atlas cell.
 *
 * Throws if any single rect is wider than `maxWidth` -- there is no shelf it could ever fit on.
 */
export function shelfPack(
  rects: PackRect[],
  maxWidth: number,
  pad = 1,
): PackResult {
  for (const rect of rects) {
    if (rect.w > maxWidth) {
      throw new Error(
        `Rect '${rect.key}' is ${rect.w}px wide, exceeding maxWidth ${maxWidth}`,
      );
    }
  }

  const sorted = [...rects].sort((a, b) => {
    if (b.h !== a.h) return b.h - a.h;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const placements: Record<string, { x: number; y: number }> = {};
  let x = 0;
  let y = 0;
  let shelfHeight = 0;
  let width = 0;

  for (const rect of sorted) {
    if (x > 0 && x + rect.w > maxWidth) {
      y += shelfHeight + pad;
      x = 0;
      shelfHeight = 0;
    }
    placements[rect.key] = { x, y };
    x += rect.w + pad;
    shelfHeight = Math.max(shelfHeight, rect.h);
    width = Math.max(width, x - pad);
  }

  const height = sorted.length === 0 ? 0 : y + shelfHeight;
  return { width, height, placements };
}
