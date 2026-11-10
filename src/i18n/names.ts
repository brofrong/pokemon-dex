/**
 * Name/text lookups for data that comes from the generated dataset (`GenData`, see
 * `src/data/types.ts`) rather than static UI copy (see `ui.ts`).
 *
 * English is always the dataset's own English string. Russian comes from the small JSON
 * dictionaries in `./data/ru/*.json`, keyed either by slug (types, egg groups, abilities,
 * items, locations, moves, forms) or by species id as a string (pokemon, genus, flavor).
 *
 * Every lookup here falls back to English when the Russian dictionary has no entry (or the
 * entry is empty), and in non-production builds logs a one-time `console.warn` per missing
 * key so gaps are visible during development without spamming the console or breaking the
 * production build.
 *
 * `flavor.json` shape: `{ "4": { "black": "…", "white": "…" } }` — keyed by species id, then
 * by version slug (`black` / `white` for Black/White). A given id/version pair may be entirely
 * absent (not yet translated); `flavorText` falls back to the English flavor text for that
 * version in that case.
 *
 * `flavor-go.json` / `flavor-extra.json` shape: `{ "4": "…" }` — one Russian text per species
 * id, not per version, because both are single texts regardless of which game version's English
 * text the page happens to show (see `flavorText`'s doc). `flavor-go.json` holds Pokémon GO's
 * own official description (shown with a "Pokémon GO" source label); `flavor-extra.json` holds
 * our own translation of a mainline game's English Pokédex text, for the handful of species GO
 * has no description for at all (shown like `flavor.json`'s bw translations, without that label,
 * since it's not a Pokémon GO text).
 */

import type { GenData, GenId, Pokemon, Form, TypeSlug } from "../data/types";
import type { Lang } from "./ui";

import typesRuJson from "./data/ru/types.json";
import eggGroupsRuJson from "./data/ru/egg-groups.json";
import abilitiesRuJson from "./data/ru/abilities.json";
import abilityEffectsRuJson from "./data/ru/ability-effects.json";
import itemsRuJson from "./data/ru/items.json";
import locationsRuJson from "./data/ru/locations.json";
import movesRuJson from "./data/ru/moves.json";
import genusRuJson from "./data/ru/genus.json";
import pokemonRuJson from "./data/ru/pokemon.json";
import formsRuJson from "./data/ru/forms.json";
import formsExtraRuJson from "./data/ru/forms-extra.json";
import flavorRuJson from "./data/ru/flavor.json";
import flavorGoRuJson from "./data/ru/flavor-go.json";
import flavorExtraRuJson from "./data/ru/flavor-extra.json";

const typesRu: Record<string, string> = typesRuJson;
const eggGroupsRu: Record<string, string> = eggGroupsRuJson;
const abilitiesRu: Record<string, string> = abilitiesRuJson;
const abilityEffectsRu: Record<string, string> = abilityEffectsRuJson;
const itemsRu: Record<string, string> = itemsRuJson;
const locationsRu: Record<string, string> = locationsRuJson;
const movesRu: Record<string, string> = movesRuJson;
const genusRu: Record<string, string> = genusRuJson;
const pokemonRu: Record<string, string> = pokemonRuJson;
const formsRu: Record<string, string> = formsRuJson;
const formsExtraRu: Record<string, string> = formsExtraRuJson;
const flavorRu: Record<string, Record<string, string>> = flavorRuJson;
const flavorGoRu: Record<string, string> = flavorGoRuJson;
const flavorExtraRu: Record<string, string> = flavorExtraRuJson;

const isProduction = () => process.env.NODE_ENV === "production";

const warned = new Set<string>();

/** Warns once (per key, per process) in non-production builds that `key` had no `ru` value. */
function warnMissing(key: string): void {
  if (isProduction() || warned.has(key)) return;
  warned.add(key);
  console.warn(
    `[i18n] missing ru translation for "${key}", falling back to English`,
  );
}

/**
 * Shared fallback: returns `ruValue` when present and non-empty for `lang === 'ru'`, otherwise
 * `enValue`, warning once (outside production) when a ru lookup was expected but missing.
 */
function resolve(
  lang: Lang,
  warnKey: string,
  ruValue: string | undefined,
  enValue: string,
): string {
  if (lang === "en") return enValue;
  if (ruValue?.trim()) return ruValue;
  warnMissing(warnKey);
  return enValue;
}

function capitalizeWord(word: string): string {
  return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);
}

/** Builds a readable English label from hyphenated identifiers, e.g. `"heat"` -> `"Heat"`. */
function englishLabel(slug: string): string {
  return slug.split("-").map(capitalizeWord).join(" ");
}

