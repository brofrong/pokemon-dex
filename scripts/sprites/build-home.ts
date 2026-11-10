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

/** One form the HOME build should produce sprites for: our `Form.key` (the output filename
 * stem) mapped to the upstream `pokemonId` (HOME's own filename stem). */
export interface HomeForm {
  key: string;
  pokemonId: number;
}

function destPath(out: string, variant: Variant, key: string): string {
  return `${out}/${variant}/${key}.webp`;
}

/** Resizes one HOME render to fit inside `size`x`size` (aspect kept, background transparent)
 * and encodes it as lossy WebP. */
async function convertOne(
  srcFile: string,
  size: number,
  quality: number,
): Promise<{ bytes: Uint8Array; dims: Size }> {
  const input = Buffer.from(await Bun.file(srcFile).arrayBuffer());
  const bytes = await sharp(input)
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .webp({ quality, alphaQuality: 90, effort: 6 })
    .toBuffer();
  const meta = await sharp(bytes).metadata();
  return { bytes, dims: { w: meta.width!, h: meta.height! } };
}

interface AtlasResult {
  file: string;
  width: number;
  height: number;
  cells: Record<string, { x: number; y: number; w: number; h: number }>;
  bytes: number;
}

/** Builds one variant's atlas by downscaling each default form's already-encoded sprite further
 * to fit inside `atlasCell`x`atlasCell`, shelf-packing the results, and encoding the composite
 * lossy (consistent with `home`'s own per-sprite files -- this is a photographic 3D render, not
 * pixel art, so there's no lossless-pixel-crispness reason to keep the atlas lossless). */
