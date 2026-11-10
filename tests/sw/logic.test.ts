import { describe, expect, test } from "bun:test";
import {
  buildPrecacheList,
  cacheKey,
  classifyRequest,
  isCacheableResponse,
  matchIgnoreSearch,
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
    "sprites/home/atlas-front.fa772c2b.webp",
    "sprites/rb/atlas-front.8580f204.webp",
    "en/bw/index.html",
    "ru/bw/index.html",
    "en/bw/list.json",
    "ru/bw/list.json",
    "en/bw/search.json",
    "en/sv/index.html",
    "ru/rb/index.html",
    "en/sv/list.json",
    "en/bw/pokemon/bulbasaur/index.html",
    "ru/bw/pokemon/bulbasaur/index.html",
    "sw.js",
    "sw-warm/bw.json",
    "sw-warm/sv.json",
    "favicon.svg",
  ];
  const DEFAULTS = { gen: "bw", spriteSet: "bw" } as const;
  const list = buildPrecacheList(distFiles, BASE, DEFAULTS);

  test("only the default generation's list pages, list.json and atlases (others cache on visit)", () => {
    expect(list).not.toContain(`${BASE}en/sv/`);
    expect(list).not.toContain(`${BASE}ru/rb/`);
    expect(list).not.toContain(`${BASE}en/sv/list.json`);
    expect(list).not.toContain(`${BASE}sprites/home/atlas-front.fa772c2b.webp`);
    expect(list).not.toContain(`${BASE}sprites/rb/atlas-front.8580f204.webp`);
    expect(list).toContain(`${BASE}en/bw/list.json`);
    expect(list).toContain(`${BASE}ru/bw/list.json`);
    expect(list).not.toContain(`${BASE}en/bw/search.json`);
  });

  test("follows whichever generation/sprite set is passed as the default", () => {
    const sv = buildPrecacheList(distFiles, BASE, {
      gen: "sv",
      spriteSet: "home",
    });
    expect(sv).toContain(`${BASE}en/sv/`);
    expect(sv).toContain(`${BASE}sprites/home/atlas-front.fa772c2b.webp`);
    expect(sv).not.toContain(`${BASE}en/bw/`);
  });

  test("includes every _astro asset and sprite atlas", () => {
    expect(list).toContain(`${BASE}_astro/client.ab12cd34.js`);
    expect(list).toContain(`${BASE}_astro/client.ab12cd34.css`);
    expect(list).toContain(`${BASE}sprites/bw/atlas-front.d8988f9a.webp`);
    expect(list).toContain(`${BASE}sprites/bw/atlas-front-shiny.3d77d488.webp`);
  });

  test("includes a shared hashed CSS file under _astro/ (Task 2: CSS is no longer inlined)", () => {
    const withCss = buildPrecacheList(
      [...distFiles, "_astro/x.abcd1234.css"],
      BASE,
      DEFAULTS,
    );
    expect(withCss).toContain(`${BASE}_astro/x.abcd1234.css`);
  });

  test("includes both languages' bw list pages", () => {
    expect(list).toContain(`${BASE}en/bw/`);
    expect(list).toContain(`${BASE}ru/bw/`);
  });

  test("excludes detail pages", () => {
    expect(list.some((u) => u.includes("/pokemon/"))).toBe(false);
  });

  test("excludes sw.js, the sw-warm/*.json warm-up lists and unrelated static files", () => {
    expect(list.some((u) => u.endsWith("sw.js"))).toBe(false);
    expect(list.some((u) => u.includes("sw-warm"))).toBe(false);
    expect(list.some((u) => u.endsWith("favicon.svg"))).toBe(false);
  });
});

describe("matchIgnoreSearch", () => {
  test("html navigations ignore the query string (QA #7: ?type=dragon, ?shiny=1, ?form=heat, ...)", () => {
    expect(matchIgnoreSearch("html")).toBe(true);
  });

  test("data requests (list.json, search.json, sw-warm/*.json) match exactly", () => {
    expect(matchIgnoreSearch("data")).toBe(false);
  });

  test("immutable and sprite requests match exactly (not that it matters for cacheFirst)", () => {
    expect(matchIgnoreSearch("immutable")).toBe(false);
    expect(matchIgnoreSearch("sprite")).toBe(false);
  });
});

describe("cacheKey", () => {
  test("html: strips the query string so every query variant stores under one entry", () => {
    expect(cacheKey(`${ORIGIN}${BASE}en/bw/?type=dragon`, "html")).toBe(
      `${ORIGIN}${BASE}en/bw/`,
    );
    expect(cacheKey(`${ORIGIN}${BASE}en/bw/?shiny=1`, "html")).toBe(
      `${ORIGIN}${BASE}en/bw/`,
    );
  });

  test("html: a bare URL (no query) is unchanged", () => {
    expect(cacheKey(`${ORIGIN}${BASE}en/bw/`, "html")).toBe(
      `${ORIGIN}${BASE}en/bw/`,
    );
  });

  test("data/immutable/sprite: stored under the exact request URL, query and all", () => {
    const withQuery = `${ORIGIN}${BASE}en/bw/list.json?v=2`;
    expect(cacheKey(withQuery, "data")).toBe(withQuery);
    const atlas = `${ORIGIN}${BASE}sprites/bw/atlas-front.d8988f9a.webp`;
    expect(cacheKey(atlas, "immutable")).toBe(atlas);
    const sprite = `${ORIGIN}${BASE}sprites/bw/front/25.webp`;
    expect(cacheKey(sprite, "sprite")).toBe(sprite);
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

describe("isCacheableResponse", () => {
  test("a successful same-origin response is cacheable", () => {
    expect(isCacheableResponse({ ok: true, type: "basic" })).toBe(true);
  });

  test("a 404/500 same-origin response is not cacheable", () => {
    expect(isCacheableResponse({ ok: false, type: "basic" })).toBe(false);
  });

  test("an opaque cross-origin response is not cacheable even if ok", () => {
    expect(isCacheableResponse({ ok: true, type: "opaque" })).toBe(false);
  });

  test("a CORS cross-origin response is not cacheable", () => {
    expect(isCacheableResponse({ ok: true, type: "cors" })).toBe(false);
  });

  test("an error response is not cacheable", () => {
    expect(isCacheableResponse({ ok: false, type: "error" })).toBe(false);
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
