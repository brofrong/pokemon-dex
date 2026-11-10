import { expect, test } from "bun:test";
import {
  extractFlavorGo,
  extractForms,
  extractRu,
  mergeFormRefs,
  normalizeGoDash,
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

test("extractForms resolves an allow-listed bare form key (no species prefix in GO)", () => {
  const map = parsePogoI18n(fixture);
  const pokemon = [
    {
      slug: "frillish",
      forms: [
        { key: "592", formSlug: null },
        { key: "592-female", formSlug: "female" },
      ],
    },
  ];

  const { forms } = extractForms(map, pokemon);

  expect(forms["592-female"]).toBe("Женская Особь");
});

test("extractForms never resolves a bare key unless the pair is explicitly allow-listed, even when the bare key exists (Calyrex's Ice Rider form must not steal Eiscue's Ice Face text)", () => {
  const map = parsePogoI18n(fixture);
  const pokemon = [
    {
      slug: "calyrex",
      forms: [
        { key: "898", formSlug: null },
        { key: "898-ice", formSlug: "ice" },
      ],
    },
  ];

  const { forms, total, matched } = extractForms(map, pokemon);

  expect(forms["898-ice"]).toBeUndefined();
  expect(total).toBe(1);
  expect(matched).toBe(0);
});

test("mergeFormRefs unions non-default forms across generations by Form.key, deduping a form present in more than one generation", () => {
  const rb = [{ slug: "rotom", forms: [{ key: "479", formSlug: null }] }];
  const bw = [
    {
      slug: "rotom",
      forms: [
        { key: "479", formSlug: null },
        { key: "479-heat", formSlug: "heat" },
      ],
    },
  ];
  const sv = [
    {
      slug: "rotom",
      forms: [
        { key: "479", formSlug: null },
        { key: "479-heat", formSlug: "heat" },
        { key: "479-wash", formSlug: "wash" },
      ],
    },
  ];

  const merged = mergeFormRefs([rb, bw, sv]);

  expect(merged).toHaveLength(1);
  expect(merged[0]!.slug).toBe("rotom");
  expect(merged[0]!.forms).toHaveLength(3);
  expect(merged[0]!.forms.map((f) => f.key).sort()).toEqual([
    "479",
    "479-heat",
    "479-wash",
  ]);
});

test("normalizeGoDash converts the source's spaced en dash to a spaced em dash", () => {
  expect(normalizeGoDash("Мьюту – Покемон")).toBe("Мьюту — Покемон");
  expect(normalizeGoDash("нет тире здесь")).toBe("нет тире здесь");
});

test("extractFlavorGo reads pokemon_desc_XXXX by species id, normalizing typography", () => {
  const map = parsePogoI18n(fixture);
  const flavor = extractFlavorGo(map, [1, 150, 999]);

  expect(flavor[1]).toBe(
    "Бульбазавра можно увидеть дремлющим при ярком солнечном свете.",
  );
  expect(flavor[150]).toBe(
    "Мьюту — Покемон, созданный путём генетических манипуляций.",
  );
  expect(flavor[999]).toBeUndefined();
});

test("extractFlavorGo ignores per-form description variants (e.g. Gigantamax Venusaur's), which this site has no per-form flavor slot for", () => {
  const map = parsePogoI18n(fixture);
  const flavor = extractFlavorGo(map, [3]);

  expect(flavor[3]).toBeUndefined();
});
