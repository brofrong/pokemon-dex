import { expect, test } from "bun:test";
import { CSV_TABLES, type Tables } from "../../../scripts/data/fetch";
import { buildEvolutionTree } from "../../../scripts/data/evolution";
import type { EvoNode } from "../../../src/data/types";

/** Builds a full `Tables` object for tests, with every table empty unless overridden. */
function makeTables(overrides: Partial<Tables>): Tables {
  const empty = Object.fromEntries(
    CSV_TABLES.map((name) => [name, []]),
  ) as unknown as Tables;
  return { ...empty, ...overrides };
}

const ctx = { gen: 5, versionGroup: "black-white", maxSpeciesId: 649 };

// Shared reference tables, modelled on the real PokeAPI CSVs (only the columns the
// resolver reads are included, same convention as resolve.test.ts).
const VERSION_GROUPS = [
  { id: "1", identifier: "red-blue", order: "3" },
  { id: "8", identifier: "diamond-pearl", order: "12" },
  { id: "11", identifier: "black-white", order: "15" },
  { id: "15", identifier: "x-y", order: "17" },
  { id: "20", identifier: "sword-shield", order: "22" },
];

const TRIGGERS = [
  { id: "1", identifier: "level-up" },
  { id: "2", identifier: "trade" },
  { id: "3", identifier: "use-item" },
  { id: "4", identifier: "shed" },
  { id: "5", identifier: "spin" }, // not one of the 4 named triggers -> "other"
];

const ITEMS = [{ id: "83", identifier: "thunder-stone" }];

const MOVES = [
  { id: "246", identifier: "ancient-power", generation_id: "3" },
  { id: "999", identifier: "future-move", generation_id: "6" },
];

const TYPES = [
  { id: "10", identifier: "fire", generation_id: "1" },
  { id: "18", identifier: "fairy", generation_id: "6" },
];

const LOCATIONS = [
  // Stands in for a row recorded under a version group that doesn't match `ctx` and isn't
  // the winner, the way real Leafeon/Glaceon rows exist for many games at once.
  { id: "1", identifier: "route-20" },
  { id: "2", identifier: "pinwheel-forest" },
];

function findChild(node: EvoNode, slug: string): EvoNode {
  const child = node.children.find((c) => c.slug === slug);
  if (!child) throw new Error(`no child named ${slug} on ${node.slug}`);
  return child;
}

test("linear chain with levels", () => {
  // Real rows: Charmeleon/Charizard's evolutions were both recorded once, at red-blue
  // (version_group_id 1), and never overridden since -- they still apply in Black/White.
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    pokemon_species: [
      {
        id: "4",
        identifier: "charmander",
        evolves_from_species_id: "",
        evolution_chain_id: "2",
      },
      {
        id: "5",
        identifier: "charmeleon",
        evolves_from_species_id: "4",
        evolution_chain_id: "2",
      },
      {
        id: "6",
        identifier: "charizard",
        evolves_from_species_id: "5",
        evolution_chain_id: "2",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "5",
        evolution_trigger_id: "1",
        version_group_id: "1",
        minimum_level: "16",
      },
      {
        evolved_species_id: "6",
        evolution_trigger_id: "1",
        version_group_id: "1",
        minimum_level: "36",
      },
    ],
  });

  const tree = buildEvolutionTree(2, ctx, t);
  expect(tree.slug).toBe("charmander");
  expect(tree.children[0].conditions).toEqual([
    { trigger: "level-up", minLevel: 16 },
  ]);
  expect(tree.children[0].children[0].conditions[0].minLevel).toBe(36);
});

