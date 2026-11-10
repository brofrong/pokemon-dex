/**
 * Pure formatting helpers for the Pokémon detail page: measurements, gender ratio, evolution
 * condition phrasing, and the stat-bar color scale. No DOM/Astro dependency, so these are unit
 * tested directly (`tests/lib/format.test.ts`) rather than through a rendered page.
 */
import type { EvoCondition, GenData } from "../data/types";
import type { Lang } from "../i18n/ui";
import { COUNT_EN, COUNT_RU, t, tCount, UI_EN, UI_RU } from "../i18n/ui";
import type { CountKey, UiKey } from "../i18n/ui";
import {
  itemName,
  locationName,
  moveName,
  pokemonName,
  typeName,
  abilityEffect,
  abilityName,
} from "../i18n/names";

/** `"12.5"` -> `"12,5"` in `ru` (comma decimal separator); unchanged in `en`. */
function localizeDecimal(value: string, lang: Lang): string {
  return lang === "ru" ? value.replace(".", ",") : value;
}

/** `dm` (decimetres, as stored in the dataset) as one-decimal metres, e.g. `"0,6 м"` / `"0.6 m"`. */
export function formatHeight(dm: number, lang: Lang): string {
  const metres = (dm / 10).toFixed(1);
  const unit = lang === "ru" ? "м" : "m";
  return `${localizeDecimal(metres, lang)} ${unit}`;
}

/** `hg` (hectograms, as stored in the dataset) as one-decimal kilograms, e.g. `"8,5 кг"` / `"8.5 kg"`. */
export function formatWeight(hg: number, lang: Lang): string {
  const kg = (hg / 10).toFixed(1);
  const unit = lang === "ru" ? "кг" : "kg";
  return `${localizeDecimal(kg, lang)} ${unit}`;
}

/**
 * A whole number with the language's thousands separator: `"1,000"` in `en`, `"1 000"` (no-break
 * space) in `ru`, per the Russian style guide's «3 000».
 */
export function formatNumber(n: number, lang: Lang): string {
  return n.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
}

