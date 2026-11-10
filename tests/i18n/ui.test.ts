import { expect, test } from "bun:test";
import { LANGS, pluralRu, t, UI_EN, UI_RU } from "../../src/i18n/ui";

test("LANGS lists en and ru", () => {
  expect(LANGS).toEqual(["en", "ru"]);
});

test("every UiKey has a non-empty ru translation", () => {
  const missing = Object.keys(UI_EN).filter(
    (key) => !UI_RU[key as keyof typeof UI_RU]?.trim(),
  );
  expect(missing).toEqual([]);
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
