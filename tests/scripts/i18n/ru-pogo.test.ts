import { expect, test } from "bun:test";
import {
  extractForms,
  extractRu,
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
