/**
 * `EvolutionTree.astro` is a thin wrapper around the pure view-model builder
 * `buildEvolutionView` (`src/lib/evolution-view.ts`) -- `bun test` has no Vite pipeline, so it
 * cannot compile/render `.astro` files directly (confirmed: importing a `.astro` file in a bun
 * test throws `Invalid element name` from Astro's own runtime). Per the task brief, this test
 * instead exercises the pure builder that the component renders verbatim, and asserts exactly
 * the properties the brief calls out: exactly one current node, no `view-transition-name` on it,
 * `vtName('sprite', key)` on every other node, and Eevee's 7 branches.
 */
import { expect, test } from "bun:test";
import { buildEvolutionView } from "../../src/lib/evolution-view";
import { vtName } from "../../src/lib/view-transition";
import bwJson from "../../src/data/gen/bw.json";
import type { GenData } from "../../src/data/types";

const gen = bwJson as unknown as GenData;
const charmander = gen.pokemon.find((p) => p.slug === "charmander")!;
const eevee = gen.pokemon.find((p) => p.slug === "eevee")!;

test("Charmander: exactly one current node, no vt-name on it, others carry vtName('sprite', key)", () => {
  const view = buildEvolutionView(
    charmander.evolution,
    charmander.id,
    "ru",
    gen,
  );
  const all = [...view.chain, ...view.branches.map((b) => b.node)];

  const current = all.filter((n) => n.current);
  expect(current).toHaveLength(1);
  expect(current[0]!.vtName).toBeUndefined();

  for (const n of all) {
    if (!n.current) expect(n.vtName).toBe(vtName("sprite", n.key));
  }
});

test("Charmander's chain covers all three stages with their level-up labels, no branches", () => {
  const view = buildEvolutionView(
    charmander.evolution,
    charmander.id,
    "ru",
    gen,
  );
  expect(view.chain.map((n) => n.slug)).toEqual([
    "charmander",
    "charmeleon",
    "charizard",
  ]);
  expect(view.arrows.map((a) => a.label)).toEqual(["Ур. 16", "Ур. 36"]);
  expect(view.branches).toEqual([]);
});

test("Eevee renders 7 branches, each carrying a vt-name, and a one-node chain", () => {
  const view = buildEvolutionView(eevee.evolution, eevee.id, "en", gen);
  expect(view.chain).toHaveLength(1);
  expect(view.chain[0]!.current).toBe(true);
  expect(view.branches).toHaveLength(7);
  for (const b of view.branches) {
    expect(b.node.vtName).toBe(vtName("sprite", b.node.key));
  }
});

test("viewing a branch member (Vaporeon) shows only its own lineage, not its siblings", () => {
  const view = buildEvolutionView(eevee.evolution, 134, "en", gen);
  expect(view.chain.map((n) => n.slug)).toEqual(["eevee", "vaporeon"]);
  expect(view.branches).toEqual([]);
});
