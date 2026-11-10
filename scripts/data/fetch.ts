import { parseCsv } from "./csv";

/** Every PokeAPI CSV table used by the data build (Tasks 3-5). */
export const CSV_TABLES = [
  "pokemon",
  "pokemon_species",
  "pokemon_forms",
  "pokemon_evolution",
  "evolution_triggers",
  "pokemon_types",
  "pokemon_types_past",
  "pokemon_stats",
  "pokemon_stats_past",
  "pokemon_abilities",
  "pokemon_abilities_past",
  "type_efficacy",
  "type_efficacy_past",
  "types",
  "versions",
  "version_groups",
  "pokemon_species_flavor_text",
  "pokemon_species_names",
  "abilities",
  "ability_names",
  "items",
  "item_names",
  "locations",
  "location_names",
  "moves",
  "move_names",
  "egg_groups",
  "pokemon_egg_groups",
  "stats",
  "genders",
] as const;

/** The parsed CSV tables, keyed by table name. */
export type Tables = Record<
  (typeof CSV_TABLES)[number],
  Record<string, string>[]
>;

const CONCURRENCY = 8;

/**
 * Downloads every table in {@link CSV_TABLES} from the PokeAPI CSV data pinned at `sha`
 * into `dir`, skipping files already present. Runs up to 8 downloads concurrently.
 */
export async function fetchCsvs(
  sha: string,
  dir = ".cache/csv",
): Promise<void> {
  const queue = [...CSV_TABLES];

  async function worker(): Promise<void> {
    for (let name = queue.shift(); name; name = queue.shift()) {
      const dest = `${dir}/${name}.csv`;
      if (await Bun.file(dest).exists()) continue;

      const url = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${sha}/data/v2/csv/${name}.csv`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
        );
      }
      await Bun.write(dest, response);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
}

/** Reads and parses every table in {@link CSV_TABLES} from CSV files already in `dir`. */
export async function loadTables(dir = ".cache/csv"): Promise<Tables> {
  const entries = await Promise.all(
    CSV_TABLES.map(async (name) => {
      const text = await Bun.file(`${dir}/${name}.csv`).text();
      return [name, parseCsv(text)] as const;
    }),
  );
  return Object.fromEntries(entries) as Tables;
}
