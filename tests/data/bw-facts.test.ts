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

test("Clefairy normal", () => {
  expect(p("clefairy").types).toEqual(["normal"]);
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
