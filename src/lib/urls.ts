import type { GenId } from "../data/types";
import { LANGS, type Lang } from "../i18n/ui";
import { getGen } from "./generations";
import { parseListState, serializeListState } from "../scripts/list-state";

/** The GitHub Pages base path this site is served under. Always has a leading and trailing slash. */
export const BASE = "/pokemon-dex/";

/**
 * Prefixes `path` with {@link BASE}, accepting the path with or without a leading slash,
 * never doubling slashes, and preserving any query string and/or hash fragment.
 */
export function withBase(path: string): string {
  const withoutLeadingSlash = path.startsWith("/") ? path.slice(1) : path;
  return BASE + withoutLeadingSlash;
}

/**
 * The URL for a generation's Pokémon list page, e.g. `listUrl('ru', 'bw')` ->
 * `/pokemon-dex/ru/bw/`. `query`, when given, is appended as the query string (a leading `?`
 * is accepted but not required); an empty/`undefined` query is omitted entirely.
 */
export function listUrl(lang: Lang, gen: GenId, query?: string): string {
  const path = withBase(`/${lang}/${gen}/`);
  if (!query) return path;
  const q = query.startsWith("?") ? query.slice(1) : query;
  return q ? `${path}?${q}` : path;
}

/**
 * The URL for one Pokémon's detail page, e.g. `pokemonUrl('ru', 'bw', 'rotom', 'heat')` ->
 * `/pokemon-dex/ru/bw/pokemon/rotom/?form=heat`. `formSlug` is omitted (no query string) for
 * the default form (`null`/`undefined`).
 */
export function pokemonUrl(
  lang: Lang,
  gen: GenId,
  slug: string,
  formSlug?: string | null,
): string {
  const path = withBase(`/${lang}/${gen}/pokemon/${slug}/`);
  return formSlug ? `${path}?form=${formSlug}` : path;
}

/**
 * Swaps the language segment of a {@link BASE}-prefixed pathname, e.g.
 * `swapLang('/pokemon-dex/en/bw/pokemon/eevee/', 'ru')` -> `/pokemon-dex/ru/bw/pokemon/eevee/`.
 * Everything after the language segment (generation, remaining path, query string, hash) is
 * preserved untouched. Pathnames that don't start with `BASE` are returned unchanged.
 *
 * On the custom 404 page (`src/pages/404.astro`), `Astro.url.pathname` is just `{BASE}404/`
 * (`trailingSlash: 'always'` applies to the route even though the *output file* is the
 * special-cased `dist/404.html`) -- there is no generation segment to preserve, so `tail` here
 * comes out as a bare `/`, and the header's language switch resolves to `{BASE}{to}/`, i.e. the
 * per-locale redirect page (`src/pages/[lang]/index.astro`), which forwards to that language's
 * Black/White list page. One extra hop, but every route this function is ever called from still
 * resolves to a real page.
 */
export function swapLang(pathname: string, to: Lang): string {
  if (!pathname.startsWith(BASE)) return pathname;
  const rest = pathname.slice(BASE.length);
  const slashIndex = rest.indexOf("/");
  const tail = slashIndex === -1 ? "" : rest.slice(slashIndex);
  return `${BASE}${to}${tail}`;
}

/**
 * The href {@link LangSwitch}'s `to`-language link should use, given the page's current
 * pathname and query string (`search`, with or without a leading `?`; empty/`undefined` omits
 * it). Delegates the path to {@link swapLang} and appends `search` verbatim -- this function
 * never decides what belongs in the query, so it can't invent or drop a param itself. Callers
 * are the single source of truth for that: pass whatever query string actually reflects the
 * current page state (e.g. the list page's `serializeListState(state)`, never a possibly-stale
 * raw `location.search` that disagrees with that state -- see `list.ts`'s `syncLangLinks`,
 * written to fix the "RU link drops filters / injects a stray `?shiny=1`" QA bug).
 */
export function langSwitchHref(
  pathname: string,
  to: Lang,
  search?: string,
): string {
  const path = swapLang(pathname, to);
  if (!search) return path;
  const q = search.startsWith("?") ? search.slice(1) : search;
  return q ? `${path}?${q}` : path;
}

/**
 * Where the generation switcher's `to` link should point from the page at `pathname` (a
 * {@link BASE}-prefixed pathname) -- never a 404 (constraints' Review Focus #2):
 *  - a detail page (`{lang}/{gen}/pokemon/{slug}/`) -> the same species' page in `to` when
 *    `existsIn(slug, to)`, else `to`'s list page (e.g. Snivy -> Red/Blue lands on the rb list).
 *    `formSlug` (the currently selected form, `""` for the default form) is kept as `?form=`
 *    only when `formExistsIn(slug, formSlug, to)` -- the target generation may not have that
 *    form for this species even when the species itself exists there (QA #6, e.g. Rotom's Heat
 *    form doesn't exist in rb/gs/rs; Charizard's Mega X/Y don't exist outside xy/sm).
 *  - a list page -> `to`'s list page, carrying over the list state in `search` (the live
 *    filter/sort/shiny query, see `list.ts`) minus what doesn't apply there: type filters for
 *    types `to` doesn't have (Fairy in rb), flag filters `to`'s list doesn't offer
 *    (`GenConfig.listFlags`: no "new"/"baby" in gen I) and `shiny` when `to` has no shiny
 *    Pokémon (gen I).
 *  - anything else (the 404 page, whose pathname has no language/generation, or an unknown
 *    language segment) -> `to`'s English list page.
 */
export function switchGenUrl(
  pathname: string,
  to: GenId,
  existsIn: (slug: string, gen: GenId) => boolean,
  search = "",
  formSlug = "",
  formExistsIn: (slug: string, formSlug: string, gen: GenId) => boolean = () =>
    false,
): string {
  const segments = pathname.startsWith(BASE)
    ? pathname.slice(BASE.length).split("/").filter(Boolean)
    : [];
  const [langSeg, genSeg, kind, slug] = segments;
  if (
    !langSeg ||
    !LANGS.includes(langSeg as Lang) ||
    !genSeg ||
    !getGen(genSeg)
  ) {
    return listUrl("en", to);
  }
  const lang = langSeg as Lang;
  if (kind === "pokemon" && slug) {
    if (!existsIn(slug, to)) return listUrl(lang, to);
    const keepForm = Boolean(formSlug) && formExistsIn(slug, formSlug, to);
    return pokemonUrl(lang, to, slug, keepForm ? formSlug : null);
  }
  const target = getGen(to);
  const state = parseListState(search, target?.types);
  if (!target?.features.shiny) state.shiny = false;
  state.flags = state.flags.filter((f) => target?.listFlags.includes(f));
  return listUrl(lang, to, serializeListState(state));
}
