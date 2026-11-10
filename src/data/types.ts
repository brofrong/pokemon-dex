/**
 * A generation the site has a config entry for (see `src/lib/generations.ts`). Only
 * Black/White (`bw`, gen 5) is actually built; the other four are listed disabled in the
 * generation switcher.
 */
export type GenId = "rb" | "gs" | "rs" | "dp" | "bw";

/** The 18 modern type identifiers, as used by PokeAPI's `types.identifier`. */
export type TypeSlug =
  | "normal"
  | "fighting"
  | "flying"
  | "poison"
  | "ground"
  | "rock"
  | "bug"
  | "ghost"
  | "steel"
  | "fire"
  | "water"
  | "grass"
  | "electric"
  | "psychic"
  | "ice"
  | "dragon"
  | "dark"
  | "fairy";

/** Base stats in the fixed in-game order: HP, Attack, Defense, Sp. Atk, Sp. Def, Speed. */
export type Stats = [
  hp: number,
  atk: number,
  def: number,
  spa: number,
  spd: number,
  spe: number,
];

/** An ability a Pokémon can have in a given generation. */
export interface AbilityRef {
  slug: string;
  hidden: boolean;
}

/**
 * Attacker type -> defender type -> damage multiplier.
 * Only entries whose factor is not 1 (neutral) are stored.
 */
export type TypeChart = Record<TypeSlug, Partial<Record<TypeSlug, number>>>;

/** The damage multipliers that can result from combining type matchups. */
export type Multiplier = 0 | 0.25 | 0.5 | 1 | 2 | 4;

/**
 * One way to trigger an evolution. Multiple conditions on the same {@link EvoNode} are
 * alternatives ("or"): meeting any one of them is enough.
 */
export interface EvoCondition {
  trigger: "level-up" | "trade" | "use-item" | "shed" | "other";
  minLevel?: number;
  item?: string;
  heldItem?: string;
  minHappiness?: number;
  timeOfDay?: "day" | "night";
  knownMove?: string;
  knownMoveType?: TypeSlug;
  location?: string;
  gender?: "female" | "male";
  tradeSpecies?: string;
  relativeStats?: -1 | 0 | 1;
  partySpecies?: string;
  minBeauty?: number;
}

/** A species in an evolution chain, with the conditions that evolve it from its parent. */
export interface EvoNode {
  speciesId: number;
  slug: string;
  conditions: EvoCondition[];
  children: EvoNode[];
}

/** A badge shown on a Pokémon's card/detail page. */
export type Flag = "legendary" | "mythical" | "baby" | "new";

/** One form (regional/battle/cosmetic variant) of a species, as it exists in a generation. */
export interface Form {
  /** Sprite filename stem: the species id for the default form, `${speciesId}-${formSlug}` otherwise. */
  key: string;
  formSlug: string | null;
  types: TypeSlug[];
  stats: Stats;
  abilities: AbilityRef[];
  battleOnly: boolean;
  /** Shares its `pokemon_id` (and therefore its data) with the species' default form. */
  cosmetic: boolean;
}

/** A species as it exists in one generation, with its default form's data inlined. */
export interface Pokemon {
  id: number;
  slug: string;
  name: string; // English; RU comes from i18n
  genus: string; // English; RU comes from i18n
  types: TypeSlug[];
  stats: Stats;
  abilities: AbilityRef[];
  flags: Flag[];
  heightDm: number;
  weightHg: number;
  /** -1 for genderless, else the female eighths (e.g. 1 -> 1/8 female). */
  genderRate: number;
  eggGroups: string[];
  hatchCounter: number;
  captureRate: number;
  hasGenderDiff: boolean;
  /** Keyed by version slug (e.g. `black`, `white`). */
  flavor: Partial<Record<string, string>>;
  evolution: EvoNode;
  /** `forms[0]` is the default form. */
  forms: Form[];
}

/**
 * A sprite angle/shininess/gender combination the sprite pipeline (`scripts/sprites/build.ts`)
 * produces one file for, under `public/sprites/bw/{variant}/{key}.webp`.
 */
export type Variant =
  | "front"
  | "front-shiny"
  | "back"
  | "back-shiny"
  | "front-female"
  | "front-shiny-female"
  | "back-female"
  | "back-shiny-female";

/**
 * The variants encoded as a full animated WebP (keeping every frame of the upstream GIF). The
 * other four (`back*`) are a static lossless first-frame WebP -- Ruling R4 trades their
 * animation for a much smaller repo (~80 MB instead of ~170 MB).
 */
export const ANIMATED_VARIANTS: Variant[] = [
  "front",
  "front-shiny",
  "front-female",
  "front-shiny-female",
];

/** Pixel dimensions of one sprite image. */
export interface Size {
  w: number;
  h: number;
}

/**
 * The sprite pipeline's build manifest (`src/data/sprites/bw.json`), describing every sprite
 * file written under `public/sprites/bw/`. `canvas` is the logical box every sprite anchors
 * bottom-center into, at integer scale (`image-rendering: pixelated`).
 */
export interface SpriteManifest {
  canvas: 96;
  /** Keyed by `Form.key`; only the variants that actually exist for that form are present. */
  sprites: Record<string, Partial<Record<Variant, Size>>>;
  /**
   * First-frame atlases for the two non-gendered animated variants, one default-form cell per
   * species. Used for fast initial paint (list/search) before the per-sprite animated WebP is
   * fetched.
   */
  atlas: Record<
    "front" | "front-shiny",
    {
      file: string;
      width: number;
      height: number;
      /** Keyed by default form key (i.e. the species id as a string). */
      cells: Record<string, { x: number; y: number; w: number; h: number }>;
    }
  >;
}

/** The full generation-5 (Black/White) Pokédex dataset built by `scripts/data/build-gen.ts`. */
export interface GenData {
  gen: GenId;
  types: TypeSlug[];
  chart: TypeChart;
  pokemon: Pokemon[];
  /** English display names, keyed by slug; only slugs actually referenced are present. */
  names: {
    abilities: Record<string, string>;
    items: Record<string, string>;
    locations: Record<string, string>;
    moves: Record<string, string>;
    eggGroups: Record<string, string>;
  };
}
