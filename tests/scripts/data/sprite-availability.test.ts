import { expect, test } from "bun:test";
import type { GenData, Pokemon, SpriteManifest } from "../../../src/data/types";
import { applySpriteAvailability } from "../../../scripts/data/sprite-availability";

function pokemon(overrides: Partial<Pokemon> = {}): Pokemon {
  const id = overrides.id ?? 1;
  return {
    id,
    slug: "test",
    name: "Test",
    genus: "Test",
    types: ["normal"],
    stats: [1, 1, 1, 1, 1, 1],
    abilities: [],
    flags: [],
    heightDm: 1,
    weightHg: 1,
    genderRate: 1,
    eggGroups: [],
    hatchCounter: 1,
    captureRate: 1,
    hasGenderDiff: true,
    flavor: {},
    evolution: { speciesId: id, slug: "test", conditions: [], children: [] },
    forms: [
      {
        key: String(id),
        pokemonId: id,
        formSlug: null,
        types: ["normal"],
        stats: [1, 1, 1, 1, 1, 1],
        abilities: [],
        battleOnly: false,
        cosmetic: false,
      },
    ],
    ...overrides,
  };
}

function genData(pokemon: Pokemon[]): GenData {
  return {
    gen: "bw",
    types: ["normal"],
    chart: {} as GenData["chart"],
    pokemon,
    names: {
      abilities: {},
      items: {},
      locations: {},
      moves: {},
      eggGroups: {},
      abilityEffects: {},
    },
  };
}

test("returns data unchanged when no manifest exists yet", () => {
  const data = genData([pokemon()]);
  expect(applySpriteAvailability(data, undefined)).toBe(data);
});

test("drops a form with no front sprite in the manifest", () => {
  const forms: Pokemon["forms"] = [
    {
      key: "201",
      pokemonId: 201,
      formSlug: null,
      types: ["normal"],
      stats: [1, 1, 1, 1, 1, 1],
      abilities: [],
      battleOnly: false,
      cosmetic: false,
    },
    {
      key: "201-a",
      pokemonId: 201,
      formSlug: "a",
      types: ["normal"],
      stats: [1, 1, 1, 1, 1, 1],
      abilities: [],
      battleOnly: false,
      cosmetic: false,
    },
  ];
  const data = genData([pokemon({ id: 201, slug: "unown", forms })]);
  const manifest: SpriteManifest = {
    canvas: 96,
    pixelated: true,
    sprites: { "201": { front: { w: 1, h: 1 } } }, // "201-a" has no front sprite
    atlas: {
      front: { file: "a.webp", width: 1, height: 1, cells: {} },
      "front-shiny": { file: "b.webp", width: 1, height: 1, cells: {} },
    },
  };

  const result = applySpriteAvailability(data, manifest);
  expect(result.pokemon[0]!.forms.map((f) => f.key)).toEqual(["201"]);
});

test("throws a clear error naming the species when its default form has no front sprite", () => {
  const forms: Pokemon["forms"] = [
    {
      key: "999",
      pokemonId: 999,
      formSlug: null,
      types: ["normal"],
      stats: [1, 1, 1, 1, 1, 1],
      abilities: [],
      battleOnly: false,
      cosmetic: false,
    },
  ];
  const data = genData([pokemon({ id: 999, slug: "missingno", forms })]);
  const manifest: SpriteManifest = {
    canvas: 96,
    pixelated: true,
    sprites: {}, // "999" (the default form) has no front sprite at all
    atlas: {
      front: { file: "a.webp", width: 1, height: 1, cells: {} },
      "front-shiny": { file: "b.webp", width: 1, height: 1, cells: {} },
    },
  };

  expect(() => applySpriteAvailability(data, manifest)).toThrow(/missingno/);
});

test("keeps every form that has a front sprite", () => {
  const forms: Pokemon["forms"] = [
    {
      key: "479",
      pokemonId: 479,
      formSlug: null,
      types: ["electric"],
      stats: [1, 1, 1, 1, 1, 1],
      abilities: [],
      battleOnly: false,
      cosmetic: false,
    },
    {
      key: "479-heat",
      pokemonId: 10008,
      formSlug: "heat",
      types: ["electric", "fire"],
      stats: [1, 1, 1, 1, 1, 1],
      abilities: [],
      battleOnly: false,
      cosmetic: false,
    },
  ];
  const data = genData([pokemon({ id: 479, slug: "rotom", forms })]);
  const manifest: SpriteManifest = {
    canvas: 96,
    pixelated: true,
    sprites: {
      "479": { front: { w: 1, h: 1 } },
      "479-heat": { front: { w: 1, h: 1 } },
    },
    atlas: {
      front: { file: "a.webp", width: 1, height: 1, cells: {} },
      "front-shiny": { file: "b.webp", width: 1, height: 1, cells: {} },
    },
  };

  const result = applySpriteAvailability(data, manifest);
  expect(result.pokemon[0]!.forms.map((f) => f.key)).toEqual([
    "479",
    "479-heat",
  ]);
});

test("ANDs hasGenderDiff with front-female sprite availability", () => {
  const withManifestHavingFemale: SpriteManifest = {
    canvas: 96,
    pixelated: true,
    sprites: {
      "25": { front: { w: 1, h: 1 }, "front-female": { w: 1, h: 1 } },
      "4": { front: { w: 1, h: 1 } }, // no front-female
    },
    atlas: {
      front: { file: "a.webp", width: 1, height: 1, cells: {} },
      "front-shiny": { file: "b.webp", width: 1, height: 1, cells: {} },
    },
  };

  const pikachu = pokemon({ id: 25, slug: "pikachu", hasGenderDiff: true });
  const charmander = pokemon({
    id: 4,
    slug: "charmander",
    hasGenderDiff: true,
  });
  const result = applySpriteAvailability(
    genData([pikachu, charmander]),
    withManifestHavingFemale,
  );

  expect(result.pokemon.find((p) => p.slug === "pikachu")!.hasGenderDiff).toBe(
    true,
  );
  // PokeAPI said Charmander has a gender diff, but no front-female sprite shipped -> false.
  expect(
    result.pokemon.find((p) => p.slug === "charmander")!.hasGenderDiff,
  ).toBe(false);
});

test("never turns hasGenderDiff true when PokeAPI says false, even if a female sprite exists", () => {
  const manifest: SpriteManifest = {
    canvas: 96,
    pixelated: true,
    sprites: { "1": { front: { w: 1, h: 1 }, "front-female": { w: 1, h: 1 } } },
    atlas: {
      front: { file: "a.webp", width: 1, height: 1, cells: {} },
      "front-shiny": { file: "b.webp", width: 1, height: 1, cells: {} },
    },
  };
  const data = genData([pokemon({ hasGenderDiff: false })]);
  const result = applySpriteAvailability(data, manifest);
  expect(result.pokemon[0]!.hasGenderDiff).toBe(false);
});
