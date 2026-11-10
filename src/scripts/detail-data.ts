/**
 * The shape of the `#pdx-forms` JSON payload the detail page embeds (built server-side by
 * `src/pages/[lang]/[gen]/pokemon/[slug]/index.astro`) and `src/scripts/detail.ts` reads to
 * switch forms (Rotom, Deerling, ...) without a network request. Types only -- no runtime code
 * -- so both sides stay in sync without duplicating the shape.
 */
import type { Multiplier, Size, Stats, TypeSlug, Variant } from "../data/types";

export interface FormPayload {
  /** Sprite filename stem; `""` form slug maps back to the default form. */
  key: string;
  formSlug: string;
  /** Localized display name for this form (species name for the default form). */
  name: string;
  types: TypeSlug[];
  stats: Stats;
  abilities: { name: string; small: string | null }[];
  /** Non-neutral matchups only (×1 is never displayed). */
  matchups: Partial<Record<TypeSlug, Multiplier>>;
  manifest: Partial<Record<Variant, Size>>;
}

export interface DetailPayload {
  /** Localized type display names, for every type the stats/matchups rows may reference. */
  typeNames: Record<TypeSlug, string>;
  /** Localized stat labels, in game order (hp, atk, def, spa, spd, spe), then "total". */
  statLabels: [string, string, string, string, string, string, string];
  forms: FormPayload[];
}