/** The official Pokémon name, e.g. `pokemonName('ru', bulbasaur)` -> `"Бульбазавр"`. */
export function pokemonName(lang: Lang, p: Pokemon): string {
  return resolve(lang, `pokemon.${p.id}`, pokemonRu[String(p.id)], p.name);
}

/** The species' category/genus, e.g. `genus('ru', charmander)` -> `"Покемон-Ящерица"`. */
export function genus(lang: Lang, p: Pokemon): string {
  return resolve(lang, `genus.${p.id}`, genusRu[String(p.id)], p.genus);
}

/** A type's display name, e.g. `typeName('ru', 'fire')` -> `"Огонь"`. */
export function typeName(lang: Lang, slug: TypeSlug): string {
  return resolve(lang, `type.${slug}`, typesRu[slug], englishLabel(slug));
}

/** An ability's display name, looked up against `gen.names.abilities` for the English source. */
export function abilityName(lang: Lang, slug: string, gen: GenData): string {
  const en = gen.names.abilities[slug] ?? englishLabel(slug);
  return resolve(lang, `ability.${slug}`, abilitiesRu[slug], en);
}

/**
 * An ability's short effect text, looked up against `gen.names.abilityEffects` for the English
 * source (PokeAPI `ability_prose.short_effect`). `ability-effects.json` ships empty in this
 * task; every lookup falls back to English until a later task translates it (gated by
 * `ABILITY_TRANSLATIONS_COMPLETE` in `tests/i18n/coverage.test.ts`).
 */
export function abilityEffect(lang: Lang, slug: string, gen: GenData): string {
  const en = gen.names.abilityEffects[slug] ?? "";
  return resolve(lang, `abilityEffect.${slug}`, abilityEffectsRu[slug], en);
}

/** An evolution item's display name, e.g. `itemName('ru', 'fire-stone', gen)` -> `"Огненный камень"`. */
export function itemName(lang: Lang, slug: string, gen: GenData): string {
  const en = gen.names.items[slug] ?? englishLabel(slug);
  return resolve(lang, `item.${slug}`, itemsRu[slug], en);
}

/** A location's display name. */
export function locationName(lang: Lang, slug: string, gen: GenData): string {
  const en = gen.names.locations[slug] ?? englishLabel(slug);
  return resolve(lang, `location.${slug}`, locationsRu[slug], en);
}

/** A move's display name (only moves referenced by evolution conditions are in the dataset). */
export function moveName(lang: Lang, slug: string, gen: GenData): string {
  const en = gen.names.moves[slug] ?? englishLabel(slug);
  return resolve(lang, `move.${slug}`, movesRu[slug], en);
}

/** An egg group's display name. */
export function eggGroupName(lang: Lang, slug: string, gen: GenData): string {
  const en = gen.names.eggGroups[slug] ?? englishLabel(slug);
  return resolve(lang, `eggGroup.${slug}`, eggGroupsRu[slug], en);
}

/**
 * Russian for the region names regional forms are named after, used by
 * {@link composeRuFormName}. Covers every regional-form prefix in the datasets (`alola`, `galar`,
 * `hisui`, `paldea`); a species with a region not in this list (there are none as of 1–1025)
 * would just fall through to the English label, same as any other unmatched form.
 */
const REGION_RU: Record<string, string> = {
  alola: "Алола",
  galar: "Галар",
  hisui: "Хисуи",
  paldea: "Пальдея",
};

/**
 * The slug of each species' *default* form, for the species whose default form is one named
 * state among several (Toxtricity's Amped form next to Low Key, Deoxys' Normal Forme next to
 * Attack/Defense/Speed, ...). PokeAPI's `pokemon_forms.form_identifier` of the default form, plus
 * Castform, Zacian/Zamazenta, Ogerpon and Terapagos, whose default form PokeAPI leaves unnamed.
 * Used by {@link defaultFormName} to label the default form's tile like its siblings (QA bug #3:
 * «Токстрисити» next to «Сдержанная Форма» left the Amped form unnamed), and by
 * {@link ruFormPart} so a composite slug like `amped-gmax` can name its base form.
 */
