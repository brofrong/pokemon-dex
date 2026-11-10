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

/**
 * Fix round 2: the tests above check a badge against a *plain* `.box`-style surface, but a type
 * badge in the Hero (`Hero.astro`) sits on `.hero`'s own background -- itself
 * `color-mix(var(--c) var(--tint), var(--surface))` -- so the badge's own translucent tint paints
 * *over* an already-tinted panel, not over the plain surface. That compounds to roughly
 * `tint * (2 - tint)` of `--c` (~26% instead of 14% in light mode, ~39% instead of 22% in dark),
 * which thins the margin considerably (worst case measured: ice ~4.72:1 light, `dark` type
 * ~4.43:1 dark -- the latter actually *failed* 4.5:1 at the formula's previous 60% dark-mode
 * value). Modeled here as two real nested `composite()` calls -- the same stacking the CSS does
 * -- rather than the algebraic shortcut, so it can't drift from what the browser actually paints.
 * Target 4.6:1 (not just 4.5) for a little headroom against rounding/anti-aliasing.
 */
function heroBadgeBackground(c: Hex, tint: number, surface: Hex): Hex {
  const heroPanel = composite(c, tint, surface);
  return composite(c, tint, heroPanel);
}

const HERO_CONTRAST_TARGET = 4.6;

test("light mode: every type's .tb text clears 4.6:1 against the Hero's double-tinted background", () => {
  const blackMixPct = mixPercent(
    TOKENS_CSS,
    /\.tb\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--c\) (\d+)%, black\)/,
  );
  for (const [type, c] of TYPES) {
    const bg = heroBadgeBackground(c, TINT_LIGHT, SURFACE_LIGHT);
    const fg = mix(c, hex("#000000"), blackMixPct);
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${type}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      HERO_CONTRAST_TARGET,
    );
  }
});

test("dark mode: every type's .tb text clears 4.6:1 against the Hero's double-tinted background", () => {
  const whiteMixPct = mixPercent(
    TOKENS_CSS,
    /data-theme="dark"\]\s*\.tb\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--c\) (\d+)%, #fff\)/,
  );
  for (const [type, c] of TYPES) {
    const bg = heroBadgeBackground(c, TINT_DARK, SURFACE_DARK);
    const fg = mix(c, hex("#ffffff"), whiteMixPct);
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${type}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      HERO_CONTRAST_TARGET,
    );
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

test("dark mode: every matchup multiplier bucket clears 4.5:1 against its actual background", () => {
  // Unlike a type badge, `TypeMatchups.astro` is only ever rendered inside a plain `.box`
  // (`[lang]/[gen]/pokemon/[slug]/index.astro`), never inside the Hero -- so `SURFACE_DARK` here
  // *is* its real, actual background; there's no second tinted layer to account for.
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
