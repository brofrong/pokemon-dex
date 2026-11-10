import { expect, test } from "bun:test";
import { CSV_TABLES, type Tables } from "../../../scripts/data/fetch";
import {
  buildEvolutionTree,
  buildEvolutionTreeFor,
} from "../../../scripts/data/evolution";
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
  { id: "5", identifier: "unclassified" }, // not a named or special trigger -> "other"
  { id: "8", identifier: "three-critical-hits" }, // a special trigger -> "other" + special
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
        evolution_trigger_id: "5", // "unclassified" -> not a named or special trigger
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

function twoStage(row: Record<string, string>): Tables {
  return makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    types: [...TYPES, { id: "17", identifier: "dark", generation_id: "2" }],
    pokemon_species: [
      {
        id: "1",
        identifier: "a",
        evolves_from_species_id: "",
        evolution_chain_id: "1",
      },
      {
        id: "2",
        identifier: "b",
        evolves_from_species_id: "1",
        evolution_chain_id: "1",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "2",
        evolution_trigger_id: "1",
        version_group_id: "15",
        ...row,
      },
    ],
  });
}

test("Gen VI+ requirement columns are mapped", () => {
  const xy = { gen: 6, versionGroup: "x-y", maxSpeciesId: 721 };
  const conditions = (row: Record<string, string>) =>
    buildEvolutionTree(1, xy, twoStage(row)).children[0]!.conditions;
  expect(
    conditions({
      minimum_level: "50",
      needs_overworld_rain: "1",
      turn_upside_down: "1",
      party_type_id: "17",
      minimum_affection: "2",
      minimum_steps: "1000",
      minimum_damage_taken: "49",
      needs_multiplayer: "1",
    }),
  ).toEqual([
    {
      trigger: "level-up",
      minLevel: 50,
      needsRain: true,
      upsideDown: true,
      partyType: "dark",
      minAffection: 2,
      minSteps: 1000,
      minDamageTaken: 49,
      needsMultiplayer: true,
    },
  ]);
  // "0" in a flag column means "not required".
  expect(conditions({ minimum_level: "5", needs_overworld_rain: "0" })).toEqual(
    [{ trigger: "level-up", minLevel: 5 }],
  );
});

test("a requirement column the builder doesn't know fails the build", () => {
  const xy = { gen: 6, versionGroup: "x-y", maxSpeciesId: 721 };
  expect(() =>
    buildEvolutionTree(1, xy, twoStage({ needs_full_moon: "1" })),
  ).toThrow(/needs_full_moon/);
});

/** Pichu -> Pikachu -> Raichu, plus Tyrogue -> Hitmonlee / Hitmonchan, like the real chains. */
const BABY_SPECIES = [
  {
    id: "172",
    identifier: "pichu",
    evolves_from_species_id: "",
    evolution_chain_id: "10",
  },
  {
    id: "25",
    identifier: "pikachu",
    evolves_from_species_id: "172",
    evolution_chain_id: "10",
  },
  {
    id: "26",
    identifier: "raichu",
    evolves_from_species_id: "25",
    evolution_chain_id: "10",
  },
  {
    id: "236",
    identifier: "tyrogue",
    evolves_from_species_id: "",
    evolution_chain_id: "47",
  },
  {
    id: "106",
    identifier: "hitmonlee",
    evolves_from_species_id: "236",
    evolution_chain_id: "47",
  },
  {
    id: "107",
    identifier: "hitmonchan",
    evolves_from_species_id: "236",
    evolution_chain_id: "47",
  },
];

const gen1 = { gen: 1, versionGroup: "red-blue", maxSpeciesId: 151 };

test("a pre-evolution from a later generation is cut off, rooting the tree at the oldest species in range", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    items: ITEMS,
    pokemon_species: BABY_SPECIES,
    pokemon_evolution: [
      {
        evolved_species_id: "25",
        evolution_trigger_id: "1",
        version_group_id: "3",
        minimum_happiness: "220",
      },
      {
        evolved_species_id: "26",
        evolution_trigger_id: "3",
        version_group_id: "1",
        trigger_item_id: "83",
      },
    ],
  });
  const tree = buildEvolutionTreeFor(25, gen1, t);
  expect(tree.slug).toBe("pikachu");
  expect(tree.conditions).toEqual([]);
  expect(tree.children.map((c) => c.slug)).toEqual(["raichu"]);
  expect(buildEvolutionTreeFor(26, gen1, t)).toEqual(tree);
});

test("siblings whose shared baby is cut off become separate one-node trees", () => {
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    pokemon_species: BABY_SPECIES,
  });
  expect(buildEvolutionTreeFor(106, gen1, t)).toEqual({
    speciesId: 106,
    slug: "hitmonlee",
    conditions: [],
    children: [],
  });
});

