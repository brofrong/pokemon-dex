import { expect, test } from "bun:test";
import type { GenData } from "../../src/data/types";
import {
  abilityName,
  eggGroupName,
  flavorText,
  formName,
  genus,
  itemName,
  locationName,
  moveName,
  pokemonName,
  typeName,
} from "../../src/i18n/names";

const bw: GenData = await Bun.file("src/data/gen/bw.json").json();

const charmander = bw.pokemon.find((p) => p.slug === "charmander")!;
const rotom = bw.pokemon.find((p) => p.slug === "rotom")!;
const heatForm = rotom.forms.find((f) => f.formSlug === "heat")!;

test("pokemonName returns English and Russian official names", () => {
  expect(pokemonName("en", charmander)).toBe("Charmander");
  expect(pokemonName("ru", charmander)).toBe("Чармандер");
});

test("genus returns English and Russian category", () => {
  expect(genus("en", charmander)).toBe(charmander.genus);
  expect(genus("ru", charmander)).toBe("Покемон-Ящерица");
});

test("typeName returns the fixed GO-aligned ru type names", () => {
  expect(typeName("ru", "fire")).toBe("Огонь");
  expect(typeName("ru", "bug")).toBe("Насекомое");
  expect(typeName("ru", "ghost")).toBe("Привидение");
  expect(typeName("en", "fire")).toBe("Fire");
});

test("abilityName looks up the ru dictionary by slug", () => {
  expect(abilityName("ru", "blaze", bw)).toBe("Пламя");
  expect(abilityName("en", "blaze", bw)).toBe("Blaze");
});

test("itemName, locationName, moveName, eggGroupName translate referenced slugs", () => {
  expect(itemName("ru", "fire-stone", bw)).toBe("Огненный камень");
  expect(locationName("ru", "pinwheel-forest", bw)).toBe("Лес Вертушка");
  expect(moveName("ru", "ancient-power", bw)).toBe("Древняя сила");
  expect(eggGroupName("ru", "monster", bw)).toBe("Монстр");
});

test("formName builds a readable English label and uses the ru forms dictionary", () => {
  expect(formName("en", rotom, heatForm)).toBe("Rotom (Heat)");
  expect(formName("ru", rotom, heatForm)).toBe("Ротом-Жар");
});

test("formName falls back to the English label when ru has no entry for that form", () => {
  // Arceus has GO strings for its plate forms, but most other forms (e.g. Unown letters) don't;
  // pick a species whose non-default form is not in forms.json to exercise the fallback.
  const unown = bw.pokemon.find((p) => p.slug === "unown")!;
  const bForm = unown.forms.find((f) => f.formSlug === "b");
  if (bForm) {
    expect(formName("ru", unown, bForm)).toBe(formName("en", unown, bForm));
  }
});

test("flavorText falls back to English when ru/flavor.json has no entry yet", () => {
  const enBlack = charmander.flavor.black ?? "";
  expect(enBlack.length).toBeGreaterThan(0);
  expect(flavorText("ru", charmander, "black")).toBe(enBlack);
  expect(flavorText("en", charmander, "black")).toBe(enBlack);
});

test("flavorText returns empty string for a version the species has no text for", () => {
  expect(flavorText("en", charmander, "not-a-real-version")).toBe("");
});