const DEFAULT_FORM_SLUG: Record<number, string> = {
  201: "a",
  351: "normal",
  386: "normal",
  412: "plant",
  413: "plant",
  414: "plant",
  421: "overcast",
  422: "west",
  423: "west",
  487: "altered",
  492: "land",
  493: "normal",
  550: "red-striped",
  555: "standard",
  585: "spring",
  586: "spring",
  592: "male",
  593: "male",
  641: "incarnate",
  642: "incarnate",
  645: "incarnate",
  647: "ordinary",
  648: "aria",
  664: "icy-snow",
  665: "icy-snow",
  666: "meadow",
  668: "male",
  669: "red",
  670: "red",
  671: "red",
  676: "natural",
  678: "male",
  681: "shield",
  710: "average",
  711: "average",
  716: "neutral",
  718: "50",
  720: "confined",
  741: "baile",
  745: "midday",
  746: "solo",
  773: "normal",
  774: "red-meteor",
  778: "disguised",
  849: "amped",
  854: "phony",
  855: "phony",
  869: "vanilla-cream-strawberry-sweet",
  875: "ice",
  876: "male",
  877: "full-belly",
  888: "hero",
  889: "hero",
  892: "single-strike",
  902: "male",
  905: "incarnate",
  916: "male",
  925: "family-of-four",
  931: "green-plumage",
  964: "zero",
  978: "curly",
  982: "two-segment",
  999: "chest",
  1012: "counterfeit",
  1013: "unremarkable",
  1017: "teal-mask",
  1024: "normal",
};

/**
 * Species whose cosmetic forms are named exactly like another species' (Scatterbug and Spewpa
 * carry the wing pattern they'll have as Vivillon), so their form parts are looked up there.
 */
const FORM_PARTS_FROM: Record<number, number> = { 664: 666, 665: 666 };

/** Minior's core colors (GO's `form_core_*` strings), for both its Meteor and Core forms. */
const MINIOR_CORE_RU: Record<string, string> = {
  red: "Красное Ядро",
  orange: "Оранжевое Ядро",
  yellow: "Жёлтое Ядро",
  green: "Зелёное Ядро",
  blue: "Голубое Ядро",
  indigo: "Синее Ядро",
  violet: "Фиолетовое Ядро",
};

/** Alcremie's cream flavors (GO's `form_cream_*`/`form_swirl_*` strings). */
const ALCREMIE_CREAM_RU: Record<string, string> = {
  "vanilla-cream": "Ванильные Сливки",
  "ruby-cream": "Ярко-Красные Сливки",
  "matcha-cream": "Сливки с Чаем Матча",
  "mint-cream": "Мятные Сливки",
  "lemon-cream": "Лимонные Сливки",
  "salted-cream": "Солёные Сливки",
  "ruby-swirl": "Ярко-Красный Виток",
  "caramel-swirl": "Карамельный Виток",
  "rainbow-swirl": "Радужный Виток",
};

/** Alcremie's Sweets (our translation; GO has no strings for them). */
const ALCREMIE_SWEET_RU: Record<string, string> = {
  strawberry: "Клубничная Сладость",
  berry: "Ягодная Сладость",
  love: "Сладость-Сердце",
  star: "Сладость-Звезда",
  clover: "Сладость-Клевер",
  flower: "Сладость-Цветок",
  ribbon: "Сладость-Бант",
};

/** Unown's two punctuation forms; its 26 letter forms are the letter itself. */
const UNOWN_MARKS: Record<string, string> = { exclamation: "!", question: "?" };

/**
 * The Russian name of one form *part* of species `id` -- the bare form label, as GO writes it
 * (`"Сдержанная Форма"`), or a full name when the source has one (`"Ротом-Жар"`): our own
 * `forms-extra.json` first (it also fixes GO strings that were matched to the wrong species), then
 * GO's `forms.json`, then the per-species rules (Unown, Minior, Alcremie). `undefined` when
 * nothing names it.
 */
function ruFormPart(id: number, slug: string): string | undefined {
  const key = `${id}-${slug}`;
  const direct = formsExtraRu[key]?.trim() || formsRu[key]?.trim();
  if (direct) return direct;
  const from = FORM_PARTS_FROM[id];
  if (from !== undefined) return ruFormPart(from, slug);
  if (id === 201) {
    if (/^[a-z]$/.test(slug)) return slug.toUpperCase();
    return UNOWN_MARKS[slug];
  }
  if (id === 774) {
    const meteor = /^([a-z]+)-meteor$/.exec(slug);
    if (meteor) {
      const core = MINIOR_CORE_RU[meteor[1]!];
      return core ? `Метеорная Форма, ${core}` : undefined;
    }
    return MINIOR_CORE_RU[slug];
  }
  if (id === 869) {
    const m = /^([a-z]+-(?:cream|swirl))-([a-z]+)-sweet$/.exec(slug);
    const cream = m ? ALCREMIE_CREAM_RU[m[1]!] : undefined;
    const sweet = m ? ALCREMIE_SWEET_RU[m[2]!] : undefined;
    return cream && sweet ? `${cream}, ${sweet}` : undefined;
  }
  return undefined;
}

