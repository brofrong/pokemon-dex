/**
 * Validates a built `dist/` directory against the project's dist-output contract:
 *
 *  1. every `href`/`src`/`srcset` and CSS `url()` that points inside the site resolves to a real
 *     file in `dist` (query/hash ignored, external URLs/`data:`/`mailto:` ignored);
 *  2. per page, the gzip size of the JS it loads (inline plus external) is <= 15 KB
 *     ({@link JS_BUDGET_BYTES});
 *  3. each list page's HTML gzip size is <= 70 KB ({@link LIST_HTML_BUDGET_BYTES} -- Controller
 *     Ruling R21/R17 raises this from the original 50 KB);
 *  4. no page repeats a `view-transition-name`, whether set via an inline `<style>` block or a
 *     `style=""` attribute;
 *  5. every page's `<html lang>` equals its path locale (the root page and the custom 404 page
 *     have no single locale and are exempt; `/{lang}/index.html` is checked against its own
 *     `{lang}` segment);
 *  6. exactly the expected number of Pokémon detail pages (Σ species over every enabled
 *     generation x 2 locales) and list pages (generations x locales) exist -- see
 *     {@link expectedPageCounts}; `main` derives both from `src/lib/generations.ts`, and the check
 *     is skipped when a caller (a synthetic test fixture) passes no expected counts;
 *  7. each detail page's HTML gzip size is <= 20 KB ({@link DETAIL_HTML_BUDGET_BYTES} -- Task 2:
 *     CSS moved out of the page (`build.inlineStylesheets: "never"`), so a detail page is now
 *     just its own markup);
 *  8. the whole `dist/` directory is <= 900 MB ({@link TOTAL_DIST_BUDGET_BYTES}).
 *
 * Every budget in checks 2/3/7/8 can be overridden per call via the `options` param (Task 2) --
 * used by tests to inject a tiny limit instead of generating a multi-hundred-MB fixture.
 *
 * Deliberately self-contained -- it imports nothing from `src/`, only the generic route shape
 * used throughout this static site:
 *   - depth 0 (`dist/index.html`)                              -> the unlocalized root redirect
 *   - depth 1 (`dist/{lang}/index.html`)                        -> a per-locale redirect
 *   - depth 2 (`dist/{lang}/{gen}/index.html`)                  -> a Pokémon list page
 *   - depth 4, segment[2] === "pokemon" (`.../pokemon/{slug}/`) -> a Pokémon detail page
 *   - `dist/404.html`                                           -> the custom 404 page (see below)
 * so it keeps working as `src/lib/generations.ts`/`src/i18n/ui.ts` change, and is easy to unit
 * test against a tiny synthetic `dist/` instead of a real Astro build.
 */

import { readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

/** Per-page JS budget (inline + external script bytes, gzipped). See constraints.md. */
export const JS_BUDGET_BYTES = 15 * 1024;

/**
 * Per-list-page HTML budget, gzipped. Controller Ruling R21/R17: 70 KB, not the 50 KB in the
 * original task brief. With cards trimmed to their visible content (`list.json` carries the rest),
 * the largest list page (sv, 1025 cards, RU) gzips to ~45 KB.
 */
export const LIST_HTML_BUDGET_BYTES = 70 * 1024;

/**
 * The detail/list page counts a build of `gens` in `locales` languages must have: one detail page
 * per species of every enabled generation (each generation has species 1..`maxSpeciesId`) and one
 * list page per enabled generation, each times the locales. Takes the generation configs as plain
 * data so this module still imports nothing from `src/` itself.
 */
export function expectedPageCounts(
  gens: readonly { maxSpeciesId: number; enabled: boolean }[],
  locales: number,
): { detail: number; list: number } {
  const enabled = gens.filter((g) => g.enabled);
  return {
    detail: locales * enabled.reduce((sum, g) => sum + g.maxSpeciesId, 0),
    list: locales * enabled.length,
  };
}

/** Per-detail-page HTML budget, gzipped. See constraints.md. */
export const DETAIL_HTML_BUDGET_BYTES = 20 * 1024;

/** Total `dist/` directory size budget. See constraints.md. */
export const TOTAL_DIST_BUDGET_BYTES = 900 * 1024 * 1024;

export interface CheckDistResult {
  errors: string[];
  report: Record<string, number>;
}

/** Per-call overrides for the budgets above, so tests can inject a tiny limit (Task 2). */
export interface CheckDistOptions {
  jsBudgetBytes?: number;
  listHtmlBudgetBytes?: number;
  detailHtmlBudgetBytes?: number;
  totalDistBudgetBytes?: number;
  /** Check 6: the exact number of detail pages; skipped when undefined. */
  expectedDetailPages?: number;
  /** Check 6: the exact number of list pages; skipped when undefined. */
  expectedListPages?: number;
}

/** A link/asset reference extracted from one page's markup. */
interface Reference {
  value: string;
  kind: "href" | "src" | "srcset" | "css-url";
}

interface ScriptRef {
  type: string | null;
  src: string | null;
  text: string;
}

interface PageExtract {
  lang: string | null;
  references: Reference[];
  scripts: ScriptRef[];
  vtNames: string[];
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const VT_NAME_RE = /view-transition-name\s*:\s*([^;}'"]+)/gi;
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

/** Script `type`s that carry data, not JS, and are excluded from the JS budget. */
function isNonJsScriptType(type: string | null): boolean {
  if (type === null) return false;
  const t = type.toLowerCase();
  return t === "speculationrules" || t.includes("json");
}

/** Strips a trailing query string and/or hash fragment; `""` means "fragment/query-only". */
function stripQueryHash(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

/** `//host/...`, `scheme:...` (`https:`, `mailto:`, `data:`, `tel:`, …), and empty values. */
function isExternal(pathOnly: string): boolean {
  return (
    pathOnly === "" || pathOnly.startsWith("//") || SCHEME_RE.test(pathOnly)
  );
}

function normalizeBase(base: string): string {
  const withLeading = base.startsWith("/") ? base : `/${base}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/** Maps a base-stripped site path (starts with `/`) to a dist-relative file path. */
function siteToDistPath(sitePath: string): string {
  if (sitePath === "/" || sitePath === "") return "index.html";
  return sitePath.endsWith("/")
    ? `${sitePath.slice(1)}index.html`
    : sitePath.slice(1);
}

type Resolution =
  | { kind: "ignored" }
  | { kind: "escapes-base"; absolutePath: string }
  | { kind: "ok"; distPath: string };

/**
 * Resolves one `href`/`src`/`url(...)` value found on the page at `pageSitePath` (its full URL
 * path, including `base`) to a dist-relative file path, or explains why it was ignored/invalid.
 */
function resolveReference(
  rawValue: string,
  pageSitePath: string,
  base: string,
): Resolution {
  const pathOnly = stripQueryHash(rawValue.trim());
  if (isExternal(pathOnly)) return { kind: "ignored" };

  const absolutePath = pathOnly.startsWith("/")
    ? pathOnly
    : new URL(pathOnly, `http://dist${pageSitePath}`).pathname;

  if (!absolutePath.startsWith(base)) {
    return { kind: "escapes-base", absolutePath };
  }
  const sitePath = `/${absolutePath.slice(base.length)}`;
  return { kind: "ok", distPath: siteToDistPath(sitePath) };
}

function parseSrcset(srcset: string): string[] {
  return srcset
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter((url): url is string => Boolean(url));
}

/** Extracts every link/asset reference, script and `view-transition-name` from one page's HTML. */
async function extractPage(html: ArrayBuffer): Promise<PageExtract> {
  let lang: string | null = null;
  const references: Reference[] = [];
  const scripts: ScriptRef[] = [];
  const vtNames: string[] = [];
  const styleBlocks: string[] = [];

  function collectVtNames(css: string): void {
    for (const match of css.matchAll(VT_NAME_RE)) {
      const name = match[1]?.trim();
      if (name && name.toLowerCase() !== "none") vtNames.push(name);
    }
  }

  function collectCssUrls(css: string): void {
    for (const match of css.matchAll(CSS_URL_RE)) {
      const value = match[2];
      if (value) references.push({ value, kind: "css-url" });
    }
  }

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(el) {
        lang = el.getAttribute("lang");
      },
    })
    .on("[href]", {
      element(el) {
        const value = el.getAttribute("href");
        if (value) references.push({ value, kind: "href" });
      },
    })
    .on("[src]", {
      element(el) {
        const value = el.getAttribute("src");
        if (value) references.push({ value, kind: "src" });
      },
    })
    .on("[srcset]", {
      element(el) {
        const value = el.getAttribute("srcset");
        if (value) {
          for (const url of parseSrcset(value))
            references.push({ value: url, kind: "srcset" });
        }
      },
    })
    .on("[style]", {
      element(el) {
        const style = el.getAttribute("style");
        if (style) {
          collectVtNames(style);
          collectCssUrls(style);
        }
      },
    })
    .on("style", {
      element() {
        styleBlocks.push("");
      },
      text(chunk) {
        const i = styleBlocks.length - 1;
        if (i >= 0) styleBlocks[i] += chunk.text;
      },
    })
    .on("script", {
      element(el) {
        scripts.push({
          type: el.getAttribute("type"),
          src: el.getAttribute("src"),
          text: "",
        });
      },
      text(chunk) {
        const script = scripts[scripts.length - 1];
        if (script) script.text += chunk.text;
      },
    });

  // `transform` is lazy: the parser only runs once the resulting body is consumed.
  await rewriter.transform(new Response(html)).arrayBuffer();
  for (const css of styleBlocks) {
    collectVtNames(css);
    collectCssUrls(css);
  }
  return { lang, references, scripts, vtNames };
}

/**
 * A page found under `dist/`, with its route decomposed into path segments (base-relative).
 * Astro (`output: "static"`, `trailingSlash: "always"`) only ever emits `index.html` files, one
 * per directory, with one deliberate exception: `src/pages/404.astro` is always built to
 * `dist/404.html` (a bare file, no directory/trailing slash), since that's the exact filename
 * GitHub Pages looks for -- see Astro's custom-404-page docs. `toPage` gives it `segments: []`,
 * the same as the unlocalized root page, so it rides the existing root exemption from check 5's
 * per-locale `<html lang>` check (it has no single locale either) without needing a second
 * special case there; its distinct `sitePath` (`"/404.html"`, not `"/"`) keeps it out of check 6's
 * list/detail route-shape matching and out of the root page's own error messages.
 */
interface Page {
  /** Dist-relative path, e.g. `"en/bw/index.html"` (or `"404.html"`, the one bare-file page). */
  filePath: string;
  /** Base-relative site path, e.g. `"/en/bw/"` (or `"/404.html"`). */
  sitePath: string;
  /** Path segments between the base and `index.html`, e.g. `["en", "bw"]` (`[]` for `404.html`). */
  segments: string[];
}

async function listDistFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) =>
      `${e.parentPath}/${e.name}`.slice(dir.length + 1).replaceAll("\\", "/"),
    );
}

