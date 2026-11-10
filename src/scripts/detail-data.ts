/**
 * The shape of the `#pdx-forms` JSON payload the detail page embeds (built server-side by
 * `src/pages/[lang]/[gen]/pokemon/[slug]/index.astro`) and `src/scripts/detail.ts` reads to
 * switch forms (Rotom, Deerling, ...) without a network request. Types only -- no runtime code
 * -- so both sides stay in sync without duplicating the shape.
 */
import type {
  GenId,
  Multiplier,
  Size,
  Stats,
  TypeSlug,
  Variant,
} from "../data/types";

export interface FormPayload {
  /** Sprite filename stem; `""` form slug maps back to the default form. */
  key: string;
  formSlug: string;
  /** Localized display name for this form (species name for the default form). */
  name: string;
  types: TypeSlug[];
  stats: Stats;
  /** `effect` is the localized short effect text (`abilityEffect`), shown inside the `<details>`. */
  abilities: { name: string; small: string | null; effect: string }[];
  /** Non-neutral matchups only (×1 is never displayed). */
  matchups: Partial<Record<TypeSlug, Multiplier>>;
  /** Pixel sizes of this form's sprite variants, minus what the generation rules out (`gateVariants`). */
  manifest: Partial<Record<Variant, Size>>;
}

export interface DetailPayload {
  /** The generation's sprite directory, e.g. `/pokemon-dex/sprites/home/`. */
  sprites: string;
  /** Whether that set is pixel art (native size) or a 2x smooth render (`displaySize`). */
  pixelated: boolean;
  /** Localized type display names, for every type the stats/matchups rows may reference. */
  typeNames: Record<TypeSlug, string>;
  /** Localized stat labels, in game order (hp, atk, def, spa, spd, spe), then "total". */
  statLabels: [string, string, string, string, string, string, string];
  forms: FormPayload[];
  /**
   * Every enabled generation this same species (matched by national dex id) exists in --
   * `detail.ts` passes this as `switchGenUrl`'s `existsIn` for the generation switcher links,
   * so a live form switch can recompute them without a network request (QA #6).
   */
  speciesGens: GenId[];
  /**
   * For each non-default form slug of this species, the enabled generations whose dataset has
   * that same form -- `detail.ts` passes this as `switchGenUrl`'s `formExistsIn`, so switching
   * generation keeps `?form=` only where the target generation actually has that form (QA #6,
   * e.g. Rotom's Heat form: dp/bw/xy/sm/swsh/sv, not rb/gs/rs).
   */
  formGens: Partial<Record<string, GenId[]>>;
}
