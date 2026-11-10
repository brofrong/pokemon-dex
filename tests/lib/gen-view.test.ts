/**
 * The pure view-model helpers that decide which detail-page sections, sprite toggles, list chips
 * and Pokédex entries render for a generation (`src/lib/gen-view.ts`). Astro components can't be
 * rendered under `bun test`, so the per-generation gating (Review Focus #1: gen I shows no
 * abilities/gender/eggs/shiny toggle, HOME generations no back toggle) is pinned here against the
 * real datasets and sprite manifests.
 */
import { describe, expect, test } from "bun:test";
import type {
  GenData,
  GenId,
  Pokemon,
  SpriteManifest,
  SpriteSetId,
} from "../../src/data/types";
import { getGen } from "../../src/lib/generations";
import {
  detailSections,
  displaySize,
  flagChips,
  gateVariants,
  pokedexEntries,
  readableTextOn,
  variantToggles,
} from "../../src/lib/gen-view";

const data = new Map<GenId, GenData>();
async function gen(id: GenId): Promise<GenData> {
  if (!data.has(id))
    data.set(id, (await Bun.file(`src/data/gen/${id}.json`).json()) as GenData);
  return data.get(id)!;
}
const manifests = new Map<SpriteSetId, SpriteManifest>();
async function sprites(set: SpriteSetId): Promise<SpriteManifest> {
  if (!manifests.has(set))
    manifests.set(
      set,
      (await Bun.file(`src/data/sprites/${set}.json`).json()) as SpriteManifest,
    );
  return manifests.get(set)!;
}
async function mon(id: GenId, slug: string): Promise<Pokemon> {
  const p = (await gen(id)).pokemon.find((x) => x.slug === slug);
  if (!p) throw new Error(`${id}: no ${slug}`);
  return p;
}

describe("detailSections", () => {
  test("gen I: no abilities, no hidden badge, no gender, no breeding", async () => {
    const s = detailSections(
      getGen("rb")!.features,
      await mon("rb", "pikachu"),
    );
    expect(s).toEqual({
      abilities: false,
      hiddenBadge: false,
      gender: false,
      breeding: false,
    });
  });

  test("gen II: gender and breeding, still no abilities", async () => {
    const s = detailSections(
      getGen("gs")!.features,
      await mon("gs", "pikachu"),
    );
    expect(s).toEqual({
      abilities: false,
      hiddenBadge: false,
      gender: true,
      breeding: true,
    });
  });

  test("gen III-IV: abilities without the hidden badge", async () => {
    for (const id of ["rs", "dp"] as const) {
      const s = detailSections(getGen(id)!.features, await mon(id, "pikachu"));
      expect(s.abilities).toBe(true);
      expect(s.hiddenBadge).toBe(false);
    }
  });

  test("gen V+: everything", async () => {
    for (const id of ["bw", "xy", "sv"] as const) {
      const s = detailSections(getGen(id)!.features, await mon(id, "pikachu"));
      expect(s).toEqual({
        abilities: true,
        hiddenBadge: true,
        gender: true,
        breeding: true,
      });
    }
  });

  test("a genderless species still shows the gender row (as 'Genderless') from gen II", async () => {
    expect(
      detailSections(getGen("gs")!.features, await mon("gs", "magnemite"))
        .gender,
    ).toBe(true);
  });
});

describe("variantToggles", () => {
  test("gen I (rb set): back only -- no shiny, no female", async () => {
    const entry = (await sprites("rb")).sprites["25"]!;
    expect(variantToggles(getGen("rb")!.features, entry)).toEqual({
      shiny: false,
      back: true,
      female: false,
    });
  });

  test("HOME generations: shiny and female, never back", async () => {
    const entry = (await sprites("home")).sprites["25"]!;
    for (const id of ["xy", "sm", "swsh", "sv"] as const) {
      expect(variantToggles(getGen(id)!.features, entry)).toEqual({
        shiny: true,
        back: false,
        female: true,
      });
    }
  });

  test("female only when a front-female sprite exists", async () => {
    const dp = await sprites("dp");
    expect(
      variantToggles(getGen("dp")!.features, dp.sprites["25"]!).female,
    ).toBe(true);
    expect(
      variantToggles(getGen("dp")!.features, dp.sprites["4"]!).female,
    ).toBe(false);
  });

  test("a feature flag wins even if the manifest had the variant", () => {
    const entry = {
      front: { w: 1, h: 1 },
      "front-shiny": { w: 1, h: 1 },
      back: { w: 1, h: 1 },
    };
    expect(
      variantToggles(
        { ...getGen("bw")!.features, shiny: false, back: false },
        entry,
      ),
    ).toEqual({ shiny: false, back: false, female: false });
  });
});

