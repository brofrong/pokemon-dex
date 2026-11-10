import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { EvoNode, GenData, GenId, Pokemon } from "../../src/data/types";
import { GENERATIONS, getGen } from "../../src/lib/generations";

/**
 * Golden facts for every generation's dataset (`src/data/gen/{id}.json`, built by
 * `bun run data`). `bw-facts.test.ts` keeps the detailed Black/White facts; this file pins what
 * makes each generation different (types, abilities, forms, species count).
 */

const files = new Map<GenId, GenData>();
async function load(id: GenId): Promise<GenData> {
  const cached = files.get(id);
  if (cached) return cached;
  const data = (await Bun.file(`src/data/gen/${id}.json`).json()) as GenData;
  files.set(id, data);
  return data;
}

function find(data: GenData, slug: string): Pokemon {
  const found = data.pokemon.find((x) => x.slug === slug);
  if (!found) throw new Error(`${data.gen}: no Pokémon '${slug}'`);
  return found;
}

const formSlugs = (p: Pokemon) => p.forms.map((f) => f.formSlug);
const abilitySlugs = (p: Pokemon) => p.abilities.map((a) => a.slug);
const allForms = (data: GenData) => data.pokemon.flatMap((p) => p.forms);
const isMegaSlug = (slug: string | null) => /(^|-)mega($|-)/.test(slug ?? "");
const isGmaxSlug = (slug: string | null) => (slug ?? "").includes("gmax");

function speciesIds(node: EvoNode): number[] {
  return [node.speciesId, ...node.children.flatMap(speciesIds)];
}

describe("generation config", () => {
  test("all nine generations, in order, enabled", () => {
    expect(GENERATIONS.map((g) => g.id)).toEqual([
      "rb",
      "gs",
      "rs",
      "dp",
      "bw",
      "xy",
      "sm",
      "swsh",
      "sv",
    ]);
    expect(GENERATIONS.every((g) => g.enabled)).toBe(true);
  });

  test("flavorVersions start with the version pair", () => {
    for (const gen of GENERATIONS) {
      expect(gen.flavorVersions.slice(0, 2)).toEqual(gen.versions);
    }
  });

  test("features follow the generation rules", () => {
    const f = (id: GenId) => getGen(id)!.features;
    expect(f("rb")).toEqual({
      abilities: false,
      hiddenAbilities: false,
      breeding: false,
      shiny: false,
      back: true,
    });
    expect(f("gs")).toMatchObject({
      abilities: false,
      breeding: true,
      shiny: true,
    });
    expect(f("rs")).toMatchObject({ abilities: true, hiddenAbilities: false });
    expect(f("bw")).toMatchObject({ hiddenAbilities: true, back: true });
    expect(f("xy").back).toBe(false);
    expect(getGen("sv")!.spriteSet).toBe("home");
    expect(getGen("dp")!.spriteSet).toBe("dp");
  });
});

describe.each(GENERATIONS.map((g) => [g.id, g] as const))("%s", (id, gen) => {
  test(`species ids are exactly 1..${gen.maxSpeciesId}`, async () => {
    const data = await load(id);
    expect(data.gen).toBe(id);
    expect(data.pokemon.map((p) => p.id)).toEqual(
      Array.from({ length: gen.maxSpeciesId }, (_, i) => i + 1),
    );
  });

  test("no evolution tree references a species above the max", async () => {
    const data = await load(id);
    for (const p of data.pokemon) {
      expect(Math.max(...speciesIds(p.evolution))).toBeLessThanOrEqual(
        gen.maxSpeciesId,
      );
      expect(speciesIds(p.evolution)).toContain(p.id);
    }
  });

  test("every form has a pokemonId", async () => {
    const data = await load(id);
    for (const form of allForms(data)) {
      expect(Number.isInteger(form.pokemonId)).toBe(true);
      expect(form.pokemonId).toBeGreaterThan(0);
    }
  });

  test("every species has flavor text (fallback version allowed)", async () => {
    const data = await load(id);
    for (const p of data.pokemon) {
      const entries = Object.entries(p.flavor).filter(([, text]) => text);
      expect(entries.length, `${id} ${p.slug}`).toBeGreaterThan(0);
      for (const [version] of entries) {
        expect(gen.flavorVersions).toContain(version);
      }
    }
  });

  test("ability names and effects cover every referenced ability", async () => {
    const data = await load(id);
    const referenced = new Set(
      data.pokemon.flatMap((p) => [
        ...p.abilities.map((a) => a.slug),
        ...p.forms.flatMap((f) => f.abilities.map((a) => a.slug)),
      ]),
    );
    expect(Object.keys(data.names.abilities).sort()).toEqual(
      [...referenced].sort(),
    );
    expect(Object.keys(data.names.abilityEffects).sort()).toEqual(
      [...referenced].sort(),
    );
    for (const effect of Object.values(data.names.abilityEffects)) {
      expect(effect.length).toBeGreaterThan(0);
      expect(effect).not.toMatch(/[[\]{}]/);
    }
  });

  test("hidden abilities only from gen 5, abilities only from gen 3", async () => {
    const data = await load(id);
    const abilities = data.pokemon.flatMap((p) => [
      ...p.abilities,
      ...p.forms.flatMap((f) => f.abilities),
    ]);
    if (!gen.features.abilities) expect(abilities).toHaveLength(0);
    if (!gen.features.hiddenAbilities) {
      expect(abilities.some((a) => a.hidden)).toBe(false);
    }
  });

  test("megas only in xy/sm, Gigantamax only in swsh", async () => {
    const data = await load(id);
    const slugs = allForms(data).map((f) => f.formSlug);
    expect(slugs.some(isMegaSlug)).toBe(id === "xy" || id === "sm");
    expect(slugs.some(isGmaxSlug)).toBe(id === "swsh");
  });
});

