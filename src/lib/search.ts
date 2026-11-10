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
