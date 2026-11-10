/**
 * Upstream data sources are pinned by commit SHA so builds are reproducible.
 * Recorded 2026-11-10 via:
 *   gh api repos/PokeAPI/pokeapi/commits/master --jq .sha
 *   gh api repos/PokeAPI/sprites/commits/master --jq .sha
 */

/** Pinned commit SHA for https://github.com/PokeAPI/pokeapi. */
export const POKEAPI_SHA = "5cbeb3f3eb55a9b86da52c4869336f9d61fdd6d7";

/** Pinned commit SHA for https://github.com/PokeAPI/sprites. */
export const SPRITES_SHA = "1b3b7c0a538dd2226ae08d0d2f8955125075bbd4";