describe("rb", () => {
  test("151 species, no dark/steel/fairy types", async () => {
    const rb = await load("rb");
    expect(rb.pokemon).toHaveLength(151);
    for (const type of ["dark", "steel", "fairy"] as const) {
      expect(rb.types).not.toContain(type);
      for (const p of rb.pokemon) expect(p.types).not.toContain(type);
    }
  });

  test("Magnemite is pure Electric", async () => {
    expect(find(await load("rb"), "magnemite").types).toEqual(["electric"]);
  });

  test("no Pokémon has abilities", async () => {
    const rb = await load("rb");
    for (const p of rb.pokemon) expect(p.abilities).toEqual([]);
    expect(rb.names.abilities).toEqual({});
  });

  test("Ghost does nothing to Psychic", async () => {
    expect((await load("rb")).chart.ghost.psychic).toBe(0);
  });

  test("no breeding data: null gender/hatch, no egg groups, no gender diff", async () => {
    for (const p of (await load("rb")).pokemon) {
      expect(p.genderRate).toBeNull();
      expect(p.hatchCounter).toBeNull();
      expect(p.eggGroups).toEqual([]);
      expect(p.hasGenderDiff).toBe(false);
    }
  });

  test("one Special stat: spa and spd are equal", async () => {
    for (const p of (await load("rb")).pokemon) {
      expect(p.stats[3]).toBe(p.stats[4]);
    }
    // Mewtwo's Gen I Special was 154 (Sp. Atk 154 / Sp. Def 90 from Gen II on).
    expect(find(await load("rb"), "mewtwo").stats).toEqual([
      106, 110, 90, 154, 154, 130,
    ]);
  });

  test("Pikachu's tree starts at Pikachu (Pichu is Gen II)", async () => {
    const pikachu = find(await load("rb"), "pikachu");
    expect(pikachu.evolution.slug).toBe("pikachu");
    expect(pikachu.evolution.conditions).toEqual([]);
  });

  test("Hitmonlee stands alone (Tyrogue is Gen II)", async () => {
    const hitmonlee = find(await load("rb"), "hitmonlee");
    expect(hitmonlee.evolution).toEqual({
      speciesId: 106,
      slug: "hitmonlee",
      conditions: [],
      children: [],
    });
  });
});

describe("gs", () => {
  test("251 species", async () => {
    expect((await load("gs")).pokemon).toHaveLength(251);
  });

  test("Magnemite is Electric/Steel", async () => {
    expect(find(await load("gs"), "magnemite").types).toEqual([
      "electric",
      "steel",
    ]);
  });

  test("no abilities", async () => {
    for (const p of (await load("gs")).pokemon) expect(p.abilities).toEqual([]);
  });

  test("Togepi is pure Normal", async () => {
    expect(find(await load("gs"), "togepi").types).toEqual(["normal"]);
  });

  test("breeding data present", async () => {
    const togepi = find(await load("gs"), "togepi");
    expect(togepi.genderRate).toBe(1);
    expect(togepi.hatchCounter).toBeGreaterThan(0);
    expect(togepi.eggGroups.length).toBeGreaterThan(0);
  });

  test("Unown has its letter forms", async () => {
    expect(find(await load("gs"), "unown").forms.length).toBeGreaterThan(20);
  });
});

describe("rs", () => {
  test("386 species", async () => {
    expect((await load("rs")).pokemon).toHaveLength(386);
  });

  test("Gengar has Levitate", async () => {
    expect(abilitySlugs(find(await load("rs"), "gengar"))).toEqual([
      "levitate",
    ]);
  });

  test("no hidden abilities anywhere", async () => {
    const rs = await load("rs");
    expect(rs.pokemon.some((p) => p.abilities.some((a) => a.hidden))).toBe(
      false,
    );
  });

  test("Roselia's tree starts at Roselia (Budew is Gen IV)", async () => {
    expect(find(await load("rs"), "roselia").evolution.slug).toBe("roselia");
  });
});

