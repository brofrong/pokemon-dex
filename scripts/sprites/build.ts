import { readdir, rm, stat } from "node:fs/promises";
import sharp from "sharp";
import type {
  GenData,
  Size,
  SpriteManifest,
  Variant,
} from "../../src/data/types";
import { ANIMATED_VARIANTS } from "../../src/data/types";
import { DEFAULT_GEN, getGen } from "../../src/lib/generations";
import { fetchSprites, SPARSE_PATH } from "./fetch";
import { shelfPack } from "./pack";

/** Every variant the pipeline produces a file for (see `Variant`). */
const ALL_VARIANTS: Variant[] = [
  "front",
  "front-shiny",
  "back",
  "back-shiny",
  "front-female",
  "front-shiny-female",
  "back-female",
  "back-shiny-female",
];

const ANIMATED_SET = new Set<Variant>(ANIMATED_VARIANTS);

/** Upstream subdirectory (relative to the Black/White `animated/` root) each variant lives under. */
const VARIANT_SUBDIR: Record<Variant, string> = {
  front: "",
  "front-shiny": "shiny",
  "front-female": "female",
  "front-shiny-female": "shiny/female",
  back: "back",
  "back-shiny": "back/shiny",
  "back-female": "back/female",
  "back-shiny-female": "back/shiny/female",
};

const ATLAS_MAX_WIDTH = 2048;
const CANVAS = 96 as const;

/** A default form's sprite filename stem is just the species id, with no `-formSlug` suffix. */
const DEFAULT_FORM_KEY = /^\d+$/;

const PROGRESS_INTERVAL = 100;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function sourcePath(src: string, variant: Variant, key: string): string {
  const subdir = VARIANT_SUBDIR[variant];
  return subdir ? `${src}/${subdir}/${key}.gif` : `${src}/${key}.gif`;
}

function destPath(out: string, variant: Variant, key: string): string {
  return `${out}/${variant}/${key}.webp`;
}

/**
 * Converts one source GIF into a lossless WebP, returning its bytes and pixel dimensions.
 * Animated variants keep every frame (and the source's frame delays, which sharp carries over
 * unless told otherwise); back variants keep only the first frame -- Ruling R4 trades their
 * animation for a much smaller repo.
 */
async function convertOne(
  srcFile: string,
  animated: boolean,
): Promise<{ bytes: Uint8Array; size: Size }> {
  const input = Buffer.from(await Bun.file(srcFile).arrayBuffer());
  const image = animated
    ? sharp(input, { animated: true })
    : sharp(input, { pages: 1 });
  const pipeline = animated
    ? image.webp({ lossless: true, effort: 6, minSize: true, loop: 0 })
    : image.webp({ lossless: true, effort: 6 });
  const bytes = await pipeline.toBuffer();
  const meta = await sharp(bytes).metadata();
  return { bytes, size: { w: meta.width!, h: meta.height! } };
}

/** Runs `jobs` through a simple promise pool of `concurrency` workers, in input order per worker. */
async function runPool<T>(
  jobs: T[],
  concurrency: number,
  worker: (job: T) => Promise<void>,
): Promise<void> {
  const queue = [...jobs];
  const workerCount = Math.max(1, Math.min(concurrency, jobs.length) || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      await worker(job);
    }
  });
  await Promise.all(workers);
}

/** Every regular file under `dir`, as slash-joined paths relative to `dir`. Missing `dir` -> `[]`. */
async function listFilesRecursive(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await listFilesRecursive(`${dir}/${entry.name}`);
      files.push(...nested.map((f) => `${entry.name}/${f}`));
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files;
}

interface AtlasResult {
  file: string;
  width: number;
  height: number;
  cells: Record<string, { x: number; y: number; w: number; h: number }>;
  bytes: number;
}

/**
 * Packs the first frame of every default-form sprite available for `variant` into one atlas
 * image (shelf-packed, {@link ATLAS_MAX_WIDTH} wide), writes it to `out` with a content-hashed
 * filename (so the service worker can cache it forever), and returns its manifest entry.
 */