test("Eevee in gen 5 has 7 branches and no Sylveon", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    items: ITEMS,
    locations: LOCATIONS,
    pokemon_species: [
      {
        id: "133",
        identifier: "eevee",
        evolves_from_species_id: "",
        evolution_chain_id: "67",
      },
      {
        id: "134",
        identifier: "vaporeon",
        evolves_from_species_id: "133",
        evolution_chain_id: "67",
      },
      {
        id: "135",
        identifier: "jolteon",
        evolves_from_species_id: "133",
        evolution_chain_id: "67",
      },
      {
        id: "136",
        identifier: "flareon",
        evolves_from_species_id: "133",
        evolution_chain_id: "67",
      },
      {
        id: "196",
        identifier: "espeon",
        evolves_from_species_id: "133",
        evolution_chain_id: "67",
      },
      {
        id: "197",
        identifier: "umbreon",
        evolves_from_species_id: "133",
        evolution_chain_id: "67",
      },
      {
        id: "470",
        identifier: "leafeon",
        evolves_from_species_id: "133",
        evolution_chain_id: "67",
      },
      {
        id: "471",
        identifier: "glaceon",
        evolves_from_species_id: "133",
        evolution_chain_id: "67",
      },
      // Sylveon: real gen-6 member of this exact chain, id > maxSpeciesId -> must be pruned.
      {
        id: "700",
        identifier: "sylveon",
        evolves_from_species_id: "133",
        evolution_chain_id: "67",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "134",
        evolution_trigger_id: "3",
        version_group_id: "1",
        trigger_item_id: "83",
      },
      {
        evolved_species_id: "135",
        evolution_trigger_id: "3",
        version_group_id: "1",
        trigger_item_id: "83",
      },
      {
        evolved_species_id: "136",
        evolution_trigger_id: "3",
        version_group_id: "1",
        trigger_item_id: "83",
      },
      {
        evolved_species_id: "196",
        evolution_trigger_id: "1",
        version_group_id: "3",
        time_of_day: "day",
      },
      {
        evolved_species_id: "197",
        evolution_trigger_id: "1",
        version_group_id: "3",
        time_of_day: "night",
      },
      // Leafeon: generic (non-matching, non-target) row plus the real black-white row.
      {
        evolved_species_id: "470",
        evolution_trigger_id: "1",
        version_group_id: "",
        location_id: "1",
      },
      {
        evolved_species_id: "470",
        evolution_trigger_id: "1",
        version_group_id: "11",
        location_id: "2",
      },
      {
        evolved_species_id: "471",
        evolution_trigger_id: "1",
        version_group_id: "8",
        location_id: "1",
      },
    ],
  });

  const tree = buildEvolutionTree(67, ctx, t);
  expect(tree.children.map((c) => c.slug)).toEqual([
    "vaporeon",
    "jolteon",
    "flareon",
    "espeon",
    "umbreon",
    "leafeon",
    "glaceon",
  ]);
});

test("version-group specific row wins over generic", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    locations: LOCATIONS,
    pokemon_species: [
      {
        id: "133",
        identifier: "eevee",
        evolves_from_species_id: "",
        evolution_chain_id: "67",
      },
      {
        id: "470",
        identifier: "leafeon",
        evolves_from_species_id: "133",
        evolution_chain_id: "67",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "470",
        evolution_trigger_id: "1",
        version_group_id: "",
        location_id: "1",
      },
      {
        evolved_species_id: "470",
        evolution_trigger_id: "1",
        version_group_id: "11",
        location_id: "2",
      },
    ],
  });

  const tree = buildEvolutionTree(67, ctx, t);
  const leafeonNode = findChild(tree, "leafeon");
  expect(leafeonNode.conditions).toEqual([
    { trigger: "level-up", location: "pinwheel-forest" },
  ]);
});

test("species above maxSpeciesId are dropped together with their subtree", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    pokemon_species: [
      {
        id: "600",
        identifier: "alpha",
        evolves_from_species_id: "",
        evolution_chain_id: "900",
      },
      // Not a real species -> stands in for a gen > 5 middle evolution.
      {
        id: "950",
        identifier: "beta",
        evolves_from_species_id: "600",
        evolution_chain_id: "900",
      },
      // Even though this id is in range, it only exists behind the pruned node.
      {
        id: "601",
        identifier: "gamma",
        evolves_from_species_id: "950",
        evolution_chain_id: "900",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "950",
        evolution_trigger_id: "1",
        version_group_id: "",
        minimum_level: "20",
      },
      {
        evolved_species_id: "601",
        evolution_trigger_id: "1",
        version_group_id: "",
        minimum_level: "40",
      },
    ],
  });

  const tree = buildEvolutionTree(900, ctx, t);
  expect(tree.children).toEqual([]);
});

test("children are sorted by speciesId regardless of row order", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    pokemon_species: [
      {
        id: "10",
        identifier: "root",
        evolves_from_species_id: "",
        evolution_chain_id: "901",
      },
      {
        id: "13",
        identifier: "third",
        evolves_from_species_id: "10",
        evolution_chain_id: "901",
      },
      {
        id: "11",
        identifier: "first",
        evolves_from_species_id: "10",
        evolution_chain_id: "901",
      },
      {
        id: "12",
        identifier: "second",
        evolves_from_species_id: "10",
        evolution_chain_id: "901",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "13",
        evolution_trigger_id: "1",
        version_group_id: "",
        minimum_level: "10",
      },
      {
        evolved_species_id: "11",
        evolution_trigger_id: "1",
        version_group_id: "",
        minimum_level: "10",
      },
      {
        evolved_species_id: "12",
        evolution_trigger_id: "1",
        version_group_id: "",
        minimum_level: "10",
      },
    ],
  });

  const tree = buildEvolutionTree(901, ctx, t);
  expect(tree.children.map((c) => c.slug)).toEqual([
    "first",
    "second",
    "third",
  ]);
});

