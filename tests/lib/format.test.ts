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

const sv = (await Bun.file("src/data/gen/sv.json").json()) as GenData;
const xy = (await Bun.file("src/data/gen/xy.json").json()) as GenData;

test("formatCondition renders the Gen VI-IX condition fields", () => {
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 50, needsRain: true },
      "en",
      xy,
    ),
  ).toBe("Lvl. 50 / Lvl. up in rain");
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 30, upsideDown: true },
      "ru",
      xy,
    ),
  ).toBe("Ур. 30 / Ур. вверх ногами");
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 32, partyType: "dark" },
      "ru",
      xy,
    ),
  ).toBe("Ур. 32 / в команде есть Покемон типа «Тёмный»");
  expect(
    formatCondition(
      { trigger: "level-up", minAffection: 2, knownMoveType: "fairy" },
      "en",
      xy,
    ),
  ).toBe("Knows a Fairy-type move / Affection 2+");
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 30, nature: "low-key" },
      "en",
      sv,
    ),
  ).toBe("Lvl. 30 / Low Key nature");
  expect(
    formatCondition({ trigger: "level-up", nature: "amped" }, "ru", sv),
  ).toBe("Характер «Бодрый»");
  expect(
    formatCondition({ trigger: "level-up", minDamageTaken: 49 }, "en", sv),
  ).toBe("49 HP damage taken");
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 38, needsMultiplayer: true },
      "en",
      sv,
    ),
  ).toBe("Lvl. 38 / Lvl. up, connected online");
});

test("formatCondition pluralizes used-move counts and step counts", () => {
  expect(
    formatCondition(
      { trigger: "level-up", usedMove: "rage-fist", usedMoveCount: 20 },
      "ru",
      sv,
    ),
  ).toMatch(/^Использовал приём «.+» 20 раз$/);
  expect(
    formatCondition(
      { trigger: "level-up", usedMove: "rage-fist", usedMoveCount: 20 },
      "en",
      sv,
    ),
  ).toMatch(/^Used “.+” 20×$/);
  expect(
    formatCondition({ trigger: "level-up", minSteps: 1000 }, "en", sv),
  ).toBe("1,000 steps together");
  expect(
    formatCondition({ trigger: "level-up", minSteps: 1000 }, "ru", sv),
  ).toBe("1\u00a0000 шагов вместе");
});

test("statColor follows the five-step scale", () => {
  expect(statColor(39)).toBe("#e06c5a");
  expect(statColor(55)).toBe("#e8a33d");
  expect(statColor(75)).toBe("#d7c53a");
  expect(statColor(95)).toBe("#7cc35a");
  expect(statColor(110)).toBe("#2fa36b");
  expect(statColor(150)).toBe("#2fa36b");
});
