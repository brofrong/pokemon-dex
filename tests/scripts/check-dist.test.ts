import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  checkDist,
  DETAIL_HTML_BUDGET_BYTES,
  EXPECTED_DETAIL_PAGES,
  JS_BUDGET_BYTES,
  LIST_HTML_BUDGET_BYTES,
  TOTAL_DIST_BUDGET_BYTES,
} from "../../scripts/check-dist";

const BASE = "/pokemon-dex/";
const SPECIES_COUNT = 649;
const LOCALES = ["en", "ru"] as const;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pokemon-dex-check-dist-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(
  relPath: string,
  content: string | Uint8Array,
): Promise<void> {
  await Bun.write(`${dir}/${relPath}`, content);
}

/** A minimal, valid page: right `<html lang>`, no scripts, no styles. */
function page(lang: string, body = ""): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

/** Generates text that is guaranteed to gzip to more than `minGzipBytes`, without guessing a ratio. */
function fillerOverGzipBudget(minGzipBytes: number): string {
  let n = 1024;
  for (;;) {
    const candidate = randomBytes(n).toString("base64");
    if (gzipSync(Buffer.from(candidate)).length > minGzipBytes)
      return candidate;
    n *= 2;
  }
}

/** Writes the minimal set of pages a real build always has: root + 2 locale redirects. */
async function writeShell(): Promise<void> {
  await write("index.html", page("en"));
  for (const lang of LOCALES) {
    await write(`${lang}/index.html`, page(lang));
  }
}

/** Writes `SPECIES_COUNT` detail pages per locale -- all minimal and link/budget-clean. */
async function writeAllDetailPages(): Promise<void> {
  await Promise.all(
    LOCALES.flatMap((lang) =>
      Array.from({ length: SPECIES_COUNT }, (_, i) =>
        write(`${lang}/bw/pokemon/species-${i + 1}/index.html`, page(lang)),
      ),
    ),
  );
}

describe("checkDist: clean fixture", () => {
  test("a fully valid dist reports no errors", async () => {
    await writeShell();
    for (const lang of LOCALES) {
      await write(
        `${lang}/bw/index.html`,
        page(lang, `<a href="${BASE}${lang}/bw/pokemon/species-1/">x</a>`),
      );
    }
    await writeAllDetailPages();
    await write("sprites/bw/front/1.webp", "fake-sprite-bytes");

    const { errors, report } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
    expect(report["pages.list"]).toBe(2);
    expect(report["pages.detail"]).toBe(EXPECTED_DETAIL_PAGES);
    expect(report["pages.total"]).toBe(
      2 + 1 + EXPECTED_DETAIL_PAGES + LOCALES.length,
    ); // shell + list + detail
    expect(report["sprites.totalBytes"]).toBe(
      Bun.file(`${dir}/sprites/bw/front/1.webp`).size,
    );
  });

  test("accepts a base path given without a leading/trailing slash", async () => {
    await write("index.html", page("en"));
    await write("en/index.html", page("en", `<a href="/app/en/bw/">x</a>`));
    await write("en/bw/index.html", page("en"));
    await write("ru/index.html", page("ru"));
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();

    const { errors } = await checkDist(dir, "app"); // no slashes at all

    expect(errors).toEqual([]);
  });
});

