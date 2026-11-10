import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildHomeSet } from "../../../scripts/sprites/build-home";
import { SPRITE_SETS } from "../../../scripts/sprites/sets";

const FIXTURES = "tests/fixtures/sprites/home";

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "pokemon-dex-sprites-home-test-"));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

test("a HOME PNG fixture becomes a lossy WebP at most 192px, keyed by our Form.key", async () => {
  const config = { ...SPRITE_SETS.home };
  config.sources = {
    front: { dir: FIXTURES, ext: "png" },
    "front-shiny": { dir: `${FIXTURES}/shiny`, ext: "png" },
    "front-female": { dir: `${FIXTURES}/female`, ext: "png" },
    "front-shiny-female": { dir: `${FIXTURES}/shiny/female`, ext: "png" },
  };

  // Form key "1-mega" maps to upstream pokemonId 1 (the fixture's only front source file) --
  // this is the key -> pokemonId mapping `build-home.ts` is responsible for, decoupling our
  // Form.key naming from HOME's pokemonId-based filenames.
  const manifest = await buildHomeSet({
    config,
    src: ".",
    out: outDir,
    forms: [{ key: "1-mega", pokemonId: 1 }],
  });

  const file = Bun.file(`${outDir}/front/1-mega.webp`);
  expect(await file.exists()).toBe(true);

  const meta = await sharp(await file.arrayBuffer()).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.width).toBeLessThanOrEqual(192);
  expect(meta.height).toBeLessThanOrEqual(192);

  const srcMeta = await sharp(`${FIXTURES}/1.png`).metadata();
  expect(srcMeta.width).toBeGreaterThan(192); // the fixture is a native-size (512px) HOME render

  expect(manifest.sprites["1-mega"]?.front).toEqual({
    w: meta.width,
    h: meta.height,
  });
  expect(manifest.pixelated).toBe(false);
});

test("resolves front-shiny and front-female from their own pokemonId", async () => {
  const config = { ...SPRITE_SETS.home };
  config.sources = {
    front: { dir: FIXTURES, ext: "png" },
    "front-shiny": { dir: `${FIXTURES}/shiny`, ext: "png" },
    "front-female": { dir: `${FIXTURES}/female`, ext: "png" },
    "front-shiny-female": { dir: `${FIXTURES}/shiny/female`, ext: "png" },
  };

  const manifest = await buildHomeSet({
    config,
    src: ".",
    out: outDir,
    forms: [
      { key: "1", pokemonId: 1 },
      { key: "25", pokemonId: 25 },
    ],
  });

  expect(manifest.sprites["1"]?.["front-shiny"]).toBeDefined();
  expect(manifest.sprites["25"]?.["front-female"]).toBeDefined();
  expect(manifest.sprites["25"]?.["front-shiny-female"]).toBeDefined();
  // No HOME fixture file for plain "25" front-shiny-female vs. "1" front-female -- not provided.
  expect(manifest.sprites["1"]?.["front-female"]).toBeUndefined();
});

test("two keys sharing one pokemonId (a cosmetic form) each get their own output file", async () => {
  const config = { ...SPRITE_SETS.home };
  config.sources = { front: { dir: FIXTURES, ext: "png" } };

  const manifest = await buildHomeSet({
    config,
    src: ".",
    out: outDir,
    forms: [
      { key: "1", pokemonId: 1 },
      { key: "1-cosmetic", pokemonId: 1 },
    ],
  });

  expect(await Bun.file(`${outDir}/front/1.webp`).exists()).toBe(true);
  expect(await Bun.file(`${outDir}/front/1-cosmetic.webp`).exists()).toBe(true);
  expect(manifest.sprites["1-cosmetic"]?.front).toEqual(
    manifest.sprites["1"]?.front,
  );
});

test("builds a lossy atlas cell (<= atlasCell px) for default-form keys only", async () => {
  const config = { ...SPRITE_SETS.home };
  config.sources = { front: { dir: FIXTURES, ext: "png" } };

  const manifest = await buildHomeSet({
    config,
    src: ".",
    out: outDir,
    forms: [{ key: "1", pokemonId: 1 }],
  });

  const cell = manifest.atlas.front.cells["1"];
  expect(cell.w).toBeLessThanOrEqual(96);
  expect(cell.h).toBeLessThanOrEqual(96);
  expect(
    await Bun.file(`${outDir}/${manifest.atlas.front.file}`).exists(),
  ).toBe(true);
});

test("a missing source file is skipped rather than failing the build", async () => {
  const config = { ...SPRITE_SETS.home };
  config.sources = { front: { dir: FIXTURES, ext: "png" } };

  const manifest = await buildHomeSet({
    config,
    src: ".",
    out: outDir,
    forms: [
      { key: "1", pokemonId: 1 },
      { key: "999999", pokemonId: 999999 },
    ],
  });

  expect(manifest.sprites["999999"]).toBeUndefined();
  expect(manifest.sprites["1"]?.front).toBeDefined();
});

test("deletes stale files left over from a previous run", async () => {
  const config = { ...SPRITE_SETS.home };
  config.sources = { front: { dir: FIXTURES, ext: "png" } };
  await Bun.write(`${outDir}/front/stale.webp`, "stale");

  await buildHomeSet({
    config,
    src: ".",
    out: outDir,
    forms: [{ key: "1", pokemonId: 1 }],
  });

  expect(await Bun.file(`${outDir}/front/stale.webp`).exists()).toBe(false);
});
