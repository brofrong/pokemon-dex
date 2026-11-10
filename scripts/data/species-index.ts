import type { EvoNode } from "../../src/data/types";
import type { EvolutionContext } from "./evolution";
import { buildEvolutionTree } from "./evolution";
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

  return {
    species,
    defaultPokemon,
    namesBySpecies,
    flavorBySpecies,
    versionIdBySlug,
    versionGroupOrderBySlug,
    eggGroupsBySpecies,
  };
}

const evoTreeCache = new WeakMap<Tables, Map<number, EvoNode>>();

/** Builds (and caches per `t`) the full evolution tree for `chainId`, shared by every member. */
export function evolutionTreeFor(
  chainId: number,
  ctx: EvolutionContext,
  t: Tables,
): EvoNode {
  const cache = evoTreeCache.get(t) ?? new Map<number, EvoNode>();
  evoTreeCache.set(t, cache);

  const cached = cache.get(chainId);
  if (cached) return cached;

  const tree = buildEvolutionTree(chainId, ctx, t);
  cache.set(chainId, tree);
  return tree;
}
