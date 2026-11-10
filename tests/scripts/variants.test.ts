import { expect, test } from "bun:test";
import {
  availableVariants,
  resolveForm,
  variantFor,
} from "../../src/scripts/variants";
import bwJson from "../../src/data/gen/bw.json";
import spritesJson from "../../src/data/sprites/bw.json";
import type { GenData, SpriteManifest } from "../../src/data/types";

const gen = bwJson as unknown as GenData;
const manifest = spritesJson as unknown as SpriteManifest;

const charmanderEntry = manifest.sprites["4"]!;
const pikachuEntry = manifest.sprites["25"]!;
const rotom = gen.pokemon.find((p) => p.slug === "rotom")!;

test("availableVariants reports only the axes this entry actually has", () => {
  expect(availableVariants(charmanderEntry)).toEqual({
    shiny: true,
    back: true,
    female: false,
  });
  expect(availableVariants(pikachuEntry)).toEqual({
    shiny: true,
    back: true,
    female: true,
  });
});

test("variantFor returns the exact combination when it exists", () => {
  expect(
    variantFor({ shiny: true, back: false, female: true }, pikachuEntry),
  ).toBe("front-shiny-female");
  expect(
    variantFor({ shiny: false, back: true, female: false }, pikachuEntry),
  ).toBe("back");
});

test("variantFor falls back to the nearest existing variant: drop female, then back, then shiny", () => {
  expect(
    variantFor({ shiny: true, back: false, female: true }, charmanderEntry),
  ).toBe("front-shiny");
  expect(
    variantFor({ shiny: false, back: true, female: true }, charmanderEntry),
  ).toBe("back");
});

test("variantFor falls back all the way to 'front' for an entry missing everything requested", () => {
  expect(variantFor({ shiny: true, back: true, female: true }, {})).toBe(
    "front",
  );
});

test("resolveForm finds a form by slug", () => {
  expect(resolveForm(rotom, "heat")?.key).toBe("479-heat");
});

test("resolveForm falls back to forms[0] for an unknown slug", () => {
  expect(resolveForm(rotom, "bogus").formSlug).toBeNull();
});

test("resolveForm falls back to forms[0] for null", () => {
  expect(resolveForm(rotom, null).formSlug).toBeNull();
  expect(resolveForm(rotom, null).key).toBe("479");
});
