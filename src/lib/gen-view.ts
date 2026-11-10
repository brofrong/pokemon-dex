/**
 * Pure, build-time view-model helpers deciding what a page shows for a generation: which
 * detail-page sections and sprite toggles exist (`GenConfig.features` plus the data itself), which
 * flag chips the list offers, and which Pokédex entries (with which labels) the detail page
 * prints. The Astro components only render what these return, so the per-generation rules
 * (constraints' Review Focus #1: gen I has no abilities, gender, eggs or shiny; HOME generations
 * have no back sprites) are unit tested here (`tests/lib/gen-view.test.ts`) instead of through a
 * rendered page, which `bun test` can't do.
 *
 * Imports `i18n/names` (all the Russian dictionaries), so never import this from a client script.
 */
import type { Flag, Pokemon, Size, Variant } from "../data/types";
import type { GenConfig, GenFeatures } from "./generations";
import type { Lang } from "../i18n/ui";
import { t } from "../i18n/ui";
import { flavorText, versionName } from "../i18n/names";

export { displaySize } from "./sprites";

/** Which optional detail-page blocks render for one species in one generation. */
export interface DetailSections {
  /** The abilities list (gen III+; and only if the species actually has one). */
  abilities: boolean;
  /** The "hidden" badge on a hidden ability (gen V+). */
  hiddenBadge: boolean;
  /** The hero's gender row (gen II+). */
  gender: boolean;
  /** Egg groups / egg cycles (gen II+): the breeding box and the hero's egg row. */
  breeding: boolean;
}

export function detailSections(
  features: GenFeatures,
  p: Pokemon,
): DetailSections {
  return {
    abilities:
      features.abilities && p.forms.some((f) => f.abilities.length > 0),
    hiddenBadge: features.hiddenAbilities,
    gender: features.breeding && p.genderRate !== null,
    breeding:
      features.breeding && (p.eggGroups.length > 0 || p.hatchCounter !== null),
  };
}

/** Which of the hero's shiny/back/gender toggles render for a form's sprite manifest entry. */
export function variantToggles(
  features: GenFeatures,
  entry: Partial<Record<Variant, Size>>,
): { shiny: boolean; back: boolean; female: boolean } {
  return {
    shiny: features.shiny && Boolean(entry["front-shiny"]),
    back: features.back && Boolean(entry.back),
    female: Boolean(entry["front-female"]),
  };
}

/**
 * A form's sprite manifest entry minus the variants the generation's features rule out (back
 * sprites in HOME generations, shiny in gen I) -- what the detail page's `#pdx-forms` payload
 * carries, so `detail.ts`'s own `availableVariants`/`variantFor` agree with {@link variantToggles}.
 */
export function gateVariants(
  features: GenFeatures,
  entry: Partial<Record<Variant, Size>>,
): Partial<Record<Variant, Size>> {
  const out: Partial<Record<Variant, Size>> = {};
  for (const [variant, size] of Object.entries(entry) as [Variant, Size][]) {
    if (!features.back && variant.startsWith("back")) continue;
    if (!features.shiny && variant.includes("shiny")) continue;
    out[variant] = size;
  }
  return out;
}

const FLAG_ORDER: readonly Flag[] = ["legendary", "mythical", "baby", "new"];

/**
 * The flag chips worth offering on a generation's list page, in display order: only flags some
 * but not all of its species have -- in gen I every species is "new" and none is a baby, so
 * those two chips (and the matching card pills) would filter nothing.
 */
export function flagChips(pokemon: Pokemon[]): Flag[] {
  return FLAG_ORDER.filter((flag) => {
    const n = pokemon.filter((p) => p.flags.includes(flag)).length;
    return n > 0 && n < pokemon.length;
  });
}

/** One labeled Pokédex text on the detail page. */
export interface DexEntry {
  /** Version name ("Red", "Sword", ...) or "Pokémon GO". */
  label: string;
  text: string;
  /** Tag background: the version's color for the generation's own pair, `null` (neutral) otherwise. */
  bg: string | null;
}

/**
 * The Pokédex texts the detail page shows for `p` in `gen`:
 *  - the generation's own version pair, each labeled and colored, where those games have text;
 *  - otherwise the one fallback version's text (`Pokemon.flavor`'s single entry), labeled with
 *    that version so it's never passed off as the generation's own;
 *  - Russian outside Black/White: one text from `flavorText` -- Pokémon GO's description labeled
 *    «Pokémon GO», or (when GO has none) our translation labeled with the source version.
 */
export function pokedexEntries(
  lang: Lang,
  p: Pokemon,
  gen: GenConfig,
): DexEntry[] {
  const own = gen.versions.filter((v) => p.flavor[v]);
  const source = own[0] ?? Object.keys(p.flavor)[0];
  if (!source) return [];

  if (lang === "ru" && gen.id !== "bw") {
    const r = flavorText(lang, p, source, gen.id);
    return [
      {
        label:
          r.source === "go"
            ? t(lang, "flavor.sourceGo")
            : versionName(lang, source),
        text: r.text,
        bg: null,
      },
    ];
  }

  if (own.length === 0) {
    return [
      {
        label: versionName(lang, source),
        text: flavorText(lang, p, source, gen.id).text,
        bg: null,
      },
    ];
  }
  return own.map((v) => ({
    label: versionName(lang, v),
    text: flavorText(lang, p, v, gen.id).text,
    bg: gen.colors[gen.versions.indexOf(v)] ?? null,
  }));
}

/** Dark or white text, whichever reads better on the `#rrggbb` background `hex`. */
export function readableTextOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Perceived brightness (ITU-R BT.601 weights), 0-255.
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  return brightness > 150 ? "#17171a" : "#fff";
}
