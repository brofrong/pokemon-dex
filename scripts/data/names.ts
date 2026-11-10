import type { GenData } from "../../src/data/types";
import type { Tables } from "./fetch";

/** Slugs actually referenced by the built dataset, collected while walking its Pokémon. */
export interface ReferencedNames {
  abilities: Set<string>;
  items: Set<string>;
  locations: Set<string>;
  moves: Set<string>;
  eggGroups: Set<string>;
}

export function emptyReferencedNames(): ReferencedNames {
  return {
    abilities: new Set(),
    items: new Set(),
    locations: new Set(),
    moves: new Set(),
    eggGroups: new Set(),
  };
}

/** Falls back to a title-cased slug (`fast-flying` -> `Fast Flying`) when no name is found. */
function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * English egg-group display names. PokeAPI's CSV export has no `egg_group_names`/
 * `egg_group_prose` table at all, so these are hand-mapped from `egg_groups.csv`'s
 * identifiers to the names the games actually show (which don't always match the
 * identifier -- e.g. `ground` is shown as "Field", `plant` as "Grass").
 */
const EGG_GROUP_NAMES: Record<string, string> = {
  monster: "Monster",
  water1: "Water 1",
  bug: "Bug",
  flying: "Flying",
  ground: "Field",
  fairy: "Fairy",
  plant: "Grass",
  humanshape: "Human-Like",
  water3: "Water 3",
  mineral: "Mineral",
  indeterminate: "Amorphous",
  water2: "Water 2",
  ditto: "Ditto",
  dragon: "Dragon",
  "no-eggs": "Undiscovered",
};

/** Looks up each referenced egg group's display name, falling back to a title-cased slug. */
function buildEggGroupNames(referenced: Set<string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const slug of referenced) {
    const name = EGG_GROUP_NAMES[slug];
    if (name) {
      result[slug] = name;
    } else {
      result[slug] = titleCase(slug);
      console.warn(
        `[build-gen] missing English egg group name for "${slug}"; using "${result[slug]}"`,
      );
    }
  }
  return result;
}

/** Builds an English-name lookup for one category, keyed by slug, limited to `referenced`. */
function buildCategory(
  category: string,
  referenced: Set<string>,
  idRows: Record<string, string>[],
  nameRows: Record<string, string>[],
  nameIdField: string,
): Record<string, string> {
  const idByIdentifier = new Map<string, number>();
  for (const row of idRows) idByIdentifier.set(row.identifier, Number(row.id));

  const englishById = new Map<number, string>();
  for (const row of nameRows) {
    if (row.local_language_id === "9") {
      englishById.set(Number(row[nameIdField]), row.name);
    }
  }

  const result: Record<string, string> = {};
  for (const slug of referenced) {
    const id = idByIdentifier.get(slug);
    const name = id !== undefined ? englishById.get(id) : undefined;
    if (name) {
      result[slug] = name;
    } else {
      result[slug] = titleCase(slug);
      console.warn(
        `[build-gen] missing English ${category} name for "${slug}"; using "${result[slug]}"`,
      );
    }
  }
  return result;
}

/** Builds `GenData.names`: English display names for only the slugs referenced in the data. */
export function buildNames(
  referenced: ReferencedNames,
  t: Tables,
): GenData["names"] {
  return {
    abilities: buildCategory(
      "ability",
      referenced.abilities,
      t.abilities,
      t.ability_names,
      "ability_id",
    ),
    items: buildCategory(
      "item",
      referenced.items,
      t.items,
      t.item_names,
      "item_id",
    ),
    locations: buildCategory(
      "location",
      referenced.locations,
      t.locations,
      t.location_names,
      "location_id",
    ),
    moves: buildCategory(
      "move",
      referenced.moves,
      t.moves,
      t.move_names,
      "move_id",
    ),
    eggGroups: buildEggGroupNames(referenced.eggGroups),
  };
}
