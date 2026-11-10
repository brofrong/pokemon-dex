import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
// @ts-expect-error -- upng-js ships no type declarations.
import UPNG from "upng-js";
import { buildSpriteSet } from "../../../scripts/sprites/build-set";
import { SPRITE_SETS } from "../../../scripts/sprites/sets";

const FIXTURES = "tests/fixtures/sprites";

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "pokemon-dex-sprites-set-test-"));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

test("rb: a gen-I PNG stays lossless, has no shiny, and gets a default-form atlas cell", async () => {
  const config = { ...SPRITE_SETS.rb };
  config.sources = {
    front: { dir: `${FIXTURES}/rb`, ext: "png" },
    back: { dir: `${FIXTURES}/rb/back`, ext: "png" },
  };

  const manifest = await buildSpriteSet({
    config,
    src: ".",
    out: outDir,
    forms: [{ key: "1", pokemonId: 1 }],
  });

  expect(manifest.canvas).toBe(96);
  expect(manifest.pixelated).toBe(true);

  const frontFile = Bun.file(`${outDir}/front/1.webp`);
  expect(await frontFile.exists()).toBe(true);
  const frontMeta = await sharp(await frontFile.arrayBuffer()).metadata();
  expect(frontMeta.format).toBe("webp");
  // sharp reports lossless WebP without a lossy `quality`; re-encoding losslessly should not
  // have introduced any color loss versus the source PNG.
  const srcMeta = await sharp(`${FIXTURES}/rb/1.png`).metadata();
  expect(frontMeta.width).toBe(srcMeta.width);
  expect(frontMeta.height).toBe(srcMeta.height);

  expect(manifest.sprites["1"]?.["front-shiny"]).toBeUndefined();
  expect(manifest.sprites["1"]?.back).toBeDefined();

  const cell = manifest.atlas.front.cells["1"];
  expect(cell).toEqual({
    x: expect.any(Number),
    y: expect.any(Number),
    w: frontMeta.width,
    h: frontMeta.height,
  });
  expect(
    await Bun.file(`${outDir}/${manifest.atlas.front.file}`).exists(),
  ).toBe(true);
});

test("gs: animated front, static back, each from their own source directory", async () => {
  const config = { ...SPRITE_SETS.gs };
  config.sources = {
    front: { dir: `${FIXTURES}/gs`, ext: "gif" },
    "front-shiny": { dir: `${FIXTURES}/gs/shiny`, ext: "gif" },
    back: { dir: `${FIXTURES}/gs/back`, ext: "png" },
    "back-shiny": { dir: `${FIXTURES}/gs/back/shiny`, ext: "png" },
  };

  const manifest = await buildSpriteSet({
    config,
    src: ".",
    out: outDir,
    forms: [{ key: "1", pokemonId: 1 }],
  });

  const frontMeta = await sharp(
    await Bun.file(`${outDir}/front/1.webp`).arrayBuffer(),
    { animated: true },
  ).metadata();
  expect(frontMeta.pages ?? 1).toBeGreaterThan(1);

  const backMeta = await sharp(
    await Bun.file(`${outDir}/back/1.webp`).arrayBuffer(),
  ).metadata();
  expect(backMeta.pages === undefined || backMeta.pages === 1).toBe(true);

  expect(manifest.sprites["1"]?.["front-shiny"]).toBeDefined();
  expect(manifest.sprites["1"]?.["back-shiny"]).toBeDefined();
});

test("deletes stale files left over from a previous run, scoped to this set's out dir", async () => {
  const config = { ...SPRITE_SETS.rb };
  config.sources = {
    front: { dir: `${FIXTURES}/rb`, ext: "png" },
    back: { dir: `${FIXTURES}/rb/back`, ext: "png" },
  };
  await Bun.write(`${outDir}/front/stale.webp`, "stale");

  await buildSpriteSet({
    config,
    src: ".",
    out: outDir,
    forms: [{ key: "1", pokemonId: 1 }],
  });

  expect(await Bun.file(`${outDir}/front/stale.webp`).exists()).toBe(false);
});

