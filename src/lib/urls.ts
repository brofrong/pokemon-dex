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
