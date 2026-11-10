/**
 * `PokemonCard.astro`'s `.card` CSS can't be unit-tested by rendering (Astro files don't compile
 * under `bun test`, see `evolution-tree.test.ts`'s module doc) -- this pins a QA-found CSS
 * invariant by reading the component's raw source instead of asserting on rendered output.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = readFileSync(
  path.join(import.meta.dir, "../../src/components/PokemonCard.astro"),
  "utf-8",
);

// Bug: "horizontal overflow on phone" -- `contain-intrinsic-size: auto 190px` is a *shorthand*
// that sets the SAME 190px fallback on both the width and height axes. An off-screen card skipped
// by `content-visibility: auto` then reports an intrinsic width of 190px (+padding/border), wider
// than the 2-column fair share at narrow viewports, forcing the grid's `1fr` tracks to overflow
// the viewport by 52px (reproduced at 390px). Only the height axis should be constrained; width
// must stay unconstrained so a skipped card contributes nothing to the grid's track sizing.
test("the card's `.card` rule does not set an intrinsic WIDTH fallback via the shorthand", () => {
  const rule = /(?<![\w-])\.card\s*\{([^}]*)\}/.exec(SOURCE);
  expect(rule).not.toBeNull();
  // Strips CSS comments first -- the fix's own explanatory comment mentions the banned shorthand
  // by name, which would otherwise make this assertion match the comment, not real declarations.
  const body = rule![1].replace(/\/\*[\s\S]*?\*\//g, "");
  // The combined shorthand (`contain-intrinsic-size: ...`) would apply to both axes -- banned.
  expect(body).not.toMatch(/contain-intrinsic-size\s*:/);
  // The height-only longhand is the fix; width is left unset (defaults to `none`).
  expect(body).toMatch(/contain-intrinsic-height\s*:\s*auto\s+190px/);
  expect(body).not.toMatch(/contain-intrinsic-width\s*:/);
});
