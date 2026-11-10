import { rename, rm } from "node:fs/promises";
import type { GenData } from "../../src/data/types";
import { POGO_ASSETS_SHA } from "../pins";

/** The raw shape of a PokeMiners `pogo_assets` i18n file: a flat, alternating key/value array. */
export interface PogoI18n {
  data: string[];
}

/** The two Pokémon-GO strings we pull per species id. */
export interface RuExtract {
  names: Record<number, string>;
  genus: Record<number, string>;
}

/** A form the dataset tracks, as much of it as {@link extractForms} needs. */
export interface FormRef {
  key: string;
  formSlug: string | null;
}

/** A species the dataset tracks, as much of it as {@link extractForms} needs. */
export interface PokemonRef {
  slug: string;
  forms: FormRef[];
}

const POGO_URL =
  "https://raw.githubusercontent.com/PokeMiners/pogo_assets/" +
  `${POGO_ASSETS_SHA}/Texts/Latest%20APK/JSON/i18n_russian.json`;

/**
 * Parses a PokeMiners i18n file's `data` array (`[key0, value0, key1, value1, …]`) into a
 * `key -> value` map. Values are trimmed: the source has a couple of stray trailing newlines
 * (e.g. `pokemon_name_0534`, `pokemon_category_0630`) that would otherwise leak into the UI.
 */
export function parsePogoI18n(json: PogoI18n): Map<string, string> {
  const map = new Map<string, string>();
  const { data } = json;
  for (let i = 0; i + 1 < data.length; i += 2) {
    map.set(data[i], data[i + 1].trim());
  }
  return map;
}

/** Zero-pads a national id to the 4 digits the PoGO key format uses (`4` -> `"0004"`). */
function pad4(id: number): string {
  return String(id).padStart(4, "0");
}

/**
 * Latin letters that are visually identical to a Cyrillic letter, mapped to that Cyrillic
 * counterpart. The PokeMiners source occasionally mixes one in (e.g. `pokemon_name_0250` spells
 * Ho-Oh as "Хо-Oх" with a Latin capital O, U+004F, instead of Cyrillic О, U+041E), which breaks
 * search and lookups that expect pure Cyrillic. See {@link normalizeLatinLookalikes}.
 */
const LATIN_TO_CYRILLIC_LOOKALIKE: Record<string, string> = {
  A: "А",
  B: "В",
  C: "С",
  E: "Е",
  H: "Н",
  K: "К",
  M: "М",
  O: "О",
  P: "Р",
  T: "Т",
  X: "Х",
  a: "а",
  c: "с",
  e: "е",
  o: "о",
  p: "р",
  x: "х",
};

const CYRILLIC_LETTER = /[А-яЁё]/;

/**
 * Replaces a Latin look-alike letter (`A B C E H K M O P T X` and lowercase `a c e o p x`) with
 * its Cyrillic counterpart whenever it sits next to an actual Cyrillic letter — e.g. "Хо-Oх"
 * (Latin capital O between two Cyrillic letters) becomes "Хо-Ох". A Latin letter with no
 * Cyrillic neighbor (a genuinely English word or name) is left untouched, so this only ever
 * fixes typos inside otherwise-Cyrillic text rather than mangling real Latin script.
 */
export function normalizeLatinLookalikes(text: string): string {
  const chars = [...text];
  return chars
    .map((ch, i) => {
      const replacement = LATIN_TO_CYRILLIC_LOOKALIKE[ch];
      if (!replacement) return ch;
      const prev = chars[i - 1];
      const next = chars[i + 1];
      const adjacentCyrillic =
        (prev !== undefined && CYRILLIC_LETTER.test(prev)) ||
        (next !== undefined && CYRILLIC_LETTER.test(next));
      return adjacentCyrillic ? replacement : ch;
    })
    .join("");
}

/**
 * Reads `pokemon_name_XXXX` and `pokemon_category_XXXX` out of `map` for each id in `ids`,
 * normalizing Latin look-alike letters (see {@link normalizeLatinLookalikes}) in both. An id
 * with no matching key is left out of the result rather than filled with a placeholder, so a
 * caller can tell a genuine gap in the source from the thing it looked up.
 */
export function extractRu(map: Map<string, string>, ids: number[]): RuExtract {
  const names: Record<number, string> = {};
  const genus: Record<number, string> = {};
  for (const id of ids) {
    const key = pad4(id);
    const name = map.get(`pokemon_name_${key}`);
    if (name !== undefined) names[id] = normalizeLatinLookalikes(name);
    const category = map.get(`pokemon_category_${key}`);
    if (category !== undefined) genus[id] = normalizeLatinLookalikes(category);
  }
  return { names, genus };
}

/**
 * Genus strings in the GO data follow one of two shapes: `"<X> Покемон"` (116 of 649 entries)
 * or `"Покемон-<X>"` (524 of 649). Checks whether literally every entry fits one of those two
 * shapes — only then is it safe to mechanically lowercase the leading/trailing "Покемон".
 */
export function genusPatternConsistent(categories: string[]): boolean {
  const suffix = /^.+ Покемон$/;
  const prefix = /^Покемон-.+$/;
  return categories.every((c) => suffix.test(c) || prefix.test(c));
}

