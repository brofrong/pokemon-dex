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
 * One {@link EvoCondition}'s display phrase, e.g. `"Ур. 16"` or `"Огненный камень"`. A condition
 * can carry several simultaneously-required fields (e.g. a level *and* a stat comparison); each
 * recognized field contributes one segment, joined with `" / "`. A condition with no recognized
 * field (or `trigger === 'other'`) falls back to a generic "special condition" phrase.
 */
export function formatCondition(
  c: EvoCondition,
  lang: Lang,
  gen: GenData,
): string {
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

  if (c.minHappiness != null) {
    if (c.timeOfDay === "day") parts.push(t(lang, "evo.happinessDay"));
    else if (c.timeOfDay === "night") parts.push(t(lang, "evo.happinessNight"));
    else parts.push(t(lang, "evo.happiness"));
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

  return parts.join(" / ");
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
