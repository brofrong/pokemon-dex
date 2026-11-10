import type { EvoNode, Flag, GenData, Pokemon } from "../../src/data/types";
import type { GenConfig } from "../../src/lib/generations";
import { DEFAULT_GEN, getGen } from "../../src/lib/generations";
import { POKEAPI_SHA } from "../pins";
import { buildForms } from "./forms";
import { fetchCsvs, loadTables, type Tables } from "./fetch";
import {
  emptyReferencedNames,
  buildNames,
  type ReferencedNames,
} from "./names";
import {
  abilitiesAt,
  statsAt,
  typeChartAt,
  typesAt,
  typesInGen,
} from "./resolve";
import {
  buildSpeciesIndex,
  evolutionTreeFor,
  normalizeFlavorText,
  type SpeciesIndex,
} from "./species-index";
import {
  applySpriteAvailability,
  loadSpriteManifest,
} from "./sprite-availability";

/** Collects every item/held item/location/move slug referenced by `node` or its descendants. */
function collectEvolutionNames(
  node: EvoNode,
  referenced: ReferencedNames,
): void {
  for (const condition of node.conditions) {
    if (condition.item) referenced.items.add(condition.item);
    if (condition.heldItem) referenced.items.add(condition.heldItem);
    if (condition.location) referenced.locations.add(condition.location);
    if (condition.knownMove) referenced.moves.add(condition.knownMove);
  }
  for (const child of node.children) collectEvolutionNames(child, referenced);
}

function buildPokemon(
  id: number,
  gen: GenConfig,
  idx: SpeciesIndex,
  blackWhiteOrder: number,
  referenced: ReferencedNames,
  t: Tables,
): Pokemon {
  const species = idx.species.get(id);
  if (!species) throw new Error(`No pokemon_species row for species ${id}`);

  const defaultPokemon = idx.defaultPokemon.get(id);
  if (!defaultPokemon)
    throw new Error(`No default pokemon row for species ${id}`);

  const names = idx.namesBySpecies.get(id);
  if (!names) throw new Error(`No English name for species ${id}`);

  const abilities = abilitiesAt(defaultPokemon.id, gen.number, t);
  for (const ability of abilities) referenced.abilities.add(ability.slug);

  const eggGroups = idx.eggGroupsBySpecies.get(id) ?? [];
  for (const eggGroup of eggGroups) referenced.eggGroups.add(eggGroup);

  const flags: Flag[] = [];
  if (species.isLegendary) flags.push("legendary");
  if (species.isMythical) flags.push("mythical");
  if (species.isBaby) flags.push("baby");
  if (species.generationId === gen.number) flags.push("new");

  const flavor: Partial<Record<string, string>> = {};
  const flavorByVersion = idx.flavorBySpecies.get(id);
  for (const versionSlug of gen.versions) {
    const versionId = idx.versionIdBySlug.get(versionSlug);
    const raw =
      versionId !== undefined ? flavorByVersion?.get(versionId) : undefined;
    if (raw) flavor[versionSlug] = normalizeFlavorText(raw);
  }

  const evolution = evolutionTreeFor(
    species.evolutionChainId,
    {
      gen: gen.number,
      versionGroup: gen.versionGroup,
      maxSpeciesId: gen.maxSpeciesId,
    },
    t,
  );
  collectEvolutionNames(evolution, referenced);

  const forms = buildForms(id, gen.number, blackWhiteOrder, t);
  for (const form of forms) {
    for (const ability of form.abilities)
      referenced.abilities.add(ability.slug);
  }

  return {
    id,
    slug: species.identifier,
    name: names.name,
    genus: names.genus,
    types: typesAt(defaultPokemon.id, gen.number, t),
    stats: statsAt(defaultPokemon.id, gen.number, t),
    abilities,
    flags,
    heightDm: defaultPokemon.heightDm,
    weightHg: defaultPokemon.weightHg,
    genderRate: species.genderRate,
    eggGroups,
    hatchCounter: species.hatchCounter,
    captureRate: species.captureRate,
    hasGenderDiff: species.hasGenderDiff,
    flavor,
    evolution,
    forms,
  };
}

/** Builds the full Pokédex dataset for `gen` (species with `generation_id <= gen.number`). */
export function buildGeneration(gen: GenConfig, t: Tables): GenData {
  const idx = buildSpeciesIndex(t);
  const blackWhiteOrder = idx.versionGroupOrderBySlug.get(gen.versionGroup);
  if (blackWhiteOrder === undefined) {
    throw new Error(`Unknown version group '${gen.versionGroup}'`);
  }

  const speciesIds = [...idx.species.values()]
    .filter((species) => species.generationId <= gen.number)
    .map((species) => species.id)
    .sort((a, b) => a - b);

  const referenced = emptyReferencedNames();
  const pokemon = speciesIds.map((id) =>
    buildPokemon(id, gen, idx, blackWhiteOrder, referenced, t),
  );

  return {
    gen: gen.id,
    types: typesInGen(gen.number, t),
    chart: typeChartAt(gen.number, t),
    pokemon,
    names: buildNames(referenced, t),
  };
}

/** Recursively sorts object keys (arrays keep their element order) for stable JSON diffs. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return Object.fromEntries(
      entries.map(([key, val]) => [key, sortKeysDeep(val)]),
    );
  }
  return value;
}

async function main(): Promise<void> {
  await fetchCsvs(POKEAPI_SHA);
  const tables = await loadTables();

  const gen = getGen(DEFAULT_GEN);
  if (!gen) throw new Error(`Unknown generation '${DEFAULT_GEN}'`);

  const manifest = await loadSpriteManifest();
  const data = applySpriteAvailability(buildGeneration(gen, tables), manifest);
  const json = JSON.stringify(sortKeysDeep(data));

  const outPath = `src/data/gen/${gen.id}.json`;
  await Bun.write(outPath, json);
  const size = Bun.file(outPath).size;

  console.log(
    `[data] wrote ${outPath}: ${data.pokemon.length} Pokémon, ${(size / 1024 / 1024).toFixed(2)} MB (${size} bytes)`,
  );
}

if (import.meta.main) {
  await main();
}
