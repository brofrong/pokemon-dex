import type { EvoNode } from "../../src/data/types";
import type { EvolutionContext } from "./evolution";
import { buildEvolutionTreeFor, evolutionRoot } from "./evolution";
import type { Tables } from "./fetch";

/** The `pokemon_species` fields `buildGeneration` reads, parsed out of their raw CSV strings. */
export interface SpeciesRow {
  id: number;
  identifier: string;
  generationId: number;
  evolutionChainId: number;
  genderRate: number;
  captureRate: number;
  hatchCounter: number;
  isBaby: boolean;
  isLegendary: boolean;
  isMythical: boolean;
  hasGenderDiff: boolean;
}

/** The species' default `pokemon` row: the one whose base data represents the species itself. */
export interface DefaultPokemon {
  id: number;
  heightDm: number;
  weightHg: number;
}

/**
 * Collapses PokeAPI's line breaks (`\n`), page breaks (`\f`, used as a box-wrap hint in some
 * flavor text) and soft hyphens into single spaces, and trims the result.
 */
export function normalizeFlavorText(text: string): string {
  return text
    .replace(/[\n\f­]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every per-species lookup `buildGeneration` needs, built once from the raw tables. */
export interface SpeciesIndex {
  species: Map<number, SpeciesRow>;
  defaultPokemon: Map<number, DefaultPokemon>;
  namesBySpecies: Map<number, { name: string; genus: string }>;
  /** English (language 9) flavor text, by species id then `versions.id`. */
  flavorBySpecies: Map<number, Map<number, string>>;
  versionIdBySlug: Map<string, number>;
  versionGroupOrderBySlug: Map<string, number>;
  eggGroupsBySpecies: Map<number, string[]>;
  /** species id -> `version_groups.order` its default form was introduced in. */
  introducedOrderBySpecies: Map<number, number>;
}

export function buildSpeciesIndex(t: Tables): SpeciesIndex {
  const species = new Map<number, SpeciesRow>();
  for (const row of t.pokemon_species) {
    species.set(Number(row.id), {
      id: Number(row.id),
      identifier: row.identifier,
      generationId: Number(row.generation_id),
      evolutionChainId: Number(row.evolution_chain_id),
      genderRate: Number(row.gender_rate),
      captureRate: Number(row.capture_rate),
      hatchCounter: Number(row.hatch_counter),
      isBaby: row.is_baby === "1",
      isLegendary: row.is_legendary === "1",
      isMythical: row.is_mythical === "1",
      hasGenderDiff: row.has_gender_differences === "1",
    });
  }

  const defaultPokemon = new Map<number, DefaultPokemon>();
  for (const row of t.pokemon) {
    if (row.is_default !== "1") continue;
    defaultPokemon.set(Number(row.species_id), {
      id: Number(row.id),
      heightDm: Number(row.height),
      weightHg: Number(row.weight),
    });
  }

  const namesBySpecies = new Map<number, { name: string; genus: string }>();
  for (const row of t.pokemon_species_names) {
    if (row.local_language_id !== "9") continue;
    namesBySpecies.set(Number(row.pokemon_species_id), {
      name: row.name,
      genus: row.genus,
    });
  }

  const flavorBySpecies = new Map<number, Map<number, string>>();
  for (const row of t.pokemon_species_flavor_text) {
    if (row.language_id !== "9") continue;
    const speciesId = Number(row.species_id);
    const byVersion =
      flavorBySpecies.get(speciesId) ?? new Map<number, string>();
    byVersion.set(Number(row.version_id), row.flavor_text);
    flavorBySpecies.set(speciesId, byVersion);
  }

  const versionIdBySlug = new Map<string, number>();
  for (const row of t.versions) {
    versionIdBySlug.set(row.identifier, Number(row.id));
  }

  const versionGroupOrderBySlug = new Map<string, number>();
  for (const row of t.version_groups) {
    versionGroupOrderBySlug.set(row.identifier, Number(row.order));
  }

  const eggGroupIdentifierById = new Map<number, string>();
  for (const row of t.egg_groups) {
    eggGroupIdentifierById.set(Number(row.id), row.identifier);
  }
  const eggGroupsBySpecies = new Map<number, string[]>();
  for (const row of t.pokemon_egg_groups) {
    const identifier = eggGroupIdentifierById.get(Number(row.egg_group_id));
    if (!identifier) continue;
    const speciesId = Number(row.species_id);
    const list = eggGroupsBySpecies.get(speciesId) ?? [];
    list.push(identifier);
    eggGroupsBySpecies.set(speciesId, list);
  }
  for (const list of eggGroupsBySpecies.values()) list.sort();

  const versionGroupOrderById = new Map<string, number>();
  for (const row of t.version_groups) {
    versionGroupOrderById.set(row.id, Number(row.order));
  }
  const speciesByDefaultPokemon = new Map<number, number>();
  for (const [speciesId, pokemon] of defaultPokemon) {
    speciesByDefaultPokemon.set(pokemon.id, speciesId);
  }
  const introducedOrderBySpecies = new Map<number, number>();
  for (const row of t.pokemon_forms) {
    if (row.is_default !== "1") continue;
    const speciesId = speciesByDefaultPokemon.get(Number(row.pokemon_id));
    const order = versionGroupOrderById.get(row.introduced_in_version_group_id);
    if (speciesId !== undefined && order !== undefined) {
      introducedOrderBySpecies.set(speciesId, order);
    }
  }

  return {
    species,
    defaultPokemon,
    namesBySpecies,
    flavorBySpecies,
    versionIdBySlug,
    versionGroupOrderBySlug,
    eggGroupsBySpecies,
    introducedOrderBySpecies,
  };
}

const evoTreeCache = new WeakMap<Tables, Map<string, EvoNode>>();

/**
 * Builds (and caches per `t` and `ctx`) the evolution tree `speciesId` belongs to in `ctx`,
 * shared by every member of that tree (see `evolutionRoot` for where it's rooted).
 */
export function evolutionTreeFor(
  speciesId: number,
  ctx: EvolutionContext,
  t: Tables,
): EvoNode {
  const cache = evoTreeCache.get(t) ?? new Map<string, EvoNode>();
  evoTreeCache.set(t, cache);

  const root = evolutionRoot(speciesId, ctx.maxSpeciesId, t);
  const key = `${ctx.gen}|${ctx.versionGroup}|${ctx.maxOrder ?? ""}|${ctx.maxSpeciesId}|${root}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const tree = buildEvolutionTreeFor(root, ctx, t);
  cache.set(key, tree);
  return tree;
}