/**
 * Lowercases the generic word "Покемон" in each genus string, but only when every entry in
 * `categories` follows the `"<X> Покемон"` / `"Покемон-<X>"` pattern (see
 * {@link genusPatternConsistent}). Real GO data has 9 categories (e.g. "Покемон Обезьяна-Свинья",
 * "Покемон в Подгузнике") that don't fit either shape, so this normally returns `categories`
 * unchanged, verbatim as mined.
 */
export function normalizeGenus(
  categories: Record<number, string>,
): Record<number, string> {
  if (!genusPatternConsistent(Object.values(categories))) return categories;
  const out: Record<number, string> = {};
  for (const [id, value] of Object.entries(categories)) {
    out[Number(id)] = value
      .replace(/^Покемон-/, "покемон-")
      .replace(/ Покемон$/, " покемон");
  }
  return out;
}

/**
 * `<our species slug>-<our formSlug>` -> the GO key suffix to use instead, for the handful of
 * forms where bw.json's name for a form doesn't match GO's own spelling. Found by searching the
 * downloaded GO file for every `form_<species-identifier>_*` key and diffing against bw.json's
 * form list: Cherrim's sunshine form is `form_cherrim_sunny` in GO, not `form_cherrim_sunshine`.
 * Every other currently-unmatched species (Pichu's spiky-eared, all 28 Unown letters, Wormadam,
 * Shellos/Gastrodon's east form, Basculin's blue-striped form, Deerling/Sawsbuck's seasons,
 * Frillish/Jellicent's female form) has *no* `form_<species-identifier>_*` key at all in this
 * GO dump — not a spelling divergence, a genuine absence — so no alias exists for them.
 */
const FORM_KEY_ALIASES: Record<string, string> = {
  "cherrim-sunshine": "sunny",
};

/**
 * For each non-default form in `pokemon` (every `FormRef` whose `formSlug` isn't `null`),
 * looks up `form_<species-slug>_<formSlug>` in `map` (or, per {@link FORM_KEY_ALIASES}, the
 * GO-spelled suffix when it differs from ours) and, if present, records it under the form's own
 * `key` (e.g. `"479-heat"`). Forms with no matching GO string (e.g. Unown's 28 letter forms,
 * which GO never names at all) are left out entirely so callers fall back to English rather
 * than inventing a Russian name.
 */
export function extractForms(
  map: Map<string, string>,
  pokemon: PokemonRef[],
): { forms: Record<string, string>; total: number; matched: number } {
  const forms: Record<string, string> = {};
  let total = 0;
  for (const p of pokemon) {
    for (const form of p.forms) {
      if (form.formSlug === null) continue;
      total++;
      const suffix =
        FORM_KEY_ALIASES[`${p.slug}-${form.formSlug}`] ?? form.formSlug;
      const value = map.get(`form_${p.slug}_${suffix}`);
      if (value !== undefined)
        forms[form.key] = normalizeLatinLookalikes(value);
    }
  }
  return { forms, total, matched: Object.keys(forms).length };
}

/** Sorts an object's string keys for a stable, diffable JSON file. */
function sortedByKey(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/** Downloads the pinned PokeMiners Russian i18n file into `.cache/pogo/`, unless already cached. */
async function fetchPogoI18n(
  cachePath = ".cache/pogo/i18n_russian.json",
  fetchImpl: typeof fetch = fetch,
): Promise<PogoI18n> {
  if (!(await Bun.file(cachePath).exists())) {
    const response = await fetchImpl(POGO_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${POGO_URL}: ${response.status} ${response.statusText}`,
      );
    }
    const tmp = `${cachePath}.tmp`;
    try {
      await Bun.write(tmp, response);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
    await rename(tmp, cachePath);
  }
  return JSON.parse(await Bun.file(cachePath).text()) as PogoI18n;
}

const MAX_SPECIES_ID = 649;

async function main(): Promise<void> {
  const json = await fetchPogoI18n();
  const map = parsePogoI18n(json);

  const ids = Array.from({ length: MAX_SPECIES_ID }, (_, i) => i + 1);
  const { names, genus } = extractRu(map, ids);
  const normalizedGenus = normalizeGenus(genus);

  const gen = JSON.parse(
    await Bun.file("src/data/gen/bw.json").text(),
  ) as GenData;
  const { forms, total, matched } = extractForms(map, gen.pokemon);

  const indent = 2;
  await Bun.write(
    "src/i18n/data/ru/pokemon.json",
    `${JSON.stringify(names, null, indent)}\n`,
  );
  await Bun.write(
    "src/i18n/data/ru/genus.json",
    `${JSON.stringify(normalizedGenus, null, indent)}\n`,
  );
  await Bun.write(
    "src/i18n/data/ru/forms.json",
    `${JSON.stringify(sortedByKey(forms), null, indent)}\n`,
  );

  console.log(
    `[i18n] names ${Object.keys(names).length} of ${MAX_SPECIES_ID}, ` +
      `genus ${Object.keys(normalizedGenus).length} of ${MAX_SPECIES_ID}, ` +
      `forms ${matched} of ${total}`,
  );
}

if (import.meta.main) {
  await main();
}
