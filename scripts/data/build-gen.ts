import type {
  AbilityRef,
  EvoNode,
  Flag,
  GenData,
  GenId,
  Pokemon,
} from "../../src/data/types";
import type { GenConfig } from "../../src/lib/generations";
import { GENERATIONS, getGen } from "../../src/lib/generations";
import { POKEAPI_SHA } from "../pins";
import { buildForms, type FormRules } from "./forms";
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
  spriteManifestPath,
} from "./sprite-availability";

/**
 * Generation-specific form gimmicks: Mega Evolution / Primal Reversion existed only in
 * generations VI-VII (`xy`, `sm`), Dynamax/Gigantamax only in VIII (`swsh`), Totem Pokémon only
 * in VII (`sm`).
 */
const MEGA_GENS = new Set<GenId>(["xy", "sm"]);
const GMAX_GENS = new Set<GenId>(["swsh"]);
const TOTEM_GENS = new Set<GenId>(["sm"]);

/**
 * Forms the content widening in {@link CONTENT_VERSION_GROUP} would pull in although the
 * generation's own games never had them (Ruling R-B12, QA bug #12): `rs` means Ruby/Sapphire,
 * where Deoxys has only its Normal Forme. Its Speed Forme is Emerald-only (Attack/Defense come
 * from FireRed/LeafGreen, already past `rs`' content order), so showing it next to Normal alone
 * was neither Ruby/Sapphire nor the full Gen III set. `dp` onward keep all four.
 */
const EXCLUDED_FORMS: Partial<Record<GenId, ReadonlySet<string>>> = {
  rs: new Set(["386-speed"]),
};

/**
 * Gen I-III sprites have no male/female differences (they start with Diamond/Pearl), so
 * `hasGenderDiff` is `false` there whatever PokeAPI's species-wide flag says.
 */
const FIRST_GEN_WITH_GENDER_SPRITES = 4;

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
    if (condition.usedMove) referenced.moves.add(condition.usedMove);
  }
  for (const child of node.children) collectEvolutionNames(child, referenced);
}

/**
 * Picks a species' Pokédex text for a generation from `texts` (version slug -> raw English
 * text): every version of the generation's own pair that has text; if neither has any, the
 * first version in `flavorVersions` that does, keyed by that version so it can be labeled.
 * Returns `{}` when no listed version has text.
 */
export function pickFlavor(
  versions: readonly [string, string],
  flavorVersions: readonly string[],
  texts: ReadonlyMap<string, string>,
): Partial<Record<string, string>> {
  const flavor: Partial<Record<string, string>> = {};
  for (const version of versions) {
    const raw = texts.get(version);
    if (raw) flavor[version] = normalizeFlavorText(raw);
  }
  if (Object.keys(flavor).length > 0) return flavor;

  for (const version of flavorVersions) {
    const raw = texts.get(version);
    if (raw) return { [version]: normalizeFlavorText(raw) };
  }
  return {};
}

/** The generation's ability rules (none before gen III, no hidden ones before gen V). */
function abilityFilter(
  gen: GenConfig,
): (abilities: AbilityRef[]) => AbilityRef[] {
  return (abilities) => {
    if (!gen.features.abilities) return [];
    if (!gen.features.hiddenAbilities)
      return abilities.filter((a) => !a.hidden);
    return abilities;
  };
}

function flavorTexts(
  id: number,
  gen: GenConfig,
  idx: SpeciesIndex,
): Map<string, string> {
  const byVersionId = idx.flavorBySpecies.get(id);
  const texts = new Map<string, string>();
  for (const versionSlug of gen.flavorVersions) {
    const versionId = idx.versionIdBySlug.get(versionSlug);
    const raw =
      versionId !== undefined ? byVersionId?.get(versionId) : undefined;
    if (raw) texts.set(versionSlug, raw);
  }
  return texts;
}

function buildPokemon(
  id: number,
  gen: GenConfig,
  idx: SpeciesIndex,
  maxOrder: number,
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

  const filterAbilities = abilityFilter(gen);
  const abilities = filterAbilities(
    abilitiesAt(defaultPokemon.id, gen.number, t),
  );
  for (const ability of abilities) referenced.abilities.add(ability.slug);

  const breeding = gen.features.breeding;
  const eggGroups = breeding ? (idx.eggGroupsBySpecies.get(id) ?? []) : [];
  for (const eggGroup of eggGroups) referenced.eggGroups.add(eggGroup);

  const flags: Flag[] = [];
  if (species.isLegendary) flags.push("legendary");
  if (species.isMythical) flags.push("mythical");
  if (species.isBaby) flags.push("baby");
  if (species.generationId === gen.number) flags.push("new");

  const flavor = pickFlavor(
    gen.versions,
    gen.flavorVersions,
    flavorTexts(id, gen, idx),
  );
  if (Object.keys(flavor).length === 0) {
    throw new Error(
      `[data] ${gen.id}: no English Pokédex text for species ${id}`,
    );
  }

  const evolution = evolutionTreeFor(
    id,
    {
      gen: gen.number,
      versionGroup: gen.versionGroup,
      maxSpeciesId: gen.maxSpeciesId,
      maxOrder,
    },
    t,
  );
  collectEvolutionNames(evolution, referenced);

  const rules: FormRules = {
    gen: gen.number,
    maxOrder,
    megas: MEGA_GENS.has(gen.id),
    gmax: GMAX_GENS.has(gen.id),
    totems: TOTEM_GENS.has(gen.id),
    cosplay: gen.number === 6,
    abilities: filterAbilities,
  };
  const forms = buildForms(id, rules, t).filter(
    (form) => !EXCLUDED_FORMS[gen.id]?.has(form.key),
  );
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
    genderRate: breeding ? species.genderRate : null,
    eggGroups,
    hatchCounter: breeding ? species.hatchCounter : null,
    captureRate: species.captureRate,
    // Sprites first showed gender differences in Gen IV.
    hasGenderDiff:
      gen.number >= FIRST_GEN_WITH_GENDER_SPRITES && species.hasGenderDiff,
    flavor,
    evolution,
    forms,
  };
}

