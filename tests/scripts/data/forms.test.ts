import { expect, test } from "bun:test";
import { CSV_TABLES, type Tables } from "../../../scripts/data/fetch";
import { buildForms, type FormRules } from "../../../scripts/data/forms";

function makeTables(overrides: Partial<Tables>): Tables {
  const empty = Object.fromEntries(
    CSV_TABLES.map((name) => [name, []]),
  ) as unknown as Tables;
  return { ...empty, ...overrides };
}

const TYPES = [
  { id: "1", identifier: "normal", generation_id: "1" },
  { id: "3", identifier: "flying", generation_id: "1" },
  { id: "10", identifier: "fire", generation_id: "1" },
  { id: "15", identifier: "ice", generation_id: "1" },
  { id: "16", identifier: "dragon", generation_id: "1" },
  { id: "18", identifier: "fairy", generation_id: "6" },
];

const VERSION_GROUPS = [
  { id: "1", identifier: "red-blue", order: "3" },
  { id: "15", identifier: "x-y", order: "17" },
  { id: "16", identifier: "omega-ruby-alpha-sapphire", order: "18" },
  { id: "17", identifier: "sun-moon", order: "19" },
  { id: "20", identifier: "sword-shield", order: "22" },
];

function form(
  id: string,
  identifier: string,
  formIdentifier: string,
  pokemonId: string,
  introduced: string,
  extra: Partial<
    Record<"is_default" | "is_battle_only" | "is_mega", string>
  > = {},
): Record<string, string> {
  return {
    id,
    identifier,
    form_identifier: formIdentifier,
    pokemon_id: pokemonId,
    introduced_in_version_group_id: introduced,
    is_default: "1",
    is_battle_only: "0",
    is_mega: "0",
    form_order: id,
    order: id,
    ...extra,
  };
}

function stats(pokemonId: string): Record<string, string>[] {
  return [1, 2, 3, 4, 5, 6].map((statId) => ({
    pokemon_id: pokemonId,
    stat_id: String(statId),
    base_stat: "50",
    effort: "0",
  }));
}

/** Charizard (6) with both megas and Gigantamax; Vulpix (37) with an Alolan form; Toxtricity
 * (849) with its two Gigantamax forms, whose `form_identifier` is "gmax" for both -- the real
 * PokeAPI collision this fixture reproduces. */
const t = makeTables({
  types: TYPES,
  version_groups: VERSION_GROUPS,
  pokemon_species: [{ id: "849", identifier: "toxtricity" }],
  pokemon: [
    { id: "6", species_id: "6", is_default: "1" },
    { id: "10034", species_id: "6", is_default: "0" },
    { id: "10035", species_id: "6", is_default: "0" },
    { id: "10196", species_id: "6", is_default: "0" },
    { id: "37", species_id: "37", is_default: "1" },
    { id: "10103", species_id: "37", is_default: "0" },
    { id: "20", species_id: "20", is_default: "1" },
    { id: "10093", species_id: "20", is_default: "0" },
    { id: "773", species_id: "773", is_default: "1" },
    { id: "849", species_id: "849", is_default: "1" },
    { id: "10184", species_id: "849", is_default: "0" },
    { id: "10219", species_id: "849", is_default: "0" },
    { id: "10228", species_id: "849", is_default: "0" },
  ],
  pokemon_forms: [
    form("6", "charizard", "", "6", "1"),
    form("10034", "charizard-mega-x", "mega-x", "10034", "15", {
      is_battle_only: "1",
      is_mega: "1",
    }),
    form("10035", "charizard-mega-y", "mega-y", "10035", "15", {
      is_battle_only: "1",
      is_mega: "1",
    }),
    form("10196", "charizard-gmax", "gmax", "10196", "20", {
      is_battle_only: "1",
    }),
    form("37", "vulpix", "", "37", "1"),
    form("10103", "vulpix-alola", "alola", "10103", "17"),
    form("20", "raticate", "", "20", "1"),
    form("10093", "raticate-totem-alola", "totem-alola", "10093", "17"),
    form("773", "silvally-normal", "normal", "773", "17"),
    form("10500", "silvally-fire", "fire", "773", "17", { is_default: "0" }),
    form("10501", "silvally-fairy", "fairy", "773", "17", { is_default: "0" }),
    form("849", "toxtricity-amped", "amped", "849", "20"),
    form("10184", "toxtricity-low-key", "low-key", "10184", "20", {
      is_default: "0",
    }),
    form("10219", "toxtricity-amped-gmax", "gmax", "10219", "20", {
      is_default: "0",
      is_battle_only: "1",
    }),
    form("10228", "toxtricity-low-key-gmax", "gmax", "10228", "20", {
      is_default: "0",
      is_battle_only: "1",
    }),
  ],
  pokemon_types: [
    { pokemon_id: "6", type_id: "10", slot: "1" },
    { pokemon_id: "6", type_id: "3", slot: "2" },
    { pokemon_id: "10034", type_id: "10", slot: "1" },
    { pokemon_id: "10034", type_id: "16", slot: "2" },
    { pokemon_id: "10035", type_id: "10", slot: "1" },
    { pokemon_id: "10035", type_id: "3", slot: "2" },
    { pokemon_id: "10196", type_id: "10", slot: "1" },
    { pokemon_id: "10196", type_id: "3", slot: "2" },
    { pokemon_id: "37", type_id: "10", slot: "1" },
    { pokemon_id: "10103", type_id: "15", slot: "1" },
    { pokemon_id: "20", type_id: "1", slot: "1" },
    { pokemon_id: "10093", type_id: "1", slot: "1" },
    { pokemon_id: "773", type_id: "1", slot: "1" },
    { pokemon_id: "849", type_id: "10", slot: "1" },
    { pokemon_id: "10184", type_id: "10", slot: "1" },
    { pokemon_id: "10219", type_id: "10", slot: "1" },
    { pokemon_id: "10228", type_id: "10", slot: "1" },
  ],
  pokemon_stats: [
    "6",
    "10034",
    "10035",
    "10196",
    "37",
    "10103",
    "20",
    "10093",
    "773",
    "849",
    "10184",
    "10219",
    "10228",
  ].flatMap(stats),
});