test("a row that evolves into a non-default form doesn't override the species' own method", () => {
  // Real rows: Raichu by Thunder Stone since red-blue; Sun/Moon adds a row (region Alola,
  // evolved form raichu-alola) that's about Alolan Raichu, not about Raichu itself.
  const t = makeTables({
    version_groups: [
      ...VERSION_GROUPS,
      { id: "17", identifier: "sun-moon", order: "19" },
    ],
    evolution_triggers: TRIGGERS,
    items: ITEMS,
    pokemon_species: BABY_SPECIES,
    pokemon: [
      { id: "25", species_id: "25", is_default: "1" },
      { id: "26", species_id: "26", is_default: "1" },
      { id: "10100", species_id: "26", is_default: "0" },
    ],
    pokemon_forms: [
      { id: "25", pokemon_id: "25", is_default: "1" },
      { id: "26", pokemon_id: "26", is_default: "1" },
      { id: "10100", pokemon_id: "10100", is_default: "1" },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "26",
        evolution_trigger_id: "3",
        version_group_id: "1",
        trigger_item_id: "83",
        required_pokemon_form_id: "25",
      },
      {
        evolved_species_id: "26",
        evolution_trigger_id: "3",
        version_group_id: "17",
        trigger_item_id: "83",
        region_id: "7",
        evolved_pokemon_form_id: "10100",
        minimum_level: "99",
      },
    ],
  });
  const sm = { gen: 7, versionGroup: "sun-moon", maxSpeciesId: 809 };
  const pichu = buildEvolutionTreeFor(26, sm, t);
  expect(findChild(findChild(pichu, "pikachu"), "raichu").conditions).toEqual([
    { trigger: "use-item", item: "thunder-stone" },
  ]);
});

test("form-specific rows still apply when they're the species' only evolution method", () => {
  // Obstagoon-shaped: only Galarian Linoone (a non-default pokemon) evolves into it.
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    pokemon_species: [
      {
        id: "264",
        identifier: "linoone",
        evolves_from_species_id: "",
        evolution_chain_id: "1",
      },
      {
        id: "862",
        identifier: "obstagoon",
        evolves_from_species_id: "264",
        evolution_chain_id: "1",
      },
    ],
    pokemon: [
      { id: "264", species_id: "264", is_default: "1" },
      { id: "10175", species_id: "264", is_default: "0" },
    ],
    pokemon_forms: [
      {
        id: "10175",
        pokemon_id: "10175",
        is_default: "1",
        form_identifier: "galar",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "862",
        evolution_trigger_id: "1",
        version_group_id: "20",
        minimum_level: "35",
        time_of_day: "night",
        required_pokemon_form_id: "10175",
      },
    ],
  });
  const swsh = { gen: 8, versionGroup: "sword-shield", maxSpeciesId: 905 };
  expect(buildEvolutionTreeFor(264, swsh, t).children[0]!.conditions).toEqual([
    {
      trigger: "level-up",
      minLevel: 35,
      timeOfDay: "night",
      fromForm: "galar",
    },
  ]);
});

test("a special trigger is kept as `special`; a regional required form as `fromForm` (R-B14)", () => {
  // Sirfetch'd-shaped: Galarian Farfetch'd evolves after 3 critical hits in one battle.
  const t = makeTables({
    version_groups: VERSION_GROUPS,
    evolution_triggers: TRIGGERS,
    pokemon_species: [
      {
        id: "83",
        identifier: "farfetchd",
        evolves_from_species_id: "",
        evolution_chain_id: "1",
      },
      {
        id: "865",
        identifier: "sirfetchd",
        evolves_from_species_id: "83",
        evolution_chain_id: "1",
      },
    ],
    pokemon: [
      { id: "83", species_id: "83", is_default: "1" },
      { id: "10166", species_id: "83", is_default: "0" },
    ],
    pokemon_forms: [
      {
        id: "10166",
        pokemon_id: "10166",
        is_default: "1",
        form_identifier: "galar",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "865",
        evolution_trigger_id: "8",
        version_group_id: "20",
        required_pokemon_form_id: "10166",
      },
    ],
  });
  const swsh = { gen: 8, versionGroup: "sword-shield", maxSpeciesId: 905 };
  expect(buildEvolutionTreeFor(83, swsh, t).children[0]!.conditions).toEqual([
    { trigger: "other", special: "three-critical-hits", fromForm: "galar" },
  ]);
});

test("maxOrder widens the version groups a generation's evolutions are read from", () => {
  // Meltan -> Melmetal was recorded at Let's Go (order 21), after Ultra Sun/Ultra Moon (20).
  const t = makeTables({
    version_groups: [
      { id: "18", identifier: "ultra-sun-ultra-moon", order: "20" },
      { id: "19", identifier: "lets-go-pikachu-lets-go-eevee", order: "21" },
    ],
    evolution_triggers: TRIGGERS,
    pokemon_species: [
      {
        id: "808",
        identifier: "meltan",
        evolves_from_species_id: "",
        evolution_chain_id: "1",
      },
      {
        id: "809",
        identifier: "melmetal",
        evolves_from_species_id: "808",
        evolution_chain_id: "1",
      },
    ],
    pokemon_evolution: [
      {
        evolved_species_id: "809",
        evolution_trigger_id: "5",
        version_group_id: "19",
      },
    ],
  });
  const usum = {
    gen: 7,
    versionGroup: "ultra-sun-ultra-moon",
    maxSpeciesId: 809,
  };
  expect(buildEvolutionTreeFor(808, usum, t).children[0]!.conditions).toEqual(
    [],
  );
  expect(
    buildEvolutionTreeFor(808, { ...usum, maxOrder: 21 }, t).children[0]!
      .conditions,
  ).toEqual([{ trigger: "other" }]);
});
