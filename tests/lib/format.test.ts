import { expect, test } from "bun:test";
import {
  formatCondition,
  formatGender,
  formatHeight,
  formatWeight,
  statColor,
} from "../../src/lib/format";
import type { GenData } from "../../src/data/types";

const bw = (await Bun.file("src/data/gen/bw.json").json()) as GenData;

test("formatHeight renders one decimal metre, localized", () => {
  expect(formatHeight(6, "ru")).toBe("0,6 м");
  expect(formatHeight(6, "en")).toBe("0.6 m");
});

test("formatWeight renders one decimal kilogram, localized", () => {
  expect(formatWeight(85, "en")).toBe("8.5 kg");
  expect(formatWeight(85, "ru")).toBe("8,5 кг");
});

test("formatGender shows the male share for a mostly-male species", () => {
  expect(formatGender(1, "ru")).toBe("♂ 87,5%");
});

test("formatGender shows the female share when the species is always female", () => {
  expect(formatGender(8, "en")).toBe("♀ 100%");
});

test("formatGender shows a genderless label for rate -1", () => {
  expect(formatGender(-1, "en")).toBe("Genderless");
  expect(formatGender(-1, "ru")).toBe("Без пола");
});

test("formatCondition renders a level-up condition", () => {
  expect(formatCondition({ trigger: "level-up", minLevel: 16 }, "ru", bw)).toBe(
    "Ур. 16",
  );
  expect(formatCondition({ trigger: "level-up", minLevel: 16 }, "en", bw)).toBe(
    "Lvl. 16",
  );
});

test("formatCondition renders a use-item condition via the localized item name", () => {
  expect(
    formatCondition({ trigger: "use-item", item: "fire-stone" }, "ru", bw),
  ).toBe("Огненный камень");
});

test("formatCondition renders a daytime-friendship condition", () => {
  expect(
    formatCondition(
      { trigger: "level-up", minHappiness: 220, timeOfDay: "day" },
      "ru",
      bw,
    ),
  ).toBe("Дружба, днём");
});

test("formatCondition renders a nighttime-friendship condition", () => {
  expect(
    formatCondition(
      { trigger: "level-up", minHappiness: 220, timeOfDay: "night" },
      "en",
      bw,
    ),
  ).toBe("Friendship, nighttime");
});

test("formatCondition combines level with a stat comparison", () => {
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 20, relativeStats: 1 },
      "ru",
      bw,
    ),
  ).toBe("Ур. 20 / Атака > Защита");
});

test("formatCondition falls back to a generic label when nothing matches", () => {
  expect(formatCondition({ trigger: "other" }, "en", bw)).toBe(
    "Special condition",
  );
});

test("statColor follows the five-step scale", () => {
  expect(statColor(39)).toBe("#e06c5a");
  expect(statColor(55)).toBe("#e8a33d");
  expect(statColor(75)).toBe("#d7c53a");
  expect(statColor(95)).toBe("#7cc35a");
  expect(statColor(110)).toBe("#2fa36b");
  expect(statColor(150)).toBe("#2fa36b");
});
