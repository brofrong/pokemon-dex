import { expect, test } from "bun:test";

import pokemonRu from "../../src/i18n/data/ru/pokemon.json";
import flavorRu from "../../src/i18n/data/ru/flavor.json";
import flavorExtraRu from "../../src/i18n/data/ru/flavor-extra.json";

/**
 * Guards against the fix-round-1 class of bug (finding 2): a capitalized name mentioned inside a
 * translated flavor text that's a near-miss of the species' *actual* official spelling in
 * `pokemon.json` — e.g. `flavor-extra.json`'s old "Цикризара" for Cyclizar (official "Сайклизар")
 * and "Вирижена" for Virizion (official "Вирижион"). Only scans text we actually wrote
 * (`flavor.json`, `flavor-extra.json`) — `flavor-go.json` is Pokémon GO's own official text, not
 * ours to typo.
 *
 * This is a heuristic, not a grammar checker: a word is flagged only when the best edit distance
 * between some truncation of the word and some truncation of an official name (both truncations
 * approximate stripping a Russian case ending) is 1 or 2 — close enough to look like a typo of
 * that name, but not so close it's plausibly just a normal declined form (distance 0, e.g.
 * genitive "Кобалиона" from "Кобалион" exactly matches once both are truncated by one
 * character). Words that aren't close to *any* name at all (ordinary Russian prose) are ignored
 * entirely, and known legitimate exceptions go in {@link ALLOWLIST}.
 */

const pokemonNames: Record<string, string> = pokemonRu;
const flavor: Record<string, Record<string, string>> = flavorRu;
const flavorExtra: Record<string, string> = flavorExtraRu;

/** How many leading characters two words must share before they're even compared further. A
 * declined form of a name only ever differs from it near the *end* (the case ending), so a
 * shared 4-character prefix is what actually distinguishes "this might be a typo of that name"
 * from "two unrelated Russian words that happen to both be short" — without it this heuristic
 * flags hundreds of ordinary sentence-initial words (checked by hand while building this test). */
const PREFIX_LEN = 4;

/** Every distinct official Russian name, bucketed by its first {@link PREFIX_LEN} characters. */
const NAMES_BY_PREFIX = new Map<string, string[]>();
for (const name of new Set(Object.values(pokemonNames))) {
  if (name.length < PREFIX_LEN) continue;
  const key = name.slice(0, PREFIX_LEN);
  const bucket = NAMES_BY_PREFIX.get(key);
  if (bucket) bucket.push(name);
  else NAMES_BY_PREFIX.set(key, [name]);
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

/** Truncations of `word` approximating "strip a Russian case ending" (0-3 trailing characters). */
function truncations(word: string): string[] {
  const out: string[] = [];
  for (let drop = 0; drop <= 3; drop++) {
    if (word.length - drop < 3) break;
    out.push(word.slice(0, word.length - drop));
  }
  return out;
}

/** The smallest edit distance between any truncation of `word` and any truncation of `name`. */
function minStemDistance(word: string, name: string): number {
  let min = Infinity;
  for (const w of truncations(word)) {
    for (const n of truncations(name)) {
      min = Math.min(min, levenshtein(w, n));
      if (min === 0) return 0;
    }
  }
  return min;
}

/**
 * `word` tokens that are near-misses of an official name but known not to be an error — either a
 * legitimate declined form this heuristic's truncation scheme doesn't happen to zero out exactly
 * (e.g. a fleeting-vowel declension), or a coincidental resemblance to an unrelated name. Add an
 * entry here (word, not a pair) only after confirming by hand that it's correct as written.
 */
const ALLOWLIST = new Set<string>([
  "Крики", // "cries/calls" (Jynx #124, Chimecho #358) — coincidentally prefix-close to "Крикетот"
  "Скользкое", // "slippery" (Barboach #339) — coincidentally prefix-close to "Сколипид"
  "Вибрируя", // "vibrating" (Kricketune #535, Bibarel #536) — coincidentally prefix-close to "Вибрава"
]);

test("flavor.json and flavor-extra.json mention no near-miss misspelling of an official Pokémon name", () => {
  const texts: string[] = [];
  for (const perVersion of Object.values(flavor)) {
    for (const text of Object.values(perVersion)) if (text) texts.push(text);
  }
  for (const text of Object.values(flavorExtra)) texts.push(text);

  const flagged: string[] = [];
  for (const text of texts) {
    const words = text.match(/[А-ЯЁ][а-яё]{3,}/g) ?? [];
    for (const word of words) {
      if (word.length < PREFIX_LEN || ALLOWLIST.has(word)) continue;
      const bucket = NAMES_BY_PREFIX.get(word.slice(0, PREFIX_LEN)) ?? [];
      let best = Infinity;
      let bestName = "";
      for (const name of bucket) {
        if (Math.abs(name.length - word.length) > 3) continue;
        const dist = minStemDistance(word, name);
        if (dist < best) {
          best = dist;
          bestName = name;
        }
        if (best === 0) break;
      }
      if (best >= 1 && best <= 2) {
        flagged.push(
          `"${word}" looks like a typo of official name "${bestName}" (stem distance ${best})`,
        );
      }
    }
  }
  expect(flagged).toEqual([]);
});

test("flavor-extra.json spells referenced species names using their actual pokemon.json spelling (fix round 1, finding 2)", () => {
  // Miraidon's text (#1008) mentions Cyclizar; Iron Leaves' text (#1010) mentions Virizion.
  // Both were originally translated with an invented spelling instead of the one GO/pokemon.json
  // actually uses for those species (#967, #640) — assert the genitive case agrees with it.
  expect(pokemonNames["967"]).toBe("Сайклизар");
  expect(flavorExtra["1008"]).toContain("Сайклизара");
  expect(flavorExtra["1008"]).not.toContain("Цикризар");

  expect(pokemonNames["640"]).toBe("Вирижион");
  expect(flavorExtra["1010"]).toContain("Вирижиона");
  expect(flavorExtra["1010"]).not.toContain("Вирижена");
});
