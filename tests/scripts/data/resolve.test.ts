import { expect, test } from "bun:test";
import { CSV_TABLES, type Tables } from "../../../scripts/data/fetch";
import {
  abilitiesAt,
  defensiveProfile,
  statsAt,
  typeChartAt,
  typesAt,
  typesInGen,
} from "../../../scripts/data/resolve";

/** Builds a full `Tables` object for tests, with every table empty unless overridden. */
function makeTables(overrides: Partial<Tables>): Tables {
  const empty = Object.fromEntries(
    CSV_TABLES.map((name) => [name, []]),
  ) as unknown as Tables;
  return { ...empty, ...overrides };
}

const t = makeTables({
  types: [
    { id: "1", identifier: "normal", generation_id: "1", damage_class_id: "2" },
    {
      id: "2",
      identifier: "fighting",
      generation_id: "1",
      damage_class_id: "2",
    },
    { id: "3", identifier: "flying", generation_id: "1", damage_class_id: "2" },
    { id: "4", identifier: "poison", generation_id: "1", damage_class_id: "2" },
    { id: "8", identifier: "ghost", generation_id: "1", damage_class_id: "2" },
    { id: "9", identifier: "steel", generation_id: "2", damage_class_id: "2" },
    { id: "12", identifier: "grass", generation_id: "1", damage_class_id: "3" },
    { id: "15", identifier: "ice", generation_id: "1", damage_class_id: "3" },
    { id: "17", identifier: "dark", generation_id: "2", damage_class_id: "3" },
    { id: "18", identifier: "fairy", generation_id: "6", damage_class_id: "" },
  ],
  // Clefairy (35): Normal through gen 5, Fairy from gen 6 on.
  // Jigglypuff-shaped fixture (39): currently dual Normal (slot1)/Fairy (slot2).
  pokemon_types: [
    { pokemon_id: "35", type_id: "18", slot: "1" },
    { pokemon_id: "39", type_id: "1", slot: "1" },
    { pokemon_id: "39", type_id: "18", slot: "2" },
  ],
  // Jigglypuff-shaped fixture (39): currently dual Normal/Fairy, but the gen-5 past row is a
  // *complete* typing with only slot 1 -- the current slot-2 Fairy must not survive into gen 5.
  pokemon_types_past: [
    { pokemon_id: "35", generation_id: "5", type_id: "1", slot: "1" },
    { pokemon_id: "39", generation_id: "5", type_id: "1", slot: "1" },
  ],
  pokemon_stats: [
    { pokemon_id: "25", stat_id: "1", base_stat: "35", effort: "0" },
    { pokemon_id: "25", stat_id: "2", base_stat: "55", effort: "0" },
    { pokemon_id: "25", stat_id: "3", base_stat: "40", effort: "0" },
    { pokemon_id: "25", stat_id: "4", base_stat: "50", effort: "0" },
    { pokemon_id: "25", stat_id: "5", base_stat: "50", effort: "0" },
    { pokemon_id: "25", stat_id: "6", base_stat: "90", effort: "2" },
  ],
  pokemon_stats_past: [
    {
      pokemon_id: "25",
      generation_id: "5",
      stat_id: "3",
      base_stat: "30",
      effort: "0",
    },
    {
      pokemon_id: "25",
      generation_id: "5",
      stat_id: "5",
      base_stat: "40",
      effort: "0",
    },
  ],
  abilities: [
    {
      id: "65",
      identifier: "overgrow",
      generation_id: "3",
      is_main_series: "1",
    },
    {
      id: "34",
      identifier: "chlorophyll",
      generation_id: "3",
      is_main_series: "1",
    },
  ],
  pokemon_abilities: [
    { pokemon_id: "1", ability_id: "65", is_hidden: "0", slot: "1" },
    { pokemon_id: "1", ability_id: "34", is_hidden: "1", slot: "3" },
  ],
  pokemon_abilities_past: [
    {
      pokemon_id: "1",
      generation_id: "4",
      ability_id: "",
      is_hidden: "1",
      slot: "3",
    },
  ],
  type_efficacy: [
    { damage_type_id: "8", target_type_id: "9", damage_factor: "100" },
    { damage_type_id: "17", target_type_id: "9", damage_factor: "100" },
    { damage_type_id: "15", target_type_id: "12", damage_factor: "200" },
    { damage_type_id: "15", target_type_id: "3", damage_factor: "200" },
    // Fairy matchups, like real PokeAPI data: fairy hits fighting super-effectively,
    // poison hits fairy for half damage. Fairy itself only exists from gen 6 on.
    { damage_type_id: "18", target_type_id: "2", damage_factor: "200" },
    { damage_type_id: "4", target_type_id: "18", damage_factor: "50" },
  ],
  type_efficacy_past: [
    {
      damage_type_id: "8",
      target_type_id: "9",
      damage_factor: "50",
      generation_id: "5",
    },
    {
      damage_type_id: "17",
      target_type_id: "9",
      damage_factor: "50",
      generation_id: "5",
    },
  ],
});

