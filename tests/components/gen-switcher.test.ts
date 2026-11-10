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

// Bug (fix round 2): at 320-350px the header overflowed the viewport by 11-31px (EN) / up to
// ~70px (RU) because the `.gen` summary's `white-space: nowrap` text ("Black / White" + the
// "Gen V" roman numeral) can't shrink below its full rendered width. Below a narrow-width
// breakpoint the roman numeral must be dropped and the full label swapped for its compact
// ("B / W"-style) form, so the lang switch and theme toggle after it never get pushed off-screen.
test("a narrow-width media query hides the roman numeral and swaps to the compact label", () => {
  const media = /@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n {2}\}/.exec(
    SOURCE,
  );
  expect(media).not.toBeNull();

  // "~380px" per the QA brief -- generous enough to clear the 350px width the report measured
  // overflow at, without kicking in so early it needlessly changes wider phone layouts.
  const breakpoint = Number(media![1]);
  expect(breakpoint).toBeGreaterThanOrEqual(350);
  expect(breakpoint).toBeLessThanOrEqual(430);

  const body = media![2];
  expect(body).toMatch(/\.gen small\s*\{[^}]*display\s*:\s*none/);
  expect(body).toMatch(/\.gen-full\s*\{[^}]*display\s*:\s*none/);
  expect(body).toMatch(/\.gen-compact\s*\{[^}]*display\s*:\s*(?!none)\S/);
});

test("the compact label is display:none outside the narrow-width media query", () => {
  // Strip the media query block first so its own (intentionally different) `.gen-compact` rule
  // doesn't satisfy this assertion about the *default* (wide-viewport) state.
  const withoutMedia = SOURCE.replace(
    /@media\s*\(max-width:\s*\d+px\)\s*\{[\s\S]*?\n {2}\}/,
    "",
  );
  const rule = /\.gen-compact\s*\{([^}]*)\}/.exec(withoutMedia);
  expect(rule).not.toBeNull();
  expect(rule![1]).toMatch(/display\s*:\s*none/);
});

test("compactLabel reduces every generation's '<Word> / <Word>' label to its initials", () => {
  const fn =
    /function compactLabel\(label: string\): string \{([\s\S]*?)\n\}/.exec(
      SOURCE,
    );
  expect(fn).not.toBeNull();
  // Builds the function from the exact source text (rather than re-implementing the same
  // transform here, which could silently drift from what the component actually does).
  const compactLabel = new Function("label", fn![1]) as (
    label: string,
  ) => string;

  for (const g of GENERATIONS) {
    const words = g.label.split("/").map((w) => w.trim());
    const expected = words.map((w) => w.charAt(0)).join(" / ");
    expect(compactLabel(g.label)).toBe(expected);
  }
  expect(compactLabel("Black / White")).toBe("B / W");
});
