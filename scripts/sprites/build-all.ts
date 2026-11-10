import type { GenData } from "../../src/data/types";
import { buildBw } from "./build";
import { buildHomeSetWithStats, type HomeForm } from "./build-home";
import { buildSpriteSetWithStats } from "./build-set";
import { fetchSprites } from "./fetch";
import { SPRITE_SETS } from "./sets";
import { formatBytes } from "./util";

/** Sprite sets built one dataset at a time (the dataset's own id -- `src/data/gen/{id}.json` --
 * matches the sprite set id for every pixel set but `bw`, which `buildBw` already covers). */
const PIXEL_SET_IDS = ["rb", "gs", "rs", "dp"] as const;

/** Generations whose pages all share the `home` sprite set. */
const HOME_GEN_IDS = ["xy", "sm", "swsh", "sv"] as const;

const CACHE_ROOT = ".cache/sprites";
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

async function formsForGen(genId: string): Promise<HomeForm[]> {
  const data = JSON.parse(
    await Bun.file(`src/data/gen/${genId}.json`).text(),
  ) as GenData;
  const byKey = new Map<string, number>();
  for (const species of data.pokemon) {
    for (const form of species.forms) byKey.set(form.key, form.pokemonId);
  }
  return [...byKey.entries()]
    .map(([key, pokemonId]) => ({ key, pokemonId }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Merges the `Form.key` -> `pokemonId` mapping across every dataset at `genDataPaths` into one
 * shared list -- `home` is one Pokémon HOME render set shared by `xy`/`sm`/`swsh`/`sv`, so a
 * form that exists in several of those generations' datasets (almost all of them) must resolve
 * to the same sprite file either way.
 *
 * A key whose `pokemonId` disagrees between two datasets is a Task-3 forms data bug (confirmed
 * for Toxtricity's and Urshifu's Gigantamax forms: both of a species' two Gmax formes currently
 * get the same `{speciesId}-gmax` key), not something the sprite pipeline can resolve -- it
 * keeps the first value seen and logs a warning rather than failing the whole sprite build over
 * it.
 */
export async function collectHomeForms(
  genDataPaths: string[] = HOME_GEN_IDS.map((id) => `src/data/gen/${id}.json`),
): Promise<HomeForm[]> {
  const keyToPokemonId = new Map<string, number>();
  for (const genDataPath of genDataPaths) {
    const data = JSON.parse(await Bun.file(genDataPath).text()) as GenData;
    for (const species of data.pokemon) {
      for (const form of species.forms) {
        const existing = keyToPokemonId.get(form.key);
        if (existing !== undefined) {
          if (existing !== form.pokemonId) {
            console.warn(
              `[sprites:home] form '${form.key}' maps to pokemonId ${existing} in an earlier ` +
                `dataset but ${form.pokemonId} in '${genDataPath}' -- keeping ${existing}`,
            );
          }
          continue;
        }
        keyToPokemonId.set(form.key, form.pokemonId);
      }
    }
  }
  return [...keyToPokemonId.entries()]
    .map(([key, pokemonId]) => ({ key, pokemonId }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

interface SetReport {
  set: string;
  files: number;
  bytes: number;
}

function totalFiles(countByVariant: Partial<Record<string, number>>): number {
  return Object.values(countByVariant).reduce(
    (a: number, b) => a + (b ?? 0),
    0,
  );
}

async function main(): Promise<void> {
  await fetchSprites();

  const reports: SetReport[] = [];
  let grandTotal = 0;

  console.log("[sprites] building bw...");
  const bwStats = await buildBw();
  await Bun.write("src/data/sprites/bw.json", JSON.stringify(bwStats.manifest));
  reports.push({
    set: "bw",
    files: totalFiles(bwStats.countByVariant),
    bytes: bwStats.totalBytes,
  });
  grandTotal += bwStats.totalBytes;

  for (const setId of PIXEL_SET_IDS) {
    console.log(`[sprites] building ${setId}...`);
    const config = SPRITE_SETS[setId];
    const forms = await formsForGen(setId);
    const stats = await buildSpriteSetWithStats({
      config,
      src: CACHE_ROOT,
      out: `public/sprites/${setId}`,
      forms,
    });
    await Bun.write(
      `src/data/sprites/${setId}.json`,
      JSON.stringify(stats.manifest),
    );
    reports.push({
      set: setId,
      files: totalFiles(stats.countByVariant),
      bytes: stats.totalBytes,
    });
    grandTotal += stats.totalBytes;
  }

  console.log("[sprites] building home...");
  const homeForms = await collectHomeForms();
  const homeStats = await buildHomeSetWithStats({
    config: SPRITE_SETS.home,
    src: CACHE_ROOT,
    out: "public/sprites/home",
    forms: homeForms,
  });
  await Bun.write(
    "src/data/sprites/home.json",
    JSON.stringify(homeStats.manifest),
  );
  reports.push({
    set: "home",
    files: totalFiles(homeStats.countByVariant),
    bytes: homeStats.totalBytes,
  });
  grandTotal += homeStats.totalBytes;

  console.log("[sprites] --- report ---");
  for (const r of reports) {
    console.log(
      `[sprites]   ${r.set}: ${r.files} files, ${formatBytes(r.bytes)}`,
    );
  }
  console.log(`[sprites] grand total: ${formatBytes(grandTotal)}`);

  if (grandTotal > MAX_TOTAL_BYTES) {
    throw new Error(
      `public/sprites totals ${formatBytes(grandTotal)}, exceeding the ${formatBytes(MAX_TOTAL_BYTES)} budget -- stopping without committing.`,
    );
  }
}

if (import.meta.main) {
  await main();
}
