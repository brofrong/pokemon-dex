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
 */

import type { GenData, Pokemon, Form, TypeSlug } from "../data/types";
import type { Lang } from "./ui";

import typesRuJson from "./data/ru/types.json";
import eggGroupsRuJson from "./data/ru/egg-groups.json";
import abilitiesRuJson from "./data/ru/abilities.json";
import itemsRuJson from "./data/ru/items.json";
import locationsRuJson from "./data/ru/locations.json";
import movesRuJson from "./data/ru/moves.json";
import genusRuJson from "./data/ru/genus.json";
import pokemonRuJson from "./data/ru/pokemon.json";
import formsRuJson from "./data/ru/forms.json";
import flavorRuJson from "./data/ru/flavor.json";

const typesRu: Record<string, string> = typesRuJson;
const eggGroupsRu: Record<string, string> = eggGroupsRuJson;
const abilitiesRu: Record<string, string> = abilitiesRuJson;
const itemsRu: Record<string, string> = itemsRuJson;
const locationsRu: Record<string, string> = locationsRuJson;
const movesRu: Record<string, string> = movesRuJson;
const genusRu: Record<string, string> = genusRuJson;
const pokemonRu: Record<string, string> = pokemonRuJson;
const formsRu: Record<string, string> = formsRuJson;
const flavorRu: Record<string, Record<string, string>> = flavorRuJson;

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

/**
 * A Pokédex flavor-text entry for one game version (e.g. `"black"` / `"white"`). Falls back to
 * the English text for that same version when no Russian translation exists yet (this task
 * ships `flavor.json` as `{}`; later tasks translate it in batches, see
 * `tests/i18n/coverage.test.ts`'s `FLAVOR_TRANSLATED_UP_TO`).
 */
export function flavorText(lang: Lang, p: Pokemon, version: string): string {
  const en = p.flavor[version] ?? "";
  const ru = flavorRu[String(p.id)]?.[version];
  return resolve(lang, `flavor.${p.id}.${version}`, ru, en);
}
