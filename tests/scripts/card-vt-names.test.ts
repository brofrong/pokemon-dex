import { expect, test } from "bun:test";
import {
  cardKeyForUrl,
  detailSlugFromUrl,
  type CardRef,
} from "../../src/scripts/card-vt-names";

const BASE = "/pokemon-dex/";

test("detailSlugFromUrl extracts the slug from an absolute detail-page URL", () => {
  expect(
    detailSlugFromUrl(
      "https://brofrong.github.io/pokemon-dex/en/bw/pokemon/charmander/",
      BASE,
    ),
  ).toBe("charmander");
});

test("detailSlugFromUrl extracts the slug from a relative detail-page URL", () => {
  expect(detailSlugFromUrl("/pokemon-dex/ru/bw/pokemon/eevee/", BASE)).toBe(
    "eevee",
  );
});

test("detailSlugFromUrl ignores a query string and/or hash", () => {
  expect(
    detailSlugFromUrl("/pokemon-dex/en/bw/pokemon/rotom/?form=heat", BASE),
  ).toBe("rotom");
  expect(
    detailSlugFromUrl("/pokemon-dex/en/bw/pokemon/rotom/#stats", BASE),
  ).toBe("rotom");
});

test("detailSlugFromUrl tolerates a missing trailing slash", () => {
  expect(detailSlugFromUrl("/pokemon-dex/en/bw/pokemon/eevee", BASE)).toBe(
    "eevee",
  );
});

test("detailSlugFromUrl is null for the list page itself", () => {
  expect(detailSlugFromUrl("/pokemon-dex/en/bw/", BASE)).toBeNull();
});

test("detailSlugFromUrl is null for a URL outside the site's base", () => {
  expect(detailSlugFromUrl("/elsewhere/en/bw/pokemon/eevee/", BASE)).toBeNull();
});

test("detailSlugFromUrl is null for garbage input", () => {
  expect(detailSlugFromUrl("not a url at all", BASE)).toBeNull();
  expect(detailSlugFromUrl("", BASE)).toBeNull();
});

const CARDS: CardRef[] = [
  { href: "/pokemon-dex/en/bw/pokemon/charmander/", id: "4" },
  { href: "/pokemon-dex/en/bw/pokemon/eevee/", id: "133" },
  { href: "/pokemon-dex/en/bw/pokemon/rotom/", id: "479" },
];

test("cardKeyForUrl finds the matching card's id", () => {
  expect(
    cardKeyForUrl(
      "https://brofrong.github.io/pokemon-dex/en/bw/pokemon/eevee/",
      BASE,
      CARDS,
    ),
  ).toBe("133");
});

test("cardKeyForUrl matches regardless of a `?form=` query string on the target URL", () => {
  expect(
    cardKeyForUrl("/pokemon-dex/en/bw/pokemon/rotom/?form=heat", BASE, CARDS),
  ).toBe("479");
});

test("cardKeyForUrl is null when no card matches", () => {
  expect(
    cardKeyForUrl("/pokemon-dex/en/bw/pokemon/bulbasaur/", BASE, CARDS),
  ).toBeNull();
});

test("cardKeyForUrl is null for a non-detail-page URL", () => {
  expect(cardKeyForUrl("/pokemon-dex/en/bw/", BASE, CARDS)).toBeNull();
});
