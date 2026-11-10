/**
 * Pure logic for the service worker (Task 14): which cache strategy a request gets
 * ({@link classifyRequest}), what the SW precaches at install ({@link buildPrecacheList}), when
 * it is safe to warm a whole generation's detail pages into the offline cache
 * ({@link shouldWarmGeneration}), and the URL list for that warm-up ({@link warmList}).
 *
 * Kept separate from `src/sw/sw.ts` (the actual worker, which talks to `self`/`caches`/`fetch`)
 * so this can be unit tested directly with `bun test`, same as the rest of the codebase's
 * client-script logic (`src/scripts/list-state.ts`, `src/scripts/theme.ts`, ...).
 */

import type { Lang } from "../i18n/ui";
import type { GenId } from "../data/types";

/**
 * How the service worker treats one request:
 * - `immutable` -- a content-hashed Astro asset or sprite atlas; never changes, cache forever.
 * - `html` -- a navigable page (ends in `/`, since `trailingSlash: 'always'`); may change between
 *   deploys, served stale-while-revalidate.
 * - `sprite` -- a per-Pokémon sprite file; stable in practice but not content-hashed, so treated
 *   as immutable's sibling but cached on first request rather than precached.
 * - `data` -- a `.json` file (`sw-warm.json`, later `search.json`); served stale-while-revalidate.
 * - `other` -- cross-origin, outside the site's base path, or anything else the SW leaves to the
 *   network untouched.
 */
export type RequestKind = "immutable" | "html" | "sprite" | "data" | "other";

/** Matches a content-hashed sprite atlas filename, e.g. `atlas-front.d8988f9a.webp`. */
const HASHED_WEBP = /\.[0-9a-f]{8}\.webp$/i;

/**
 * Classifies one request by its URL, relative to the site's `base` (e.g. `/pokemon-dex/`).
 * `url.pathname` must start with `base` or the result is `other` -- this also means a path that
 * looks like a sprite/asset but is missing the base prefix (a base-leak bug, see constraints.md
 * Review Focus #4) is correctly rejected instead of being cached under the wrong strategy.
 */
export function classifyRequest(url: URL, base: string): RequestKind {
  if (!url.pathname.startsWith(base)) return "other";
  const rel = url.pathname.slice(base.length);

  if (rel.startsWith("_astro/")) return "immutable";
  if (HASHED_WEBP.test(rel)) return "immutable";
  if (rel.startsWith("sprites/")) return "sprite";
  if (rel.endsWith(".json")) return "data";
  if (rel === "" || rel.endsWith("/")) return "html";
  return "other";
}

/** Matches a generation list page's output file, e.g. `en/bw/index.html` (exactly `{lang}/{gen}/index.html`). */
const LIST_PAGE_FILE = /^[a-z]{2}\/[a-z0-9]+\/index\.html$/;

/**
 * Builds the service worker's precache list from the finished `dist/` file listing (paths
 * relative to the dist root, as produced by `integrations/service-worker.ts`'s `Bun.Glob` scan):
 * every content-hashed Astro asset (`_astro/*`) and sprite atlas, plus both languages' `bw` list
 * pages. Detail pages are deliberately excluded (649 x 2 pages would bloat the install) -- they
 * are warmed in the background instead, see {@link warmList}.
 *
 * Per Ruling R20, `search.json` does not exist yet (Task 12) and is therefore not included here
 * either way; `sw-warm.json` (the warm-up slug list this integration also writes) is likewise
 * excluded on purpose -- precaching it unconditionally for every visitor would defeat
 * {@link shouldWarmGeneration}'s whole point of not spending bandwidth on slow/metered
 * connections. It is cached the normal way (stale-while-revalidate, `data` kind) the first time
 * `src/scripts/sw-register.ts` actually fetches it.
 */
export function buildPrecacheList(distFiles: string[], base: string): string[] {
  const out: string[] = [];
  for (const raw of distFiles) {
    const file = raw.replace(/^\/+/, "").replaceAll("\\", "/");
    if (file.startsWith("_astro/") || HASHED_WEBP.test(file)) {
      out.push(base + file);
      continue;
    }
    if (LIST_PAGE_FILE.test(file)) {
      out.push(base + file.slice(0, -"index.html".length));
    }
  }
  return out;
}

/** The minimal shape of `navigator.connection` ({@link https://developer.mozilla.org/docs/Web/API/NetworkInformation}) this needs. */
export interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
}

/**
 * Whether it's safe to warm a whole generation's detail pages (~2-3 MB) into the offline cache in
 * the background: only on a connection that exists, isn't flagged Save-Data, isn't cellular, and
 * whose effective type is the fastest bucket (`4g`). Mirrors the `shouldPrefetch` guard
 * (constraints.md Review Focus #5, Task 13) but is intentionally stricter -- a whole-generation
 * warm-up is a much bigger download than viewport prefetch.
 */
export function shouldWarmGeneration(
  conn: ConnectionInfo | undefined,
): boolean {
  if (!conn) return false;
  if (conn.saveData) return false;
  if (conn.type === "cellular") return false;
  return conn.effectiveType === "4g";
}

/**
 * Every detail page URL for `lang`/`gen`, one per `slug`, e.g.
 * `warmList('ru', 'bw', ['bulbasaur'], '/pokemon-dex/')` ->
 * `['/pokemon-dex/ru/bw/pokemon/bulbasaur/']`. Shaped like `pokemonUrl` (`src/lib/urls.ts`) for
 * the default form, but takes `base` explicitly (rather than importing the app's hardcoded
 * `BASE`) so this stays testable with any base and bundles standalone into `src/sw/sw.ts` and
 * `src/scripts/sw-register.ts` without depending on more of the app than necessary.
 */
export function warmList(
  lang: Lang,
  gen: GenId,
  slugs: string[],
  base: string,
): string[] {
  return slugs.map((slug) => `${base}${lang}/${gen}/pokemon/${slug}/`);
}
