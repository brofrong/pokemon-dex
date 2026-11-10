import { expect, test } from "bun:test";
import { SPRITE_SETS } from "../../../scripts/sprites/sets";
import type { SpriteSetId } from "../../../src/data/types";

const ALL_SET_IDS: SpriteSetId[] = ["rb", "gs", "rs", "dp", "bw", "home"];

test("covers all six sprite sets", () => {
  expect(Object.keys(SPRITE_SETS).sort()).toEqual([...ALL_SET_IDS].sort());
});

test("every set has at least a front source and lists it in variants", () => {
  for (const id of ALL_SET_IDS) {
    const config = SPRITE_SETS[id];
    expect(config.variants).toContain("front");
    expect(config.sources.front).toBeDefined();
  }
});

test("pixel sets are lossless and pixelated; home is lossy and not pixelated", () => {
  for (const id of ["rb", "gs", "rs", "dp", "bw"] as const) {
    expect(SPRITE_SETS[id].lossless).toBe(true);
    expect(SPRITE_SETS[id].pixelated).toBe(true);
  }
  expect(SPRITE_SETS.home.lossless).toBe(false);
  expect(SPRITE_SETS.home.pixelated).toBe(false);
});

test("rb has no shiny or female variants (generation I had neither)", () => {
  expect(SPRITE_SETS.rb.variants).toEqual(["front", "back"]);
});

test("dp has every variant, mirroring bw's own layout", () => {
  expect(SPRITE_SETS.dp.variants.sort()).toEqual(
    SPRITE_SETS.bw.variants.sort(),
  );
});

test("home resizes to 192px, is lossy quality 70, and sets a 96px atlas cell", () => {
  expect(SPRITE_SETS.home.resize).toBe(192);
  expect(SPRITE_SETS.home.quality).toBe(70);
  expect(SPRITE_SETS.home.atlasCell).toBe(96);
  expect(SPRITE_SETS.home.variants).not.toContain("back");
});
