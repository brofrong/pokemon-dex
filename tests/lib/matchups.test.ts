import { expect, test } from "bun:test";
import { groupMatchups, matchups } from "../../src/lib/matchups";
import bwJson from "../../src/data/gen/bw.json";
import type { GenData } from "../../src/data/types";

const gen = bwJson as unknown as GenData;

test("matchups computes Charmander's (fire) defensive profile", () => {
  const profile = matchups(["fire"], gen.chart, gen.types);
  expect(profile.water).toBe(2);
  expect(profile.ground).toBe(2);
  expect(profile.rock).toBe(2);
  expect(profile.fire).toBe(0.5);
  expect(profile.grass).toBe(0.5);
  expect(profile.ice).toBe(0.5);
  expect(profile.bug).toBe(0.5);
  expect(profile.steel).toBe(0.5);
  expect(profile.normal).toBe(1);
});

test("matchups combines dual types multiplicatively (Charizard: fire/flying)", () => {
  const profile = matchups(["fire", "flying"], gen.chart, gen.types);
  expect(profile.rock).toBe(4);
  expect(profile.ground).toBe(0);
  expect(profile.bug).toBe(0.25);
  expect(profile.grass).toBe(0.25);
  expect(profile.electric).toBe(2);
});

test("groupMatchups buckets into the five displayed multipliers and drops neutral", () => {
  const profile = matchups(["fire", "flying"], gen.chart, gen.types);
  const groups = groupMatchups(profile);
  expect(groups.get(4)).toEqual(["rock"]);
  expect(groups.get(0)).toEqual(["ground"]);
  expect(groups.get(0.25)?.sort()).toEqual(["bug", "grass"]);
  expect([...groups.keys()]).toEqual([4, 2, 0.5, 0.25, 0]);
});