test("Clefairy is Normal in gen 5, Fairy now", () => {
  expect(typesAt(35, 5, t)).toEqual(["normal"]);
  expect(typesAt(35, 9, t)).toEqual(["fairy"]);
});

test("past types replace the whole typing, not just the slots they mention", () => {
  // Jigglypuff-shaped fixture: current is dual Normal/Fairy, but the gen-5 past row is a
  // complete typing with only slot 1 (Normal) -- the current slot-2 Fairy must not leak in.
  expect(typesAt(39, 5, t)).toEqual(["normal"]);
  expect(typesAt(39, 6, t)).toEqual(["normal", "fairy"]);
});

test("stats past per stat", () => {
  expect(statsAt(25, 5, t)).toEqual([35, 55, 30, 50, 40, 90]); // Pikachu gen 5
});

test("empty ability_id removes the slot", () => {
  expect(abilitiesAt(1, 4, t)).toEqual([{ slug: "overgrow", hidden: false }]);
});

test("no fairy in gen 5", () =>
  expect(typesInGen(5, t)).not.toContain("fairy"));

test("steel resists ghost in gen 5", () => {
  expect(
    defensiveProfile(["steel"], typeChartAt(5, t), typesInGen(5, t)).ghost,
  ).toBe(0.5);
});

test("dual type multiplies", () => {
  const chart = typeChartAt(5, t);
  const inGen = typesInGen(5, t);
  expect(defensiveProfile(["grass", "flying"], chart, inGen).ice).toBe(4);
});

test("fairy matchups don't leak into gen 5, but exist once fairy does", () => {
  const chart5 = typeChartAt(5, t);
  expect(chart5.fairy).toBeUndefined();
  expect(Object.values(chart5).some((row) => row && "fairy" in row)).toBe(
    false,
  );

  const chart6 = typeChartAt(6, t);
  expect(chart6.fairy?.fighting).toBe(2);
  expect(chart6.poison?.fairy).toBe(0.5);
});

test("gen I's single Special stat fills both Sp. Atk and Sp. Def", () => {
  const mewtwo = [106, 110, 90, 154, 90, 130];
  const special = makeTables({
    pokemon_stats: mewtwo.map((base, i) => ({
      pokemon_id: "150",
      stat_id: String(i + 1),
      base_stat: String(base),
      effort: "0",
    })),
    pokemon_stats_past: [
      {
        pokemon_id: "150",
        generation_id: "1",
        stat_id: "9",
        base_stat: "154",
        effort: "0",
      },
    ],
  });
  expect(statsAt(150, 1, special)).toEqual([106, 110, 90, 154, 154, 130]);
  expect(statsAt(150, 2, special)).toEqual([106, 110, 90, 154, 90, 130]);
});

test("abilities introduced after the generation are dropped", () => {
  const later = makeTables({
    abilities: [
      { id: "1", identifier: "old", generation_id: "3", is_main_series: "1" },
      { id: "2", identifier: "new", generation_id: "7", is_main_series: "1" },
    ],
    pokemon_abilities: [
      { pokemon_id: "1", ability_id: "1", is_hidden: "0", slot: "1" },
      { pokemon_id: "1", ability_id: "2", is_hidden: "0", slot: "2" },
    ],
  });
  expect(abilitiesAt(1, 5, later).map((a) => a.slug)).toEqual(["old"]);
  expect(abilitiesAt(1, 7, later).map((a) => a.slug)).toEqual(["old", "new"]);
});
