import { expect, test } from "bun:test";
import {
  extractForms,
  extractRu,
  normalizeLatinLookalikes,
  parsePogoI18n,
} from "../../../scripts/i18n/ru-pogo";

const fixture = JSON.parse(
  await Bun.file("tests/fixtures/pogo-ru.json").text(),
) as { data: string[] };

test("parsePogoI18n maps the flat alternating array to a key -> value map", () => {
  const map = parsePogoI18n(fixture);
  expect(map.get("pokemon_name_0001")).toBe("Бульбазавр");
  expect(map.get("pokemon_category_0004")).toBe("Покемон-Ящерица");
  expect(map.get("form_rotom_heat")).toBe("Ротом-Жар");
  expect(map.get("1106_name")).toBe("Камень Синно");
});

test("extractRu reads pokemon_name_XXXX and pokemon_category_XXXX for the requested ids", () => {
  const map = parsePogoI18n(fixture);
  const { names, genus } = extractRu(map, [1, 4, 5, 6, 25, 122, 133]);

  expect(names[1]).toBe("Бульбазавр");
  expect(names[4]).toBe("Чармандер");
  expect(names[5]).toBe("Чармелеон");
  expect(names[6]).toBe("Чаризард");
  expect(names[25]).toBe("Пикачу");
  expect(names[122]).toBe("Мистер Майм");
  expect(names[133]).toBe("Иви");

  expect(genus[4]).toBe("Покемон-Ящерица");
  expect(genus[133]).toBe("Эволюционный Покемон");
});

test("every extracted fixture name is plain Cyrillic text", () => {
  const map = parsePogoI18n(fixture);
  const { names } = extractRu(map, [1, 4, 5, 6, 25, 122, 133]);
  expect(Object.values(names).every((n) => /^[А-ЯЁа-яё ]+$/.test(n))).toBe(
    true,
  );
});

// Built from explicit \u escapes (not typed Cyrillic/Latin glyphs) so the test itself can't
// silently contain the wrong look-alike character.
const CYR_KHA = "Х"; // Х
const CYR_o = "о"; // о
const CYR_O = "О"; // О
const LATIN_O = "O"; // O

test("normalizeLatinLookalikes fixes a Latin letter sitting next to Cyrillic letters (Ho-Oh's name in the GO source)", () => {
  const input = `${CYR_KHA}${CYR_o}-${LATIN_O}${CYR_KHA}`; // "Хо-Oх" with Latin capital O
  const expected = `${CYR_KHA}${CYR_o}-${CYR_O}${CYR_KHA}`; // "Хо-Ох" all Cyrillic
  expect(normalizeLatinLookalikes(input)).toBe(expected);
});

test("normalizeLatinLookalikes leaves a genuinely Latin word untouched", () => {
  expect(normalizeLatinLookalikes("HP")).toBe("HP");
  expect(normalizeLatinLookalikes("Pokemon")).toBe("Pokemon");
});

test("normalizeLatinLookalikes fixes a Latin letter adjacent to Cyrillic on only one side, preserving case", () => {
  const input = `т${LATIN_O}вар`; // "т" + Latin capital O + "вар"
  expect(normalizeLatinLookalikes(input)).toBe(`т${CYR_O}вар`); // uppercase O -> uppercase О
});

test("extractForms resolves Cherrim's sunshine form via the spelling alias (GO key is form_cherrim_sunny, not form_cherrim_sunshine)", () => {
  const map = parsePogoI18n(fixture);
  const pokemon = [
    {
      slug: "cherrim",
      forms: [
        { key: "421", formSlug: null },
        { key: "421-sunshine", formSlug: "sunshine" },
      ],
    },
  ];

  const { forms, total, matched } = extractForms(map, pokemon);

  expect(forms["421-sunshine"]).toBe("Форма Солнечная Погода");
  expect(total).toBe(1);
  expect(matched).toBe(1);
});