/** `"<Имя> (<part>)"`, unless `part` already is a full name containing the species' own name. */
function withSpecies(ruBase: string, part: string): string {
  return part.includes(ruBase) ? part : `${ruBase} (${part})`;
}

/**
 * Builds a species' Russian form name. Fix round 1, finding 5 introduced the mega/Gigantamax/
 * regional rules; QA bug #3 extended them to every form kind in the nine datasets, so that no
 * Russian form name falls back to English:
 *
 * - `mega` -> `"Мега-<Имя>"`; `mega-x`/`mega-y` append `" X"`/`" Y"` (Mega Charizard X).
 * - a named form part (see {@link ruFormPart}) -> `"<Имя> (<part>)"`, or the part itself when
 *   it already contains the name (`"Ротом-Жар"`, `"Пикачу в кепке Алолы"`).
 * - `gmax` -> `"<Имя> (Гигантамакс)"`; `<base>-gmax` (Toxtricity's and Urshifu's two Gigantamax
 *   forms) -> `"<Имя> (<base part>, Гигантамакс)"`.
 * - `totem` -> `"<Имя> (Тотем)"`; `totem-<base>` -> `"<Имя> (<base part>, Тотем)"`.
 * - a regional prefix (`alola`, `galar`, `hisui`, `paldea`) alone -> `"<Имя> (<Регион>)"`;
 *   followed by `-<base>` (`galar-zen`, `paldea-combat-breed`) -> `"<Имя> (<Регион>, <base part>)"`.
 *
 * Returns `null` when a part has no Russian source, leaving the caller to fall back to English.
 */
function composeRuFormName(p: Pokemon, formSlug: string): string | null {
  const ruBase = pokemonName("ru", p);
  if (formSlug === "mega") return `Мега-${ruBase}`;
  if (formSlug === "mega-x") return `Мега-${ruBase} X`;
  if (formSlug === "mega-y") return `Мега-${ruBase} Y`;

  const own = ruFormPart(p.id, formSlug);
  if (own) return withSpecies(ruBase, own);

  /** A base form's part, or the region it's named after, for a composite slug. */
  const basePart = (slug: string): string | undefined =>
    REGION_RU[slug] ?? ruFormPart(p.id, slug);

  if (formSlug === "gmax") return `${ruBase} (Гигантамакс)`;
  if (formSlug.endsWith("-gmax")) {
    const base = basePart(formSlug.slice(0, -"-gmax".length));
    return base ? `${ruBase} (${base}, Гигантамакс)` : null;
  }
  if (formSlug === "totem") return `${ruBase} (Тотем)`;
  if (formSlug.startsWith("totem-")) {
    const base = basePart(formSlug.slice("totem-".length));
    return base ? `${ruBase} (${base}, Тотем)` : null;
  }
  for (const [region, regionRu] of Object.entries(REGION_RU)) {
    if (formSlug === region) return `${ruBase} (${regionRu})`;
    if (formSlug.startsWith(`${region}-`)) {
      const extra = ruFormPart(p.id, formSlug.slice(region.length + 1));
      return extra ? `${ruBase} (${regionRu}, ${extra})` : null;
    }
  }
  return null;
}

/**
 * A non-default form's display name.
 * - `en`: built from the species name and the form slug, e.g. `"Rotom (Heat)"`.
 * - `ru`: composed from the species' own Russian name and the form's Russian part (see
 *   {@link composeRuFormName}): `"Ротом-Жар"`, `"Мега-Чаризард X"`, `"Валпикс (Алола)"`,
 *   `"Токстрисити (Сдержанная Форма, Гигантамакс)"`, `"Аноун (B)"`. Falls back to the English
 *   label (with a dev warning) for a form nothing names yet.
 */
export function formName(lang: Lang, p: Pokemon, form: Form): string {
  const enBase = pokemonName("en", p);
  const en = form.formSlug
    ? `${enBase} (${englishLabel(form.formSlug)})`
    : enBase;
  if (lang === "en") return en;

  const composed = form.formSlug ? composeRuFormName(p, form.formSlug) : null;
  if (composed) return composed;

  warnMissing(`form.${form.key}`);
  return en;
}

/**
 * The label of a species' *default* form on its form tile: `"Toxtricity (Amped)"` /
 * «Токстрисити (Восторженная Форма)» for a species whose default form is one named state among
 * several (see {@link DEFAULT_FORM_SLUG}), so it reads like its siblings' tiles. Every other
 * species' default form is just the species name.
 */