describe("gateVariants", () => {
  const all = {
    front: { w: 1, h: 1 },
    "front-shiny": { w: 1, h: 1 },
    back: { w: 1, h: 1 },
    "back-shiny": { w: 1, h: 1 },
    "front-female": { w: 1, h: 1 },
  };

  test("drops back sprites without the back feature and shiny without the shiny feature", () => {
    expect(Object.keys(gateVariants(getGen("xy")!.features, all))).toEqual([
      "front",
      "front-shiny",
      "front-female",
    ]);
    expect(Object.keys(gateVariants(getGen("rb")!.features, all))).toEqual([
      "front",
      "back",
      "front-female",
    ]);
    expect(gateVariants(getGen("bw")!.features, all)).toEqual(all);
  });
});

describe("flagChips", () => {
  test("gen I: every species is 'new' and none is a baby, so neither chip filters anything", async () => {
    expect(flagChips((await gen("rb")).pokemon)).toEqual([
      "legendary",
      "mythical",
    ]);
  });

  test("later generations offer all four chips, in display order", async () => {
    for (const id of ["gs", "bw", "sv"] as const) {
      expect(flagChips((await gen(id)).pokemon)).toEqual([
        "legendary",
        "mythical",
        "baby",
        "new",
      ]);
    }
  });
});

describe("pokedexEntries", () => {
  test("en, both versions have text: two entries labeled with the versions' names and colors", async () => {
    const entries = pokedexEntries(
      "en",
      await mon("rb", "pikachu"),
      getGen("rb")!,
    );
    expect(entries.map((e) => e.label)).toEqual(["Red", "Blue"]);
    expect(entries[0]!.bg).toBe(getGen("rb")!.colors[0]);
    expect(entries[1]!.bg).toBe(getGen("rb")!.colors[1]);
    expect(entries.every((e) => e.text.length > 0)).toBe(true);
  });

  test("en, fallback version: one entry labeled with the version the text actually came from", async () => {
    const sv = await gen("sv");
    const p = sv.pokemon.find(
      (x) => !x.flavor.scarlet && !x.flavor.violet && x.flavor.sword,
    )!;
    const entries = pokedexEntries("en", p, getGen("sv")!);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.label).toBe("Sword");
    expect(entries[0]!.bg).toBeNull();
    expect(entries[0]!.text).toBe(p.flavor.sword!);
  });

  test("ru bw: our per-version translations, two entries", async () => {
    const entries = pokedexEntries(
      "ru",
      await mon("bw", "pikachu"),
      getGen("bw")!,
    );
    expect(entries.map((e) => e.label)).toEqual(["Black", "White"]);
  });

  test("ru other generations: one Pokémon GO description, labeled «Pokémon GO»", async () => {
    const entries = pokedexEntries(
      "ru",
      await mon("xy", "pikachu"),
      getGen("xy")!,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.label).toBe("Pokémon GO");
    expect(entries[0]!.text).toMatch(/[а-яё]/i);
  });
});

describe("displaySize / readableTextOn", () => {
  test("pixel sets render at their native size; HOME's 192px renders at half (96 CSS px)", () => {
    expect(displaySize({ w: 58, h: 51 }, true)).toEqual({ w: 58, h: 51 });
    expect(displaySize({ w: 192, h: 192 }, false)).toEqual({ w: 96, h: 96 });
  });

  test("picks dark text on light tags and white on dark ones", () => {
    expect(readableTextOn("#ffffff")).toBe("#17171a");
    expect(readableTextOn("#17171a")).toBe("#fff");
    expect(readableTextOn("#c0c0c0")).toBe("#17171a");
    expect(readableTextOn("#2e50d8")).toBe("#fff");
  });
});
