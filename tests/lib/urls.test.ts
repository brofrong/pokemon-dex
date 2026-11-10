import { expect, test } from "bun:test";
import { listUrl, pokemonUrl, swapLang, withBase } from "../../src/lib/urls";

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

test("listUrl builds a bare generation list URL", () => {
  expect(listUrl("en", "bw")).toBe("/pokemon-dex/en/bw/");
  expect(listUrl("ru", "bw")).toBe("/pokemon-dex/ru/bw/");
});

test("listUrl appends a query string, with or without a leading '?'", () => {
  expect(listUrl("ru", "bw", "type=fire,flying")).toBe(
    "/pokemon-dex/ru/bw/?type=fire,flying",
  );
  expect(listUrl("ru", "bw", "?type=fire,flying")).toBe(
    "/pokemon-dex/ru/bw/?type=fire,flying",
  );
});

test("listUrl omits an empty query string", () => {
  expect(listUrl("en", "bw", "")).toBe("/pokemon-dex/en/bw/");
  expect(listUrl("en", "bw", "?")).toBe("/pokemon-dex/en/bw/");
});

test("pokemonUrl builds a detail URL with a form query", () => {
  expect(pokemonUrl("ru", "bw", "rotom", "heat")).toBe(
    "/pokemon-dex/ru/bw/pokemon/rotom/?form=heat",
  );
});

test("pokemonUrl omits the query string for the default form", () => {
  expect(pokemonUrl("en", "bw", "charmander")).toBe(
    "/pokemon-dex/en/bw/pokemon/charmander/",
  );
  expect(pokemonUrl("en", "bw", "charmander", null)).toBe(
    "/pokemon-dex/en/bw/pokemon/charmander/",
  );
});

test("swapLang replaces only the language segment", () => {
  expect(swapLang("/pokemon-dex/en/bw/pokemon/eevee/", "ru")).toBe(
    "/pokemon-dex/ru/bw/pokemon/eevee/",
  );
});

test("swapLang preserves a trailing query string", () => {
  expect(swapLang("/pokemon-dex/en/bw/?type=fire&sort=speed", "ru")).toBe(
    "/pokemon-dex/ru/bw/?type=fire&sort=speed",
  );
});

test("swapLang leaves a pathname outside the base untouched", () => {
  expect(swapLang("/elsewhere/en/", "ru")).toBe("/elsewhere/en/");
});
