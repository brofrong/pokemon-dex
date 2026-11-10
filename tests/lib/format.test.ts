import { expect, test } from "bun:test";
import {
  abilitySmallLabel,
  abilityView,
  formatCondition,
  formatConditions,
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
  ).toBe("Ур. 20, Атака > Защита");
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
  ).toBe("Lvl. 50, while raining");
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 30, upsideDown: true },
      "ru",
      xy,
    ),
  ).toBe("Ур. 30, консоль перевёрнута");
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 32, partyType: "dark" },
      "ru",
      xy,
    ),
  ).toBe("Ур. 32, в команде есть Покемон типа «Тёмный»");
  expect(
    formatCondition(
      { trigger: "level-up", minAffection: 2, knownMoveType: "fairy" },
      "en",
      xy,
    ),
  ).toBe("Knows a Fairy-type move, Affection 2+");
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 30, nature: "low-key" },
      "en",
      sv,
    ),
  ).toBe("Lvl. 30, Low Key nature");
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
  ).toBe("Lvl. 38, connected online");
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

test("formatCondition names held items, time of day, regional forms and one-off triggers", () => {
  expect(
    formatCondition(
      { trigger: "level-up", heldItem: "razor-claw", timeOfDay: "night" },
      "en",
      sv,
    ),
  ).toBe("Lvl. up holding Razor Claw, nighttime");
  expect(
    formatCondition(
      { trigger: "level-up", minLevel: 28, fromForm: "galar" },
      "ru",
      sv,
    ),
  ).toBe("Ур. 28, из галарской формы");
  expect(
    formatCondition(
      { trigger: "other", special: "three-critical-hits", fromForm: "galar" },
      "en",
      sv,
    ),
  ).toBe("3 critical hits in one battle, from Galarian form");
  // The Sweet and the time of day pick Alcremie's form; they're not part of the method.
  expect(
    formatCondition(
      {
        trigger: "other",
        special: "spin",
        heldItem: "love-sweet",
        timeOfDay: "day",
      },
      "ru",
      sv,
    ),
  ).toBe("Покружиться, держа сладость");
});

test("formatConditions joins alternatives with or and states shared fields once (R-B13)", () => {
  expect(
    formatConditions(
      [
        { trigger: "level-up", minLevel: 30, nature: "amped" },
        { trigger: "level-up", minLevel: 30, nature: "low-key" },
      ],
      "ru",
      sv,
    ),
  ).toBe("Ур. 30: характер «Бодрый» или «Спокойный»");
  expect(
    formatConditions(
      [
        { trigger: "use-item", item: "fire-stone" },
        { trigger: "use-item", item: "water-stone" },
      ],
      "en",
      bw,
    ),
  ).toBe("Fire Stone or Water Stone");
  expect(
    formatConditions(
      [
        { trigger: "level-up", minLevel: 25, timeOfDay: "day" },
        { trigger: "level-up", minLevel: 25, timeOfDay: "night" },
      ],
      "ru",
      sv,
    ),
  ).toBe("Ур. 25: днём или ночью");
  expect(
    formatConditions(
      [
        { trigger: "level-up", minLevel: 25, gender: "male" },
        { trigger: "level-up", minLevel: 25, gender: "female" },
      ],
      "en",
      sv,
    ),
  ).toBe("Lvl. 25");
  // An alternative that is a subset of another can't be factored; both are spelled out.
  expect(
    formatConditions(
      [
        { trigger: "level-up", minLevel: 25, timeOfDay: "day" },
        { trigger: "level-up", minLevel: 25 },
      ],
      "en",
      sv,
    ),
  ).toBe("Lvl. 25, daytime or Lvl. 25");
  expect(formatConditions([], "en", sv)).toBe("");
});

test("statColor follows the five-step scale", () => {
  expect(statColor(39)).toBe("#e06c5a");
  expect(statColor(55)).toBe("#e8a33d");
  expect(statColor(75)).toBe("#d7c53a");
  expect(statColor(95)).toBe("#7cc35a");
  expect(statColor(110)).toBe("#2fa36b");
  expect(statColor(150)).toBe("#2fa36b");
});

// Task 7: abilities with descriptions. `abilityView` is the view-model shared by the
// server-rendered `Abilities.astro` and the `#pdx-forms` JSON payload (`buildFormPayload` in
// the detail page's `index.astro`), so a client-side form switch re-renders exactly what the
// server would have. Charizard (bw): "blaze" (not hidden), "solar-power" (hidden).

test("abilitySmallLabel is null in English for a non-hidden ability (nothing useful to add)", () => {
  expect(abilitySmallLabel("blaze", false, "en", bw)).toBeNull();
});

test("abilitySmallLabel shows just the hidden badge in English", () => {
  expect(abilitySmallLabel("solar-power", true, "en", bw)).toBe("hidden");
});

test("abilitySmallLabel adds the canonical English name as a translation aid outside English", () => {
  expect(abilitySmallLabel("blaze", false, "ru", bw)).toBe("Blaze");
});

test("abilitySmallLabel combines the hidden badge and English name outside English", () => {
  expect(abilitySmallLabel("solar-power", true, "ru", bw)).toBe(
    "скрытая · Solar Power",
  );
});

test("abilityView bundles the localized name, small label and effect for the payload", () => {
  expect(abilityView("blaze", false, "ru", bw)).toEqual({
    name: "Пламя",
    small: "Blaze",
    effect:
      "Увеличивает приёмы типа Огонь до ×1,5, когда HP Покемона не превышает 1/3 максимума.",
  });
});

test("abilityView's hidden badge and effect agree with abilitySmallLabel/abilityEffect directly", () => {
  const view = abilityView("solar-power", true, "en", bw);
  expect(view.small).toBe(abilitySmallLabel("solar-power", true, "en", bw));
  expect(view.effect).toBe(bw.names.abilityEffects["solar-power"]);
  expect(view.name).toBe(bw.names.abilities["solar-power"]);
});