describe("checkDist: check 1 -- links resolve inside dist", () => {
  test("detects a broken href", async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page("en", `<a href="${BASE}en/bw/pokemon/missing/">x</a>`),
    );
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some((e) => e.includes("broken href") && e.includes("missing")),
    ).toBe(true);
  });

  test('resolves a <link rel="stylesheet" href> like any other href', async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page(
        "en",
        `<link rel="stylesheet" href="${BASE}_astro/missing.abcd1234.css">`,
      ),
    );
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some(
        (e) => e.includes("broken href") && e.includes("missing.abcd1234.css"),
      ),
    ).toBe(true);
  });

  test('a <link rel="stylesheet" href> that resolves to a real file is fine', async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page(
        "en",
        `<link rel="stylesheet" href="${BASE}_astro/style.abcd1234.css">`,
      ),
    );
    await write("ru/bw/index.html", page("ru"));
    await write("_astro/style.abcd1234.css", "body{color:#000}");
    await writeAllDetailPages();

    const { errors } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
  });

  test("detects a broken src (and a broken srcset entry)", async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page(
        "en",
        `<img src="${BASE}sprites/nope.webp" srcset="${BASE}sprites/ok.webp 1x, ${BASE}sprites/also-missing.webp 2x">`,
      ),
    );
    await write("ru/bw/index.html", page("ru"));
    await write("sprites/ok.webp", "ok");

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some((e) => e.includes("broken src") && e.includes("nope.webp")),
    ).toBe(true);
    expect(
      errors.some(
        (e) => e.includes("broken srcset") && e.includes("also-missing"),
      ),
    ).toBe(true);
    expect(errors.some((e) => e.includes("ok.webp"))).toBe(false);
  });

  test("detects a broken CSS url() in a style attribute and in a <style> block", async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page(
        "en",
        `<div style="--atlas:url(${BASE}sprites/missing-attr.webp)"></div>` +
          `<style>.x{background:url(${BASE}sprites/missing-style.webp)}</style>`,
      ),
    );
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(errors.some((e) => e.includes("missing-attr.webp"))).toBe(true);
    expect(errors.some((e) => e.includes("missing-style.webp"))).toBe(true);
  });

  test("flags a link that is missing the base prefix (base path leak)", async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page("en", `<img src="/sprites/bw/1.webp">`),
    );
    await write("ru/bw/index.html", page("ru"));
    // The file even exists at the base-less path -- the leak must still be caught.
    await write("sprites/bw/1.webp", "exists-but-at-the-wrong-url");

    const { errors } = await checkDist(dir, BASE);

    expect(errors.some((e) => e.includes("escapes base"))).toBe(true);
  });

  test("ignores external URLs, mailto:, data:, hash fragments and query strings", async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page(
        "en",
        [
          `<a href="https://example.com/x">ext</a>`,
          `<a href="//example.com/x">protocol-relative</a>`,
          `<a href="mailto:a@b.com">mail</a>`,
          `<a href="#frag-only">frag</a>`,
          `<img src="data:image/webp;base64,AAAA">`,
          `<a href="${BASE}en/bw/?type=fire&sort=id">query</a>`,
          `<a href="${BASE}en/bw/#card-1">hash</a>`,
        ].join(""),
      ),
    );
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();

    const { errors } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
  });

  test("resolves a relative href against its own page directory", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en", `<a href="../">up</a>`));
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();

    const { errors } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
  });
});

describe("checkDist: check 2 -- per-page JS budget", () => {
  test("detects an oversize inline script", async () => {
    await writeShell();
    const filler = fillerOverGzipBudget(JS_BUDGET_BYTES);
    await write(
      "en/bw/index.html",
      page("en", `<script>var bigComment = "${filler}";</script>`),
    );
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(errors.some((e) => e.includes("JS budget exceeded"))).toBe(true);
  });

  test("detects an oversize external script", async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page("en", `<script type="module" src="${BASE}_astro/big.js"></script>`),
    );
    await write("ru/bw/index.html", page("ru"));
    const filler = fillerOverGzipBudget(JS_BUDGET_BYTES);
    await write("_astro/big.js", `var bigComment = "${filler}";`);

    const { errors } = await checkDist(dir, BASE);

    expect(errors.some((e) => e.includes("JS budget exceeded"))).toBe(true);
  });

  test("a page under budget is fine, and JSON/speculationrules script blocks are excluded", async () => {
    await writeShell();
    const jsonFiller = fillerOverGzipBudget(JS_BUDGET_BYTES); // large, but it's JSON -- must not count
    await write(
      "en/bw/index.html",
      page(
        "en",
        `<script type="application/json">{"big":"${jsonFiller}"}</script>` +
          `<script type="speculationrules">{"big":"${jsonFiller}"}</script>` +
          `<script>1;</script>`,
      ),
    );
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();

    const { errors, report } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
    expect(report["js.gzipMaxBytes"]).toBeLessThan(JS_BUDGET_BYTES);
  });
});

