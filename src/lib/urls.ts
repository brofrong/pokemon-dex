import type { GenId } from "../data/types";
import type { Lang } from "../i18n/ui";

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
 */
export function swapLang(pathname: string, to: Lang): string {
  if (!pathname.startsWith(BASE)) return pathname;
  const rest = pathname.slice(BASE.length);
  const slashIndex = rest.indexOf("/");
  const tail = slashIndex === -1 ? "" : rest.slice(slashIndex);
  return `${BASE}${to}${tail}`;
}