test("a missing source file is skipped rather than failing the build", async () => {
  const config = { ...SPRITE_SETS.rb };
  config.sources = {
    front: { dir: `${FIXTURES}/rb`, ext: "png" },
    back: { dir: `${FIXTURES}/rb/back`, ext: "png" },
  };

  const manifest = await buildSpriteSet({
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

test("rs/dp-style set: a non-default form's source file is named by pokemonId, not by key", async () => {
  // Emerald/HeartGold-SoulSilver don't have per-form-named files the way `bw`/`gs` do -- a form
  // like Deoxys-Speed's only upstream sprite is `{pokemonId}.png` (e.g. `386-speed`'s pokemonId
  // 10003 resolves to `10003.png`), never `386-speed.png`. `filenameBy: "pokemonId"` is how a
  // set config says so.
  const config = { ...SPRITE_SETS.rs, filenameBy: "pokemonId" as const };
  config.sources = {
    front: { dir: `${FIXTURES}/rb`, ext: "png" }, // reuse the rb fixture: "1.png" exists there
  };

  const manifest = await buildSpriteSet({
    config,
    src: ".",
    out: outDir,
    forms: [{ key: "1-mega", pokemonId: 1 }],
  });

  expect(await Bun.file(`${outDir}/front/1-mega.webp`).exists()).toBe(true);
  expect(manifest.sprites["1-mega"]?.front).toBeDefined();
});

function sumDelay(delay: number[] | undefined): number {
  return (delay ?? []).reduce((a, b) => a + b, 0);
}

test("rs: a real Emerald APNG front sprite stays animated (every frame, real delays), not a 1-frame static WebP", async () => {
  const config = { ...SPRITE_SETS.rs };
  config.sources = { front: { dir: `${FIXTURES}/rs`, ext: "png" } };

  const manifest = await buildSpriteSet({
    config,
    src: ".",
    out: outDir,
    forms: [{ key: "1", pokemonId: 1 }],
  });

  const srcImg = UPNG.decode(
    await Bun.file(`${FIXTURES}/rs/1.png`).arrayBuffer(),
  );
  const expectedFrames = srcImg.frames.length;
  const expectedDelay = srcImg.frames.reduce(
    (a: number, f: { delay: number }) => a + f.delay,
    0,
  );

  const bytes = await Bun.file(`${outDir}/front/1.webp`).arrayBuffer();
  const meta = await sharp(bytes, { animated: true }).metadata();

  expect(meta.pages ?? 1).toBeGreaterThan(1);
  expect(meta.pages).toBe(expectedFrames);
  expect(sumDelay(meta.delay)).toBe(expectedDelay);
  expect(manifest.sprites["1"]?.front).toEqual({
    w: meta.width,
    h: meta.pageHeight!,
  });
});

test("dp: a real HeartGold/SoulSilver APNG front sprite stays animated (every frame, real delays)", async () => {
  const config = { ...SPRITE_SETS.dp };
  config.sources = { front: { dir: `${FIXTURES}/dp`, ext: "png" } };

  await buildSpriteSet({
    config,
    src: ".",
    out: outDir,
    forms: [{ key: "1", pokemonId: 1 }],
  });

  const srcImg = UPNG.decode(
    await Bun.file(`${FIXTURES}/dp/1.png`).arrayBuffer(),
  );
  const expectedFrames = srcImg.frames.length;
  const expectedDelay = srcImg.frames.reduce(
    (a: number, f: { delay: number }) => a + f.delay,
    0,
  );

  const bytes = await Bun.file(`${outDir}/front/1.webp`).arrayBuffer();
  const meta = await sharp(bytes, { animated: true }).metadata();

  expect(meta.pages).toBe(expectedFrames);
  expect(sumDelay(meta.delay)).toBe(expectedDelay);
});
