import { describe, expect, test } from "bun:test";
import {
  buildPrecacheList,
  classifyRequest,
  shouldWarmGeneration,
  warmList,
} from "../../src/sw/logic";
import { BASE } from "../../src/lib/urls";
import bwJson from "../../src/data/gen/bw.json";

const ORIGIN = "https://brofrong.github.io";
const bw = bwJson as { pokemon: { slug: string }[] };

describe("classifyRequest", () => {
  test("an Astro asset under _astro/ is immutable", () => {
    const url = new URL(`${BASE}_astro/client.ab12cd34.js`, ORIGIN);
    expect(classifyRequest(url, BASE)).toBe("immutable");
  });

  test("a content-hashed sprite atlas is immutable", () => {
    const url = new URL(`${BASE}sprites/bw/atlas-front.d8988f9a.webp`, ORIGIN);
    expect(classifyRequest(url, BASE)).toBe("immutable");
  });

  test("a list page (trailing slash) is html", () => {
    const url = new URL(`${BASE}en/bw/`, ORIGIN);
    expect(classifyRequest(url, BASE)).toBe("html");
  });

  test("the base root itself is html", () => {
    const url = new URL(BASE, ORIGIN);
    expect(classifyRequest(url, BASE)).toBe("html");
  });

  test("a per-pokemon sprite (not content-hashed) is sprite", () => {
    const url = new URL(`${BASE}sprites/bw/front/25.webp`, ORIGIN);
    expect(classifyRequest(url, BASE)).toBe("sprite");
  });

  test("a JSON data file is data", () => {
    const url = new URL(`${BASE}sw-warm.json`, ORIGIN);
    expect(classifyRequest(url, BASE)).toBe("data");
  });

  test("a path outside the base is other", () => {
    const url = new URL("/favicon.svg", ORIGIN);
    expect(classifyRequest(url, BASE)).toBe("other");
  });

  test("a sprite path without the base prefix is other, not sprite", () => {
    const url = new URL("/sprites/bw/front/25.webp", ORIGIN);
    expect(classifyRequest(url, BASE)).toBe("other");
  });
});

describe("buildPrecacheList", () => {
  const distFiles = [
    "_astro/client.ab12cd34.js",
    "_astro/client.ab12cd34.css",
    "sprites/bw/atlas-front.d8988f9a.webp",
    "sprites/bw/atlas-front-shiny.3d77d488.webp",
    "en/bw/index.html",
    "ru/bw/index.html",
    "en/bw/pokemon/bulbasaur/index.html",
    "ru/bw/pokemon/bulbasaur/index.html",
    "sw.js",
    "sw-warm.json",
    "favicon.svg",
  ];
  const list = buildPrecacheList(distFiles, BASE);

  test("includes every _astro asset and sprite atlas", () => {
    expect(list).toContain(`${BASE}_astro/client.ab12cd34.js`);
    expect(list).toContain(`${BASE}_astro/client.ab12cd34.css`);
    expect(list).toContain(`${BASE}sprites/bw/atlas-front.d8988f9a.webp`);
    expect(list).toContain(`${BASE}sprites/bw/atlas-front-shiny.3d77d488.webp`);
  });

  test("includes both languages' bw list pages", () => {
    expect(list).toContain(`${BASE}en/bw/`);
    expect(list).toContain(`${BASE}ru/bw/`);
  });

  test("excludes detail pages", () => {
    expect(list.some((u) => u.includes("/pokemon/"))).toBe(false);
  });

  test("excludes sw.js, sw-warm.json and unrelated static files", () => {
    expect(list.some((u) => u.endsWith("sw.js"))).toBe(false);
    expect(list.some((u) => u.endsWith("sw-warm.json"))).toBe(false);
    expect(list.some((u) => u.endsWith("favicon.svg"))).toBe(false);
  });
});

describe("shouldWarmGeneration", () => {
  test("no connection info -> false", () => {
    expect(shouldWarmGeneration(undefined)).toBe(false);
  });

  test("fast wifi -> true", () => {
    expect(shouldWarmGeneration({ effectiveType: "4g", type: "wifi" })).toBe(
      true,
    );
  });

  test("4g over cellular -> false", () => {
    expect(
      shouldWarmGeneration({ effectiveType: "4g", type: "cellular" }),
    ).toBe(false);
  });

  test("Save-Data -> false even on fast wifi", () => {
    expect(
      shouldWarmGeneration({
        effectiveType: "4g",
        type: "wifi",
        saveData: true,
      }),
    ).toBe(false);
  });

  test("a slower effective type -> false", () => {
    expect(shouldWarmGeneration({ effectiveType: "3g", type: "wifi" })).toBe(
      false,
    );
  });
});

describe("warmList", () => {
  test("builds one URL per slug, all under the lang/gen pokemon path", () => {
    const slugs = bw.pokemon.map((p) => p.slug);
    const urls = warmList("ru", "bw", slugs, BASE);
    expect(urls).toHaveLength(649);
    for (const url of urls) {
      expect(url.startsWith(`${BASE}ru/bw/pokemon/`)).toBe(true);
      expect(url.endsWith("/")).toBe(true);
    }
  });
});