describe("checkDist: check 3 -- list page HTML budget (Ruling R21/R17: 70 KB)", () => {
  test("detects a list page over the 70 KB gzip budget", async () => {
    await writeShell();
    const filler = fillerOverGzipBudget(LIST_HTML_BUDGET_BYTES);
    await write(
      "en/bw/index.html",
      page("en", `<div data-filler="${filler}"></div>`),
    );
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some((e) => e.includes("list page HTML budget exceeded")),
    ).toBe(true);
  });

  test("the same oversize body on a detail page does not trip the list-page HTML budget (it trips the detail-page one instead)", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));
    const filler = fillerOverGzipBudget(LIST_HTML_BUDGET_BYTES);
    await write(
      "en/bw/pokemon/species-1/index.html",
      page("en", `<div data-filler="${filler}"></div>`),
    );

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some((e) => e.includes("list page HTML budget exceeded")),
    ).toBe(false);
    expect(
      errors.some((e) => e.includes("detail page HTML budget exceeded")),
    ).toBe(true);
  });
});

describe("checkDist: check 3b -- detail page HTML budget (20 KB gzip)", () => {
  test("detects a detail page over the 20 KB gzip budget", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));
    const filler = fillerOverGzipBudget(DETAIL_HTML_BUDGET_BYTES);
    await write(
      "en/bw/pokemon/species-1/index.html",
      page("en", `<div data-filler="${filler}"></div>`),
    );

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some((e) => e.includes("detail page HTML budget exceeded")),
    ).toBe(true);
  });

  test("the same oversize body on a list page does not trip the detail-page HTML budget", async () => {
    await writeShell();
    const filler = fillerOverGzipBudget(DETAIL_HTML_BUDGET_BYTES);
    await write(
      "en/bw/index.html",
      page("en", `<div data-filler="${filler}"></div>`),
    );
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some((e) => e.includes("detail page HTML budget exceeded")),
    ).toBe(false);
  });

  test("a detail page under budget is fine, and the report tracks the max", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();

    const { errors, report } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
    expect(report["html.detail.gzipMaxBytes"]).toBeLessThan(
      DETAIL_HTML_BUDGET_BYTES,
    );
  });

  test("a tiny injected detail HTML budget (options override) catches an otherwise-fine page", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));
    await write("en/bw/pokemon/species-1/index.html", page("en"));
    await write("ru/bw/pokemon/species-1/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE, {
      detailHtmlBudgetBytes: 1,
    });

    expect(
      errors.some((e) => e.includes("detail page HTML budget exceeded")),
    ).toBe(true);
  });
});

describe("checkDist: check 8 -- total dist/ size budget (900 MB)", () => {
  test("a tiny injected total-size budget (options override) catches an otherwise-fine dist", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));

    const { errors, report } = await checkDist(dir, BASE, {
      totalDistBudgetBytes: 1,
    });

    expect(errors.some((e) => e.includes("total size budget exceeded"))).toBe(
      true,
    );
    expect(report["dist.totalBytes"]).toBeGreaterThan(1);
  });

  test("stays under the default 900 MB budget for a small fixture dist", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();

    const { errors, report } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
    expect(report["dist.totalBytes"]).toBeLessThan(TOTAL_DIST_BUDGET_BYTES);
  });
});