/** A percentage with at most one decimal (dropped when the value is a whole number), localized. */
function formatPercent(value: number, lang: Lang): string {
  const rounded = Math.round(value * 10) / 10;
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${localizeDecimal(str, lang)}%`;
}

/**
 * `rate` is PokeAPI's `gender_rate` (female eighths, `-1` for genderless). Shows the male share
 * with its symbol; falls back to the female share only once the male share hits exactly 0 (an
 * always-female species), since the single bold value in the meta row has room for only one.
 */
export function formatGender(rate: number, lang: Lang): string {
  if (rate === -1) return t(lang, "meta.genderless");
  const femalePct = (rate / 8) * 100;
  const malePct = 100 - femalePct;
  if (malePct > 0) return `♂ ${formatPercent(malePct, lang)}`;
  return `♀ ${formatPercent(femalePct, lang)}`;
}

/** The stat-bar fill color for one base stat value, per the mockup's five-step scale. */
export function statColor(v: number): string {
  if (v < 50) return "#e06c5a";
  if (v < 70) return "#e8a33d";
  if (v < 90) return "#d7c53a";
  if (v < 110) return "#7cc35a";
  return "#2fa36b";
}

/** A species' localized display name by slug, falling back to the raw slug if it's not in this gen. */
function speciesLabel(slug: string, lang: Lang, gen: GenData): string {
  const p = gen.pokemon.find((x) => x.slug === slug);
  return p ? pokemonName(lang, p) : slug;
}

/**
 * One rendered field of an evolution condition. `caseable`: its phrase template starts with an
 * ordinary word («Знает приём…», "Knows a…"), which reads lower-case anywhere but at the very
 * start of a label (fix round 1, Ruling R-B16). Templates that start with an interpolated name
 * (`{item}`, `{type}`), a number, or a name that is always capitalized (the stat names in
 * «Атака > Защита», the Towers of Darkness/Waters) keep their case.
 */
interface Part {
  text: string;
  caseable: boolean;
}

/** Phrase keys whose own words are proper names/stat names, never lower-cased. */
const KEEP_CASE = new Set<UiKey | CountKey>([
  "evo.stats.gt",
  "evo.stats.eq",
  "evo.stats.lt",
  "evo.special.tower-of-darkness",
  "evo.special.tower-of-waters",
]);

/**
 * Like {@link KEEP_CASE}, for English only: its nature phrases start with the nature group's name
 * ("Low Key nature"), while Russian's start with the word «Характер».
 */
const KEEP_CASE_EN = new Set<UiKey | CountKey>([
  "evo.nature.amped",
  "evo.nature.lowKey",
]);

/** Whether a phrase template starts with an ordinary word that may be lower-cased. */
function caseableTemplate(
  lang: Lang,
  key: UiKey | CountKey,
  template: string,
): boolean {
  if (KEEP_CASE.has(key) || (lang === "en" && KEEP_CASE_EN.has(key))) {
    return false;
  }
  return /^\p{Lu}/u.test(template);
}

/** A part as it reads after the start of a label: its first letter lower-cased when caseable. */
function inner(part: Part): string {
  return part.caseable
    ? part.text[0]!.toLowerCase() + part.text.slice(1)
    : part.text;
}

/** A label's first phrase, capitalized («В команде есть «Реморэйд»»). */
function initial(part: Part): string {
  return part.text[0]!.toUpperCase() + part.text.slice(1);
}

/**
 * Parts joined with `", "`: the first one capitalized when it starts the label (`atStart`), every
 * other one {@link inner}.
 */
function renderParts(parts: Part[], atStart: boolean): string {
  return parts
    .map((part, i) => (atStart && i === 0 ? initial(part) : inner(part)))
    .join(", ");
}

/**
 * The display phrases of one {@link EvoCondition}'s simultaneously-required fields, in a fixed
 * order, e.g. «Ур. 50», «во время дождя». Each recognized field contributes one part; a
 * condition with no recognized field falls back to a generic "special condition" phrase.
 */
function conditionParts(c: EvoCondition, lang: Lang, gen: GenData): Part[] {
  const parts: Part[] = [];
  const add = (key: UiKey, vars?: Record<string, string | number>): void => {
    parts.push({
      text: t(lang, key, vars),
      caseable: caseableTemplate(
        lang,
        key,
        (lang === "en" ? UI_EN : UI_RU)[key],
      ),
    });
  };
  const addCount = (
    key: CountKey,
    count: number,
    vars: Record<string, string | number>,
  ): void => {
    parts.push({
      text: tCount(lang, key, count, vars),
      caseable: caseableTemplate(
        lang,
        key,
        (lang === "en" ? COUNT_EN : COUNT_RU)[key].one,
      ),
    });
  };

  if (c.minLevel != null) add("evo.level", { level: c.minLevel });

  if (c.trigger === "trade") {
    if (c.tradeSpecies) {
      add("evo.tradeSpecies", {
        species: speciesLabel(c.tradeSpecies, lang, gen),
      });
    } else if (c.heldItem) {
      add("evo.tradeItem", { item: itemName(lang, c.heldItem, gen) });
    } else {
      add("evo.trade");
    }
  }

  if (c.trigger === "use-item" && c.item) {
    add("evo.item", { item: itemName(lang, c.item, gen) });
  }

  if (c.trigger === "shed") add("evo.shed");

  if (c.special) add(`evo.special.${c.special}`);

  // Alcremie's Sweet and the time of day decide which Alcremie it becomes, not whether it
  // evolves, so its spin condition stays one phrase instead of 21 near-identical alternatives.
  const decidesForm = c.special === "spin";

  if (c.heldItem && c.trigger !== "trade" && !decidesForm) {
    add("evo.holdItem", { item: itemName(lang, c.heldItem, gen) });
  }

  if (c.minHappiness != null) {
    if (c.timeOfDay === "day") add("evo.happinessDay");
    else if (c.timeOfDay === "night") add("evo.happinessNight");
    else add("evo.happiness");
  } else if (!decidesForm) {
    if (c.timeOfDay === "day") add("evo.day");
    if (c.timeOfDay === "night") add("evo.night");
    if (c.timeOfDay === "dusk") add("evo.dusk");
    if (c.timeOfDay === "full-moon") add("evo.fullMoon");
  }

  if (c.knownMove) {
    add("evo.knownMove", { move: moveName(lang, c.knownMove, gen) });
  }
  if (c.knownMoveType) {
    add("evo.knownMoveType", { type: typeName(lang, c.knownMoveType) });
  }
  if (c.location) {
    add("evo.location", { location: locationName(lang, c.location, gen) });
  }
  if (c.gender === "female") add("evo.gender.female");
  if (c.gender === "male") add("evo.gender.male");
  if (c.relativeStats === 1) add("evo.stats.gt");
  if (c.relativeStats === 0) add("evo.stats.eq");
  if (c.relativeStats === -1) add("evo.stats.lt");
  if (c.partySpecies) {
    add("evo.party", { species: speciesLabel(c.partySpecies, lang, gen) });
  }
  if (c.minBeauty != null) add("evo.beauty", { beauty: c.minBeauty });
  if (c.needsRain) add("evo.needsRain");
  if (c.upsideDown) add("evo.upsideDown");
  if (c.partyType) add("evo.partyType", { type: typeName(lang, c.partyType) });
  if (c.minAffection != null) {
    add("evo.minAffection", { affection: c.minAffection });
  }
  if (c.nature === "amped") add("evo.nature.amped");
  if (c.nature === "low-key") add("evo.nature.lowKey");
  if (c.usedMove) {
    const count = c.usedMoveCount ?? 1;
    addCount("evo.usedMove", count, {
      move: moveName(lang, c.usedMove, gen),
      count: formatNumber(count, lang),
    });
  }
  if (c.minSteps != null) {
    addCount("evo.minSteps", c.minSteps, {
      count: formatNumber(c.minSteps, lang),
    });
  }
  if (c.minDamageTaken != null) {
    add("evo.minDamageTaken", {
      damage: formatNumber(c.minDamageTaken, lang),
    });
  }
  if (c.needsMultiplayer) add("evo.needsMultiplayer");

  if (parts.length === 0) add("evo.other");

  if (c.fromForm) add(`evo.fromForm.${c.fromForm}`);

  return parts;
}

/**
 * One {@link EvoCondition}'s display phrase, e.g. «Ур. 16» or «Ур. 50, во время дождя»: its
 * simultaneously-required fields ("and") joined with `", "` (Ruling R-B13), every phrase after
 * the first starting lower-case («Дружба, знает приём (тип: Фея)», Ruling R-B16).
 */
export function formatCondition(
  c: EvoCondition,
  lang: Lang,
  gen: GenData,
): string {
  return renderParts(conditionParts(c, lang, gen), true);
}

/** `a`, `a или b`, `a, b или c` (EN: `a, b or c`). */
function orList(items: string[], lang: Lang): string {
  const or = t(lang, "evo.or");
  if (items.length <= 2) return items.join(or);
  return `${items.slice(0, -1).join(", ")}${or}${items.at(-1)!}`;
}

/**
 * The label of one evolution step from all its alternative conditions (Ruling R-B13):
 *  - fields inside one condition (and) are joined with `", "`;
 *  - alternatives (or) are joined with `" или "` / `" or "` (three or more: `"a, b или c"`), after
 *    dropping exact repeats (a species with several cosmetic sub-forms repeats the same condition
 *    once per sub-form, e.g. Burmy's three cloaks into Wormadam);
 *  - fields every alternative shares are said once, before a colon: Toxtricity's
 *    «Ур. 30: характер «Бодрый» или «Спокойный»», Rockruff's «Ур. 25: днём, ночью или вечером»;
 *  - alternatives that differ only by gender and cover both (Espurr, Lechonk, Basculin into
 *    their male/female forms) aren't a choice at all, so the gender is left out.
 * Only the label's very first phrase keeps its capital (Ruling R-B16).
 */
export function formatConditions(
  conditions: EvoCondition[],
  lang: Lang,
  gen: GenData,
): string {
  const alternatives: Part[][] = [];
  const seen = new Set<string>();
  for (const c of conditions) {
    const parts = conditionParts(c, lang, gen);
    const key = parts.map((p) => p.text).join("\n");
    if (seen.has(key)) continue;
    seen.add(key);
    alternatives.push(parts);
  }
  if (alternatives.length === 0) return "";
  if (alternatives.length === 1) return renderParts(alternatives[0]!, true);

  const texts = (parts: Part[]) => parts.map((p) => p.text);
  const common = alternatives[0]!.filter((part) =>
    alternatives.every((alt) => texts(alt).includes(part.text)),
  );
  const commonTexts = texts(common);
  const rests = alternatives.map((alt) =>
    alt.filter((part) => !commonTexts.includes(part.text)),
  );
  const restSet = new Set(rests.map((rest) => texts(rest).join("\n")));
  const has = (key: UiKey) => restSet.has(t(lang, key));

  if (rests.every((rest) => rest.length === 1) && restSet.size === 2) {
    if (has("evo.gender.male") && has("evo.gender.female")) {
      return renderParts(common, true);
    }
    if (has("evo.nature.amped") && has("evo.nature.lowKey")) {
      const either = t(lang, "evo.nature.either");
      return common.length > 0
        ? `${renderParts(common, true)}: ${either}`
        : either[0]!.toUpperCase() + either.slice(1);
    }
  }

  if (common.length === 0 || rests.some((rest) => rest.length === 0)) {
    return orList(
      alternatives.map((alt, i) => renderParts(alt, i === 0)),
      lang,
    );
  }
  return `${renderParts(common, true)}: ${orList(
    rests.map((rest) => renderParts(rest, false)),
    lang,
  )}`;
}

/**
 * The reference `<small>` line under one ability (mockup `.abil small`): the hidden-ability
 * label when hidden, plus the canonical English name as a translation aid when `lang` is not
 * already English. `null` when there's nothing useful to show (an English, non-hidden ability).
 */
export function abilitySmallLabel(
  slug: string,
  hidden: boolean,
  lang: Lang,
  gen: GenData,
): string | null {
  const parts: string[] = [];
  if (hidden) parts.push(t(lang, "ability.hidden"));
  if (lang !== "en") parts.push(abilityName("en", slug, gen));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The view-model for one ability box (mockup `.abil`): localized name, the `<small>` reference
 * line and the localized short effect text shown inside its `<details>`. Shared by the
 * server-rendered `Abilities.astro` and the `#pdx-forms` JSON payload (`buildFormPayload` in the
 * detail page's `index.astro`) so a form switch re-renders exactly what the server would have. */
export interface AbilityView {
  name: string;
  small: string | null;
  effect: string;
}

export function abilityView(
  slug: string,
  hidden: boolean,
  lang: Lang,
  gen: GenData,
): AbilityView {
  return {
    name: abilityName(lang, slug, gen),
    small: abilitySmallLabel(slug, hidden, lang, gen),
    effect: abilityEffect(lang, slug, gen),
  };
}
