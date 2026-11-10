import { expect, test } from "bun:test";
import { withBase } from "../../src/lib/urls";

test("withBase prefixes a leading-slash path with the base", () => {
  expect(withBase("/en/bw/")).toBe("/pokemon-dex/en/bw/");
});

test("withBase prefixes a path without a leading slash", () => {
  expect(withBase("en/bw/")).toBe("/pokemon-dex/en/bw/");
});

test("withBase works for asset paths", () => {
  expect(withBase("/sprites/bw/front/1.webp")).toBe(
    "/pokemon-dex/sprites/bw/front/1.webp",
  );
});

test("withBase keeps query and hash", () => {
  expect(withBase("/en/bw/?type=fire#x")).toBe(
    "/pokemon-dex/en/bw/?type=fire#x",
  );
});

test("withBase handles the root path", () => {
  expect(withBase("/")).toBe("/pokemon-dex/");
});
