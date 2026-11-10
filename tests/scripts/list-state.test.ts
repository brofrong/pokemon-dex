import { expect, test } from "bun:test";
import {
  parseListState,
  serializeListState,
} from "../../src/scripts/list-state";

const DEFAULT = parseListState("");

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

test("garbage ignored", () => {
  expect(parseListState("?type=fairy,bogus&sort=x").types).toEqual([]);
  expect(parseListState("?type=fairy,bogus&sort=x").sort).toBe("id");
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
