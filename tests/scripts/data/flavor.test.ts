import { expect, test } from "bun:test";
import { pickFlavor } from "../../../scripts/data/build-gen";

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
