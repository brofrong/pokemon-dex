import { expect, test } from "bun:test";
import {
  parseListState,
  serializeListState,
  sortComparator,
} from "../../src/scripts/list-state";
import { getGen } from "../../src/lib/generations";

const DEFAULT = parseListState("");
const BW_TYPES = getGen("bw")!.types;
const RB_TYPES = getGen("rb")!.types;

test("state round trip and defaults", () => {
  const s = parseListState("?type=fire,flying&sort=spe&dir=desc&shiny=1");
  expect(s).toMatchObject({
    types: ["fire", "flying"],
    sort: "spe",
    dir: "desc",
    shiny: true,
  });
  expect(serializeListState(parseListState(""))).toBe("");
});

test("a serialized state restores to the same state (every field)", () => {
  const s = {
    q: "пика",
    types: ["water", "ice"] as const,
    flags: ["legendary", "new"] as const,
    sort: "total" as const,
    dir: "desc" as const,
    shiny: true,
  };
  const state = { ...s, types: [...s.types], flags: [...s.flags] };
  expect(parseListState(serializeListState(state))).toEqual(state);
});

test("garbage ignored; a type the generation lacks is garbage too", () => {
  expect(parseListState("?type=fairy,bogus&sort=x", BW_TYPES).types).toEqual(
    [],
  );
  expect(parseListState("?type=fairy,bogus&sort=x", BW_TYPES).sort).toBe("id");
  expect(parseListState("?type=dark,steel,fire", RB_TYPES).types).toEqual([
    "fire",
  ]);
});

test("without a type list, every modern type (fairy included) is valid", () => {
  expect(parseListState("?type=fairy").types).toEqual(["fairy"]);
});

test("at most 2 types are kept, in order, extras dropped", () => {
  expect(parseListState("?type=fire,water,grass").types).toEqual([
    "fire",
    "water",
  ]);
});

test("leading '?' is optional", () => {
  expect(parseListState("sort=name").sort).toBe("name");
});

test("serializeListState omits defaults and includes only set fields", () => {
  expect(serializeListState({ ...DEFAULT, q: "pika" })).toBe("q=pika");
  expect(serializeListState({ ...DEFAULT, shiny: true })).toBe("shiny=1");
});

// QA bug #19: names sort by the page language's collation, not by code point.
test("sortComparator orders Russian names with ё next to е", () => {
  const names = ["Слоупок", "Слиггу", "Слёрпафф", "Слоубро"];
  expect([...names].sort(sortComparator("ru"))).toEqual([
    "Слёрпафф",
    "Слиггу",
    "Слоубро",
    "Слоупок",
  ]);
  expect(
    ["Железный Шип", "Железный Мотылёк", "Ёжик"].sort(sortComparator("ru")),
  ).toEqual(["Ёжик", "Железный Мотылёк", "Железный Шип"]);
});

test("sortComparator compares numbers numerically", () => {
  expect([10, 9, 100].sort(sortComparator("en"))).toEqual([9, 10, 100]);
  expect(sortComparator("en")("Mew", "Mewtwo")).toBeLessThan(0);
});