describe("checkDist: check 4 -- duplicate view-transition-name", () => {
  test("detects a duplicate name split across a style attribute and a <style> block", async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page(
        "en",
        `<div style="view-transition-name:pdx-1"></div>` +
          `<style>.hero{view-transition-name:pdx-1}</style>`,
      ),
    );
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some((e) => e.includes('duplicate view-transition-name "pdx-1"')),
    ).toBe(true);
  });

  test("the same name repeated on two different pages is fine", async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page("en", `<div style="view-transition-name:pdx-1"></div>`),
    );
    await write(
      "ru/bw/index.html",
      page("ru", `<div style="view-transition-name:pdx-1"></div>`),
    );
    await writeAllDetailPages();

    const { errors } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
  });

  test("an explicit view-transition-name: none is never a duplicate", async () => {
    await writeShell();
    await write(
      "en/bw/index.html",
      page(
        "en",
        `<div style="view-transition-name:none"></div><div style="view-transition-name:none"></div>`,
      ),
    );
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();

    const { errors } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
  });
});

describe("checkDist: check 5 -- <html lang> matches path locale", () => {
  test("detects a mismatched lang on a list page", async () => {
    await writeShell();
    await write("en/bw/index.html", page("ru")); // wrong on purpose
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some(
        (e) =>
          e.includes('does not match path locale "en"') &&
          e.includes("/en/bw/"),
      ),
    ).toBe(true);
  });

  test("detects a mismatched lang on a locale redirect page", async () => {
    await write("index.html", page("en"));
    await write("en/index.html", page("fr")); // wrong on purpose
    await write("en/bw/index.html", page("en"));
    await write("ru/index.html", page("ru"));
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some((e) => e.includes("/en/") && e.includes("path locale")),
    ).toBe(true);
  });

  test("the root page is exempt from the lang check regardless of its <html lang>", async () => {
    await write("index.html", page("fr")); // would fail if checked -- root has no single locale
    await write("en/index.html", page("en"));
    await write("en/bw/index.html", page("en"));
    await write("ru/index.html", page("ru"));
    await write("ru/bw/index.html", page("ru"));

    const { errors } = await checkDist(dir, BASE);

    expect(errors.some((e) => e.startsWith("/:"))).toBe(false);
  });
});

describe("checkDist: custom 404 page (dist/404.html)", () => {
  test("is exempt from the lang check, and isn't counted as a list/detail page", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();
    await write("404.html", page("fr")); // would fail the lang check if checked

    const { errors, report } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
    expect(report["pages.list"]).toBe(2);
    expect(report["pages.detail"]).toBe(EXPECTED_DETAIL_PAGES);
  });

  test("still validates links and the JS budget inside 404.html", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();
    await write(
      "404.html",
      page("en", `<a href="${BASE}en/bw/pokemon/missing/">x</a>`),
    );

    const { errors } = await checkDist(dir, BASE);

    expect(
      errors.some(
        (e) => e.startsWith("/404.html") && e.includes("broken href"),
      ),
    ).toBe(true);
  });
});

describe("checkDist: check 6 -- exactly 2 x 649 detail pages", () => {
  test("reports the exact count when too few detail pages exist", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));
    await write("en/bw/pokemon/species-1/index.html", page("en"));
    await write("ru/bw/pokemon/species-1/index.html", page("ru"));

    const { errors, report } = await checkDist(dir, BASE);

    expect(
      errors.some(
        (e) =>
          e.includes(`expected exactly ${EXPECTED_DETAIL_PAGES}`) &&
          e.includes("found 2"),
      ),
    ).toBe(true);
    expect(report["pages.detail"]).toBe(2);
  });

  test("passes once exactly 2 x 649 detail pages exist (and all other checks are clean)", async () => {
    await writeShell();
    await write("en/bw/index.html", page("en"));
    await write("ru/bw/index.html", page("ru"));
    await writeAllDetailPages();

    const { errors, report } = await checkDist(dir, BASE);

    expect(errors).toEqual([]);
    expect(report["pages.detail"]).toBe(EXPECTED_DETAIL_PAGES);
  });
});
