/** A generation the site builds a Pokédex for. Only Black/White (gen 5) ships. */
export type GenId = "bw";

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
