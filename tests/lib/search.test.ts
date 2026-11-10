import { expect, test } from "bun:test";
import type { GenData, Pokemon } from "../../src/data/types";
import {
  matchesQuery,
  normalizeQuery,
  rankSearchResults,
  searchKey,
} from "../../src/lib/search";
import { pokemonName } from "../../src/i18n/names";

const bw: GenData = await Bun.file("src/data/gen/bw.json").json();

const ids = bw.pokemon.map((p) => p.id);
const keys: Record<number, string> = {};
for (const p of bw.pokemon) keys[p.id] = searchKey(p as Pokemon);
const byId = new Map(bw.pokemon.map((p) => [p.id, p as Pokemon]));

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

// QA #16: the ⌘K palette must put an exact name match first, not the lowest id whose name the
// query happens to be a prefix of (`"mew"` matches both #150 Mewtwo and #151 Mew).
function rank(ids: number[], lang: "en" | "ru", q: string): number[] {
  const rows = ids.map((id) => ({
    id,
    name: pokemonName(lang, byId.get(id)!),
  }));
  return rankSearchResults(
    rows,
    normalizeQuery(q),
    (r) => r.id,
    (r) => r.name,
  ).map((r) => r.id);
}

test("mew -> Mew (151) ranks before the lower-numbered Mewtwo (150)", () => {
  expect(rank([150, 151], "en", "mew")[0]).toBe(151);
});

test("мью -> Мью ranks before Мьюту (RU names)", () => {
  expect(pokemonName("ru", byId.get(151)!)).toBe("Мью");
  expect(rank([150, 151], "ru", "мью")[0]).toBe(151);
});

test("a number query ranks the exact id first", () => {
  expect(rank([25, 250, 125], "en", "25")[0]).toBe(25);
});

test("prefix matches (no exact match) rank shorter name before longer, then by id", () => {
  // "char" matches Charmander (4), Charmeleon (5), Charizard (6) -- none is an exact match, so
  // they rank by name length first: "charizard" (9 letters) before the two 10-letter names,
  // which then fall back to id (Charmander, 4, before Charmeleon, 5).
  const ranked = rank([4, 5, 6], "en", "char");
  expect(ranked).toEqual([6, 4, 5]);
});

test("a whole-name prefix match ranks above a match that's only a prefix of a later word", () => {
  const rows = [
    { id: 2, name: "Mr. Mime" }, // "mime" prefixes the *second* word only -- lowest tier.
    { id: 1, name: "Mimic" }, // "mime" would also need to prefix the whole name -- not this one.
    { id: 3, name: "Mimey" }, // whole-name prefix, longer than "Mimic".
  ];
  const ranked = rankSearchResults(
    rows,
    "mime",
    (r) => r.id,
    (r) => r.name,
  ).map((r) => r.id);
  // Neither row 1 ("mimic") nor row 2 ("mr mime") starts with "mime"; row 3 ("mimey") does, so it
  // ranks first even though its id (3) is higher than both.
  expect(ranked).toEqual([3, 1, 2]);
});
