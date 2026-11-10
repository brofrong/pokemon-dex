import { expect, test } from "bun:test";
import {
  availableVariants,
  isGenderVariantForm,
  resolveForm,
  selectableForms,
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
const frillish = gen.pokemon.find((p) => p.slug === "frillish")!;
const unown = gen.pokemon.find((p) => p.slug === "unown")!;

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

test("isGenderVariantForm flags Frillish's cosmetic 'female' form", () => {
  const femaleForm = frillish.forms.find((f) => f.formSlug === "female")!;
  expect(isGenderVariantForm(frillish.hasGenderDiff, femaleForm)).toBe(true);
});

test("isGenderVariantForm does not flag the default form or an unrelated form slug", () => {
  expect(isGenderVariantForm(frillish.hasGenderDiff, frillish.forms[0]!)).toBe(
    false,
  );
  const heatForm = rotom.forms.find((f) => f.formSlug === "heat")!;
  expect(isGenderVariantForm(rotom.hasGenderDiff, heatForm)).toBe(false);
});

test("isGenderVariantForm requires the species-level gender-diff flag too", () => {
  // A hypothetical species with a cosmetic 'female' form but no visible gender difference
  // shouldn't be swallowed by the gender toggle -- it should still render as its own form tile.
  const femaleForm = frillish.forms.find((f) => f.formSlug === "female")!;
  expect(isGenderVariantForm(false, femaleForm)).toBe(false);
});

test("selectableForms drops Frillish/Jellicent's gender-variant form, leaving just the default", () => {
  expect(selectableForms(frillish).map((f) => f.key)).toEqual(["592"]);
  const jellicent = gen.pokemon.find((p) => p.slug === "jellicent")!;
  expect(selectableForms(jellicent).map((f) => f.key)).toEqual(["593"]);
});

test("selectableForms keeps every Rotom/Unown form (none are gender variants)", () => {
  expect(selectableForms(rotom)).toHaveLength(rotom.forms.length);
  expect(selectableForms(unown)).toHaveLength(unown.forms.length);
});
