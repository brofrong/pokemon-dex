/**
 * `EvolutionTree.astro`/`EvolutionBranch.astro` are thin wrappers around the pure view-model
 * builder `buildEvolutionView` (`src/lib/evolution-view.ts`) -- `bun test` has no Vite pipeline,
 * so it cannot compile/render `.astro` files directly (confirmed: importing a `.astro` file in a
 * bun test throws `Invalid element name` from Astro's own runtime). Per the task brief, this test
 * instead exercises the pure builder that the components render verbatim.
 *
 * Fix round 1 extended these tests for two findings:
 *  - #1: a node whose `conditions` repeat (Wormadam/Gastrodon's cosmetic sub-forms duplicate the
 *    exact same condition several times in the raw data) must not render a duplicated label.
 *  - #2: the tree must show the WHOLE species tree on every member's page, not stop at the first
 *    branch point -- Wurmple's page was dropping Beautifly/Dustox entirely.
 */
import { describe, expect, test } from "bun:test";
import {
  buildEvolutionView,
  flattenEvolutionView,
} from "../../src/lib/evolution-view";
import { vtName } from "../../src/lib/view-transition";
import bwJson from "../../src/data/gen/bw.json";
import svJson from "../../src/data/gen/sv.json";
import swshJson from "../../src/data/gen/swsh.json";
import xyJson from "../../src/data/gen/xy.json";
import type { EvoNode, GenData } from "../../src/data/types";

const gen = bwJson as unknown as GenData;
const charmander = gen.pokemon.find((p) => p.slug === "charmander")!;
const eevee = gen.pokemon.find((p) => p.slug === "eevee")!;
const wurmple = gen.pokemon.find((p) => p.slug === "wurmple")!;
const burmy = gen.pokemon.find((p) => p.slug === "burmy")!;

/** Asserts the whole-tree invariants every view must satisfy, regardless of `currentSpeciesId`. */
function expectValidView(view: ReturnType<typeof buildEvolutionView>): void {
  const all = flattenEvolutionView(view);

  const current = all.filter((n) => n.current);
  expect(current).toHaveLength(1);
  expect(current[0]!.vtName).toBeUndefined();

  const names = all.filter((n) => !n.current).map((n) => n.vtName);
  expect(names).toEqual(
    all.filter((n) => !n.current).map((n) => vtName("sprite", n.key)),
  );
  // Every non-current node's vt-name must be unique across the WHOLE tree, not just within its
  // own branch -- a duplicate anywhere in the document drops the entire view transition.
  expect(new Set(names).size).toBe(names.length);
}

test("Charmander: exactly one current node, no vt-name on it, others carry vtName('sprite', key), no branches", () => {
  const view = buildEvolutionView(
    charmander.evolution,
    charmander.id,
    "ru",
    gen,
  );
  expectValidView(view);
  expect(view.chain.map((n) => n.slug)).toEqual([
    "charmander",
    "charmeleon",
    "charizard",
  ]);
  expect(view.arrows.map((a) => a.label)).toEqual(["Ур. 16", "Ур. 36"]);
  expect(view.branches).toEqual([]);
});

test("Eevee renders 7 branches, each a one-node leaf segment carrying a vt-name", () => {
  const view = buildEvolutionView(eevee.evolution, eevee.id, "en", gen);
  expect(view.chain).toHaveLength(1);
  expect(view.chain[0]!.current).toBe(true);
  expect(view.branches).toHaveLength(7);
  for (const b of view.branches) {
    expect(b.segment.chain).toHaveLength(1);
    expect(b.segment.branches).toEqual([]);
    expect(b.segment.chain[0]!.vtName).toBe(
      vtName("sprite", b.segment.chain[0]!.key),
    );
  }
  expectValidView(view);
});

