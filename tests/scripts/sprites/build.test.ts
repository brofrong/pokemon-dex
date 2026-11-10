import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildSprites } from "../../../scripts/sprites/build";

const FIXTURES = "tests/fixtures/sprites";

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "pokemon-dex-sprites-test-"));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

function sumDelay(delay: number[] | undefined): number {
  return (delay ?? []).reduce((a, b) => a + b, 0);
}

test("builds an animated front/front-shiny pair, a front-female, a static back, and an atlas", async () => {
  const manifest = await buildSprites({
    src: FIXTURES,
    out: outDir,
    keys: ["4", "25"],
  });

  const frontFile = Bun.file(`${outDir}/front/4.webp`);
  expect(await frontFile.exists()).toBe(true);

  const frontBytes = await frontFile.arrayBuffer();
  const srcMeta = await sharp(`${FIXTURES}/4.gif`, {
    animated: true,
  }).metadata();
  // Read once without `{ animated: true }` for the per-frame pixel size (what the manifest
  // stores), and once with it for the page count / delay sequence.
  const frontMeta = await sharp(frontBytes).metadata();
  const frontAnimMeta = await sharp(frontBytes, { animated: true }).metadata();
  expect(frontAnimMeta.pages ?? 1).toBeGreaterThan(1);
  // libwebp's animation encoder losslessly merges pixel-identical adjacent frames -- Charmander's
  // frame 0 and frame 1 are pixel-identical with different delays (200ms, then 100ms), so they
  // collapse into one 300ms frame. The frame *count* can therefore differ from the source GIF's;
  // the total animation duration (and every visually distinct frame) must not.
  expect(sumDelay(frontAnimMeta.delay)).toBe(sumDelay(srcMeta.delay));

  const shinyMeta = await sharp(
    await Bun.file(`${outDir}/front-shiny/4.webp`).arrayBuffer(),
  ).metadata();
  expect(shinyMeta.width).toBe(frontMeta.width);
  expect(shinyMeta.height).toBe(frontMeta.height);

  expect(await Bun.file(`${outDir}/front-female/25.webp`).exists()).toBe(true);

  const backMeta = await sharp(
    await Bun.file(`${outDir}/back/4.webp`).arrayBuffer(),
  ).metadata();
  expect(backMeta.pages === undefined || backMeta.pages === 1).toBe(true);

  const frontCell = manifest.atlas.front.cells["4"];
  expect(frontCell).toEqual({
    x: expect.any(Number),
    y: expect.any(Number),
    w: frontMeta.width,
    h: frontMeta.height,
  });
  expect(
    await Bun.file(`${outDir}/${manifest.atlas.front.file}`).exists(),
  ).toBe(true);
  expect(manifest.atlas.front.file).toMatch(/^atlas-front\.[0-9a-f]{8}\.webp$/);
  expect(manifest.atlas["front-shiny"].file).toMatch(
    /^atlas-front-shiny\.[0-9a-f]{8}\.webp$/,
  );

  expect(manifest.sprites["4"]?.front).toEqual({
    w: frontMeta.width,
    h: frontMeta.height,
  });
  expect(manifest.sprites["4"]?.back).toBeDefined();
  expect(manifest.sprites["4"]?.["front-female"]).toBeUndefined();
  expect(manifest.sprites["25"]?.["front-female"]).toBeDefined();
  expect(manifest.sprites["25"]?.front).toBeUndefined();
  expect(manifest.canvas).toBe(96);
});

test("output bytes stay within a sane margin of the source GIF for each animated file", async () => {
  await buildSprites({ src: FIXTURES, out: outDir, keys: ["4", "25"] });

  const cases: Array<[string, string]> = [
    [`${FIXTURES}/4.gif`, `${outDir}/front/4.webp`],
    [`${FIXTURES}/shiny/4.gif`, `${outDir}/front-shiny/4.webp`],
    [`${FIXTURES}/female/25.gif`, `${outDir}/front-female/25.webp`],
  ];
  for (const [srcFile, outFile] of cases) {
    const srcBytes = Bun.file(srcFile).size;
    const outBytes = Bun.file(outFile).size;
    // Lossless WebP via sharp 0.35.5 (`{ lossless: true, effort: 6, minSize: true }`) lands
    // close to an already-optimized GIF's size for these small, low-color sprites -- sometimes
    // a little smaller, sometimes a little larger (measured here: 0.95x-1.12x). It is not the
    // >=10% reduction the WebP format achieves on photographic content, which is expected and
    // not worth chasing further (see constraints.md); this just guards against a regression that
    // would bloat it well past that, e.g. an accidental lossy/quality setting.
    expect(outBytes).toBeLessThanOrEqual(srcBytes * 1.2);
  }
});

test("deletes stale files left over from a previous run", async () => {
  await Bun.write(`${outDir}/front/stale.webp`, "stale");
  await Bun.write(`${outDir}/atlas-front.deadbeef.webp`, "stale-atlas");

  await buildSprites({ src: FIXTURES, out: outDir, keys: ["4"] });

  expect(await Bun.file(`${outDir}/front/stale.webp`).exists()).toBe(false);
  expect(await Bun.file(`${outDir}/atlas-front.deadbeef.webp`).exists()).toBe(
    false,
  );
});

test("a missing source file is skipped rather than failing the build", async () => {
  const manifest = await buildSprites({
    src: FIXTURES,
    out: outDir,
    keys: ["4", "999999"],
  });
  expect(manifest.sprites["999999"]).toBeUndefined();
  expect(manifest.sprites["4"]?.front).toBeDefined();
});
