/**
 * WCAG 2.x relative-luminance contrast ratio (the same formula `tests/lib/contrast.test.ts` uses
 * to guard every type color's badge text and the matchup multiplier colors, QA bug #18).
 * `mix`/`composite` mirror what CSS `color-mix(in srgb, ...)` and alpha-compositing actually do
 * (simple per-channel interpolation of the non-linear sRGB bytes), so the numbers these compute
 * match what a browser renders for the equivalent `color-mix()`/translucent-background CSS.
 */

export type Hex = `#${string}`;

function hexToRgb(hex: Hex): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: readonly number[]): Hex {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}` as Hex;
}

function srgbToLinear(c: number): number {
  const n = c / 255;
  return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0-1). */
export function relativeLuminance(hex: Hex): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two opaque colors, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Hex, b: Hex): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/** `color-mix(in srgb, a pctA%, b)`: a straight per-channel blend of the two sRGB colors. */
export function mix(a: Hex, b: Hex, pctA: number): Hex {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return toHex([
    ar * pctA + br * (1 - pctA),
    ag * pctA + bg * (1 - pctA),
    ab * pctA + bb * (1 - pctA),
  ]);
}

/** `fg` at `alpha` opacity, alpha-composited over the opaque `bg` -- e.g. a translucent
 *  `color-mix(in srgb, var(--c) 14%, transparent)` badge background painted over its surface. */
export function composite(fg: Hex, alpha: number, bg: Hex): Hex {
  return mix(fg, bg, alpha);
}
