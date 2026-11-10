/**
 * The two per-generation JSON endpoints' payload builders (`src/lib/list-data.ts`):
 *  - `listTuples` -> `/{lang}/{gen}/list.json`, the list page's search keys/stats/evolution
 *    ids/flags, fetched right after first paint so the 1025-card HTML stays within budget;
 *  - `searchTuples` -> `/{lang}/{gen}/search.json`, the ⌘K palette index.
 * The endpoints themselves (`src/pages/[lang]/[gen]/*.json.ts`) read their dataset through
 * `getGenData` (Vite's `import.meta.glob`, unavailable under `bun test`), so the shape and size
 * are pinned here against the builders, fed the real datasets.
 */
import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import type { GenData, GenId } from "../../src/data/types";
import { GENERATIONS } from "../../src/lib/generations";
import { flattenEvo, listTuples, searchTuples } from "../../src/lib/list-data";

const load = async (id: GenId) =>
  (await Bun.file(`src/data/gen/${id}.json`).json()) as GenData;

describe("listTuples", () => {
  test("one [id, searchKey, stats, evoIds, flags] tuple per species, in Pokédex order", async () => {
    const rb = await load("rb");
    const tuples = listTuples(rb);
    expect(tuples).toHaveLength(151);
    expect(tuples.map((t) => t[0])).toEqual(rb.pokemon.map((p) => p.id));

    const pikachu = tuples.find((t) => t[0] === 25)!;
    const [id, key, stats, evo, flags] = pikachu;
    expect(id).toBe(25);
    expect(key).toContain("pikachu");
    expect(key).toContain("пикачу");
    expect(key.split(" ")).toContain("25");
    expect(stats).toHaveLength(6);
    expect(evo).toEqual([25, 26]); // no Pichu in gen I
    expect(flags).toEqual(["new"]);
  });

  test("evolution ids span the whole chain, branches included", async () => {
    const bw = await load("bw");
    const eevee = listTuples(bw).find((t) => t[0] === 133)!;
    expect(eevee[3]).toEqual([133, 134, 135, 136, 196, 197, 470, 471]);
    expect(flattenEvo(bw.pokemon[0]!.evolution)).toEqual([1, 2, 3]);
  });

  test("sv (1025 species) gzips to <= 40 KB", async () => {
    const json = JSON.stringify(listTuples(await load("sv")));
    const gz = gzipSync(Buffer.from(json)).length;
    expect(gz).toBeLessThanOrEqual(40 * 1024);
  });
});

describe("searchTuples", () => {
  test("ru/bw: 649 tuples, gzip < 20 KB", async () => {
    const tuples = searchTuples(await load("bw"), "ru");
    expect(tuples).toHaveLength(649);
    expect(gzipSync(Buffer.from(JSON.stringify(tuples))).length).toBeLessThan(
      20 * 1024,
    );
  });

  test("ru/bw: charmander tuple is [4, 'charmander', 'Чармандер', bilingual key, ['fire']]", async () => {
    const charmander = searchTuples(await load("bw"), "ru").find(
      (t) => t[0] === 4,
    )!;
    expect(charmander[1]).toBe("charmander");
    expect(charmander[2]).toBe("Чармандер");
    expect(charmander[3]).toContain("чармандер");
    expect(charmander[3]).toContain("charmander");
    expect(charmander[4]).toEqual(["fire"]);
  });

  test("en: display names are English", async () => {
    const t = searchTuples(await load("bw"), "en").find((x) => x[0] === 4)!;
    expect(t[2]).toBe("Charmander");
  });

  test("every generation: one tuple per species, gen-specific types (Clefairy is Normal in gen I-V)", async () => {
    for (const g of GENERATIONS) {
      const data = await load(g.id);
      const tuples = searchTuples(data, "en");
      expect(tuples).toHaveLength(g.maxSpeciesId);
      const clefairy = tuples.find((t) => t[0] === 35)!;
      expect(clefairy[4]).toEqual([g.number < 6 ? "normal" : "fairy"]);
    }
  });
});
