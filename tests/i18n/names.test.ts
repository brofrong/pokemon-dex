import { expect, test } from "bun:test";
import type { GenData } from "../../src/data/types";
import {
  abilityEffect,
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
  versionName,
} from "../../src/i18n/names";

const bw: GenData = await Bun.file("src/data/gen/bw.json").json();
const sv: GenData = await Bun.file("src/data/gen/sv.json").json();

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

test("flavorText (bw) falls back to English when ru/flavor.json has no entry for that id", () => {
  // Use a synthetic id that can never appear in flavor.json (real species ids are 1..649), so
  // this test keeps exercising the fallback regardless of how far the Task 7b/7c/7d translation
  // batches have progressed through the real dataset.
  const untranslated = {
    ...charmander,
    id: -1,
    flavor: { black: "Stand-in English flavor text." },
  };
  const enBlack = untranslated.flavor.black;
  expect(flavorText("ru", untranslated, "black", "bw")).toEqual({
    text: enBlack,
    source: "game",
  });
  expect(flavorText("en", untranslated, "black", "bw")).toEqual({
    text: enBlack,
    source: "game",
  });
});

test("flavorText returns empty text for a version the species has no text for", () => {
  expect(flavorText("en", charmander, "not-a-real-version", "bw")).toEqual({
    text: "",
    source: "game",
  });
});

test("flavorText (non-bw) prefers flavor-go.json, labeling the source 'go'", () => {
  const sprigatito = sv.pokemon.find((p) => p.slug === "sprigatito")!;
  const version = Object.keys(sprigatito.flavor)[0]!;
  const result = flavorText("ru", sprigatito, version, "sv");
  expect(result.source).toBe("go");
  expect(result.text.length).toBeGreaterThan(0);
});

test("flavorText (non-bw) falls back to flavor-extra.json when GO has no description, labeling the source 'game'", () => {
  const terapagos = sv.pokemon.find((p) => p.slug === "terapagos")!;
  const version = Object.keys(terapagos.flavor)[0]!;
  const result = flavorText("ru", terapagos, version, "sv");
  expect(result.source).toBe("game");
  expect(result.text.length).toBeGreaterThan(0);
});

test("flavorText en always reads the dataset's own English string for that version/gen, regardless of ru source", () => {
  const sprigatito = sv.pokemon.find((p) => p.slug === "sprigatito")!;
  const version = Object.keys(sprigatito.flavor)[0]!;
  expect(flavorText("en", sprigatito, version, "sv")).toEqual({
    text: sprigatito.flavor[version] ?? "",
    source: "game",
  });
});

test("abilityEffect falls back to the English short effect (ru dictionary ships empty, Task 5b fills it)", () => {
  const en = bw.names.abilityEffects["blaze"]!;
  expect(abilityEffect("en", "blaze", bw)).toBe(en);
  expect(abilityEffect("ru", "blaze", bw)).toBe(en);
});

test("versionName returns the fixed display name for a known version slug", () => {
  expect(versionName("en", "ultra-sun")).toBe("Ultra Sun");
  expect(versionName("ru", "ultra-sun")).toBe("Ultra Sun");
  expect(versionName("ru", "scarlet")).toBe("Scarlet");
});