test("Wurmple's tree contains silcoon, beautifly, cascoon and dustox on Wurmple's own page", () => {
  const view = buildEvolutionView(wurmple.evolution, wurmple.id, "en", gen);
  const slugs = flattenEvolutionView(view).map((n) => n.slug);
  expect(slugs).toEqual([
    "wurmple",
    "silcoon",
    "beautifly",
    "cascoon",
    "dustox",
  ]);
  expect(view.branches).toHaveLength(2);
  // Each branch carries its own full sub-chain (the second evolution step), not just a leaf tile.
  for (const b of view.branches) {
    expect(b.segment.chain).toHaveLength(2);
    expect(b.segment.arrows).toHaveLength(1);
  }
  expectValidView(view);
});

test("Wurmple's tree is identical on every member's page -- only `current` moves", () => {
  for (const id of [265, 266, 267, 268, 269]) {
    const view = buildEvolutionView(wurmple.evolution, id, "en", gen);
    expect(flattenEvolutionView(view).map((n) => n.slug)).toEqual([
      "wurmple",
      "silcoon",
      "beautifly",
      "cascoon",
      "dustox",
    ]);
  }
});

test("on Beautifly's own page, the current flag is on beautifly (nested two levels inside a branch)", () => {
  const beautifly = gen.pokemon.find((p) => p.slug === "beautifly")!;
  const view = buildEvolutionView(wurmple.evolution, beautifly.id, "en", gen);
  const current = flattenEvolutionView(view).filter((n) => n.current);
  expect(current).toHaveLength(1);
  expect(current[0]!.slug).toBe("beautifly");
  expect(current[0]!.vtName).toBeUndefined();
  // Its sibling branch (Cascoon/Dustox) is still fully present and still carries vt-names.
  const cascoonBranch = view.branches.find(
    (b) => b.segment.chain[0]!.slug === "cascoon",
  )!;
  expect(cascoonBranch.segment.chain.map((n) => n.slug)).toEqual([
    "cascoon",
    "dustox",
  ]);
  expectValidView(view);
});

test("Burmy's duplicated conditions (one per cosmetic cloak) render once, not repeated", () => {
  const view = buildEvolutionView(burmy.evolution, burmy.id, "ru", gen);
  const wormadamBranch = view.branches.find(
    (b) => b.segment.chain[0]!.slug === "wormadam",
  )!;
  // The raw data repeats `{ gender: 'female', minLevel: 20 }` three times (once per Wormadam
  // cloak form); deduplicated, that's one "Lvl. 20, females only" label, not three.
  expect(wormadamBranch.label).toBe("Ур. 20, только самки");
});

test("a synthetic node with exactly repeated conditions dedupes to one label", () => {
  const repeated: EvoNode = {
    speciesId: 9001,
    slug: "test-mon",
    conditions: [
      { trigger: "level-up", minLevel: 20, gender: "female" },
      { trigger: "level-up", minLevel: 20, gender: "female" },
      { trigger: "level-up", minLevel: 20, gender: "female" },
    ],
    children: [],
  };
  const root: EvoNode = {
    speciesId: 9000,
    slug: "test-root",
    conditions: [],
    children: [repeated],
  };
  // A single-child node continues the linear chain (not a branch); the dedup lives in the
  // shared `formatConditions` helper used by both arrows and branch labels, so this exercises it
  // via the chain's arrow.
  const view = buildEvolutionView(root, 9000, "en", gen);
  expect(view.chain.map((n) => n.slug)).toEqual(["test-root", "test-mon"]);
  expect(view.arrows).toHaveLength(1);
  expect(view.arrows[0]!.label).toBe("Lvl. 20, females only");
});

test("viewing a branch member (Vaporeon) still shows the whole Eevee tree, current on vaporeon", () => {
  const view = buildEvolutionView(eevee.evolution, 134, "en", gen);
  expect(view.branches).toHaveLength(7);
  const current = flattenEvolutionView(view).filter((n) => n.current);
  expect(current).toHaveLength(1);
  expect(current[0]!.slug).toBe("vaporeon");
});

