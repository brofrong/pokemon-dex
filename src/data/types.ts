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
