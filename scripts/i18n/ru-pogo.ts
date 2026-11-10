import { rename, rm } from "node:fs/promises";
import type { GenData, GenId } from "../../src/data/types";
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
 * The nearest neighbor of `chars[i]` in direction `dir` (`-1`/`1`), skipping over hyphens so a
 * lookalike sitting right after/before a hyphen still sees the Cyrillic letter on the far side
 * of it — e.g. in "Хакамо-o" (fix round 1, finding 1) the trailing Latin `o` has a hyphen as its
 * literal neighbor, but the name's own "о" one more step back. Returns `undefined` at the string
 * boundary (no neighbor at all).
 */
function nearestNonHyphenNeighbor(
  chars: string[],
  i: number,
  dir: -1 | 1,
): string | undefined {
  let j = i + dir;
  while (j >= 0 && j < chars.length && chars[j] === "-") j += dir;
  return chars[j];
}

/**
 * Replaces a Latin look-alike letter (`A B C E H K M O P T X` and lowercase `a c e o p x`) with
 * its Cyrillic counterpart whenever it sits next to (or, skipping over a hyphen, one step beyond)
 * an actual Cyrillic letter — e.g. "Хо-Oх" (Latin capital O between two Cyrillic letters) becomes
 * "Хо-Ох", and "Хакамо-o"/"Коммо-o" (Latin lowercase `o` right after a hyphen, with nothing
 * after it) become "Хакамо-о"/"Коммо-о" by looking past the hyphen to the "о" before it. A Latin
 * letter with no Cyrillic neighbor on either side (a genuinely English word or name) is left
 * untouched, so this only ever fixes typos inside otherwise-Cyrillic text rather than mangling
 * real Latin script.
 */
export function normalizeLatinLookalikes(text: string): string {
  const chars = [...text];
  return chars
    .map((ch, i) => {
      const replacement = LATIN_TO_CYRILLIC_LOOKALIKE[ch];
      if (!replacement) return ch;
      const prev = nearestNonHyphenNeighbor(chars, i, -1);
      const next = nearestNonHyphenNeighbor(chars, i, 1);
      const adjacentCyrillic =
        (prev !== undefined && CYRILLIC_LETTER.test(prev)) ||
        (next !== undefined && CYRILLIC_LETTER.test(next));
      return adjacentCyrillic ? replacement : ch;
    })
    .join("");
}

/**
 * Collapses GO's occasional embedded line breaks into plain spacing: a newline (or any
 * whitespace run containing one) right after/before a hyphen is removed outright — e.g.
 * `form_furfrou_dandy`'s "Причёска-\nДжентльмен" becomes "Причёска-Джентльмен", not
 * "Причёска- Джентльмен" — and any other whitespace run (including a lone "\n", e.g.
 * `pokemon_desc_0689`'s "Барберакл\nобладает") collapses to a single space. The dump also has a
 * bunch of *trailing* "\n"s (`pokemon_name_0534`, `pokemon_category_0630`, …), which `trim()`
 * already handles in `parsePogoI18n`; this additionally covers the internal cases that survive
 * that trim.
 */