export function defaultFormName(lang: Lang, p: Pokemon): string {
  const slug = DEFAULT_FORM_SLUG[p.id];
  if (slug === undefined) return pokemonName(lang, p);
  if (lang === "en") return `${pokemonName("en", p)} (${englishLabel(slug)})`;
  const part = ruFormPart(p.id, slug);
  if (part) return withSpecies(pokemonName("ru", p), part);
  warnMissing(`form.${p.id}-${slug}`);
  return pokemonName("ru", p);
}

/** A flavor-text lookup's result: the text to show, and where a Russian one came from. */
export interface FlavorResult {
  text: string;
  /**
   * `"game"`: a mainline game's own Pokédex text — either our `flavor.json` translation (`bw`)
   * or our `flavor-extra.json` translation of another generation's English text, or (for `en`)
   * the dataset's own English string. `"go"`: Pokémon GO's official description, which must be
   * shown with the `"flavor.sourceGo"` label (see `src/i18n/ui.ts`) since it isn't actually that
   * game's Pokédex entry — no fabricated "official game text" claim.
   */
  source: "game" | "go";
}

/**
 * A Pokédex flavor-text entry for one game version (e.g. `"black"` / `"white"`) in generation
 * `gen`. `en` always reads the dataset's own English string for `version` (whatever generation).
 * `ru` depends on `gen`:
 *  - `bw`: our own per-version translations in `flavor.json`, exactly as before this task.
 *  - every other generation: Pokémon GO's single per-species description in `flavor-go.json`
 *    (`source: "go"`); if GO has none for this species, our own translation of a mainline game's
 *    text in `flavor-extra.json` (`source: "game"`, see `FlavorResult`'s doc).
 * Falls back to the English text when no Russian translation exists yet in whichever file was
 * consulted (`flavor.json` ships translated per `FLAVOR_TRANSLATED_UP_TO` in
 * `tests/i18n/coverage.test.ts`; `flavor-go.json`/`flavor-extra.json` ship complete for 1–1025,
 * see `task-5a-report.md`).
 */
export function flavorText(
  lang: Lang,
  p: Pokemon,
  version: string,
  gen: GenId,
): FlavorResult {
  const en = p.flavor[version] ?? "";
  if (lang === "en") return { text: en, source: "game" };

  if (gen === "bw") {
    const ru = flavorRu[String(p.id)]?.[version];
    if (ru?.trim()) return { text: ru, source: "game" };
    warnMissing(`flavor.${p.id}.${version}`);
    return { text: en, source: "game" };
  }

  const go = flavorGoRu[String(p.id)];
  if (go?.trim()) return { text: go, source: "go" };
  const extra = flavorExtraRu[String(p.id)];
  if (extra?.trim()) return { text: extra, source: "game" };
  warnMissing(`flavor.${p.id}.go`);
  return { text: en, source: "game" };
}

/**
 * Display name for a game version slug (e.g. `"ultra-sun"` -> `"Ultra Sun"`), used to label a
 * flavor-text entry that fell back to an earlier version's English text (see `GenConfig.
 * flavorVersions`' doc in `src/lib/generations.ts`). Covers every version slug that appears as a
 * `Pokemon.flavor` key in any of the nine datasets. Russian uses the same Latin game titles —
 * there's no Cyrillic "official" rendering of e.g. "Ultra Sun" to translate to.
 */
const VERSION_NAMES: Record<string, string> = {
  red: "Red",
  blue: "Blue",
  yellow: "Yellow",
  gold: "Gold",
  silver: "Silver",
  crystal: "Crystal",
  ruby: "Ruby",
  sapphire: "Sapphire",
  emerald: "Emerald",
  diamond: "Diamond",
  pearl: "Pearl",
  platinum: "Platinum",
  black: "Black",
  white: "White",
  x: "X",
  y: "Y",
  "omega-ruby": "Omega Ruby",
  "alpha-sapphire": "Alpha Sapphire",
  sun: "Sun",
  moon: "Moon",
  "ultra-sun": "Ultra Sun",
  "ultra-moon": "Ultra Moon",
  "lets-go-pikachu": "Let's Go, Pikachu!",
  "lets-go-eevee": "Let's Go, Eevee!",
  sword: "Sword",
  shield: "Shield",
  "legends-arceus": "Legends: Arceus",
  scarlet: "Scarlet",
  violet: "Violet",
};

export function versionName(lang: Lang, slug: string): string {
  void lang; // kept for API symmetry with the rest of this file; see VERSION_NAMES' doc above.
  return VERSION_NAMES[slug] ?? englishLabel(slug);
}