function toPage(filePath: string): Page | null {
  if (filePath === "404.html") {
    return { filePath, sitePath: "/404.html", segments: [] };
  }
  if (filePath !== "index.html" && !filePath.endsWith("/index.html"))
    return null;
  const dirPart =
    filePath === "index.html"
      ? ""
      : filePath.slice(0, -"index.html".length - 1);
  const segments = dirPart === "" ? [] : dirPart.split("/");
  const sitePath = segments.length === 0 ? "/" : `/${segments.join("/")}/`;
  return { filePath, sitePath, segments };
}

function isPage(page: Page | null): page is Page {
  return page !== null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Checks the built static site in `dir` (e.g. `"dist"`), served under `base` (e.g.
 * `"/pokemon-dex/"`; with or without a trailing slash). See the module doc for the eight checks.
 */
export async function checkDist(
  dir: string,
  base: string,
  options: CheckDistOptions = {},
): Promise<CheckDistResult> {
  const jsBudgetBytes = options.jsBudgetBytes ?? JS_BUDGET_BYTES;
  const listHtmlBudgetBytes =
    options.listHtmlBudgetBytes ?? LIST_HTML_BUDGET_BYTES;
  const detailHtmlBudgetBytes =
    options.detailHtmlBudgetBytes ?? DETAIL_HTML_BUDGET_BYTES;
  const totalDistBudgetBytes =
    options.totalDistBudgetBytes ?? TOTAL_DIST_BUDGET_BYTES;

  const normalizedBase = normalizeBase(base);
  const errors: string[] = [];

  const allFiles = await listDistFiles(dir);
  const fileSet = new Set(allFiles);

  let spritesTotalBytes = 0;
  let totalBytes = 0;
  // Reported only (no budget): the list page's deferred `list.json` (search keys, stats, ...).
  let listJsonGzipMaxBytes = 0;
  for (const f of allFiles) {
    const size = Bun.file(`${dir}/${f}`).size;
    totalBytes += size;
    if (f.startsWith("sprites/")) spritesTotalBytes += size;
    if (f.endsWith("/list.json")) {
      const gz = gzipSync(await Bun.file(`${dir}/${f}`).arrayBuffer()).length;
      listJsonGzipMaxBytes = Math.max(listJsonGzipMaxBytes, gz);
    }
  }

  const pages = allFiles.map(toPage).filter(isPage);

  let detailPageCount = 0;
  let listPageCount = 0;
  let listHtmlGzipMaxBytes = 0;
  let detailHtmlGzipMaxBytes = 0;
  let jsGzipMaxBytes = 0;

  for (const page of pages) {
    const raw = await Bun.file(`${dir}/${page.filePath}`).arrayBuffer();
    const extract = await extractPage(raw);

    const pageSitePath = `${normalizedBase.slice(0, -1)}${page.sitePath}`;
    // `segments.length === 0` covers both the unlocalized root page and `404.html` (see `Page`'s
    // doc comment) -- neither has one single locale, so both are exempt from check 5 below.
    const isRoot = page.segments.length === 0;
    const isListPage = page.segments.length === 2;
    const isDetailPage =
      page.segments.length === 4 && page.segments[2] === "pokemon";
    if (isListPage) listPageCount++;
    if (isDetailPage) detailPageCount++;

    // Check 1: every href/src/srcset/CSS url() resolves to a real dist file.
    for (const ref of extract.references) {
      const resolution = resolveReference(
        ref.value,
        pageSitePath,
        normalizedBase,
      );
      if (resolution.kind === "ignored") continue;
      if (resolution.kind === "escapes-base") {
        errors.push(
          `${page.sitePath}: ${ref.kind}="${ref.value}" escapes base "${normalizedBase}" (resolved to "${resolution.absolutePath}")`,
        );
        continue;
      }
      if (!fileSet.has(resolution.distPath)) {
        errors.push(
          `${page.sitePath}: broken ${ref.kind}="${ref.value}" -> dist/${resolution.distPath} does not exist`,
        );
      }
    }

    // Check 2: per-page JS budget (inline + external script bytes, gzipped individually).
    let jsGzipBytes = 0;
    for (const script of extract.scripts) {
      if (isNonJsScriptType(script.type)) continue;
      if (script.src) {
        const resolution = resolveReference(
          script.src,
          pageSitePath,
          normalizedBase,
        );
        if (resolution.kind === "ok" && fileSet.has(resolution.distPath)) {
          jsGzipBytes += gzipSync(
            await Bun.file(`${dir}/${resolution.distPath}`).arrayBuffer(),
          ).length;
        }
        // A missing/escaping script src is already reported by check 1 above.
      } else if (script.text) {
        jsGzipBytes += gzipSync(Buffer.from(script.text, "utf-8")).length;
      }
    }
    jsGzipMaxBytes = Math.max(jsGzipMaxBytes, jsGzipBytes);
    if (jsGzipBytes > jsBudgetBytes) {
      errors.push(
        `${page.sitePath}: JS budget exceeded -- ${formatBytes(jsGzipBytes)} gzip > ${formatBytes(jsBudgetBytes)} budget`,
      );
    }

    // Check 3: list-page HTML budget.
    const htmlGzipBytes = gzipSync(Buffer.from(raw)).length;
    if (isListPage) {
      listHtmlGzipMaxBytes = Math.max(listHtmlGzipMaxBytes, htmlGzipBytes);
      if (htmlGzipBytes > listHtmlBudgetBytes) {
        errors.push(
          `${page.sitePath}: list page HTML budget exceeded -- ${formatBytes(htmlGzipBytes)} gzip > ${formatBytes(listHtmlBudgetBytes)} budget`,
        );
      }
    }

    // Check 7: detail-page HTML budget (Task 2: CSS is no longer inlined, so this is markup only).
    if (isDetailPage) {
      detailHtmlGzipMaxBytes = Math.max(detailHtmlGzipMaxBytes, htmlGzipBytes);
      if (htmlGzipBytes > detailHtmlBudgetBytes) {
        errors.push(
          `${page.sitePath}: detail page HTML budget exceeded -- ${formatBytes(htmlGzipBytes)} gzip > ${formatBytes(detailHtmlBudgetBytes)} budget`,
        );
      }
    }

    // Check 4: no duplicate view-transition-name on the page.
    const seen = new Set<string>();
    for (const name of extract.vtNames) {
      if (seen.has(name)) {
        errors.push(
          `${page.sitePath}: duplicate view-transition-name "${name}"`,
        );
      }
      seen.add(name);
    }

    // Check 5: <html lang> matches the path locale (root page exempt -- no single locale).
    if (!isRoot) {
      const locale = page.segments[0];
      if (extract.lang !== locale) {
        errors.push(
          `${page.sitePath}: <html lang="${extract.lang ?? ""}"> does not match path locale "${locale}"`,
        );
      }
    }
  }

  // Check 6: exactly the expected number of detail and list pages.
  const { expectedDetailPages, expectedListPages } = options;
  if (
    expectedDetailPages !== undefined &&
    detailPageCount !== expectedDetailPages
  ) {
    errors.push(
      `expected exactly ${expectedDetailPages} detail pages (species x locales), found ${detailPageCount}`,
    );
  }
  if (expectedListPages !== undefined && listPageCount !== expectedListPages) {
    errors.push(
      `expected exactly ${expectedListPages} list pages (generations x locales), found ${listPageCount}`,
    );
  }

  // Check 8: total dist/ directory size.
  if (totalBytes > totalDistBudgetBytes) {
    errors.push(
      `dist/ total size budget exceeded -- ${formatBytes(totalBytes)} > ${formatBytes(totalDistBudgetBytes)} budget`,
    );
  }

  return {
    errors,
    report: {
      "pages.total": pages.length,
      "pages.list": listPageCount,
      "pages.detail": detailPageCount,
      "html.list.gzipMaxBytes": listHtmlGzipMaxBytes,
      "html.detail.gzipMaxBytes": detailHtmlGzipMaxBytes,
      "js.gzipMaxBytes": jsGzipMaxBytes,
      "json.list.gzipMaxBytes": listJsonGzipMaxBytes,
      "sprites.totalBytes": spritesTotalBytes,
      "dist.totalBytes": totalBytes,
    },
  };
}

async function main(): Promise<void> {
  const { BASE } = await import("../src/lib/urls");
  const { GENERATIONS } = await import("../src/lib/generations");
  const { LANGS } = await import("../src/i18n/ui");
  const counts = expectedPageCounts(GENERATIONS, LANGS.length);
  const { errors, report } = await checkDist("dist", BASE, {
    expectedDetailPages: counts.detail,
    expectedListPages: counts.list,
  });

  console.log("[check-dist] report:");
  for (const [key, value] of Object.entries(report)) {
    const formatted = key.toLowerCase().includes("bytes")
      ? formatBytes(value)
      : String(value);
    console.log(`[check-dist]   ${key}: ${formatted} (${value})`);
  }

  if (errors.length > 0) {
    console.error(`[check-dist] ${errors.length} error(s):`);
    for (const error of errors) console.error(`[check-dist]   - ${error}`);
    process.exit(1);
  }

  console.log("[check-dist] OK -- no errors.");
}

if (import.meta.main) {
  await main();
}
