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
 * A non-default form's display name.
 * - `en`: built from the species name and the form slug, e.g. `"Rotom (Heat)"`.
 * - `ru`: the GO-sourced string in `forms.json` keyed by `form.key` (e.g. `"479-heat"`),
 *   falling back to the English label when that form has no Russian name (most don't — see
 *   Task 6's report).
 */
export function formName(lang: Lang, p: Pokemon, form: Form): string {
  const enBase = pokemonName("en", p);
  const en = form.formSlug
    ? `${enBase} (${englishLabel(form.formSlug)})`
    : enBase;
  return resolve(lang, `form.${form.key}`, formsRu[form.key], en);
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
