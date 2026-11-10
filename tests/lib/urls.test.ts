import { expect, test } from "bun:test";
import {
  langSwitchHref,
  listUrl,
  pokemonUrl,
  swapLang,
  withBase,
} from "../../src/lib/urls";

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

// Regression coverage for the "language switch loses list state" QA bug: the RU link on
// `/en/bw/?type=fire&sort=atk` must carry exactly that query, never drop it and never inject a
// param (e.g. a stray `?shiny=1`) that isn't actually in it. `langSwitchHref` is the pure helper
// `list.ts`'s `syncLangLinks` calls with the list's live, serialized state -- never raw,
// possibly-stale `location.search` -- so these cases pin the contract at the unit level.
test("langSwitchHref keeps the current list state in the swapped link", () => {
  expect(
    langSwitchHref("/pokemon-dex/en/bw/", "ru", "type=fire&sort=atk"),
  ).toBe("/pokemon-dex/ru/bw/?type=fire&sort=atk");
});

test("langSwitchHref accepts a leading '?' the same way", () => {
  expect(
    langSwitchHref("/pokemon-dex/en/bw/", "ru", "?type=fire&sort=atk"),
  ).toBe("/pokemon-dex/ru/bw/?type=fire&sort=atk");
});

test("langSwitchHref never invents a query param: no search in, none out", () => {
  expect(langSwitchHref("/pokemon-dex/en/bw/", "ru")).toBe(
    "/pokemon-dex/ru/bw/",
  );
  expect(langSwitchHref("/pokemon-dex/en/bw/", "ru", "")).toBe(
    "/pokemon-dex/ru/bw/",
  );
  expect(langSwitchHref("/pokemon-dex/en/bw/", "ru", "?")).toBe(
    "/pokemon-dex/ru/bw/",
  );
});

test("langSwitchHref carries a shiny param only when it's actually present", () => {
  expect(langSwitchHref("/pokemon-dex/en/bw/", "ru", "shiny=1")).toBe(
    "/pokemon-dex/ru/bw/?shiny=1",
  );
  expect(
    langSwitchHref("/pokemon-dex/en/bw/", "ru", "type=fire&sort=atk"),
  ).not.toContain("shiny");
});

test("langSwitchHref delegates the path to swapLang (preserves the generation segment)", () => {
  expect(
    langSwitchHref("/pokemon-dex/en/bw/pokemon/eevee/", "ru", "form=heat"),
  ).toBe("/pokemon-dex/ru/bw/pokemon/eevee/?form=heat");
});