describe("dp", () => {
  test("493 species", async () => {
    expect((await load("dp")).pokemon).toHaveLength(493);
  });

  test("Rotom has forms", async () => {
    expect(find(await load("dp"), "rotom").forms.length).toBeGreaterThan(1);
  });

  test("Togekiss is Normal/Flying", async () => {
    expect(find(await load("dp"), "togekiss").types).toEqual([
      "normal",
      "flying",
    ]);
  });
});

describe("xy", () => {
  test("721 species", async () => {
    expect((await load("xy")).pokemon).toHaveLength(721);
  });

  test("Clefairy is Fairy", async () => {
    expect(find(await load("xy"), "clefairy").types).toEqual(["fairy"]);
  });

  test("Charizard has both Mega forms", async () => {
    expect(formSlugs(find(await load("xy"), "charizard"))).toEqual(
      expect.arrayContaining(["mega-x", "mega-y"]),
    );
  });

  test("no Alolan forms", async () => {
    const slugs = allForms(await load("xy")).map((f) => f.formSlug ?? "");
    expect(slugs.some((s) => s.includes("alola"))).toBe(false);
  });
});

describe("sm", () => {
  test("809 species", async () => {
    expect((await load("sm")).pokemon).toHaveLength(809);
  });

  test("Vulpix has an Ice Alolan form", async () => {
    const alola = find(await load("sm"), "vulpix").forms.find(
      (f) => f.formSlug === "alola",
    );
    expect(alola?.types).toEqual(["ice"]);
  });

  test("megas present", async () => {
    expect(formSlugs(find(await load("sm"), "charizard"))).toContain("mega-x");
  });

  test("Meltan (808) present", async () => {
    expect(find(await load("sm"), "meltan").id).toBe(808);
  });
});

describe("swsh", () => {
  test("905 species", async () => {
    expect((await load("swsh")).pokemon).toHaveLength(905);
  });

  test("Charizard has a Gigantamax form and no Mega forms", async () => {
    const slugs = formSlugs(find(await load("swsh"), "charizard"));
    expect(slugs).toContain("gmax");
    expect(slugs.some(isMegaSlug)).toBe(false);
  });

  test("Galarian Meowth present", async () => {
    expect(formSlugs(find(await load("swsh"), "meowth"))).toContain("galar");
  });
});

describe("sv", () => {
  test("1025 species", async () => {
    expect((await load("sv")).pokemon).toHaveLength(1025);
  });

  test("no mega or Gigantamax forms", async () => {
    const slugs = allForms(await load("sv")).map((f) => f.formSlug);
    expect(slugs.some(isMegaSlug)).toBe(false);
    expect(slugs.some(isGmaxSlug)).toBe(false);
  });

  test("the 18 types, without the Tera-only Stellar type", async () => {
    const sv = await load("sv");
    expect(sv.types).toHaveLength(18);
    expect(sv.types as string[]).not.toContain("stellar");
  });

  test("Wooper has a Paldean form", async () => {
    expect(formSlugs(find(await load("sv"), "wooper"))).toContain("paldea");
  });

  test("Gengar has Cursed Body", async () => {
    expect(abilitySlugs(find(await load("sv"), "gengar"))).toEqual([
      "cursed-body",
    ]);
  });

  test("a species with no Scarlet/Violet text falls back to an earlier version", async () => {
    const bulbasaur = find(await load("sv"), "bulbasaur");
    expect(bulbasaur.flavor.scarlet).toBeUndefined();
    expect(Object.keys(bulbasaur.flavor)).toHaveLength(1);
  });
});

describe("bw", () => {
  test("Manaphy's evolution tree is Manaphy itself (it used to show Phione's)", async () => {
    // Phione and Manaphy share an evolution chain without evolving into each other; the old
    // chain-rooted builder gave both Phione's one-node tree.
    expect(find(await load("bw"), "manaphy").evolution).toEqual({
      speciesId: 490,
      slug: "manaphy",
      conditions: [],
      children: [],
    });
  });

  test("unchanged apart from the added pokemonId/abilityEffects fields", async () => {
    // SHA-256 of `src/data/gen/bw.json` as built before all-generations support (commit
    // 113ebcd). Stripping the two added fields (and undoing the Manaphy fix above) must
    // reproduce it byte for byte. Update this hash only for an intentional change to the
    // Black/White dataset.
    const BW_BEFORE_SHA256 =
      "58f62b4744fba9c871107241078775a8da34b7a346746b64e117f18f2f1706f6";
    const bw = structuredClone(await load("bw")) as unknown as {
      pokemon: {
        slug: string;
        evolution: EvoNode;
        forms: { pokemonId?: number }[];
      }[];
      names: { abilityEffects?: unknown };
    };
    for (const p of bw.pokemon)
      for (const form of p.forms) delete form.pokemonId;
    delete bw.names.abilityEffects;
    const manaphy = bw.pokemon.find((p) => p.slug === "manaphy")!;
    manaphy.evolution = {
      children: [],
      conditions: [],
      slug: "phione",
      speciesId: 489,
    };
    const hash = createHash("sha256").update(JSON.stringify(bw)).digest("hex");
    expect(hash).toBe(BW_BEFORE_SHA256);
  });
});
