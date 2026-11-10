/**
 * Pure formatting helpers for the Pokémon detail page: measurements, gender ratio, evolution
 * condition phrasing, and the stat-bar color scale. No DOM/Astro dependency, so these are unit
 * tested directly (`tests/lib/format.test.ts`) rather than through a rendered page.
 */
import type { EvoCondition, GenData } from "../data/types";
import type { Lang } from "../i18n/ui";
import { t, tCount } from "../i18n/ui";
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
 * The display phrases of one {@link EvoCondition}'s simultaneously-required fields, in a fixed
 * order, e.g. `["Ур. 50", "во время дождя"]`. Each recognized field contributes one segment; a
 * condition with no recognized field falls back to a generic "special condition" phrase.
 */
function conditionParts(c: EvoCondition, lang: Lang, gen: GenData): string[] {
  const parts: string[] = [];

  if (c.minLevel != null) {
    parts.push(t(lang, "evo.level", { level: c.minLevel }));
  }

  if (c.trigger === "trade") {
    if (c.tradeSpecies) {
      parts.push(
        t(lang, "evo.tradeSpecies", {
          species: speciesLabel(c.tradeSpecies, lang, gen),
        }),
      );
    } else if (c.heldItem) {
      parts.push(
        t(lang, "evo.tradeItem", { item: itemName(lang, c.heldItem, gen) }),
      );
    } else {
      parts.push(t(lang, "evo.trade"));
    }
  }

  if (c.trigger === "use-item" && c.item) {
    parts.push(t(lang, "evo.item", { item: itemName(lang, c.item, gen) }));
  }

  if (c.trigger === "shed") parts.push(t(lang, "evo.shed"));

  if (c.special) parts.push(t(lang, `evo.special.${c.special}`));

  // Alcremie's Sweet and the time of day decide which Alcremie it becomes, not whether it
  // evolves, so its spin condition stays one phrase instead of 21 near-identical alternatives.
  const decidesForm = c.special === "spin";

  if (c.heldItem && c.trigger !== "trade" && !decidesForm) {
    parts.push(
      t(lang, "evo.holdItem", { item: itemName(lang, c.heldItem, gen) }),
    );
  }

  if (c.minHappiness != null) {
    if (c.timeOfDay === "day") parts.push(t(lang, "evo.happinessDay"));
    else if (c.timeOfDay === "night") parts.push(t(lang, "evo.happinessNight"));
    else parts.push(t(lang, "evo.happiness"));
  } else if (!decidesForm) {
    if (c.timeOfDay === "day") parts.push(t(lang, "evo.day"));
    if (c.timeOfDay === "night") parts.push(t(lang, "evo.night"));
  }

  if (c.knownMove) {
    parts.push(
      t(lang, "evo.knownMove", { move: moveName(lang, c.knownMove, gen) }),
    );
  }
  if (c.knownMoveType) {
    parts.push(
      t(lang, "evo.knownMoveType", { type: typeName(lang, c.knownMoveType) }),
    );
  }
  if (c.location) {
    parts.push(
      t(lang, "evo.location", {
        location: locationName(lang, c.location, gen),
      }),
    );
  }
  if (c.gender === "female") parts.push(t(lang, "evo.gender.female"));
  if (c.gender === "male") parts.push(t(lang, "evo.gender.male"));
  if (c.relativeStats === 1) parts.push(t(lang, "evo.stats.gt"));
  if (c.relativeStats === 0) parts.push(t(lang, "evo.stats.eq"));
  if (c.relativeStats === -1) parts.push(t(lang, "evo.stats.lt"));
  if (c.partySpecies) {
    parts.push(
      t(lang, "evo.party", {
        species: speciesLabel(c.partySpecies, lang, gen),
      }),
    );
  }
  if (c.minBeauty != null) {
    parts.push(t(lang, "evo.beauty", { beauty: c.minBeauty }));
  }
  if (c.needsRain) parts.push(t(lang, "evo.needsRain"));
  if (c.upsideDown) parts.push(t(lang, "evo.upsideDown"));
  if (c.partyType) {
    parts.push(t(lang, "evo.partyType", { type: typeName(lang, c.partyType) }));
  }
  if (c.minAffection != null) {
    parts.push(t(lang, "evo.minAffection", { affection: c.minAffection }));
  }
  if (c.nature === "amped") parts.push(t(lang, "evo.nature.amped"));
  if (c.nature === "low-key") parts.push(t(lang, "evo.nature.lowKey"));
  if (c.usedMove) {
    const count = c.usedMoveCount ?? 1;
    parts.push(
      tCount(lang, "evo.usedMove", count, {
        move: moveName(lang, c.usedMove, gen),
        count: formatNumber(count, lang),
      }),
    );
  }
  if (c.minSteps != null) {
    parts.push(
      tCount(lang, "evo.minSteps", c.minSteps, {
        count: formatNumber(c.minSteps, lang),
      }),
    );
  }
  if (c.minDamageTaken != null) {
    parts.push(
      t(lang, "evo.minDamageTaken", {
        damage: formatNumber(c.minDamageTaken, lang),
      }),
    );
  }
  if (c.needsMultiplayer) parts.push(t(lang, "evo.needsMultiplayer"));

  if (parts.length === 0) parts.push(t(lang, "evo.other"));

  if (c.fromForm) parts.push(t(lang, `evo.fromForm.${c.fromForm}`));

  return parts;
}

