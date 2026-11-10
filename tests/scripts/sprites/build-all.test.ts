import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectHomeForms } from "../../../scripts/sprites/build-all";
import type { GenData, Pokemon } from "../../../src/data/types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pokemon-dex-home-forms-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function pokemon(id: number, forms: Pokemon["forms"]): Pokemon {
  return {
    id,
    slug: `species-${id}`,
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
    hasGenderDiff: false,
    flavor: {},
    evolution: {
      speciesId: id,
      slug: `species-${id}`,
      conditions: [],
      children: [],
    },
    forms,
  };
}

function form(key: string, pokemonId: number): Pokemon["forms"][number] {
  return {
    key,
    pokemonId,
    formSlug: key.includes("-") ? key.split("-").slice(1).join("-") : null,
    types: ["normal"],
    stats: [1, 1, 1, 1, 1, 1],
    abilities: [],
    battleOnly: false,
    cosmetic: false,
  };
}

function genData(gen: GenData["gen"], pokemon: Pokemon[]): GenData {
  return {
    gen,
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

test("merges Form.key -> pokemonId across every given dataset, deduplicating shared keys", async () => {
  const xy = genData("xy", [pokemon(1, [form("1", 1)])]);
  const sv = genData("sv", [
    pokemon(1, [form("1", 1)]),
    pokemon(900, [form("900", 900), form("900-alola", 10900)]),
  ]);
  await Bun.write(`${dir}/xy.json`, JSON.stringify(xy));
  await Bun.write(`${dir}/sv.json`, JSON.stringify(sv));

  const forms = await collectHomeForms([`${dir}/xy.json`, `${dir}/sv.json`]);

  expect(forms).toEqual(
    expect.arrayContaining([
      { key: "1", pokemonId: 1 },
      { key: "900", pokemonId: 900 },
      { key: "900-alola", pokemonId: 10900 },
    ]),
  );
  expect(forms).toHaveLength(3);
});

test("a key appearing in several datasets with the same pokemonId is merged into one entry", async () => {
  // Every real key carries the same pokemonId everywhere it appears (one species+form always
  // resolves to the same pokemon_id) -- e.g. Toxtricity's two Gigantamax forms, which used to
  // collide onto one key before scripts/data/forms.ts's uniqueSlugFor fix, now each keep their
  // own distinct key across every generation's dataset.
  const first = genData("swsh", [
    pokemon(849, [form("849-amped-gmax", 10219)]),
  ]);
  const second = genData("sv", [pokemon(849, [form("849-amped-gmax", 10219)])]);
  await Bun.write(`${dir}/a.json`, JSON.stringify(first));
  await Bun.write(`${dir}/b.json`, JSON.stringify(second));

  const forms = await collectHomeForms([`${dir}/a.json`, `${dir}/b.json`]);

  expect(forms).toEqual([{ key: "849-amped-gmax", pokemonId: 10219 }]);
});
