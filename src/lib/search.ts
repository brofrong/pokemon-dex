/**
 * Instant client-side search for the Pokémon list page. `searchKey` is computed once per
 * Pokémon (server-side, emitted as `data-q` on its card); `normalizeQuery` is applied to both
 * the stored key and the live search box value so the two sides compare on equal footing.
 */

import type { Pokemon } from "../data/types";
import { pokemonName } from "../i18n/names";

/**
 * Normalizes free-text search input: lowercases, folds `ё` → `е` (common on Russian layouts/IMEs
 * that drop the dieresis), strips a leading `#` (as typed before a Pokédex number), turns any
 * run of punctuation/whitespace into a single space, trims the ends, and -- when the whole
 * result is a plain number -- strips leading zeros (`"025"` → `"25"`) so it lines up with the
 * un-padded id token `searchKey` emits.
 */
export function normalizeQuery(q: string): string {
  let s = q.toLowerCase().replace(/ё/g, "е").replace(/#/g, "");
  s = s
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (/^\d+$/.test(s)) s = String(Number(s));
  return s;
}

/**
 * The normalized, space-separated text a Pokémon is searched by: its id, English name and
 * Russian name. Emitted verbatim as `data-q` on each list card and compared against a
 * `normalizeQuery`-normalized query by {@link matchesQuery}.
 */
export function searchKey(p: Pokemon): string {
  return normalizeQuery(
    `${p.id} ${pokemonName("en", p)} ${pokemonName("ru", p)}`,
  );
}

/**
 * Whether `key` (a {@link searchKey} value) matches `q` (a {@link normalizeQuery}-normalized
 * query). An empty query always matches (no filter). A purely numeric query must exactly equal
 * one whitespace-separated token of `key` (so `"25"` does not match `"250"` or `"125"`);
 * otherwise every word of `q` must be a *prefix* of some word of `key` (so `"пика"` matches
 * `"пикачу"`, and `"mr mime"`/`"мистер майм"` both match the bilingual key for Mr. Mime).
 */
export function matchesQuery(key: string, q: string): boolean {
  if (q === "") return true;
  const keyWords = key.split(" ").filter(Boolean);
  if (/^\d+$/.test(q)) return keyWords.includes(q);
  const qWords = q.split(" ").filter(Boolean);
  return qWords.every((word) =>
    keyWords.some((keyWord) => keyWord.startsWith(word)),
  );
}

/**
 * Where one search result ranks relative to a {@link normalizeQuery}-normalized query `q`,
 * given its id and its localized display name:
 * - `0` (best): `q` is purely numeric and equals the id exactly, or `q` equals the normalized
 *   name exactly (`"mew"` -> Mew, `"мью"` -> Мью).
 * - `1`: `q` is a numeric query that doesn't match this id (so this row can't be ranked `0`
 *   even though `matchesQuery` found it some other way), or the normalized name merely
 *   *contains* `q` as a prefix (`"mew"` -> Mewtwo).
 * - `2` (worst): everything else `matchesQuery` matched (e.g. `q` only matches a later word,
 *   as `"mime"` matching "Mr. Mime").
 *
 * A numeric query's non-id rows land in tier `1` rather than `2` only to keep the function total
 * and monotonic; in practice `matchesQuery` never lets a numeric query through for a row whose
 * id doesn't equal it, so that branch is unreachable from {@link rankSearchResults}' normal
 * callers -- see its own doc.
 */
function rankTier(id: number, name: string, q: string): 0 | 1 | 2 {
  if (/^\d+$/.test(q)) return String(id) === q ? 0 : 1;
  const normalizedName = normalizeQuery(name);
  if (normalizedName === q) return 0;
  if (normalizedName.startsWith(q)) return 1;
  return 2;
}

/**
 * Sorts search results (already filtered by {@link matchesQuery}) by relevance to the
 * {@link normalizeQuery}-normalized query `q`: an exact name match first, then prefix matches
 * (shorter display name first, then lower id), then everything else by id (QA #16 -- previously
 * results stayed in dataset/id order, so e.g. `"mew"` ranked `#150 Mewtwo` above the exact match
 * `#151 Mew`, and Enter opened the wrong Pokémon). Stable and non-mutating; ties fall back to id
 * so the order is deterministic.
 */
export function rankSearchResults<T>(
  rows: readonly T[],
  q: string,
  idOf: (row: T) => number,
  nameOf: (row: T) => string,
): T[] {
  return [...rows].sort((a, b) => {
    const ta = rankTier(idOf(a), nameOf(a), q);
    const tb = rankTier(idOf(b), nameOf(b), q);
    if (ta !== tb) return ta - tb;
    if (ta === 1) {
      const lenDiff = nameOf(a).length - nameOf(b).length;
      if (lenDiff !== 0) return lenDiff;
    }
    return idOf(a) - idOf(b);
  });
}
