/**
 * A generation the site has a config entry for (see `src/lib/generations.ts`), one per main
 * series generation I-IX. Each has its own dataset under `src/data/gen/{id}.json`.
 */
export type GenId =
  "rb" | "gs" | "rs" | "dp" | "bw" | "xy" | "sm" | "swsh" | "sv";

/**
 * A sprite set: the pixel sets of generations I-V (`rb`, `gs`, `rs`, `dp`, `bw`) and the
 * Pokémon HOME renders (`home`) shared by generations VI-IX. Sprites live under
 * `public/sprites/{set}/`, described by the manifest `src/data/sprites/{set}.json`.
 */
export type SpriteSetId = "rb" | "gs" | "rs" | "dp" | "bw" | "home";

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
  /** Level up while it's raining in the overworld (Goodra). */
  needsRain?: true;
  /** Level up with the console held upside down (Malamar). */
  upsideDown?: true;
  /** Level up with a Pokémon of this type in the party (Pangoro: Dark). */
  partyType?: TypeSlug;
  /** Minimum Pokémon-Amie/Refresh affection hearts (Sylveon in Gen VI-VII). */
  minAffection?: number;
  /** Which nature group evolves into this form (Toxtricity: Amped or Low Key). */
  nature?: "amped" | "low-key";
  /** A move that must be used `usedMoveCount` times (Wyrdeer, Overqwil, Annihilape). */
  usedMove?: string;
  usedMoveCount?: number;
  /** Steps walked with it outside its Poké Ball (Pawmot, Brambleghast, Rabsca). */
  minSteps?: number;
  /** HP of damage taken without fainting (Runerigus, Basculegion). */
  minDamageTaken?: number;
  /** Level up while connected to other players in the Union Circle (Palafin). */
  needsMultiplayer?: true;
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
  /**
   * PokeAPI `pokemon.id` this form's data comes from: the species id for default forms, 10001+
   * for forms with their own data (megas, regional forms, ...). Cosmetic forms share their
   * species' default `pokemonId`. Pokémon HOME names its sprite files by this id.
   */
  pokemonId: number;
  formSlug: string | null;
  types: TypeSlug[];
  stats: Stats;
  abilities: AbilityRef[];
  battleOnly: boolean;
  /** Shares its `pokemon_id` (and therefore its data) with the species' default form. */
  cosmetic: boolean;
}

/**
 * A species as it exists in one generation, with its default form's data inlined.
 *
 * Data a generation's games didn't have is represented explicitly, so pages can hide the
 * section instead of showing an empty or made-up value (see `GenConfig.features`):
 *  - Generation I (no breeding, no genders): `genderRate` and `hatchCounter` are `null`,
 *    `eggGroups` is `[]`, `hasGenderDiff` is `false`.
 *  - Generations I-II (no abilities): `abilities` is `[]` here and on every form, and
 *    `GenData.names.abilities`/`abilityEffects` are `{}`.
 *  - Generations III-IV (no hidden abilities): no `AbilityRef` has `hidden: true`.
 */
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
  /**
   * -1 for genderless, else the female eighths (e.g. 1 -> 1/8 female). `null` in generation I,
   * which had no genders.
   */
  genderRate: number | null;
  /** Egg group slugs; `[]` in generation I, which had no breeding. */
  eggGroups: string[];
  /** Egg cycles; `null` in generation I, which had no breeding. */
  hatchCounter: number | null;
  captureRate: number;
  hasGenderDiff: boolean;
  /**
   * English Pokédex text keyed by version slug (e.g. `black`, `white`). Holds the generation's
   * own version pair where those games have text; when neither does, it holds exactly one
   * entry, from the first version in `GenConfig.flavorVersions` that has text (e.g. a fallback
   * `sword` or `legends-arceus` entry in `sv`), so the key doubles as the source label.
   */
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

/** One generation's full Pokédex dataset (`src/data/gen/{id}.json`), built by `scripts/data/build-gen.ts`. */
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
    /**
     * English short effect of each referenced ability (PokeAPI `ability_prose.short_effect`,
     * markup stripped to plain text), keyed by ability slug like `abilities`.
     */
    abilityEffects: Record<string, string>;
  };
}
