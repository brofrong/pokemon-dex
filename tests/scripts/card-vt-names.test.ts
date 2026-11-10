import { expect, test } from "bun:test";
import {
  cardKeyForUrl,
  detailSlugFromUrl,
  pageRevealScript,
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

/**
 * `pageRevealScript` (QA bug #8) returns plain inline-script *source*, not a function this test
 * runner can call directly -- evaluated the same way `VT_ABORT_GUARD_SCRIPT` is tested
 * (`new Function(...)`), with minimal stand-ins for the handful of DOM/Navigation-API globals it
 * touches (`window`, `document`, `location`, `addEventListener`) instead of a real browser.
 */
interface FakeStyle {
  viewTransitionName: string;
}
interface FakeCard {
  href: string;
  dataset: { id: string };
  querySelector: (selector: string) => { style: FakeStyle } | null;
}

function fakeCard(
  href: string,
  id: string,
): { card: FakeCard; styles: Record<string, FakeStyle> } {
  const styles: Record<string, FakeStyle> = {
    ".spr": { viewTransitionName: "" },
    ".nm": { viewTransitionName: "" },
    ".types": { viewTransitionName: "" },
  };
  const card: FakeCard = {
    href,
    dataset: { id },
    querySelector: (selector) =>
      styles[selector] ? { style: styles[selector]! } : null,
  };
  return { card, styles };
}

/** Evaluates `pageRevealScript(base)` and returns the `pagereveal` handler it registered (or
 *  `undefined` if the script no-op'd, e.g. feature-detection failing). */
function evalPageRevealScript(
  base: string,
  cards: readonly FakeCard[],
  fromUrl: string | undefined,
): ((event: unknown) => void) | undefined {
  const handlers: Record<string, (event: unknown) => void> = {};
  const addEventListenerStub = (
    type: string,
    handler: (event: unknown) => void,
  ) => {
    handlers[type] = handler;
  };
  const windowStub = {
    onpageswap: null,
    navigation: fromUrl
      ? { activation: { from: { url: fromUrl } } }
      : undefined,
  };
  const documentStub = {
    querySelectorAll: () => cards,
  };
  const locationStub = { href: "https://brofrong.github.io/" };
  new Function(
    "window",
    "document",
    "location",
    "addEventListener",
    pageRevealScript(base),
  )(windowStub, documentStub, locationStub, addEventListenerStub);
  return handlers["pagereveal"];
}

test("pageRevealScript names the matching card's sprite/name/types on pagereveal", async () => {
  const { card, styles } = fakeCard(
    "https://brofrong.github.io/pokemon-dex/en/bw/pokemon/eevee/",
    "133",
  );
  const handler = evalPageRevealScript(
    BASE,
    [card],
    "https://brofrong.github.io/pokemon-dex/en/bw/pokemon/eevee/",
  );
  expect(handler).toBeFunction();

  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => (resolveFinished = resolve));
  handler!({
    viewTransition: {
      finished,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    },
  });

  expect(styles[".spr"]!.viewTransitionName).toBe("sprite-133");
  expect(styles[".nm"]!.viewTransitionName).toBe("name-133");
  expect(styles[".types"]!.viewTransitionName).toBe("types-133");

  resolveFinished();
  await finished;
  // Letting the `.then(clear, clear)` microtask run.
  await Promise.resolve();
  await Promise.resolve();
  expect(styles[".spr"]!.viewTransitionName).toBe("");
  expect(styles[".nm"]!.viewTransitionName).toBe("");
  expect(styles[".types"]!.viewTransitionName).toBe("");
});

test("pageRevealScript names nothing when no card matches the origin URL", () => {
  const { card, styles } = fakeCard(
    "https://brofrong.github.io/pokemon-dex/en/bw/pokemon/charmander/",
    "4",
  );
  const handler = evalPageRevealScript(
    BASE,
    [card],
    "https://brofrong.github.io/pokemon-dex/en/bw/pokemon/eevee/",
  );
  handler!({
    viewTransition: {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    },
  });
  expect(styles[".spr"]!.viewTransitionName).toBe("");
});

test("pageRevealScript does nothing without a viewTransition on the event", () => {
  const { card, styles } = fakeCard(
    "https://brofrong.github.io/pokemon-dex/en/bw/pokemon/eevee/",
    "133",
  );
  const handler = evalPageRevealScript(
    BASE,
    [card],
    "https://brofrong.github.io/pokemon-dex/en/bw/pokemon/eevee/",
  );
  handler!({ viewTransition: null });
  expect(styles[".spr"]!.viewTransitionName).toBe("");
});

test("pageRevealScript does nothing without navigation.activation.from.url (e.g. Safari)", () => {
  const { card, styles } = fakeCard(
    "https://brofrong.github.io/pokemon-dex/en/bw/pokemon/eevee/",
    "133",
  );
  const handler = evalPageRevealScript(BASE, [card], undefined);
  handler!({
    viewTransition: {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    },
  });
  expect(styles[".spr"]!.viewTransitionName).toBe("");
});