const XY: FormRules = {
  gen: 6,
  maxOrder: 17,
  megas: true,
  gmax: false,
  totems: false,
  cosplay: true,
};
const SM: FormRules = {
  gen: 7,
  maxOrder: 21,
  megas: true,
  gmax: false,
  totems: true,
  cosplay: false,
};
const SWSH: FormRules = {
  gen: 8,
  maxOrder: 26,
  megas: false,
  gmax: true,
  totems: false,
  cosplay: false,
};
const SV: FormRules = {
  gen: 9,
  maxOrder: 29,
  megas: false,
  gmax: false,
  totems: false,
  cosplay: false,
};

const slugs = (rules: FormRules, species: number) =>
  buildForms(species, rules, t).map((f) => f.formSlug);

test("megas only where allowed", () => {
  expect(slugs(XY, 6)).toEqual([null, "mega-x", "mega-y"]);
  expect(slugs(SWSH, 6)).toEqual([null, "gmax"]);
  expect(slugs(SV, 6)).toEqual([null]);
});

test("forms introduced after the generation's content are dropped", () => {
  expect(slugs(XY, 37)).toEqual([null]);
  expect(slugs(SM, 37)).toEqual([null, "alola"]);
});

test("totem forms only where allowed", () => {
  expect(slugs(SM, 20)).toEqual([null, "totem-alola"]);
  expect(slugs(SV, 20)).toEqual([null]);
});

test("every form carries its pokemonId", () => {
  expect(buildForms(6, XY, t).map((f) => f.pokemonId)).toEqual([
    6, 10034, 10035,
  ]);
  expect(buildForms(773, SM, t).map((f) => f.pokemonId)).toEqual([
    773, 773, 773,
  ]);
});

test("Toxtricity's two Gigantamax forms get distinct, unique keys despite sharing form_identifier 'gmax'", () => {
  const forms = buildForms(849, SWSH, t);
  expect(forms.map((f) => f.key)).toEqual([
    "849",
    "849-low-key",
    "849-amped-gmax",
    "849-low-key-gmax",
  ]);
  expect(forms.map((f) => f.formSlug)).toEqual([
    null,
    "low-key",
    "amped-gmax",
    "low-key-gmax",
  ]);
  expect(forms.map((f) => f.pokemonId)).toEqual([849, 10184, 10219, 10228]);
  // Every key is unique -- the bug this reproduces was two forms both keyed "849-gmax".
  expect(new Set(forms.map((f) => f.key)).size).toBe(forms.length);
});

test("Silvally's memory forms take the memory's type, like Arceus' plates", () => {
  const forms = buildForms(773, SM, t);
  expect(forms.map((f) => [f.formSlug, f.types])).toEqual([
    [null, ["normal"]],
    ["fire", ["fire"]],
    ["fairy", ["fairy"]],
  ]);
  expect(forms[1]!.cosmetic).toBe(false);
});