/**
 * One {@link EvoCondition}'s display phrase, e.g. `"Ур. 16"` or `"Ур. 50, во время дождя"`: its
 * simultaneously-required fields ("and") joined with `", "` (Ruling R-B13).
 */
export function formatCondition(
  c: EvoCondition,
  lang: Lang,
  gen: GenData,
): string {
  return conditionParts(c, lang, gen).join(", ");
}

/**
 * The label of one evolution step from all its alternative conditions (Ruling R-B13):
 *  - fields inside one condition (and) are joined with `", "`;
 *  - alternatives (or) are joined with `" или "` / `" or "`, after dropping exact repeats (a
 *    species with several cosmetic sub-forms repeats the same condition once per sub-form, e.g.
 *    Burmy's three cloaks into Wormadam);
 *  - fields every alternative shares are said once, before a colon: Toxtricity's
 *    `"Ур. 30: характер «Бодрый» или «Спокойный»"`;
 *  - alternatives that differ only by gender and cover both (Espurr, Lechonk, Basculin into
 *    their male/female forms) aren't a choice at all, so the gender is left out.
 */
export function formatConditions(
  conditions: EvoCondition[],
  lang: Lang,
  gen: GenData,
): string {
  const and = ", ";
  const alternatives: string[][] = [];
  const seen = new Set<string>();
  for (const c of conditions) {
    const parts = conditionParts(c, lang, gen);
    const key = parts.join(and);
    if (seen.has(key)) continue;
    seen.add(key);
    alternatives.push(parts);
  }
  if (alternatives.length === 0) return "";
  if (alternatives.length === 1) return alternatives[0]!.join(and);

  const common = alternatives[0]!.filter((part) =>
    alternatives.every((alt) => alt.includes(part)),
  );
  const rests = alternatives.map((alt) =>
    alt.filter((part) => !common.includes(part)),
  );
  const restSet = new Set(rests.map((rest) => rest.join(and)));
  const has = (key: Parameters<typeof t>[1]) => restSet.has(t(lang, key));

  if (rests.every((rest) => rest.length === 1) && restSet.size === 2) {
    if (has("evo.gender.male") && has("evo.gender.female")) {
      return common.join(and);
    }
    if (has("evo.nature.amped") && has("evo.nature.lowKey")) {
      const either = t(lang, "evo.nature.either");
      return common.length > 0
        ? `${common.join(and)}: ${either}`
        : capitalize(either);
    }
  }

  const or = t(lang, "evo.or");
  if (common.length === 0 || rests.some((rest) => rest.length === 0)) {
    return alternatives.map((alt) => alt.join(and)).join(or);
  }
  return `${common.join(and)}: ${rests.map((rest) => rest.join(and)).join(or)}`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
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
