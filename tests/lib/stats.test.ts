import { expect, test } from "bun:test";
import type { GenData } from "../../src/data/types";
import { listTuples } from "../../src/lib/list-data";
import {
  hasSingleSpecial,
  statRowIndices,
  statTotal,
} from "../../src/lib/stats";

const rb = (await Bun.file("src/data/gen/rb.json").json()) as GenData;
const bw = (await Bun.file("src/data/gen/bw.json").json()) as GenData;
const find = (data: GenData, slug: string) =>
  data.pokemon.find((p) => p.slug === slug)!;

// QA bug #9 / Ruling R-B9: Gen I had one Special stat.
test("only Red/Blue has a single Special stat", () => {
  expect(hasSingleSpecial("rb")).toBe(true);
  for (const id of [
    "gs",
    "rs",
    "dp",
    "bw",
    "xy",
    "sm",
    "swsh",
    "sv",
  ] as const) {
    expect(hasSingleSpecial(id)).toBe(false);
  }
});

test("a single-Special generation shows five rows and counts Special once", () => {
  expect(statRowIndices(true)).toEqual([0, 1, 2, 3, 5]);
  expect(statRowIndices(false)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(statTotal(find(rb, "gengar").stats, true)).toBe(425);
  expect(statTotal(find(rb, "mew").stats, true)).toBe(500);
  expect(statTotal(find(bw, "gengar").stats, false)).toBe(500);
});

test("the rb dataset (and so list.json) holds Special in both special slots", () => {
  for (const [, , stats] of listTuples(rb)) expect(stats[3]).toBe(stats[4]);
});

test("rb's total ranks Mew and Dragonite above Moltres", () => {
  const total = (slug: string) => statTotal(find(rb, slug).stats, true);
  expect(total("mew")).toBe(500);
  expect(total("dragonite")).toBe(500);
  expect(total("moltres")).toBe(495);
});
