import { expect, test } from "bun:test";
import type { EvoNode, GenData, Stats } from "../../src/data/types";

const bw: GenData = await Bun.file("src/data/gen/bw.json").json();

const p = (slug: string) => bw.pokemon.find((x) => x.slug === slug)!;

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function sum(stats: Stats): number {
  return stats.reduce((total, value) => total + value, 0);
}

function findNode(node: EvoNode, slug: string): EvoNode | null {
  if (node.slug === slug) return node;
  for (const child of node.children) {
    const found = findNode(child, slug);
    if (found) return found;
  }
  return null;
}

test("649 species, ids 1..649", () => {
  expect(bw.pokemon.map((x) => x.id)).toEqual(range(1, 649));
});

test("no fairy anywhere", () => {
  expect(bw.types).not.toContain("fairy");
});

test("no pokemon or form has fairy in its types", () => {
  for (const pokemon of bw.pokemon) {
    expect(pokemon.types).not.toContain("fairy");
    for (const form of pokemon.forms) {
      expect(form.types).not.toContain("fairy");
    }
  }
});

test("Clefairy normal", () => {
  expect(p("clefairy").types).toEqual(["normal"]);
});

test("gen-5 past typing replaces Fairy wholesale, not just merges", () => {
  expect(p("marill").types).toEqual(["water"]);
  expect(p("gardevoir").types).toEqual(["psychic"]);
  expect(p("mawile").types).toEqual(["steel"]);
  expect(p("jigglypuff").types).toEqual(["normal"]);
  expect(p("cottonee").types).toEqual(["grass"]);
});

test("Charmander total 309", () => {
  expect(sum(p("charmander").stats)).toBe(309);
});

test("Pikachu gen-5 stats", () => {
  expect(p("pikachu").stats).toEqual([35, 55, 30, 50, 40, 90]);
});

test("Gengar has Levitate, not Cursed Body", () => {
  expect(p("gengar").abilities.map((a) => a.slug)).toEqual(["levitate"]);
});

test("Charmander hidden ability Solar Power", () => {
  expect(p("charmander").abilities).toContainEqual({
    slug: "solar-power",
    hidden: true,
  });
});

test("Eevee 7 branches", () => {
  expect(p("eevee").evolution.children).toHaveLength(7);
});

test("Golbat evolves by happiness", () => {
  expect(
    findNode(p("zubat").evolution, "crobat")!.conditions[0].minHappiness,
  ).toBeGreaterThan(0);
});

test("Rotom has 6 forms with Electric + form type", () => {
  expect(p("rotom").forms).toHaveLength(6);
  expect(p("rotom").forms.find((f) => f.formSlug === "heat")!.types).toEqual([
    "electric",
    "fire",
  ]);
});

test("Mewtwo legendary, Mew mythical, Pichu baby, Snivy new", () => {
  expect(p("mewtwo").flags).toContain("legendary");
  expect(p("mew").flags).toContain("mythical");
  expect(p("pichu").flags).toContain("baby");
  expect(p("snivy").flags).toContain("new");
});

test("every Pokémon has black and white flavor text", () => {
  bw.pokemon.forEach((x) => {
    expect(x.flavor.black).toBeTruthy();
    expect(x.flavor.white).toBeTruthy();
  });
});

test("Arceus' plate forms take the plate's type", () => {
  expect(p("arceus").forms.find((f) => f.formSlug === "water")!.types).toEqual([
    "water",
  ]);
});

test("Arceus has no '???' or Fairy form", () => {
  expect(p("arceus").forms.some((f) => f.formSlug === "unknown")).toBe(false);
  expect(p("arceus").forms.some((f) => f.formSlug === "fairy")).toBe(false);
});

test("Arceus has 17 forms (default Normal + 16 other-type plates in gen 5)", () => {
  // Gen 5 has 17 types (all but Fairy); Normal is already the default form, leaving 16
  // plate forms: fighting, flying, poison, ground, rock, bug, ghost, steel, fire, water,
  // grass, electric, psychic, ice, dragon, dark.
  expect(p("arceus").forms).toHaveLength(17);
});

test("Burmy is pure Bug regardless of cloak", () => {
  expect(p("burmy").forms.every((f) => f.types.join() === "bug")).toBe(true);
});

test("egg group display names differ from their slugs where the games differ", () => {
  expect(bw.names.eggGroups.water1).toBe("Water 1");
  expect(bw.names.eggGroups.ground).toBe("Field");
});

test("hasGenderDiff is ANDed with actual front-female sprite availability", () => {
  expect(p("pikachu").hasGenderDiff).toBe(true);
  expect(p("charmander").hasGenderDiff).toBe(false);
  const count = bw.pokemon.filter((x) => x.hasGenderDiff).length;
  expect(count).toBeGreaterThanOrEqual(90);
  expect(count).toBeLessThanOrEqual(110);
});
