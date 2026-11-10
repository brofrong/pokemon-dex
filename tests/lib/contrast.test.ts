import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  composite,
  contrastRatio,
  mix,
  type Hex,
} from "../../src/lib/contrast";

/**
 * QA bug #18: type-badge label text failed WCAG AA (4.5:1 for 12px text) in light mode, and the
 * type-matchup multiplier colors failed it in dark mode. Both fixes are formulas/literals in CSS
 * (`src/styles/tokens.css`'s `.tb`, `src/components/TypeMatchups.astro`'s `.x4`/`.x2`/`.xh`/`.xq`),
 * so rather than duplicate (and risk drifting from) the exact numbers, these tests parse them
 * straight out of the real source files and recompute the actual rendered contrast -- a change to
 * either file is re-checked against all 18 type colors in both themes automatically.
 */

const TOKENS_CSS = readFileSync(
  join(import.meta.dir, "../../src/styles/tokens.css"),
  "utf8",
);
const MATCHUPS_ASTRO = readFileSync(
  join(import.meta.dir, "../../src/components/TypeMatchups.astro"),
  "utf8",
);

function hex(s: string): Hex {
  return s as Hex;
}

/** All 18 `.t-{type} { --c: #rrggbb; }` rules. */
function typeColors(): ReadonlyMap<string, Hex> {
  const colors = new Map<string, Hex>();
  for (const m of TOKENS_CSS.matchAll(
    /\.t-([a-z]+)\s*\{\s*--c:\s*(#[0-9a-f]{6});/g,
  )) {
    colors.set(m[1]!, hex(m[2]!));
  }
  return colors;
}

/** The percentage `X` out of `color-mix(in srgb, var(--c) X%, <other>)` in the first match of
 *  `pattern` against `css`. */
function mixPercent(css: string, pattern: RegExp): number {
  const m = css.match(pattern);
  if (!m) throw new Error(`pattern not found: ${pattern}`);
  return Number(m[1]) / 100;
}

const TYPES = typeColors();
const SURFACE_LIGHT = hex("#ffffff");
const SURFACE_DARK = hex("#1b1b1f");
const TINT_LIGHT = 0.14;
const TINT_DARK = 0.22;

test("tokens.css defines exactly the 18 Pokémon types", () => {
  expect(TYPES.size).toBe(18);
});

test("light mode: every type's .tb text clears 4.5:1 against its own badge background", () => {
  const blackMixPct = mixPercent(
    TOKENS_CSS,
    /\.tb\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--c\) (\d+)%, black\)/,
  );
  for (const [type, c] of TYPES) {
    const bg = composite(c, TINT_LIGHT, SURFACE_LIGHT);
    const fg = mix(c, hex("#000000"), blackMixPct);
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${type}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }
});

test("dark mode: every type's .tb text clears 4.5:1 against its own badge background", () => {
  const whiteMixPct = mixPercent(
    TOKENS_CSS,
    /data-theme="dark"\]\s*\.tb\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--c\) (\d+)%, #fff\)/,
  );
  for (const [type, c] of TYPES) {
    const bg = composite(c, TINT_DARK, SURFACE_DARK);
    const fg = mix(c, hex("#ffffff"), whiteMixPct);
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${type}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }
});

/** The literal hex color of `:root[data-theme="dark"] #pdx-matchups .{cls} { color: #hex; }`. */
function darkBucketColor(cls: string): Hex {
  const m = MATCHUPS_ASTRO.match(
    new RegExp(
      `data-theme="dark"\\]\\s*#pdx-matchups \\.${cls}\\s*\\{\\s*color:\\s*(#[0-9a-f]{6})`,
    ),
  );
  if (!m) throw new Error(`dark-mode color for .${cls} not found`);
  return hex(m[1]!);
}

test("dark mode: every matchup multiplier bucket clears 4.5:1 against the box surface", () => {
  for (const cls of ["x4", "x2", "xh", "xq"]) {
    const ratio = contrastRatio(darkBucketColor(cls), SURFACE_DARK);
    expect(ratio, `${cls}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }
});

test("dark mode: the x0 (no-effect) label already relies on --text-2, which already passes", () => {
  // --text-2 in dark mode (tokens.css): #9a9aa3.
  expect(contrastRatio(hex("#9a9aa3"), SURFACE_DARK)).toBeGreaterThanOrEqual(
    4.5,
  );
});