test("a row referencing a move introduced after the generation is skipped", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    moves: MOVES,
    pokemon_species: [
      {
        id: "602",
        identifier: "proto",
        evolves_from_species_id: "",
        evolution_chain_id: "902",
      },
      {
        id: "603",
        identifier: "evolved",
        evolves_from_species_id: "602",
        evolution_chain_id: "902",
      },
    ],
    pokemon_evolution: [
      // Only candidate row for this species; its move doesn't exist until gen 6.
      {
        evolved_species_id: "603",
        evolution_trigger_id: "1",
        version_group_id: "",
        known_move_id: "999",
      },
    ],
  });

  const tree = buildEvolutionTree(902, ctx, t);
  expect(tree.children[0].conditions).toEqual([]);
});

test("a row referencing a type introduced after the generation is skipped", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    types: TYPES,
    pokemon_species: [
      {
        id: "604",
        identifier: "proto2",
        evolves_from_species_id: "",
        evolution_chain_id: "903",
      },
      {
        id: "605",
        identifier: "evolved2",
        evolves_from_species_id: "604",
        evolution_chain_id: "903",
      },
    ],
    pokemon_evolution: [
      // Fairy doesn't exist until gen 6 -- this condition can't be met in gen 5.
      {
        evolved_species_id: "605",
        evolution_trigger_id: "1",
        version_group_id: "",
        known_move_type_id: "18",
      },
    ],
  });

  const tree = buildEvolutionTree(903, ctx, t);
  expect(tree.children[0].conditions).toEqual([]);
});

test("a row for vg introduced after the target version group never wins", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    items: ITEMS,
    pokemon_species: [
      {
        id: "606",
        identifier: "proto3",
        evolves_from_species_id: "",
        evolution_chain_id: "904",
      },
      {
        id: "607",
        identifier: "evolved3",
        evolves_from_species_id: "606",
        evolution_chain_id: "904",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "607",
        evolution_trigger_id: "1",
        version_group_id: "8",
        minimum_level: "30",
      },
      // sword-shield (order 22) is after black-white (order 15) -- must not win or appear.
      {
        evolved_species_id: "607",
        evolution_trigger_id: "3",
        version_group_id: "20",
        trigger_item_id: "83",
      },
    ],
  });

  const tree = buildEvolutionTree(904, ctx, t);
  expect(tree.children[0].conditions).toEqual([
    { trigger: "level-up", minLevel: 30 },
  ]);
});

test("resolves trigger, item, gender, trade/party species and relative stats", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    items: ITEMS,
    genders: [
      { id: "1", identifier: "female" },
      { id: "2", identifier: "male" },
      { id: "3", identifier: "genderless" },
    ],
    pokemon_species: [
      {
        id: "608",
        identifier: "proto4",
        evolves_from_species_id: "",
        evolution_chain_id: "905",
      },
      {
        id: "609",
        identifier: "evolved4",
        evolves_from_species_id: "608",
        evolution_chain_id: "905",
      },
      {
        id: "610",
        identifier: "trader",
        evolves_from_species_id: "",
        evolution_chain_id: "906",
      },
      {
        id: "611",
        identifier: "partymon",
        evolves_from_species_id: "",
        evolution_chain_id: "907",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "609",
        evolution_trigger_id: "5", // "spin" -> not one of the 4 named triggers
        version_group_id: "",
        held_item_id: "83",
        gender_id: "1",
        trade_species_id: "610",
        party_species_id: "611",
        relative_physical_stats: "-1",
        minimum_beauty: "170",
      },
    ],
  });

  const tree = buildEvolutionTree(905, ctx, t);
  expect(tree.children[0].conditions).toEqual([
    {
      trigger: "other",
      heldItem: "thunder-stone",
      gender: "female",
      tradeSpecies: "trader",
      partySpecies: "partymon",
      relativeStats: -1,
      minBeauty: 170,
    },
  ]);
});
