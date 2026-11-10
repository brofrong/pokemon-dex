import { expect, test } from "bun:test";
import type { GenData, Pokemon } from "../../src/data/types";
import { matchesQuery, normalizeQuery, searchKey } from "../../src/lib/search";

const bw: GenData = await Bun.file("src/data/gen/bw.json").json();

const ids = bw.pokemon.map((p) => p.id);
const keys: Record<number, string> = {};
for (const p of bw.pokemon) keys[p.id] = searchKey(p as Pokemon);

test.each([
  ["Пика", 25],
  ["пика", 25],
  ["25", 25],
  ["025", 25],
  ["#025", 25],
  ["pika", 25],
  ["mr mime", 122],
  ["Mr. Mime", 122],
  ["мистер майм", 122],
])("%s finds %d", (q, id) => {
  expect(
    ids.filter((i) => matchesQuery(keys[i]!, normalizeQuery(q))),
  ).toContain(id);
});

test("25 does not match 250 or 125", () => {
  expect(matchesQuery(keys[250]!, normalizeQuery("25"))).toBe(false);
  expect(matchesQuery(keys[125]!, normalizeQuery("25"))).toBe(false);
});

test("ё equals е", () => {
  expect(normalizeQuery("Ёж")).toBe("еж");
});

test("normalizeQuery collapses punctuation and whitespace", () => {
  expect(normalizeQuery("  Mr.   Mime!! ")).toBe("mr mime");
});

test("normalizeQuery strips leading zeros of a pure number", () => {
  expect(normalizeQuery("0007")).toBe("7");
});

test("matchesQuery treats an empty query as matching everything", () => {
  expect(matchesQuery(keys[1]!, "")).toBe(true);
});

test("searchKey includes id, English and Russian name", () => {
  expect(keys[4]).toContain("4");
  expect(keys[4]).toContain("charmander");
  expect(keys[4]).toContain("чармандер");
});
