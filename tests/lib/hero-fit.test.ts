/**
 * Guards the hero sprite against overflowing its stage (Task 8 fix rounds 1-2): every form of
 * every sprite set, at the scale `heroFit` picks, must fit the narrowest stage the hero ever has
 * (`HERO_MIN_STAGE_W`, a 320px phone) -- wider screens give the stage column at least that much.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SpriteManifest } from "../../src/data/types";
import { HERO_MIN_STAGE_W, HERO_SCALE, heroFit } from "../../src/lib/sprites";

const SETS = ["rb", "gs", "rs", "dp", "bw", "home"] as const;
const manifest = (set: string): SpriteManifest =>
  JSON.parse(
    readFileSync(
      path.join(import.meta.dir, `../../src/data/sprites/${set}.json`),
      "utf-8",
    ),
  );

test("the minimum stage width matches a 320px phone minus the hero's margins and padding", () => {
  expect(HERO_MIN_STAGE_W).toBe(272);
});

test("heroFit keeps 2x when it fits, drops to 1x (never a fraction) when it doesn't", () => {
  expect(
    heroFit({ front: { w: 80, h: 70 }, back: { w: 90, h: 60 } }, true),
  ).toEqual({
    scale: 2,
    w: 180,
    h: 140,
  });
  expect(heroFit({ front: { w: 136, h: 50 } }, true).scale).toBe(2);
  expect(heroFit({ front: { w: 140, h: 140 } }, true)).toEqual({
    scale: 1,
    w: 140,
    h: 140,
  });
  // HOME renders are stored at 2x density: 192px files are 96 CSS px.
  expect(heroFit({ front: { w: 192, h: 192 } }, false)).toEqual({
    scale: 2,
    w: 192,
    h: 192,
  });
  expect(heroFit({}, true)).toEqual({ scale: HERO_SCALE, w: 0, h: 0 });
});

for (const set of SETS) {
  test(`every ${set} form's hero sprite fits the narrowest stage`, () => {
    const m = manifest(set);
    const tooWide: string[] = [];
    for (const [key, entry] of Object.entries(m.sprites)) {
      const fit = heroFit(entry, m.pixelated);
      expect(Number.isInteger(fit.scale)).toBe(true);
      if (fit.w > HERO_MIN_STAGE_W) tooWide.push(`${key} (${fit.w}px)`);
    }
    expect(tooWide).toEqual([]);
  });
}

test("only the handful of extra-wide pixel forms drop to 1x", () => {
  const atOne = SETS.flatMap((set) => {
    const m = manifest(set);
    return Object.entries(m.sprites)
      .filter(([, entry]) => heroFit(entry, m.pixelated).scale === 1)
      .map(([key]) => `${set}:${key}`);
  });
  // dp Scizor (140px), bw Lugia (153px) and Swanna (137px) as of this writing.
  expect(atOne.length).toBeLessThanOrEqual(5);
});
