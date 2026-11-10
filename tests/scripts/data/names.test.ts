import { expect, test } from "bun:test";
import { CSV_TABLES, type Tables } from "../../../scripts/data/fetch";
import {
  buildNames,
  emptyReferencedNames,
  stripProseMarkup,
} from "../../../scripts/data/names";

function makeTables(overrides: Partial<Tables>): Tables {
  const empty = Object.fromEntries(
    CSV_TABLES.map((name) => [name, []]),
  ) as unknown as Tables;
  return { ...empty, ...overrides };
}

test("strips PokeAPI [label]{kind:slug} markup to its label, or the slug when unlabeled", () => {
  expect(
    stripProseMarkup("Raises [Speed]{mechanic:speed} after each turn."),
  ).toBe("Raises Speed after each turn.");
  expect(stripProseMarkup("Immune to []{move:sand-attack}.")).toBe(
    "Immune to sand attack.",
  );
  expect(stripProseMarkup("Leaves 1 HP.  Blocks OHKO moves.")).toBe(
    "Leaves 1 HP. Blocks OHKO moves.",
  );
});

test("abilityEffects holds the English short effect of each referenced ability", () => {
  const t = makeTables({
    abilities: [
      { id: "26", identifier: "levitate", generation_id: "3" },
      { id: "130", identifier: "cursed-body", generation_id: "5" },
    ],
    ability_names: [
      { ability_id: "26", local_language_id: "9", name: "Levitate" },
    ],
    ability_prose: [
      {
        ability_id: "26",
        local_language_id: "5",
        short_effect: "Immunisé contre Sol.",
        effect: "",
      },
      {
        ability_id: "26",
        local_language_id: "9",
        short_effect: "Evades [Ground]{type:ground} moves.",
        effect: "long",
      },
      {
        ability_id: "130",
        local_language_id: "9",
        short_effect: "May disable a move.",
        effect: "long",
      },
    ],
  });
  const referenced = emptyReferencedNames();
  referenced.abilities.add("levitate");
  const names = buildNames(referenced, t);
  expect(names.abilities).toEqual({ levitate: "Levitate" });
  expect(names.abilityEffects).toEqual({ levitate: "Evades Ground moves." });
});

test("without prose, the effect falls back to the newest flavor text by version-group order", () => {
  // Version group 28 (red-green-japan) has a higher id but the lowest order.
  const t = makeTables({
    abilities: [{ id: "1", identifier: "stench", generation_id: "3" }],
    version_groups: [
      { id: "5", identifier: "ruby-sapphire", order: "7" },
      { id: "28", identifier: "red-green-japan", order: "1" },
    ],
    ability_flavor_text: [
      {
        ability_id: "1",
        version_group_id: "5",
        language_id: "9",
        flavor_text: "Helps repel\nwild POKéMON.",
      },
      {
        ability_id: "1",
        version_group_id: "28",
        language_id: "9",
        flavor_text: "Oldest.",
      },
    ],
  });
  const referenced = emptyReferencedNames();
  referenced.abilities.add("stench");
  expect(buildNames(referenced, t).abilityEffects).toEqual({
    stench: "Helps repel wild POKéMON.",
  });
});
