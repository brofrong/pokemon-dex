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

// Bug: "filtering/search doesn't hide cards" -- `list.ts` toggles the `hidden` attribute, but the
// UA stylesheet's `[hidden] { display: none }` is author-origin-overridden by this component's
// own `.card { display: block }` (same specificity; author beats user-agent regardless of
// specificity), so cards stayed visible no matter what `list.ts` did. A `.card[hidden]` rule
// (higher specificity than `.card` alone, so order in the stylesheet can't matter either) must
// force `display: none`.
test("a `.card[hidden]` rule forces display:none (cards actually hide when filtered out)", () => {
  const rule = /\.card\[hidden\]\s*\{([^}]*)\}/.exec(SOURCE);
  expect(rule).not.toBeNull();
  expect(rule![1]).toMatch(/display\s*:\s*none/);
});
