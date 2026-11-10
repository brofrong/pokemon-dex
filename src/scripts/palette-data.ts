/**
 * Memoizes a fetch, but only on success: a failed attempt (network error, non-2xx status, bad
 * JSON) clears its own cache slot immediately, so the *next* call starts a fresh fetch instead of
 * permanently replaying the same failure forever. Callers get a `{ ok: false }` result instead of
 * a silent fallback value, so a UI can tell "the fetch failed" apart from "the fetch succeeded
 * with zero matches" -- see `palette.ts`'s distinct `palette.offline` message, which exists
 * precisely because those two cases must not look the same.
 *
 * `fetchImpl` is injected (rather than closing over the global `fetch`) purely for testability --
 * see `tests/scripts/palette-data.test.ts`'s fake-fetch-fails-once-then-succeeds case, which
 * can't easily stub the real global `fetch` in a `bun test` environment.
 *
 * Concurrent callers while a fetch is in flight share the same pending promise (no duplicate
 * requests); once it resolves successfully, every later call returns that cached result
 * immediately without fetching again.
 */
export type LoadResult<T> = { ok: true; data: T } | { ok: false };

export function createDataLoader<T>(
  fetchImpl: (url: string) => Promise<Response>,
  url: string,
): () => Promise<LoadResult<T>> {
  let pending: Promise<LoadResult<T>> | null = null;

  return function load(): Promise<LoadResult<T>> {
    if (pending) return pending;
    pending = fetchImpl(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true as const, data: (await res.json()) as T };
      })
      .catch(() => {
        // Let the next call retry from scratch instead of caching this failure forever.
        pending = null;
        return { ok: false as const };
      });
    return pending;
  };
}
