import { expect, test } from "bun:test";
import { cascadeEnder } from "../../src/scripts/cascade";

test("stops once every cascade card has ended, exactly once", () => {
  let stops = 0;
  const c = cascadeEnder(3, () => void stops++);
  c.ended();
  c.ended();
  expect(stops).toBe(0);
  expect(c.done).toBe(false);
  c.ended();
  expect(stops).toBe(1);
  expect(c.done).toBe(true);
  // Late events (e.g. an animationcancel after the fact) don't stop it again.
  c.ended();
  c.stopNow();
  expect(stops).toBe(1);
});

test("stopNow ends it early (first interaction / fallback timer)", () => {
  let stops = 0;
  const c = cascadeEnder(24, () => void stops++);
  c.stopNow();
  c.stopNow();
  expect(stops).toBe(1);
  c.ended();
  expect(stops).toBe(1);
});

test("no cascade cards: ended immediately", () => {
  let stops = 0;
  const c = cascadeEnder(0, () => void stops++);
  expect(stops).toBe(1);
  expect(c.done).toBe(true);
});