async function buildAtlas(
  variant: "front" | "front-shiny",
  defaultKeys: string[],
  encoded: Map<string, { bytes: Uint8Array; dims: Size }>,
  atlasCell: number,
  quality: number,
  out: string,
): Promise<AtlasResult | undefined> {
  const entries: { key: string; buf: Buffer; w: number; h: number }[] = [];
  for (const key of defaultKeys) {
    const source = encoded.get(key);
    if (!source) continue;
    const resized = await sharp(Buffer.from(source.bytes))
      .resize(atlasCell, atlasCell, { fit: "inside" })
      .png()
      .toBuffer();
    const meta = await sharp(resized).metadata();
    entries.push({ key, buf: resized, w: meta.width!, h: meta.height! });
  }
  if (entries.length === 0) return undefined;

  const { width, height, placements } = shelfPack(
    entries.map((e) => ({ key: e.key, w: e.w, h: e.h })),
    ATLAS_MAX_WIDTH,
  );

  const composites = entries.map((e) => ({
    input: e.buf,
    left: placements[e.key]!.x,
    top: placements[e.key]!.y,
  }));

  const atlasBytes = await sharp({
    create: {
      width,
      height,
      channels: 4 as const,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality, alphaQuality: 90, effort: 6 })
    .toBuffer();

  const hash = Bun.hash(atlasBytes).toString(16).padStart(16, "0").slice(0, 8);
  const fileName = `atlas-${variant}.${hash}.webp`;
  await Bun.write(`${out}/${fileName}`, atlasBytes);

  const cells: Record<string, { x: number; y: number; w: number; h: number }> =
    {};
  for (const e of entries) {
    const { x, y } = placements[e.key]!;
    cells[e.key] = { x, y, w: e.w, h: e.h };
  }

  return { file: fileName, width, height, cells, bytes: atlasBytes.length };
}

export interface BuildHomeOptions {
  config: SpriteSetConfig;
  /** Sparse `PokeAPI/sprites` checkout root; `config.sources[variant].dir` is relative to this. */
  src: string;
  out: string;
  forms: HomeForm[];
}

export interface BuildHomeStats {
  manifest: SpriteManifest;
  countByVariant: Partial<Record<Variant, number>>;
  bytesByVariant: Partial<Record<Variant, number>>;
  atlasBytes: Partial<Record<"front" | "front-shiny", number>>;
  totalBytes: number;
}

/**
 * Converts Pokémon HOME's pokemonId-named renders into our Form.key-named lossy WebP sprites,
 * resized to fit inside `config.resize`px. Several `forms` entries can share one `pokemonId`
 * (cosmetic forms, e.g. every Unown letter) -- the encoded bytes for a given (variant,
 * pokemonId) pair are produced once and written to every key that maps to it, so a cosmetic
 * form costs an extra file write, not an extra `sharp` conversion. A missing upstream file is
 * silently skipped (most forms have no shiny/female HOME render, some have none at all). Builds
 * the two first-frame-equivalent atlases (downscaled further, see `buildAtlas`), deletes anything
 * under `out` this run didn't (re)produce, and returns the resulting manifest.
 */
export async function buildHomeSet(
  opts: BuildHomeOptions,
): Promise<SpriteManifest> {
  return (await buildHomeSetWithStats(opts)).manifest;
}

export async function buildHomeSetWithStats(
  opts: BuildHomeOptions,
): Promise<BuildHomeStats> {
  const { config, src, out, forms } = opts;
  const resize = config.resize ?? 192;
  const quality = config.quality ?? 70;
  const atlasCell = config.atlasCell ?? resize;
  const concurrency = navigator.hardwareConcurrency || 4;

  const sprites: Record<string, Partial<Record<Variant, Size>>> = {};
  const produced = new Set<string>();
  const countByVariant: Partial<Record<Variant, number>> = {};
  const bytesByVariant: Partial<Record<Variant, number>> = {};
  // Cache per (variant, pokemonId): several `forms` entries (cosmetic forms) can share a
  // pokemonId and must not be re-converted with `sharp` once each.
  const cache = new Map<string, { bytes: Uint8Array; dims: Size } | null>();
  let processed = 0;

  const jobs = forms.flatMap((form) =>
    config.variants.map((variant) => ({ form, variant })),
  );

  await runPool(jobs, concurrency, async ({ form, variant }) => {
    const source = config.sources[variant];
    if (!source) return;

    const cacheKey = `${variant}/${form.pokemonId}`;
    let result = cache.get(cacheKey);
    if (result === undefined) {
      const srcFile = `${src}/${source.dir}/${form.pokemonId}.${source.ext}`;
      result = (await pathExists(srcFile))
        ? await convertOne(srcFile, resize, quality)
        : null;
      cache.set(cacheKey, result);
    }
    if (!result) return;

    await Bun.write(destPath(out, variant, form.key), result.bytes);
    produced.add(`${variant}/${form.key}.webp`);

    sprites[form.key] = sprites[form.key] ?? {};
    sprites[form.key]![variant] = result.dims;
    countByVariant[variant] = (countByVariant[variant] ?? 0) + 1;
    bytesByVariant[variant] =
      (bytesByVariant[variant] ?? 0) + result.bytes.length;

    processed++;
    if (processed % PROGRESS_INTERVAL === 0) {
      console.log(`[sprites:home] processed ${processed}/${jobs.length}...`);
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
    const encodedForVariant = new Map(
      defaultKeys
        .map((key) => {
          const form = forms.find((f) => f.key === key)!;
          const encoded = cache.get(`${variant}/${form.pokemonId}`);
          return encoded ? ([key, encoded] as const) : undefined;
        })
        .filter((e): e is [string, { bytes: Uint8Array; dims: Size }] => !!e),
    );
    const result = await buildAtlas(
      variant,
      defaultKeys,
      encodedForVariant,
      atlasCell,
      quality,
      out,
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
    canvas: 96,
    pixelated: config.pixelated,
    sprites: sortedSprites,
    atlas,
  };

  const totalBytes =
    Object.values(bytesByVariant).reduce((a, b) => a + b, 0) +
    Object.values(atlasBytes).reduce((a, b) => a + b, 0);

  return { manifest, countByVariant, bytesByVariant, atlasBytes, totalBytes };
}
