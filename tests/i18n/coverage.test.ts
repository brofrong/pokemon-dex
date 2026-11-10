import { expect, test } from "bun:test";
import type { GenData } from "../../src/data/types";

import typesRu from "../../src/i18n/data/ru/types.json";
import eggGroupsRu from "../../src/i18n/data/ru/egg-groups.json";
import abilitiesRu from "../../src/i18n/data/ru/abilities.json";
import itemsRu from "../../src/i18n/data/ru/items.json";
import locationsRu from "../../src/i18n/data/ru/locations.json";
import movesRu from "../../src/i18n/data/ru/moves.json";
import genusRu from "../../src/i18n/data/ru/genus.json";
import pokemonRu from "../../src/i18n/data/ru/pokemon.json";
import flavorRu from "../../src/i18n/data/ru/flavor.json";
import { FLAVOR_TRANSLATED_UP_TO } from "./flavor-coverage";

const bw: GenData = await Bun.file("src/data/gen/bw.json").json();

/** Slugs/ids referenced in `enMap` that have no non-empty value in `ruMap`. */
function missingSlugs(
  enMap: Record<string, string>,
  ruMap: Record<string, string>,
): string[] {
  return Object.keys(enMap).filter((key) => !ruMap[key]?.trim());
}

test("types.json covers every type used by this generation", () => {
  const ru: Record<string, string> = typesRu;
  const missing = bw.types.filter((slug) => !ru[slug]?.trim());
  expect(missing).toEqual([]);
});

test("egg-groups.json covers every egg group referenced in bw.json", () => {
  const missing = missingSlugs(bw.names.eggGroups, eggGroupsRu);
  expect(missing).toEqual([]);
});

test("abilities.json covers every ability referenced in bw.json", () => {
  const missing = missingSlugs(bw.names.abilities, abilitiesRu);
  expect(missing).toEqual([]);
});

test("items.json covers every item referenced in bw.json", () => {
  const missing = missingSlugs(bw.names.items, itemsRu);
  expect(missing).toEqual([]);
});

test("locations.json covers every location referenced in bw.json", () => {
  const missing = missingSlugs(bw.names.locations, locationsRu);
  expect(missing).toEqual([]);
});

test("moves.json covers every move referenced in bw.json", () => {
  const missing = missingSlugs(bw.names.moves, movesRu);
  expect(missing).toEqual([]);
});

test("pokemon.json covers every species id 1..649", () => {
  const ru: Record<string, string> = pokemonRu;
  const missing = bw.pokemon
    .map((p) => p.id)
    .filter((id) => !ru[String(id)]?.trim());
  expect(missing).toEqual([]);
});

test("genus.json covers every species id 1..649", () => {
  const ru: Record<string, string> = genusRu;
  const missing = bw.pokemon
    .map((p) => p.id)
    .filter((id) => !ru[String(id)]?.trim());
  expect(missing).toEqual([]);
});

test(`flavor.json has black and white for every species id <= ${FLAVOR_TRANSLATED_UP_TO}`, () => {
  const ru: Record<string, { black?: string; white?: string }> = flavorRu;
  const missing: string[] = [];
  for (const p of bw.pokemon) {
    if (p.id > FLAVOR_TRANSLATED_UP_TO) continue;
    const entry = ru[String(p.id)];
    if (!entry?.black?.trim()) missing.push(`${p.id}.black`);
    if (!entry?.white?.trim()) missing.push(`${p.id}.white`);
  }
  expect(missing).toEqual([]);
});