/**
 * Generations whose sprites come from a later game of the same generation (Crystal, Emerald,
 * HeartGold/SoulSilver -- see `SpriteSetId`): their datasets include the forms that game
 * already had (Rotom's appliances, Giratina-Origin and Shaymin-Sky from Platinum), so every form
 * shown can have a sprite -- minus {@link EXCLUDED_FORMS} (Emerald's Deoxys-Speed in `rs`).
 */
const CONTENT_VERSION_GROUP: Partial<Record<GenId, string>> = {
  gs: "crystal",
  rs: "emerald",
  dp: "heartgold-soulsilver",
};

function versionGroupOrder(idx: SpeciesIndex, identifier: string): number {
  const order = idx.versionGroupOrderBySlug.get(identifier);
  if (order === undefined) {
    throw new Error(`Unknown version group '${identifier}'`);
  }
  return order;
}

/**
 * The latest `version_groups.order` whose content (forms, evolution methods) belongs in `gen`'s
 * dataset: `gen.versionGroup`'s own order, widened to the sprite source game in
 * {@link CONTENT_VERSION_GROUP}, and to the latest version group that introduced one of its
 * species. The species range is per generation, not per game, so the latter pulls in the
 * same generation's later games where they added species: Let's Go (Meltan, Melmetal) for
 * `sm`, Legends: Arceus (Wyrdeer ... Enamorus, plus its Hisuian forms) for `swsh`, and The
 * Teal Mask/The Indigo Disk (Ogerpon ... Pecharunt, plus their forms) for `sv`. For `rb`, `bw`
 * and `xy` it's the version group itself (so no Black 2/White 2 forms in `bw`, no Omega
 * Ruby/Alpha Sapphire Megas or Primals in `xy`).
 */
export function contentOrder(gen: GenConfig, idx: SpeciesIndex): number {
  const contentGroup = CONTENT_VERSION_GROUP[gen.id];
  let order = Math.max(
    versionGroupOrder(idx, gen.versionGroup),
    contentGroup ? versionGroupOrder(idx, contentGroup) : 0,
  );
  for (const [speciesId, introduced] of idx.introducedOrderBySpecies) {
    if (speciesId <= gen.maxSpeciesId && introduced > order) order = introduced;
  }
  return order;
}

/** Builds the full Pokédex dataset for `gen` (species `1..gen.maxSpeciesId`). */
export function buildGeneration(gen: GenConfig, t: Tables): GenData {
  const idx = buildSpeciesIndex(t);
  const maxOrder = contentOrder(gen, idx);

  const speciesIds = [...idx.species.values()]
    .filter((species) => species.generationId <= gen.number)
    .map((species) => species.id)
    .sort((a, b) => a - b);

  const referenced = emptyReferencedNames();
  const pokemon = speciesIds.map((id) =>
    buildPokemon(id, gen, idx, maxOrder, referenced, t),
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

/** Parses `--gen <id>` (or `--gen=<id>`); every generation when absent. */
function selectedGenerations(argv: string[]): GenConfig[] {
  const index = argv.findIndex(
    (arg) => arg === "--gen" || arg.startsWith("--gen="),
  );
  if (index === -1) return GENERATIONS;
  const arg = argv[index]!;
  const id = arg.includes("=") ? arg.slice("--gen=".length) : argv[index + 1];
  const gen = id ? getGen(id) : undefined;
  if (!gen) {
    throw new Error(
      `Unknown generation '${id ?? ""}' (expected one of ${GENERATIONS.map((g) => g.id).join(", ")})`,
    );
  }
  return [gen];
}

async function main(): Promise<void> {
  const gens = selectedGenerations(Bun.argv.slice(2));
  await fetchCsvs(POKEAPI_SHA);
  const tables = await loadTables();

  for (const gen of gens) {
    // A generation whose sprite set has no manifest yet (`bun run sprites` hasn't built it)
    // is written without sprite-availability narrowing; re-run `bun run data` after it has.
    const manifestPath = spriteManifestPath(gen.spriteSet);
    const manifest = await loadSpriteManifest(manifestPath);
    if (!manifest) {
      console.warn(
        `[data] ${gen.id}: no sprite manifest at ${manifestPath}; forms/hasGenderDiff not narrowed to available sprites`,
      );
    }
    const data = applySpriteAvailability(
      buildGeneration(gen, tables),
      manifest,
    );
    const json = JSON.stringify(sortKeysDeep(data));

    const outPath = `src/data/gen/${gen.id}.json`;
    await Bun.write(outPath, json);
    const size = Bun.file(outPath).size;
    const forms = data.pokemon.reduce((n, p) => n + p.forms.length, 0);

    console.log(
      `[data] wrote ${outPath}: ${data.pokemon.length} Pokémon, ${forms} forms, ${(size / 1024).toFixed(0)} KB (${size} bytes)`,
    );
  }
}

if (import.meta.main) {
  await main();
}
