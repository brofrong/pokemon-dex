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
const xy: GenData = await Bun.file("src/data/gen/xy.json").json();
const swsh: GenData = await Bun.file("src/data/gen/swsh.json").json();
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

test("formName composes a Russian mega name when forms.json has no entry (fix round 1, finding 5)", () => {
  const charizardXy = xy.pokemon.find((p) => p.slug === "charizard")!;
  const megaX = charizardXy.forms.find((f) => f.formSlug === "mega-x")!;
  const megaY = charizardXy.forms.find((f) => f.formSlug === "mega-y")!;
  expect(formName("ru", charizardXy, megaX)).toBe("Мега-Чаризард X");
  expect(formName("ru", charizardXy, megaY)).toBe("Мега-Чаризард Y");
});

test("formName composes a Russian Gigantamax name when forms.json has no entry", () => {
  const charizardSwsh = swsh.pokemon.find((p) => p.slug === "charizard")!;
  const gmax = charizardSwsh.forms.find((f) => f.formSlug === "gmax")!;
  expect(formName("ru", charizardSwsh, gmax)).toBe("Чаризард (Гигантамакс)");
});

test("formName composes a Russian regional-form name using the species' own official ru name", () => {
  const vulpix = sv.pokemon.find((p) => p.slug === "vulpix")!;
  const vulpixAlola = vulpix.forms.find((f) => f.formSlug === "alola")!;
  expect(pokemonName("ru", vulpix)).toBe("Валпикс");
  expect(formName("ru", vulpix, vulpixAlola)).toBe("Валпикс (Алола)");

  const growlithe = sv.pokemon.find((p) => p.slug === "growlithe")!;
  const growlitheHisui = growlithe.forms.find((f) => f.formSlug === "hisui")!;
  expect(formName("ru", growlithe, growlitheHisui)).toBe("Гроулит (Хисуи)");

  const wooper = sv.pokemon.find((p) => p.slug === "wooper")!;
  const wooperPaldea = wooper.forms.find((f) => f.formSlug === "paldea")!;
  expect(formName("ru", wooper, wooperPaldea)).toBe("Вупер (Пальдея)");
});

test("formName's regional composition best-effort-labels a composite formSlug's extra part in English", () => {
  const tauros = sv.pokemon.find((p) => p.slug === "tauros")!;
  const combatBreed = tauros.forms.find(
    (f) => f.formSlug === "paldea-combat-breed",
  )!;
  expect(formName("ru", tauros, combatBreed)).toBe(
    "Таурос (Пальдея, Combat Breed)",
  );
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

test("abilityEffect returns the Russian translation for a real slug (Task 5b)", () => {
  expect(abilityEffect("en", "blaze", bw)).toBe(
    bw.names.abilityEffects["blaze"],
  );
  expect(abilityEffect("ru", "blaze", bw)).toBe(
    "Усиливает приёмы типа Огонь до ×1,5, когда HP Покемона не превышает 1/3 максимума.",
  );
});

test("abilityEffect falls back to the English text when the ru dictionary has no entry for a slug", () => {
  // Synthetic gen data with a made-up slug: no real generation references an untranslated
  // ability (coverage.test.ts enforces that), so this exercises the fallback path directly
  // rather than relying on a real gap.
  const fakeGen: GenData = {
    ...bw,
    names: {
      ...bw.names,
      abilityEffects: {
        ...bw.names.abilityEffects,
        "made-up-ability": "Some effect text.",
      },
    },
  };
  expect(abilityEffect("en", "made-up-ability", fakeGen)).toBe(
    "Some effect text.",
  );
  expect(abilityEffect("ru", "made-up-ability", fakeGen)).toBe(
    "Some effect text.",
  );
});

test("versionName returns the fixed display name for a known version slug", () => {
  expect(versionName("en", "ultra-sun")).toBe("Ultra Sun");
  expect(versionName("ru", "ultra-sun")).toBe("Ultra Sun");
  expect(versionName("ru", "scarlet")).toBe("Scarlet");
});
