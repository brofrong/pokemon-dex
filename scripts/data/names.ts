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
    abilityEffects: buildAbilityEffects(referenced.abilities, t),
  };
}

/**
 * Turns PokeAPI prose markup into plain text: `[label]{kind:slug}` becomes `label`, and an
 * unlabeled `[]{kind:slug}` becomes the slug with dashes as spaces. Runs of whitespace collapse
 * to one space.
 */
export function stripProseMarkup(text: string): string {
  return text
    .replace(
      /\[([^\]]*)\]\{[^:}]*:([^}]*)\}/g,
      (_, label: string, slug: string) => label || slug.replace(/-/g, " "),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Overrides for upstream PokeAPI English ability-effect text known to be wrong, checked before
 * the `ability_prose`/`ability_flavor_text` lookup below. Keyed by ability slug.
 *
 * `cotton-down`: PokeAPI's `ability_prose` short_effect for this ability is a verbatim copy of
 * Stalwart's text ("Ignores moves and abilities that draw in moves" / ends up as "When Ignores
 * moves and abilities that draw in moves." once another override is layered on top upstream) —
 * Cotton Down's real mechanic (scatters cotton fluff, lowering every other Pokémon's Speed one
 * stage when the bearer is hit) has nothing to do with redirect immunity. Replaced with an
 * accurate description written in the same terse PokeAPI "short effect" style as the rest of
 * this table, so it reads consistently with every other entry here.
 */
const ABILITY_EFFECT_OVERRIDES: Record<string, string> = {
  "cotton-down":
    "When hit by an attack, scatters cotton fluff and lowers the Speed of all other Pokémon on the field by one stage.",
};

/**
 * English (language 9) short effect of each referenced ability, from `ability_prose` (unless
 * overridden above). An ability with no English prose falls back to its newest English
 * `ability_flavor_text` (the in-game description) with a warning; one with neither fails the
 * build.
 */
function buildAbilityEffects(
  referenced: Set<string>,
  t: Tables,
): Record<string, string> {
  const idByIdentifier = new Map<string, number>();
  for (const row of t.abilities)
    idByIdentifier.set(row.identifier, Number(row.id));

  const proseById = new Map<number, string>();
  for (const row of t.ability_prose) {
    if (row.local_language_id === "9" && row.short_effect) {
      proseById.set(Number(row.ability_id), row.short_effect);
    }
  }

  // "Newest" is by `version_groups.order`: ids aren't chronological (e.g. 28 = red-green-japan).
  const versionGroupOrder = new Map<string, number>();
  for (const row of t.version_groups) {
    versionGroupOrder.set(row.id, Number(row.order));
  }
  const flavorById = new Map<number, { order: number; text: string }>();
  for (const row of t.ability_flavor_text) {
    if (row.language_id !== "9") continue;
    const id = Number(row.ability_id);
    const order = versionGroupOrder.get(row.version_group_id) ?? 0;
    const previous = flavorById.get(id);
    if (!previous || order > previous.order) {
      flavorById.set(id, { order, text: row.flavor_text });
    }
  }

  const result: Record<string, string> = {};
  for (const slug of referenced) {
    if (ABILITY_EFFECT_OVERRIDES[slug]) {
      result[slug] = ABILITY_EFFECT_OVERRIDES[slug];
      continue;
    }
    const id = idByIdentifier.get(slug);
    const prose = id !== undefined ? proseById.get(id) : undefined;
    if (prose) {
      result[slug] = stripProseMarkup(prose);
      continue;
    }
    const flavor = id !== undefined ? flavorById.get(id) : undefined;
    if (!flavor) {
      throw new Error(
        `[build-gen] no English effect text for ability "${slug}"`,
      );
    }
    result[slug] = stripProseMarkup(flavor.text);
    console.warn(
      `[build-gen] no English short effect for ability "${slug}"; using its flavor text`,
    );
  }
  return result;
}
