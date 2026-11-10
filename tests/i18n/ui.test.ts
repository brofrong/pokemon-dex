import { expect, test } from "bun:test";
import {
  COUNT_EN,
  COUNT_RU,
  LANGS,
  pluralRu,
  t,
  tCount,
  UI_EN,
  UI_RU,
} from "../../src/i18n/ui";

/** The set of `{name}` placeholder names used in a template string. */
function placeholders(template: string): Set<string> {
  return new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

test("LANGS lists en and ru", () => {
  expect(LANGS).toEqual(["en", "ru"]);
});

test("every UiKey has a non-empty ru translation", () => {
  const missing = Object.keys(UI_EN).filter(
    (key) => !UI_RU[key as keyof typeof UI_RU]?.trim(),
  );
  expect(missing).toEqual([]);
});

test("every UiKey has the same {placeholders} in en and ru", () => {
  const mismatches: string[] = [];
  for (const key of Object.keys(UI_EN) as (keyof typeof UI_EN)[]) {
    const en = placeholders(UI_EN[key]);
    const ru = placeholders(UI_RU[key]);
    if (!sameSet(en, ru)) {
      mismatches.push(`${key}: en={${[...en]}} ru={${[...ru]}}`);
    }
  }
  expect(mismatches).toEqual([]);
});

test("every CountKey form has matching {placeholders} across en one/other and ru one/few/many", () => {
  const mismatches: string[] = [];
  for (const key of Object.keys(COUNT_EN) as (keyof typeof COUNT_EN)[]) {
    const enForms = COUNT_EN[key];
    const ruForms = COUNT_RU[key];
    const sets = [
      placeholders(enForms.one),
      placeholders(enForms.other),
      placeholders(ruForms.one),
      placeholders(ruForms.few),
      placeholders(ruForms.many),
    ];
    const allSame = sets.every((s) => sameSet(s, sets[0]!));
    if (!allSame) {
      mismatches.push(
        `${key}: ${sets.map((s) => [...s].join(",")).join(" | ")}`,
      );
    }
  }
  expect(mismatches).toEqual([]);
});

test("t returns the fixed ru stat name", () => {
  expect(t("ru", "stat.total")).toBe("Сумма");
});

test("t returns the fixed en stat name", () => {
  expect(t("en", "stat.total")).toBe("Total");
});

test("t substitutes a numeric placeholder", () => {
  expect(t("ru", "evo.level", { level: 16 })).toBe("Ур. 16");
  expect(t("en", "evo.level", { level: 16 })).toBe("Lvl. 16");
});

test("t substitutes a string placeholder", () => {
  expect(t("ru", "evo.item", { item: "Огненный камень" })).toBe(
    "Огненный камень",
  );
});

test("t substitutes the same placeholder appearing more than once", () => {
  expect(t("ru", "evo.tradeSpecies", { species: "Карраблёст" })).toBe(
    "Обмен на «Карраблёст»",
  );
});

test("evo.knownMoveType avoids declining the type name after a preposition", () => {
  expect(t("ru", "evo.knownMoveType", { type: "Огонь" })).toBe(
    "Знает приём (тип: Огонь)",
  );
  expect(t("en", "evo.knownMoveType", { type: "Fire" })).toBe(
    "Knows a Fire-type move",
  );
});

test("evo.stats.* use nominative case consistently with the comparison symbols", () => {
  expect(t("ru", "evo.stats.gt")).toBe("Атака > Защита");
  expect(t("ru", "evo.stats.eq")).toBe("Атака = Защита");
  expect(t("ru", "evo.stats.lt")).toBe("Атака < Защита");
});

test("tCount picks the correct ru plural form by count", () => {
  expect(tCount("ru", "list.count", 1)).toBe(
    "1 покемон · поиск и фильтры срабатывают сразу, без ожидания",
  );
  expect(tCount("ru", "list.count", 2)).toBe(
    "2 покемона · поиск и фильтры срабатывают сразу, без ожидания",
  );
  expect(tCount("ru", "list.count", 5)).toBe(
    "5 покемонов · поиск и фильтры срабатывают сразу, без ожидания",
  );
  expect(tCount("ru", "list.count", 21)).toBe(
    "21 покемон · поиск и фильтры срабатывают сразу, без ожидания",
  );
  expect(tCount("ru", "list.count", 649)).toBe(
    "649 покемонов · поиск и фильтры срабатывают сразу, без ожидания",
  );
});

test("tCount is not pluralized in en (Pokémon is invariant)", () => {
  expect(tCount("en", "list.count", 1)).toBe(
    "1 Pokémon · search and filters apply instantly, no waiting",
  );
  expect(tCount("en", "list.count", 649)).toBe(
    "649 Pokémon · search and filters apply instantly, no waiting",
  );
});

test("tCount renders evo.usedMove with the correct ru plural and the extra {move} var (fix round 1, finding 3)", () => {
  expect(tCount("ru", "evo.usedMove", 1, { move: "Рывок" })).toBe(
    "Использовал приём «Рывок» 1 раз",
  );
  expect(tCount("ru", "evo.usedMove", 2, { move: "Рывок" })).toBe(
    "Использовал приём «Рывок» 2 раза",
  );
  expect(tCount("ru", "evo.usedMove", 5, { move: "Рывок" })).toBe(
    "Использовал приём «Рывок» 5 раз",
  );
  expect(tCount("ru", "evo.usedMove", 21, { move: "Рывок" })).toBe(
    "Использовал приём «Рывок» 21 раз",
  );
});

test("tCount renders evo.usedMove in en (invariant across counts)", () => {
  expect(tCount("en", "evo.usedMove", 1, { move: "Tackle" })).toBe(
    "Used “Tackle” 1×",
  );
  expect(tCount("en", "evo.usedMove", 21, { move: "Tackle" })).toBe(
    "Used “Tackle” 21×",
  );
});

test("tCount renders evo.minSteps with the correct ru plural (fix round 1, finding 3)", () => {
  expect(tCount("ru", "evo.minSteps", 1)).toBe("1 шаг вместе");
  expect(tCount("ru", "evo.minSteps", 2)).toBe("2 шага вместе");
  expect(tCount("ru", "evo.minSteps", 5)).toBe("5 шагов вместе");
  expect(tCount("ru", "evo.minSteps", 21)).toBe("21 шаг вместе");
});

test("tCount renders evo.minSteps in en with singular/plural 'step(s)'", () => {
  expect(tCount("en", "evo.minSteps", 1)).toBe("1 step together");
  expect(tCount("en", "evo.minSteps", 2)).toBe("2 steps together");
  expect(tCount("en", "evo.minSteps", 21)).toBe("21 steps together");
});

test("pluralRu picks the Russian plural form by count", () => {
  const forms: [string, string, string] = ["покемон", "покемона", "покемонов"];
  expect(pluralRu(1, forms)).toBe("покемон");
  expect(pluralRu(21, forms)).toBe("покемон");
  expect(pluralRu(2, forms)).toBe("покемона");
  expect(pluralRu(4, forms)).toBe("покемона");
  expect(pluralRu(5, forms)).toBe("покемонов");
  expect(pluralRu(11, forms)).toBe("покемонов");
  expect(pluralRu(649, forms)).toBe("покемонов");
});
