/**
 * Upstream data sources are pinned by commit SHA so builds are reproducible.
 * Recorded 2026-11-10 via:
 *   gh api repos/PokeAPI/pokeapi/commits/master --jq .sha
 *   gh api repos/PokeAPI/sprites/commits/master --jq .sha
 *   gh api repos/partywhale/pokemon-type-icons/commits/main --jq .sha
 */

/** Pinned commit SHA for https://github.com/PokeAPI/pokeapi. */
export const POKEAPI_SHA = "5cbeb3f3eb55a9b86da52c4869336f9d61fdd6d7";

/** Pinned commit SHA for https://github.com/PokeAPI/sprites. */
export const SPRITES_SHA = "1b3b7c0a538dd2226ae08d0d2f8955125075bbd4";

/**
 * Pinned commit SHA for https://github.com/PokeMiners/pogo_assets, the source of the
 * official Russian Pokémon GO localization (names, genus/category text and form names)
 * mined from the game client. Per controller Ruling R8 this replaces Bulbapedia as the
 * Russian-name source for Task 6.
 */
export const POGO_ASSETS_SHA = "db10df75d6f6f92018d9786af0aecc238fecc4ef";

/**
 * Pinned commit SHA for https://github.com/partywhale/pokemon-type-icons (MIT), the source of
 * the 18 type icon SVGs vendored under `src/assets/types/`.
 */
export const TYPE_ICONS_SHA = "fcbe6978c61c359680bc07636c3f9bdc0f346b43";
