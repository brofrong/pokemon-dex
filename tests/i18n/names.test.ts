import { expect, test } from "bun:test";
import type { GenData } from "../../src/data/types";
import {
  abilityEffect,
  abilityName,
  eggGroupName,
  defaultFormName,
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

const rb: GenData = await Bun.file("src/data/gen/rb.json").json();
const gs: GenData = await Bun.file("src/data/gen/gs.json").json();
const rs: GenData = await Bun.file("src/data/gen/rs.json").json();
const dp: GenData = await Bun.file("src/data/gen/dp.json").json();
const bw: GenData = await Bun.file("src/data/gen/bw.json").json();
const xy: GenData = await Bun.file("src/data/gen/xy.json").json();
const sm: GenData = await Bun.file("src/data/gen/sm.json").json();
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

test("formName names a regional composite form's extra part in Russian (QA bug #3)", () => {
  const tauros = sv.pokemon.find((p) => p.slug === "tauros")!;
  const combatBreed = tauros.forms.find(
    (f) => f.formSlug === "paldea-combat-breed",
  )!;
  expect(formName("ru", tauros, combatBreed)).toBe(
    "Таурос (Пальдея, Порода Сражение)",
  );
  const darmanitan = swsh.pokemon.find((p) => p.slug === "darmanitan")!;
  const galarZen = darmanitan.forms.find((f) => f.formSlug === "galar-zen")!;
  expect(formName("ru", darmanitan, galarZen)).toBe(
    "Дарманитан (Галар, Режим Дзен)",
  );
});

test("formName composes every QA bug #3 form kind in Russian", () => {
  const ru = (gen: GenData, slug: string, formSlug: string) => {
    const p = gen.pokemon.find((x) => x.slug === slug)!;
    const form = p.forms.find((f) => f.formSlug === formSlug)!;
    return formName("ru", p, form);
  };
  expect(ru(swsh, "toxtricity", "amped-gmax")).toBe(
    "Токстрисити (Восторженная Форма, Гигантамакс)",
  );
  expect(ru(swsh, "toxtricity", "low-key-gmax")).toBe(
    "Токстрисити (Сдержанная Форма, Гигантамакс)",
  );
  expect(ru(swsh, "toxtricity", "low-key")).toBe(
    "Токстрисити (Сдержанная Форма)",
  );
  expect(ru(swsh, "urshifu", "rapid-strike-gmax")).toBe(
    "Уршифу (Стиль Серийный Удар, Гигантамакс)",
  );
  expect(ru(sm, "pikachu", "original-cap")).toBe("Пикачу в оригинальной кепке");
  expect(ru(sm, "pikachu", "alola-cap")).toBe("Пикачу в кепке Алолы");
  expect(ru(bw, "unown", "b")).toBe("Аноун (B)");
  expect(ru(bw, "unown", "question")).toBe("Аноун (?)");
  expect(ru(sm, "minior", "orange-meteor")).toBe(
    "Миниор (Метеорная Форма, Оранжевое Ядро)",
  );
  expect(ru(sm, "minior", "blue")).toBe("Миниор (Голубое Ядро)");
  expect(ru(swsh, "alcremie", "matcha-cream-strawberry-sweet")).toBe(
    "Алкреми (Сливки с Чаем Матча, Клубничная Сладость)",
  );
  expect(ru(sv, "ogerpon", "wellspring-mask")).toBe("Огерпон (Маска Родника)");
  expect(ru(sm, "lurantis", "totem")).toBe("Лурантис (Тотем)");
  expect(ru(sm, "raticate", "totem-alola")).toBe("Ратикейт (Алола, Тотем)");
  expect(ru(sm, "mimikyu", "totem-busted")).toBe(
    "Мимикью (Сломанная Форма, Тотем)",
  );
  expect(ru(sm, "scatterbug", "sun")).toBe("Скаттербаг (Солнечный Узор)");
  // A GO string that already names the species is kept as it is.
  expect(ru(bw, "rotom", "heat")).toBe("Ротом-Жар");
  expect(ru(xy, "kyurem", "black")).toBe("Чёрный Курем");
});

test("no Russian form name in any generation falls back to Latin script (QA bug #3)", () => {
  // Legitimately Latin: Unown's letters, the X/Y of Mega Charizard/Mewtwo X and Y, and the Z of
  // Porygon-Z's own official name.
  const allowed = /^Аноун \([A-Z]\)$|^Мега-\S+ [XY]$|^Поригон-Z$/;
  const offenders: string[] = [];
  for (const gen of [rb, gs, rs, dp, bw, xy, sm, swsh, sv]) {
    for (const p of gen.pokemon) {
      for (const form of p.forms) {
        const name = form.formSlug
          ? formName("ru", p, form)
          : defaultFormName("ru", p);
        if (/[A-Za-z]/.test(name) && !allowed.test(name)) {
          offenders.push(`${gen.gen} ${form.key}: ${name}`);
        }
      }
    }
  }
  expect(offenders).toEqual([]);
});

test("defaultFormName labels a named default form like its siblings, else the plain name", () => {
  const toxtricity = swsh.pokemon.find((p) => p.slug === "toxtricity")!;
  expect(defaultFormName("ru", toxtricity)).toBe(
    "Токстрисити (Восторженная Форма)",
  );
  expect(defaultFormName("en", toxtricity)).toBe("Toxtricity (Amped)");
  const deoxys = dp.pokemon.find((p) => p.slug === "deoxys")!;
  expect(defaultFormName("ru", deoxys)).toBe("Деоксис (Обычная Форма)");
  const charizard = xy.pokemon.find((p) => p.slug === "charizard")!;
  expect(defaultFormName("ru", charizard)).toBe("Чаризард");
  expect(defaultFormName("en", charizard)).toBe("Charizard");
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
    "Увеличивает приёмы типа Огонь до ×1,5, когда HP Покемона не превышает 1/3 максимума.",
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
