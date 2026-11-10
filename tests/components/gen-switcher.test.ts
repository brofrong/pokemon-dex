/**
 * `GenSwitcher.astro`'s narrow-width CSS can't be unit-tested by rendering (Astro files don't
 * compile under `bun test`, see `evolution-tree.test.ts`'s module doc) -- this pins the QA-found
 * header-overflow fix by reading the component's raw source instead of asserting on rendered
 * output.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GENERATIONS } from "../../src/lib/generations";

const SOURCE = readFileSync(
  path.join(import.meta.dir, "../../src/components/GenSwitcher.astro"),
  "utf-8",
);

/** Every `@media (max-width: Npx) { ... }` block in the component's styles. */
const MEDIA_RE = /@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n {2}\}/g;
const mediaBlocks = [...SOURCE.matchAll(MEDIA_RE)].map((m) => ({
  maxWidth: Number(m[1]),
  body: m[2]!,
}));

// Bug (QA fix round 2, then Task 6 fix round 1): the `.gen` summary's `white-space: nowrap`
// text can't shrink below its full rendered width, so on narrow screens it pushed the lang
// switch and theme toggle off-screen -- first 11-31px (EN) / ~70px (RU) at 320-350px for
// "Black / White · Gen V", then, with all nine generations, up to 63px at 390px for RU
// "Ultra Sun / Ultra Moon · Поколение VII". The breakpoints are sized for that longest label
// (measured sweep: 9 gens x EN/RU x 320-1280px, see the task-6 report): the roman numeral goes
// below ~480px, the full label is swapped for the short label below ~430px.
test("below ~480px the roman numeral is hidden", () => {
  const block = mediaBlocks.find((b) =>
    /\.gen small\s*\{[^}]*display\s*:\s*none/.test(b.body),
  );
  expect(block).toBeDefined();
  expect(block!.maxWidth).toBeGreaterThanOrEqual(479);
});

test("below ~430px the full label is swapped for the short label", () => {
  const block = mediaBlocks.find((b) =>
    /\.gen-full\s*\{[^}]*display\s*:\s*none/.test(b.body),
  );
  expect(block).toBeDefined();
  expect(block!.maxWidth).toBeGreaterThanOrEqual(429);
  expect(block!.body).toMatch(
    /\.gen-compact\s*\{[^}]*display\s*:\s*(?!none)\S/,
  );
  // The roman numeral is gone at least as early as the label swap (never short label + numeral).
  const smallBlock = mediaBlocks.find((b) =>
    /\.gen small\s*\{[^}]*display\s*:\s*none/.test(b.body),
  );
  expect(smallBlock!.maxWidth).toBeGreaterThanOrEqual(block!.maxWidth);
});

test("the compact label is display:none outside the narrow-width media queries", () => {
  // Strip the media query blocks first so their own (intentionally different) `.gen-compact`
  // rule doesn't satisfy this assertion about the *default* (wide-viewport) state.
  const withoutMedia = SOURCE.replace(MEDIA_RE, "");
  const rule = /\.gen-compact\s*\{([^}]*)\}/.exec(withoutMedia);
  expect(rule).not.toBeNull();
  expect(rule![1]).toMatch(/display\s*:\s*none/);
});

// Initials were ambiguous once all nine generations are listed ("Ultra Sun / Ultra Moon" ->
// "U / U", "Sword / Shield" -> "S / S"), so the compact label is each generation's own
// `shortLabel` instead.
test("the compact label renders the generation's shortLabel", () => {
  expect(SOURCE).toMatch(
    /class="gen-compact"\s*>\s*<span aria-hidden="true">\{current\.shortLabel\}<\/span>/,
  );
  expect(SOURCE).not.toContain("compactLabel");
});

// a11y: below 430px the visible label is just "USUM"/"SwSh"; assistive tech must still get the
// full generation name, so the short code is aria-hidden and a visually hidden copy of the full
// label sits next to it (inside `.gen-compact`, so it's only exposed when that label shows).
test("the compact label still exposes the full generation name to assistive tech", () => {
  const compact = /<span class="gen-compact"[\s\S]*?<\/span\s*>\s*<small>/.exec(
    SOURCE,
  );
  expect(compact).not.toBeNull();
  expect(compact![0]).toMatch(
    /<span class="gen-vh">\{current\.label\}<\/span>/,
  );
  const rule = /\.gen-vh\s*\{([^}]*)\}/.exec(SOURCE);
  expect(rule).not.toBeNull();
  expect(rule![1]).toMatch(/position\s*:\s*absolute/);
  expect(rule![1]).toMatch(/clip-path\s*:\s*inset\(50%\)/);
  expect(rule![1]).not.toMatch(/display\s*:\s*none/);
});

test("every generation's shortLabel is distinct and short", () => {
  expect(GENERATIONS.map((g) => g.shortLabel)).toEqual([
    "RB",
    "GS",
    "RS",
    "DP",
    "BW",
    "XY",
    "USUM",
    "SwSh",
    "SV",
  ]);
});

test("every generation links via switchGenUrl (no unlinked 'soon' rows left)", () => {
  expect(SOURCE).toContain("switchGenUrl(");
  expect(SOURCE).not.toContain("gen.soon");
  expect(SOURCE).not.toContain("ROUTED_GENS");
});
