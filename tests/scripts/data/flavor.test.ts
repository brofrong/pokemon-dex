import { describe, expect, test } from "bun:test";
import { pickFlavor } from "../../../scripts/data/build-gen";
import { normalizeFlavorText } from "../../../scripts/data/species-index";

const versions: [string, string] = ["scarlet", "violet"];
const order = ["scarlet", "violet", "legends-arceus", "sword", "shield"];

test("keeps whatever the version pair has, without fallbacks", () => {
  const texts = new Map([
    ["violet", "V"],
    ["sword", "S"],
  ]);
  expect(pickFlavor(versions, order, texts)).toEqual({ violet: "V" });
});

test("falls back to the first version in priority order, keyed by that version", () => {
  const texts = new Map([
    ["shield", "Sh"],
    ["sword", "S"],
  ]);
  expect(pickFlavor(versions, order, texts)).toEqual({ sword: "S" });
});

test("normalizes line breaks; {} when nothing has text", () => {
  expect(
    pickFlavor(versions, order, new Map([["scarlet", "a\nb\fc"]])),
  ).toEqual({ scarlet: "a b c" });
  expect(pickFlavor(versions, order, new Map())).toEqual({});
});

// QA bug #10: the games' line-wrap hyphenation used to leave "surround ings" / "10,000- horsepower".
// The raw strings below are PokeAPI's own `pokemon_species_flavor_text` rows.
describe("normalizeFlavorText", () => {
  test("joins a word split by a soft hyphen at a line break", () => {
    expect(
      normalizeFlavorText(
        "It steals heat\nfrom its surround­\nings. If you feel\fa sudden chill, it\nis certain that a\nGENGAR appeared.",
      ),
    ).toBe(
      "It steals heat from its surroundings. If you feel a sudden chill, it is certain that a GENGAR appeared.",
    );
    expect(
      normalizeFlavorText(
        "This POKéMON wan­\nders across time.\nGrass and trees\fflourish in the\nforests in which\nit has appeared.",
      ),
    ).toContain("wanders across time");
    expect(
      normalizeFlavorText("When CELEBI disap­\npears deep in a\nforest"),
    ).toBe("When CELEBI disappears deep in a forest");
    expect(normalizeFlavorText("almost any­\fthing. Its")).toBe(
      "almost anything. Its",
    );
  });

  test("keeps a real hyphen at a line end and joins without a space", () => {
    expect(
      normalizeFlavorText(
        "The larger pincer has 10,000-\nhorsepower strength. However, it\nis so heavy, it is difficult to aim.",
      ),
    ).toBe(
      "The larger pincer has 10,000-horsepower strength. However, it is so heavy, it is difficult to aim.",
    );
    expect(normalizeFlavorText("to\fblast out 10000-\nvolt lightning")).toBe(
      "to blast out 10000-volt lightning",
    );
    expect(
      normalizeFlavorText("its over-six-foot-\nlong tongue, its tail"),
    ).toBe("its over-six-foot-long tongue, its tail");
  });

  test("a spaced dash at a line end stays punctuation", () => {
    expect(normalizeFlavorText("its nest -\nthis is for")).toBe(
      "its nest - this is for",
    );
    expect(normalizeFlavorText("and fragile -\fjust touching")).toBe(
      "and fragile - just touching",
    );
  });
});
