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
import type { GenId, SpriteSetId } from "../data/types";

/**
 * How the service worker treats one request:
 * - `immutable` -- a content-hashed Astro asset or sprite atlas; never changes, cache forever.
 * - `html` -- a navigable page (ends in `/`, since `trailingSlash: 'always'`); may change between
 *   deploys, served stale-while-revalidate.
 * - `sprite` -- a per-Pokémon sprite file; stable in practice but not content-hashed, so treated
 *   as immutable's sibling but cached on first request rather than precached.
 * - `data` -- a `.json` file (`list.json`, `search.json`, `sw-warm/{gen}.json`); served
 *   stale-while-revalidate.
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

/** The generation (and its sprite set) whose list pages/atlases are precached at install. */
export interface PrecacheDefaults {
  gen: GenId;
  spriteSet: SpriteSetId;
}

/**
 * Builds the service worker's precache list from the finished `dist/` file listing (paths
 * relative to the dist root, as produced by `integrations/service-worker.ts`'s `Bun.Glob` scan):
 * every content-hashed Astro asset (`_astro/*`, the shared JS and CSS), plus -- for the default
 * generation only (`defaults`, the one the site opens on) -- both languages' list pages, their
 * `list.json` and that generation's sprite atlases. Keeps the install small now that nine
 * generations exist: every other generation's list page, `list.json` and atlases are cached the
 * first time they're visited (`html`/`data` stale-while-revalidate, atlases cache-first).
 *
 * Detail pages are deliberately excluded (thousands of pages would bloat the install) -- they are
 * warmed in the background instead, see {@link warmList}. `search.json` and the per-generation
 * `sw-warm/{gen}.json` slug lists are excluded too: precaching them for every visitor would
 * defeat {@link shouldWarmGeneration}'s whole point of not spending bandwidth on slow/metered
 * connections; they're cached the normal way (`data` kind) once actually fetched.
 */
export function buildPrecacheList(
  distFiles: string[],
  base: string,
  defaults: PrecacheDefaults,
): string[] {
  const out: string[] = [];
  const atlasPrefix = `sprites/${defaults.spriteSet}/`;
  for (const raw of distFiles) {
    const file = raw.replace(/^\/+/, "").replaceAll("\\", "/");
    if (file.startsWith("_astro/")) {
      out.push(base + file);
      continue;
    }
    if (HASHED_WEBP.test(file)) {
      if (
        file.startsWith(atlasPrefix) &&
        !file.slice(atlasPrefix.length).includes("/")
      )
        out.push(base + file);
      continue;
    }
    const match = /^[a-z]{2}\/([a-z0-9]+)\/(index\.html|list\.json)$/.exec(
      file,
    );
    if (match?.[1] === defaults.gen) {
      out.push(
        base +
          (match[2] === "index.html"
            ? file.slice(0, -"index.html".length)
            : file),
      );
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

/** The minimal shape of a `fetch()` `Response` this needs to decide whether it's safe to cache. */
export interface CacheableResponse {
  ok: boolean;
  type: string;
}

/**
 * Whether a fetched response is safe to put in a cache: a successful (2xx, `ok`) same-origin
 * response. `type` is `"basic"` for a same-origin `fetch()` result -- anything else (`"opaque"`
 * for a cross-origin no-cors response, `"cors"`, `"error"`, ...) can't be relied on to actually
 * carry the status it claims (an opaque response reports `ok: true` unconditionally), so it's
 * rejected even if `ok` is true. Every URL this service worker fetches is same-origin (relative
 * to its own scope), so in practice this only ever rejects on a non-2xx status; the `type` check
 * is defence in depth against that changing.
 *
 * Extracted as a pure function (rather than inlined per call site) so install-time precaching can
 * decide per-URL whether to cache a response without duplicating this check, and so it's directly
 * unit-testable like the rest of this file.
 */
export function isCacheableResponse(response: CacheableResponse): boolean {
  return response.ok && response.type === "basic";
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