export function normalizeGoWhitespace(text: string): string {
  return text
    .replace(/-\s+/g, "-")
    .replace(/\s+-/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Replaces the PokeMiners source's spaced en dash (" – ", U+2013) with the spaced em dash the
 * site's style guide uses ("Хидден-дэш — вот так", U+2014) — e.g. `pokemon_desc_0150`'s
 * "Мьюту – Покемон, созданный…" becomes "Мьюту — Покемон, созданный…". Every occurrence in the
 * pinned dump is already surrounded by spaces (checked by hand across all 1025 `pokemon_desc_*`
 * entries), so a plain spaced replacement is safe and doesn't touch numeric ranges or hyphenated
 * words, which the source doesn't use this character for.
 */
export function normalizeGoDash(text: string): string {
  return text.replaceAll(" – ", " — ");
}

/**
 * Applies every GO typography fix, in the order that matters: whitespace first (so a newline
 * sitting where a dash's surrounding spaces should be doesn't dodge {@link normalizeGoDash}'s
 * literal `" – "` match), then the dash, then the Latin-lookalike fix.
 */
function normalizeGoText(text: string): string {
  return normalizeLatinLookalikes(normalizeGoDash(normalizeGoWhitespace(text)));
}

/**
 * Reads `pokemon_name_XXXX` and `pokemon_category_XXXX` out of `map` for each id in `ids`,
 * normalizing GO typography (see {@link normalizeGoText}) in both. An id with no matching key is
 * left out of the result rather than filled with a placeholder, so a caller can tell a genuine
 * gap in the source from the thing it looked up.
 */
export function extractRu(map: Map<string, string>, ids: number[]): RuExtract {
  const names: Record<number, string> = {};
  const genus: Record<number, string> = {};
  for (const id of ids) {
    const key = pad4(id);
    const name = map.get(`pokemon_name_${key}`);
    if (name !== undefined) names[id] = normalizeGoText(name);
    const category = map.get(`pokemon_category_${key}`);
    if (category !== undefined) genus[id] = normalizeGoText(category);
  }
  return { names, genus };
}

/**
 * Reads `pokemon_desc_XXXX` (the species' single Pokémon GO Pokédex description) for each id in
 * `ids`, normalizing GO typography. Only the plain 4-digit key is read — the dump also has
 * per-form variants for some ids (e.g. `pokemon_desc_0003_0169_2` for Gigantamax Venusaur), which
 * this site has no per-form flavor slot for (`Pokemon.flavor` is per-species), so they're not
 * read. An id with no `pokemon_desc_XXXX` key at all (26 of 1–1025 as of the pinned dump — the
 * newest Gen IX DLC species plus a handful of earlier ones GO hasn't added yet) is left out;
 * those are translated by hand into `flavor-extra.json` instead (see `task-5a-report.md`).
 */
export function extractFlavorGo(
  map: Map<string, string>,
  ids: number[],
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const id of ids) {
    const raw = map.get(`pokemon_desc_${pad4(id)}`);
    if (raw !== undefined) out[id] = normalizeGoText(raw);
  }
  return out;
}

/**
 * Genus strings in the GO data follow one of two shapes: `"<X> Покемон"` or `"Покемон-<X>"`.
 * Checks whether literally every entry fits one of those two shapes — only then is it safe to
 * mechanically lowercase the leading/trailing "Покемон".
 */
export function genusPatternConsistent(categories: string[]): boolean {
  const suffix = /^.+ Покемон$/;
  const prefix = /^Покемон-.+$/;
  return categories.every((c) => suffix.test(c) || prefix.test(c));
}

/**
 * Lowercases the generic word "Покемон" in each genus string, but only when every entry in
 * `categories` follows the `"<X> Покемон"` / `"Покемон-<X>"` pattern (see
 * {@link genusPatternConsistent}). Real GO data has entries (e.g. "Покемон Обезьяна-Свинья",
 * "Покемон в Подгузнике") that don't fit either shape even at 1–649, and more appear through
 * 1–1025, so this returns `categories` unchanged, verbatim as mined, exactly as it already did
 * for the 1–649 range.
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
 * Species GO has no Pokédex entry at all for in the pinned dump, so no official Russian name
 * exists to extract: the newest Gen IX DLC (The Hidden Treasure of Area Zero / The Indigo Disk,
 * ids 1009–1025). Transliterated/translated by hand, following the conventions visible in GO's
 * own treatment of the other Paradox/invented-name species (literal translation for descriptive
 * English names like "Iron Leaves" -> "Железные Листья", mirroring GO's "Great Tusk" ->
 * "Великий Бивень"; phonetic transliteration for portmanteau names like "Dipplin" -> "Диплин",
 * mirroring GO's "Gholdengo" -> "Голденго"). Only used to fill a species id {@link extractRu}
 * left out — see {@link withManualOverlay}.
 */
const MANUAL_NAMES: Record<number, string> = {
  1009: "Шагающая Волна", // Walking Wake
  1010: "Железные Листья", // Iron Leaves
  1011: "Диплин", // Dipplin
  1012: "Польчагейст", // Poltchageist
  1013: "Синистча", // Sinistcha
  1014: "Окидоги", // Okidogi
  1015: "Мункидори", // Munkidori
  1016: "Фезандипити", // Fezandipiti
  1017: "Огерпон", // Ogerpon
  1018: "Архалудон", // Archaludon
  1019: "Гидраппл", // Hydrapple
  1020: "Пронзающий Огонь", // Gouging Fire
  1021: "Яростный Разряд", // Raging Bolt
  1022: "Железный Валун", // Iron Boulder
  1023: "Железная Корона", // Iron Crown
  1024: "Терапагос", // Terapagos
  1025: "Пичарант", // Pecharunt
};

/**
 * Genus translations for species ids that have a GO name but no GO `pokemon_category_XXXX`
 * (ids 916–982) plus the same ids as {@link MANUAL_NAMES} (1007–1025, which also lack genus).
 * Follows the dominant `"Покемон-<X>"` shape seen across the extracted data (see
 * {@link genusPatternConsistent}'s doc).
 */
const MANUAL_GENUS: Record<number, string> = {
  916: "Покемон-Хряк", // Oinkologne: Hog Pokémon
  925: "Покемон-Семья", // Maushold: Family Pokémon
  931: "Покемон-Попугай", // Squawkabilly: Parrot Pokémon
  964: "Покемон-Дельфин", // Palafin: Dolphin Pokémon
  978: "Покемон-Мимикрия", // Tatsugiri: Mimicry Pokémon
  982: "Покемон-Земляной Змей", // Dudunsparce: Land Snake Pokémon
  1007: "Покемон-Парадокс", // Koraidon
  1008: "Покемон-Парадокс", // Miraidon
  1009: "Покемон-Парадокс", // Walking Wake
  1010: "Покемон-Парадокс", // Iron Leaves
  1011: "Покемон-Карамельное Яблоко", // Dipplin: Candy Apple Pokémon
  1012: "Покемон-Матча", // Poltchageist: Matcha Pokémon
  1013: "Покемон-Матча", // Sinistcha: Matcha Pokémon
  1014: "Покемон-Вассал", // Okidogi: Retainer Pokémon
  1015: "Покемон-Вассал", // Munkidori: Retainer Pokémon
  1016: "Покемон-Вассал", // Fezandipiti: Retainer Pokémon
  1017: "Покемон-Маска", // Ogerpon: Mask Pokémon
  1018: "Покемон-Сплав", // Archaludon: Alloy Pokémon
  1019: "Покемон-Яблочная Гидра", // Hydrapple: Apple Hydra Pokémon
  1020: "Покемон-Парадокс", // Gouging Fire
  1021: "Покемон-Парадокс", // Raging Bolt
  1022: "Покемон-Парадокс", // Iron Boulder
  1023: "Покемон-Парадокс", // Iron Crown
  1024: "Покемон-Тера", // Terapagos: Tera Pokémon
  1025: "Покемон-Порабощение", // Pecharunt: Subjugation Pokémon
};

/** Fills every id `manual` has that `extracted` doesn't; never overwrites a GO-sourced value. */
function withManualOverlay(
  extracted: Record<number, string>,
  manual: Record<number, string>,
): Record<number, string> {
  const out = { ...extracted };
  for (const [id, value] of Object.entries(manual)) {
    if (out[Number(id)] === undefined) out[Number(id)] = value;
  }
  return out;
}

/**
 * `<our species slug>-<our formSlug>` -> the GO key suffix to use with the `form_<slug>_`
 * prefix, for forms where our formSlug doesn't literally match GO's spelling once hyphens become
 * underscores (see {@link extractForms}). `cherrim-sunshine` is the original (1–649) case:
 * Cherrim's sunshine form is `form_cherrim_sunny` in GO, not `form_cherrim_sunshine`. The rest
 * were found by extending the dataset to 1–1025: GO gives Necrozma's dusk/dawn forms the fuller
 * `dusk_mane`/`dawn_wings` keys (more specific than the generic `form_dusk` bare key those two
 * would otherwise fall back to, see {@link BARE_FORM_ALLOWLIST}); Oricorio's Pom-Pom style is
 * `form_oricorio_pompom` (no underscore between "pom" and "pom"); Zygarde's percentage forms use
 * the English words, not the digits our `formSlug`s carry.
 */
const FORM_KEY_ALIASES: Record<string, string> = {
  "cherrim-sunshine": "sunny",
  "necrozma-dusk": "dusk_mane",
  "necrozma-dawn": "dawn_wings",
  "oricorio-pom-pom": "pompom",
  "zygarde-10": "ten_percent",
  "zygarde-10-power-construct": "ten_percent",
  "zygarde-50-power-construct": "fifty_percent",
};

/**
 * `<our species slug>-<our formSlug>` -> the literal GO key, for the one form whose GO key
 * doesn't even spell the species name correctly: `form_squakabilly_white` (missing a "w") is the
 * only Squawkabilly form key the pinned dump has; its other two plumage colors (blue, yellow)
 * have no GO string at all.
 */
const FULL_KEY_OVERRIDES: Record<string, string> = {
  "squawkabilly-white-plumage": "form_squakabilly_white",
};

/**
 * `<our species slug>-<our formSlug>` pairs allowed to resolve against a bare `form_<formSlug>`
 * key (no species prefix) once the species-prefixed lookup misses. GO reuses these generic
 * strings across unrelated species that happen to share an English form word (e.g.
 * `form_female` backs every cosmetic gender-difference form: Frillish, Jellicent, Pyroar,
 * Meowstic, Indeedee, Basculegion). Explicit per-pair opt-in (rather than trying every bare key
 * automatically) avoids a real miss: Calyrex's Ice Rider form (`formSlug` `"ice"`) would
 * otherwise silently steal Eiscue's `form_ice` ("Ледяное Лицо", Eiscue's Ice Face) — a different
 * Pokémon's text for a same-named but unrelated form, which is exactly the kind of wrong-but-
 * plausible match this file's other normalizers exist to prevent. Every pair here was verified
 * by hand against the pinned dump's actual string.
 */
const BARE_FORM_ALLOWLIST = new Set<string>([
  "kyogre-primal",
  "groudon-primal",
  "basculin-blue-striped",
  "basculin-white-striped",
  "deerling-summer",
  "deerling-autumn",
  "deerling-winter",
  "sawsbuck-summer",
  "sawsbuck-autumn",
  "sawsbuck-winter",
  "frillish-female",
  "jellicent-female",
  "keldeo-resolute",
  "scatterbug-sun",
  "spewpa-sun",
  "pyroar-female",
  "meowstic-female",
  "indeedee-female",
  "basculegion-female",
  "minior-yellow",
  "minior-green",
  "minior-blue",
  "cramorant-gulping",
  "cramorant-gorging",
  "toxtricity-low-key",
  "sinistea-antique",
  "polteageist-antique",
  "eiscue-noice",
  "urshifu-rapid-strike",
  "tatsugiri-droopy",
  "tatsugiri-stretchy",
  "enamorus-therian",
]);

/** Looks up one non-default form's GO string, or `undefined` if none of the three strategies hit. */
function lookupFormValue(
  map: Map<string, string>,
  slug: string,
  formSlug: string,
): string | undefined {
  const pairKey = `${slug}-${formSlug}`;

  const overrideKey = FULL_KEY_OVERRIDES[pairKey];
  if (overrideKey) return map.get(overrideKey);

  const suffix = FORM_KEY_ALIASES[pairKey] ?? formSlug.replaceAll("-", "_");
  const prefixed = map.get(`form_${slug}_${suffix}`);
  if (prefixed !== undefined) return prefixed;

  if (BARE_FORM_ALLOWLIST.has(pairKey)) {
    return map.get(`form_${formSlug.replaceAll("-", "_")}`);
  }
  return undefined;
}

/**
 * For each non-default form in `pokemon` (every `FormRef` whose `formSlug` isn't `null`), looks
 * up its GO string (see {@link lookupFormValue}: species-prefixed key, alias/override, or an
 * allow-listed bare key) and, if found, records it under the form's own `key` (e.g.
 * `"479-heat"`). Forms with no matching GO string at all (most regional/mega/Gigantamax variants
 * — GO never renamed those, only showing them as Pokédex filter chips — plus Unown's 28 letters
 * and a handful of others) are left out entirely so callers fall back to English rather than
 * inventing a Russian name.
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
      const value = lookupFormValue(map, p.slug, form.formSlug);
      if (value !== undefined) forms[form.key] = normalizeGoText(value);
    }
  }
  return { forms, total, matched: Object.keys(forms).length };
}

/**
 * Merges the `pokemon` arrays of every generation dataset into one list of {@link PokemonRef},
 * keyed by species slug, with every generation's non-default forms unioned by `Form.key` (a
 * form that exists in several generations, e.g. Mega Charizard X in both `xy` and `sm`, is only
 * counted once). `extractForms` needs the union because Black/White (gen V) predates megas,
 * Gigantamax and most regional forms, so a bw-only form list would miss the vast majority of
 * them.
 */
export function mergeFormRefs(genPokemon: PokemonRef[][]): PokemonRef[] {
  const bySlug = new Map<string, Map<string, string | null>>();
  for (const pokemonList of genPokemon) {
    for (const p of pokemonList) {
      let formsBySlug = bySlug.get(p.slug);
      if (!formsBySlug) {
        formsBySlug = new Map();
        bySlug.set(p.slug, formsBySlug);
      }
      for (const f of p.forms) formsBySlug.set(f.key, f.formSlug);
    }
  }
  return [...bySlug.entries()].map(([slug, formsBySlug]) => ({
    slug,
    forms: [...formsBySlug.entries()].map(([key, formSlug]) => ({
      key,
      formSlug,
    })),
  }));
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

/** Every generation with a dataset, oldest first (mirrors `GENERATIONS` in `src/lib/generations.ts`). */
const GEN_IDS: GenId[] = [
  "rb",
  "gs",
  "rs",
  "dp",
  "bw",
  "xy",
  "sm",
  "swsh",
  "sv",
];

const MAX_SPECIES_ID = 1025;

async function main(): Promise<void> {
  const json = await fetchPogoI18n();
  const map = parsePogoI18n(json);

  const ids = Array.from({ length: MAX_SPECIES_ID }, (_, i) => i + 1);
  const { names: extractedNames, genus: extractedGenus } = extractRu(map, ids);
  const names = withManualOverlay(extractedNames, MANUAL_NAMES);
  const normalizedGenus = withManualOverlay(
    normalizeGenus(extractedGenus),
    MANUAL_GENUS,
  );

  const genPokemon: PokemonRef[][] = [];
  for (const gen of GEN_IDS) {
    const data = JSON.parse(
      await Bun.file(`src/data/gen/${gen}.json`).text(),
    ) as GenData;
    genPokemon.push(data.pokemon);
  }
  const mergedPokemon = mergeFormRefs(genPokemon);
  const { forms, total, matched } = extractForms(map, mergedPokemon);

  const flavorGo = extractFlavorGo(map, ids);

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
  await Bun.write(
    "src/i18n/data/ru/flavor-go.json",
    `${JSON.stringify(flavorGo, null, indent)}\n`,
  );

  console.log(
    `[i18n] names ${Object.keys(names).length} of ${MAX_SPECIES_ID} ` +
      `(${Object.keys(MANUAL_NAMES).length} manual), ` +
      `genus ${Object.keys(normalizedGenus).length} of ${MAX_SPECIES_ID} ` +
      `(${Object.keys(MANUAL_GENUS).length} manual), ` +
      `forms ${matched} of ${total}, ` +
      `flavor-go ${Object.keys(flavorGo).length} of ${MAX_SPECIES_ID}`,
  );
}

if (import.meta.main) {
  await main();
}