// QA bug #2: node names (and the sprite alt, which is the same string) follow the page language.
test("node names are localized: Russian names on RU pages, English on EN pages", () => {
  const ru = flattenEvolutionView(
    buildEvolutionView(eevee.evolution, eevee.id, "ru", gen),
  ).map((n) => n.name);
  expect(ru.slice(0, 4)).toEqual(["Иви", "Вапореон", "Джолтеон", "Флареон"]);
  const en = flattenEvolutionView(
    buildEvolutionView(eevee.evolution, eevee.id, "en", gen),
  ).map((n) => n.name);
  expect(en.slice(0, 4)).toEqual(["Eevee", "Vaporeon", "Jolteon", "Flareon"]);
  expect(
    flattenEvolutionView(
      buildEvolutionView(eevee.evolution, eevee.id, "ru", gen),
    )[0]!.primaryType,
  ).toBe("normal");
});

describe("condition labels (R-B13, R-B14)", () => {
  const sv = svJson as unknown as GenData;
  const swsh = swshJson as unknown as GenData;
  const xy = xyJson as unknown as GenData;
  const labelsOf = (data: GenData, slug: string, lang: "en" | "ru") => {
    const p = data.pokemon.find((x) => x.slug === slug)!;
    const view = buildEvolutionView(p.evolution, p.id, lang, data);
    const out: Record<string, string> = {};
    const visit = (seg: typeof view) => {
      seg.chain.forEach((n, i) => {
        if (i > 0) out[n.slug] = seg.arrows[i - 1]!.label;
      });
      for (const b of seg.branches) {
        out[b.segment.chain[0]!.slug] = b.label;
        visit(b.segment);
      }
    };
    visit(view);
    return out;
  };

  test("fields of one condition join with a comma, alternatives with or", () => {
    expect(labelsOf(xy, "goodra", "ru").goodra).toBe("Ур. 50, во время дождя");
    expect(labelsOf(xy, "goodra", "en").goodra).toBe("Lvl. 50, while raining");
    expect(labelsOf(swsh, "toxtricity", "ru").toxtricity).toBe(
      "Ур. 30: характер «Бодрый» или «Спокойный»",
    );
    expect(labelsOf(swsh, "toxtricity", "en").toxtricity).toBe(
      "Lvl. 30: Amped or Low Key nature",
    );
    expect(labelsOf(sv, "kubfu", "ru").urshifu).toBe(
      "Свиток тьмы или Свиток вод",
    );
    // Male and female alternatives that only pick the evolved form aren't a requirement.
    expect(labelsOf(sv, "lechonk", "ru").oinkologne).toBe("Ур. 18");
  });

  test("a regional-form-only evolution says which form evolves", () => {
    const meowth = labelsOf(sv, "meowth", "en");
    // Kanto Meowth at level 28, plus Alolan Meowth by friendship (fix round 1).
    expect(meowth.persian).toBe("Lvl. 28 or friendship, from Alolan form");
    expect(meowth.perrserker).toBe("Lvl. 28, from Galarian form");
    expect(labelsOf(sv, "wooper", "ru").clodsire).toBe(
      "Ур. 20, из пальдейской формы",
    );
  });

  test("one-off evolution methods are named instead of a vague special condition", () => {
    expect(labelsOf(sv, "farfetchd", "ru").sirfetchd).toBe(
      "3 критических удара за один бой, из галарской формы",
    );
    expect(labelsOf(sv, "pawniard", "ru").kingambit).toBe(
      "Победить трёх Бишарпов, ведущих стаи Поуниардов",
    );
    expect(labelsOf(swsh, "kubfu", "en").urshifu).toBe(
      "Tower of Darkness or Tower of Waters",
    );
    expect(labelsOf(sv, "gimmighoul", "en").gholdengo).toBe(
      "Collect 999 Gimmighoul Coins",
    );
    for (const data of [swsh, sv]) {
      for (const p of data.pokemon) {
        for (const label of Object.values(labelsOf(data, p.slug, "ru"))) {
          expect(label).not.toContain("Особое условие");
        }
      }
    }
  });
});
