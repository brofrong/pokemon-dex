/**
 * Build-time accessors for the per-generation datasets (`src/data/gen/{id}.json`) and sprite
 * manifests (`src/data/sprites/{set}.json`). Vite's eager `import.meta.glob` bundles each JSON
 * file once into the build, so every page/endpoint shares one parsed copy instead of each route
 * importing the nine datasets itself. Pages only: `import.meta.glob` doesn't exist under
 * `bun test` (tests read the JSON files directly and exercise the pure helpers that take a
 * `GenData`), and nothing here ships to the browser.
 */
import type {
  GenData,
  GenId,
  SpriteManifest,
  SpriteSetId,
} from "../data/types";

const DATASETS = import.meta.glob<GenData>("../data/gen/*.json", {
  eager: true,
  import: "default",
});
const MANIFESTS = import.meta.glob<SpriteManifest>("../data/sprites/*.json", {
  eager: true,
  import: "default",
});

/** One generation's full dataset. Throws for a generation with no dataset. */
export function getGenData(gen: GenId): GenData {
  const data = DATASETS[`../data/gen/${gen}.json`];
  if (!data) throw new Error(`No dataset for generation '${gen}'`);
  return data;
}

/** One sprite set's manifest. Throws for a set with no manifest. */
export function getSpriteManifest(set: SpriteSetId): SpriteManifest {
  const manifest = MANIFESTS[`../data/sprites/${set}.json`];
  if (!manifest) throw new Error(`No sprite manifest for set '${set}'`);
  return manifest;
}

const slugSets = new Map<GenId, Set<string>>();

/** Whether a species with this slug exists in `gen` (for `switchGenUrl`). */
export function speciesExists(slug: string, gen: GenId): boolean {
  let slugs = slugSets.get(gen);
  if (!slugs) {
    slugs = new Set(getGenData(gen).pokemon.map((p) => p.slug));
    slugSets.set(gen, slugs);
  }
  return slugs.has(slug);
}