async function buildAtlas(
  src: string,
  out: string,
  variant: "front" | "front-shiny",
  defaultKeys: string[],
  sizes: Map<string, Size>,
): Promise<AtlasResult | undefined> {
  const rects = defaultKeys
    .filter((key) => sizes.has(key))
    .map((key) => ({ key, ...sizes.get(key)! }));
  if (rects.length === 0) return undefined;

  const { width, height, placements } = shelfPack(rects, ATLAS_MAX_WIDTH);

  const composites = await Promise.all(
    rects.map(async (rect) => {
      const srcFile = sourcePath(src, variant, rect.key);
      const input = Buffer.from(await Bun.file(srcFile).arrayBuffer());
      const frame = await sharp(input, { pages: 1 }).png().toBuffer();
      const { x, y } = placements[rect.key]!;
      return { input: frame, left: x, top: y };
    }),
  );

  const atlasBytes = await sharp({
    create: {
      width,
      height,
      channels: 4 as const,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ lossless: true, effort: 6 })
    .toBuffer();

  const hash = Bun.hash(atlasBytes).toString(16).padStart(16, "0").slice(0, 8);
  const fileName = `atlas-${variant}.${hash}.webp`;
  await Bun.write(`${out}/${fileName}`, atlasBytes);

  const cells: Record<string, { x: number; y: number; w: number; h: number }> =
    {};
  for (const rect of rects) {
    const { x, y } = placements[rect.key]!;
    cells[rect.key] = { x, y, w: rect.w, h: rect.h };
  }

  return { file: fileName, width, height, cells, bytes: atlasBytes.length };
}

export interface BuildSpritesOptions {
  src: string;
  out: string;
  keys: string[];
}

export interface BuildSpritesStats {
  manifest: SpriteManifest;
  countByVariant: Partial<Record<Variant, number>>;
  bytesByVariant: Partial<Record<Variant, number>>;
  atlasBytes: Partial<Record<"front" | "front-shiny", number>>;
  totalBytes: number;
}

/**
 * Converts every available sprite (across all 8 {@link Variant}s) for `keys` from the upstream
 * GIF layout at `src` into lossless WebP under `out`, builds the two first-frame atlases, deletes
 * anything under `out` this run didn't (re)produce, and returns the resulting manifest. A
 * variant/key combination with no source file is silently skipped (most non-default forms have
 * no back/female sprites at all, and a handful have no sprite whatsoever).
 */
export async function buildSprites(
  opts: BuildSpritesOptions,
): Promise<SpriteManifest> {
  return (await buildSpritesWithStats(opts)).manifest;
}

/** Same as {@link buildSprites}, but also returns the per-variant counts/bytes for reporting. */
export async function buildSpritesWithStats(
  opts: BuildSpritesOptions,
): Promise<BuildSpritesStats> {
  const { src, out, keys } = opts;
  const concurrency = navigator.hardwareConcurrency || 4;

  const sprites: Record<string, Partial<Record<Variant, Size>>> = {};
  const sizesByVariant = new Map<Variant, Map<string, Size>>(
    ALL_VARIANTS.map((v) => [v, new Map<string, Size>()]),
  );
  const produced = new Set<string>();
  const countByVariant: Partial<Record<Variant, number>> = {};
  const bytesByVariant: Partial<Record<Variant, number>> = {};
  let processed = 0;

  const jobs = keys.flatMap((key) =>
    ALL_VARIANTS.map((variant) => ({ key, variant })),
  );

  await runPool(jobs, concurrency, async ({ key, variant }) => {
    const srcFile = sourcePath(src, variant, key);
    if (!(await pathExists(srcFile))) return;

    const { bytes, size } = await convertOne(
      srcFile,
      ANIMATED_SET.has(variant),
    );
    await Bun.write(destPath(out, variant, key), bytes);
    produced.add(`${variant}/${key}.webp`);

    sprites[key] = sprites[key] ?? {};
    sprites[key]![variant] = size;
    sizesByVariant.get(variant)!.set(key, size);
    countByVariant[variant] = (countByVariant[variant] ?? 0) + 1;
    bytesByVariant[variant] = (bytesByVariant[variant] ?? 0) + bytes.length;

    processed++;
    if (processed % PROGRESS_INTERVAL === 0) {
      console.log(`[sprites] processed ${processed} files...`);
    }
  });

  const defaultKeys = keys.filter((key) => DEFAULT_FORM_KEY.test(key)).sort();
  const atlas = {} as SpriteManifest["atlas"];
  const atlasBytes: Partial<Record<"front" | "front-shiny", number>> = {};
  for (const variant of ["front", "front-shiny"] as const) {
    const result = await buildAtlas(
      src,
      out,
      variant,
      defaultKeys,
      sizesByVariant.get(variant)!,
    );
    if (result) {
      atlas[variant] = {
        file: result.file,
        width: result.width,
        height: result.height,
        cells: result.cells,
      };
      produced.add(result.file);
      atlasBytes[variant] = result.bytes;
    }
  }

  // Delete anything under `out` this run didn't (re)produce -- stale sprites from a dropped
  // form/variant, or an atlas from a previous run under its old content hash.
  const existing = await listFilesRecursive(out);
  await Promise.all(
    existing
      .filter((f) => !produced.has(f))
      .map((f) => rm(`${out}/${f}`, { force: true })),
  );

  // Rebuild every per-form variant map in a fixed (ALL_VARIANTS) key order: the promise pool
  // completes jobs in a nondeterministic order, so without this the JSON would differ byte-for-
  // byte between otherwise-identical runs even though its content never actually changes.
  const sortedSprites: Record<string, Partial<Record<Variant, Size>>> = {};
  for (const key of Object.keys(sprites).sort()) {
    const variants = sprites[key]!;
    const ordered: Partial<Record<Variant, Size>> = {};
    for (const variant of ALL_VARIANTS) {
      const size = variants[variant];
      if (size) ordered[variant] = size;
    }
    sortedSprites[key] = ordered;
  }

  const manifest: SpriteManifest = {
    canvas: CANVAS,
    pixelated: true,
    sprites: sortedSprites,
    atlas,
  };

  const totalBytes =
    Object.values(bytesByVariant).reduce((a, b) => a + b, 0) +
    Object.values(atlasBytes).reduce((a, b) => a + b, 0);

  return { manifest, countByVariant, bytesByVariant, atlasBytes, totalBytes };
}

const MANIFEST_PATH = "src/data/sprites/bw.json";
const OUT_DIR = "public/sprites/bw";
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Builds the `bw` sprite set (the only one this file knows how to build) and returns its stats,
 * without writing the manifest or doing any reporting -- `scripts/sprites/build-all.ts` calls
 * this directly so one orchestrator run covers every sprite set, including `bw`. Re-running this
 * against the same pinned `SPRITES_SHA` and the same `bw.json` dataset is deterministic, so the
 * `bw` output this produces is byte-identical to what's already committed.
 */
export async function buildBw(): Promise<BuildSpritesStats> {
  const gen = getGen(DEFAULT_GEN);
  if (!gen) throw new Error(`Unknown generation '${DEFAULT_GEN}'`);

  const data = JSON.parse(
    await Bun.file(`src/data/gen/${gen.id}.json`).text(),
  ) as GenData;
  const keys = [
    ...new Set(data.pokemon.flatMap((p) => p.forms.map((f) => f.key))),
  ].sort();

  const srcDir = `.cache/sprites/${SPARSE_PATH}`;
  return buildSpritesWithStats({ src: srcDir, out: OUT_DIR, keys });
}

async function main(): Promise<void> {
  await fetchSprites();

  const stats = await buildBw();

  await Bun.write(MANIFEST_PATH, JSON.stringify(stats.manifest));

  console.log(`[sprites] wrote ${MANIFEST_PATH} and ${OUT_DIR}/`);
  for (const variant of ALL_VARIANTS) {
    const count = stats.countByVariant[variant] ?? 0;
    const bytes = stats.bytesByVariant[variant] ?? 0;
    console.log(
      `[sprites]   ${variant}: ${count} files, ${formatBytes(bytes)}`,
    );
  }
  for (const variant of ["front", "front-shiny"] as const) {
    const entry = stats.manifest.atlas[variant];
    if (entry) {
      console.log(
        `[sprites]   atlas-${variant}: ${entry.file} (${entry.width}x${entry.height}, ` +
          `${formatBytes(stats.atlasBytes[variant] ?? 0)}, ${Object.keys(entry.cells).length} cells)`,
      );
    }
  }
  console.log(`[sprites] total: ${formatBytes(stats.totalBytes)}`);

  if (stats.totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(
      `public/sprites/bw totals ${formatBytes(stats.totalBytes)}, exceeding the ${formatBytes(MAX_TOTAL_BYTES)} budget -- stopping without committing.`,
    );
  }
}

if (import.meta.main) {
  await main();
}
