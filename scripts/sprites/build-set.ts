import sharp from "sharp";
import type { Size, SpriteManifest, Variant } from "../../src/data/types";
import { shelfPack } from "./pack";
import type { SpriteSetConfig } from "./sets";
import {
  ATLAS_MAX_WIDTH,
  cleanupStale,
  DEFAULT_FORM_KEY,
  pathExists,
  PROGRESS_INTERVAL,
  runPool,
} from "./util";

const CANVAS = 96 as const;

/** One form the pixel-set build should produce sprites for: our `Form.key` (always the output
 * filename stem) and its `pokemonId` (the upstream filename stem for sets whose non-default-form
 * files are named by pokemonId -- see `SpriteSetConfig.filenameBy`). */
export interface SpriteForm {
  key: string;
  pokemonId: number;
}

/** The upstream filename stem for `form`, per `config.filenameBy`. A default form's `key` and
 * `pokemonId` are always the same number, so this only matters for non-default forms. */
function stemFor(config: SpriteSetConfig, form: SpriteForm): string {
  return config.filenameBy === "pokemonId" ? String(form.pokemonId) : form.key;
}

function sourcePath(
  config: SpriteSetConfig,
  variant: Variant,
  stem: string,
): string | undefined {
  const source = config.sources[variant];
  if (!source) return undefined;
  return `${source.dir}/${stem}.${source.ext}`;
}

function destPath(out: string, variant: Variant, key: string): string {
  return `${out}/${variant}/${key}.webp`;
}

/**
 * Converts one source image into a lossless WebP, returning its bytes and pixel dimensions.
 * Animated variants keep every frame (and the source's frame delays); everything else keeps
 * only the first frame -- the same trade-off `scripts/sprites/build.ts` makes for `bw`'s back
 * sprites, applied here to every set's back variants.
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

interface AtlasResult {
  file: string;
  width: number;
  height: number;
  cells: Record<string, { x: number; y: number; w: number; h: number }>;
  bytes: number;
}

/** Packs the first frame of every default-form sprite available for `variant` into one atlas
 * image, lossless, with a content-hashed filename -- mirrors `build.ts`'s `buildAtlas` for `bw`,
 * generalized to any pixel set's source layout. */
async function buildAtlas(
  config: SpriteSetConfig,
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
      const srcFile = sourcePath(config, variant, rect.key)!;
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

export interface BuildSetOptions {
  config: SpriteSetConfig;
  /** Sparse `PokeAPI/sprites` checkout root; `config.sources[variant].dir` is relative to this. */
  src: string;
  out: string;
  forms: SpriteForm[];
}

export interface BuildSetStats {
  manifest: SpriteManifest;
  countByVariant: Partial<Record<Variant, number>>;
  bytesByVariant: Partial<Record<Variant, number>>;
  atlasBytes: Partial<Record<"front" | "front-shiny", number>>;
  totalBytes: number;
}

/**
 * Converts every available sprite (across `config.variants`) for `keys` from its upstream source
 * layout into lossless WebP under `out`, builds the two first-frame atlases, deletes anything
 * under `out` this run didn't (re)produce, and returns the resulting manifest. A variant/key
 * combination with no source file is silently skipped. Generalizes `build.ts`'s `bw`-only
 * pipeline to any pixel sprite set (`rb`, `gs`, `rs`, `dp`); `home`'s lossy, resized, pokemonId-
 * keyed renders are built separately by `build-home.ts`.
 */
export async function buildSpriteSet(
  opts: BuildSetOptions,
): Promise<SpriteManifest> {
  return (await buildSpriteSetWithStats(opts)).manifest;
}

export async function buildSpriteSetWithStats(
  opts: BuildSetOptions,
): Promise<BuildSetStats> {
  const { config, src, out, forms } = opts;
  const concurrency = navigator.hardwareConcurrency || 4;

  const animatedSet = new Set(config.animatedVariants);
  const sprites: Record<string, Partial<Record<Variant, Size>>> = {};
  const sizesByVariant = new Map<Variant, Map<string, Size>>(
    config.variants.map((v) => [v, new Map<string, Size>()]),
  );
  const produced = new Set<string>();
  const countByVariant: Partial<Record<Variant, number>> = {};
  const bytesByVariant: Partial<Record<Variant, number>> = {};
  let processed = 0;

  const jobs = forms.flatMap((form) =>
    config.variants.map((variant) => ({ form, variant })),
  );

  await runPool(jobs, concurrency, async ({ form, variant }) => {
    const relative = sourcePath(config, variant, stemFor(config, form));
    if (!relative) return;
    const srcFile = `${src}/${relative}`;
    if (!(await pathExists(srcFile))) return;

    const { bytes, size } = await convertOne(srcFile, animatedSet.has(variant));
    await Bun.write(destPath(out, variant, form.key), bytes);
    produced.add(`${variant}/${form.key}.webp`);

    sprites[form.key] = sprites[form.key] ?? {};
    sprites[form.key]![variant] = size;
    sizesByVariant.get(variant)!.set(form.key, size);
    countByVariant[variant] = (countByVariant[variant] ?? 0) + 1;
    bytesByVariant[variant] = (bytesByVariant[variant] ?? 0) + bytes.length;

    processed++;
    if (processed % PROGRESS_INTERVAL === 0) {
      console.log(
        `[sprites:${config.id}] processed ${processed}/${jobs.length}...`,
      );
    }
  });

  const defaultKeys = forms
    .map((f) => f.key)
    .filter((key) => DEFAULT_FORM_KEY.test(key))
    .sort();
  const atlas = {} as SpriteManifest["atlas"];
  const atlasBytes: Partial<Record<"front" | "front-shiny", number>> = {};
  for (const variant of ["front", "front-shiny"] as const) {
    if (!config.sources[variant]) continue;
    const srcDir = config.sources[variant]!.dir;
    const result = await buildAtlas(
      {
        ...config,
        sources: {
          [variant]: {
            dir: `${src}/${srcDir}`,
            ext: config.sources[variant]!.ext,
          },
        },
      },
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

  await cleanupStale(out, produced);

  // Rebuild every per-form variant map in a fixed (`config.variants`) key order: the promise pool
  // completes jobs in a nondeterministic order, so without this the JSON would differ byte-for-
  // byte between otherwise-identical runs even though its content never actually changes.
  const sortedSprites: Record<string, Partial<Record<Variant, Size>>> = {};
  for (const key of Object.keys(sprites).sort()) {
    const variants = sprites[key]!;
    const ordered: Partial<Record<Variant, Size>> = {};
    for (const variant of config.variants) {
      const size = variants[variant];
      if (size) ordered[variant] = size;
    }
    sortedSprites[key] = ordered;
  }

  const manifest: SpriteManifest = {
    canvas: CANVAS,
    pixelated: config.pixelated,
    sprites: sortedSprites,
    atlas,
  };

  const totalBytes =
    Object.values(bytesByVariant).reduce((a, b) => a + b, 0) +
    Object.values(atlasBytes).reduce((a, b) => a + b, 0);

  return { manifest, countByVariant, bytesByVariant, atlasBytes, totalBytes };
}
