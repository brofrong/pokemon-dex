import type { EvoCondition, EvoNode, TypeSlug } from "../../src/data/types";
import type { Tables } from "./fetch";

/** The generation-aware context `buildEvolutionTree` resolves conditions against. */
export interface EvolutionContext {
  gen: number;
  versionGroup: string;
  maxSpeciesId: number;
  /**
   * The `version_groups.order` evolution rows are resolved at, when it's later than
   * `versionGroup`'s own order -- e.g. Ultra Sun/Ultra Moon's dataset includes Let's Go's
   * Meltan/Melmetal, so it reads rows up to Let's Go. Defaults to `versionGroup`'s order.
   */
  maxOrder?: number;
}

const KNOWN_TRIGGERS = new Set<EvoCondition["trigger"]>([
  "level-up",
  "trade",
  "use-item",
  "shed",
]);

interface SpeciesRow {
  id: number;
  identifier: string;
  evolvesFrom: number | null;
  chainId: number;
}

/** A `pokemon_evolution` row paired with the `order` of the version group it targets. */
interface EvoRow {
  raw: Record<string, string>;
  /** `version_groups.order` of this row's `version_group_id`, or `null` when that field is
   * empty (a generic row not tied to any particular version group). */
  order: number | null;
}

interface TypeOrMoveRow {
  identifier: string;
  generationId: number;
}

interface EvolutionIndex {
  speciesById: Map<number, SpeciesRow>;
  speciesByChain: Map<number, SpeciesRow[]>;
  childrenByParent: Map<number, SpeciesRow[]>;
  evolutionRowsByEvolved: Map<number, EvoRow[]>;
  triggerIdentifierById: Map<number, string>;
  itemIdentifierById: Map<number, string>;
  moveById: Map<number, TypeOrMoveRow>;
  typeById: Map<number, TypeOrMoveRow>;
  locationIdentifierById: Map<number, string>;
  genderIdentifierById: Map<number, string>;
  versionGroupOrderByIdentifier: Map<string, number>;
  /** species id -> the `pokemon.id` of its default pokemon. */
  defaultPokemonBySpecies: Map<number, number>;
  /** `pokemon_forms.id` -> its `pokemon_id`. */
  pokemonByForm: Map<number, number>;
  /** `pokemon_forms.id` -> its `form_identifier`. */
  formIdentifierById: Map<number, string>;
}

const indexCache = new WeakMap<Tables, EvolutionIndex>();

function field(raw: Record<string, string>, key: string): string {
  return raw[key] ?? "";
}

function buildIndex(t: Tables): EvolutionIndex {
  const speciesById = new Map<number, SpeciesRow>();
  const childrenByParent = new Map<number, SpeciesRow[]>();
  const speciesByChain = new Map<number, SpeciesRow[]>();

  for (const row of t.pokemon_species) {
    const id = Number(row.id);
    const evolvesFromField = field(row, "evolves_from_species_id");
    const species: SpeciesRow = {
      id,
      identifier: row.identifier,
      evolvesFrom: evolvesFromField ? Number(evolvesFromField) : null,
      chainId: Number(row.evolution_chain_id),
    };
    speciesById.set(id, species);

    if (species.evolvesFrom !== null) {
      const siblings = childrenByParent.get(species.evolvesFrom) ?? [];
      siblings.push(species);
      childrenByParent.set(species.evolvesFrom, siblings);
    }

    const chainMembers = speciesByChain.get(species.chainId) ?? [];
    chainMembers.push(species);
    speciesByChain.set(species.chainId, chainMembers);
  }

  const versionGroupOrderById = new Map<number, number>();
  const versionGroupOrderByIdentifier = new Map<string, number>();
  for (const row of t.version_groups) {
    const order = Number(row.order);
    versionGroupOrderById.set(Number(row.id), order);
    versionGroupOrderByIdentifier.set(row.identifier, order);
  }

  const triggerIdentifierById = new Map<number, string>();
  for (const row of t.evolution_triggers) {
    triggerIdentifierById.set(Number(row.id), row.identifier);
  }

  const itemIdentifierById = new Map<number, string>();
  for (const row of t.items) {
    itemIdentifierById.set(Number(row.id), row.identifier);
  }

  const moveById = new Map<number, TypeOrMoveRow>();
  for (const row of t.moves) {
    moveById.set(Number(row.id), {
      identifier: row.identifier,
      generationId: Number(row.generation_id),
    });
  }

  const typeById = new Map<number, TypeOrMoveRow>();
  for (const row of t.types) {
    typeById.set(Number(row.id), {
      identifier: row.identifier,
      generationId: Number(row.generation_id),
    });
  }

  const locationIdentifierById = new Map<number, string>();
  for (const row of t.locations) {
    locationIdentifierById.set(Number(row.id), row.identifier);
  }

  const genderIdentifierById = new Map<number, string>();
  for (const row of t.genders) {
    genderIdentifierById.set(Number(row.id), row.identifier);
  }

  const evolutionRowsByEvolved = new Map<number, EvoRow[]>();
  for (const row of t.pokemon_evolution) {
    const evolvedSpeciesId = Number(row.evolved_species_id);
    const vgField = field(row, "version_group_id");
    const order = vgField
      ? (versionGroupOrderById.get(Number(vgField)) ?? null)
      : null;
    const rows = evolutionRowsByEvolved.get(evolvedSpeciesId) ?? [];
    rows.push({ raw: row, order });
    evolutionRowsByEvolved.set(evolvedSpeciesId, rows);
  }

  const defaultPokemonBySpecies = new Map<number, number>();
  for (const row of t.pokemon) {
    if (row.is_default === "1") {
      defaultPokemonBySpecies.set(Number(row.species_id), Number(row.id));
    }
  }

  const pokemonByForm = new Map<number, number>();
  const formIdentifierById = new Map<number, string>();
  for (const row of t.pokemon_forms) {
    pokemonByForm.set(Number(row.id), Number(row.pokemon_id));
    formIdentifierById.set(Number(row.id), row.form_identifier);
  }

  return {
    formIdentifierById,
    speciesById,
    speciesByChain,
    childrenByParent,
    evolutionRowsByEvolved,
    triggerIdentifierById,
    itemIdentifierById,
    moveById,
    typeById,
    locationIdentifierById,
    genderIdentifierById,
    versionGroupOrderByIdentifier,
    defaultPokemonBySpecies,
    pokemonByForm,
  };
}

function getIndex(t: Tables): EvolutionIndex {
  const cached = indexCache.get(t);
  if (cached) return cached;
  const built = buildIndex(t);
  indexCache.set(t, built);
  return built;
}

/**
 * Picks the `pokemon_evolution` row(s) for one evolved species that apply at `targetOrder`
 * (the `order` of `ctx.versionGroup`, or `ctx.maxOrder`).
 *
 * The winning version group is decided by rows about the species' own line only: a row whose
 * `evolved_pokemon_form_id`/`required_pokemon_form_id` names a form of a *non-default*
 * pokemon (Alolan Raichu, Hisuian Decidueye, Galarian Slowbro, ...) is a regional-form
 * evolution, and must not override the species' own method just because it was recorded in
 * a later version group (Sun/Moon's Alolan-Raichu row would otherwise replace Raichu's
 * Thunder Stone row from `sm` on). Cosmetic forms of the default pokemon (Deerling's seasons,
 * Flabébé's colors) count as the species' own line. Once the winning order is known, every
 * row at that order survives as an "or" alternative, own line or not (Burmy's three cloaks
 * into Wormadam, Midnight/Dusk Lycanroc next to Midday). Only when no own-line row applies
 * are all rows resolved together (Obstagoon, Perrserker, Clodsire, ... evolve only from a
 * regional form). See {@link selectByOrder} for how a set of rows is resolved by version
 * group.
 */
function selectApplicableRows(
  rows: EvoRow[],
  targetOrder: number,
  isOwnLine: (row: EvoRow) => boolean,
): EvoRow[] {
  const own = selectByOrder(rows.filter(isOwnLine), targetOrder);
  if (own.length === 0) return selectByOrder(rows, targetOrder);
  const winning = own[0]!.order;
  return rows.filter((row) => row.order === winning);
}

/**
 * Resolves one set of `pokemon_evolution` rows by version group.
 *
 * Each row's `version_group_id` marks the version group *from which* that evolution method
 * took effect; absent a later override for the same species, it keeps applying to every
 * version group after it. So the winning row is the one with the largest `order` that is
 * still <= `targetOrder` -- an exact version-group match beats an earlier row, which beats
 * one from further back, and a row for a version group introduced *after* the target never
 * wins (e.g. Sun/Moon's Alolan Raichu, or Sword/Shield's leaf-stone/ice-stone Eeveelutions,
 * don't apply in Black/White). Ties at the winning order (alternative methods introduced in
 * the same version group, e.g. an item vs. a trade) all survive as "or" conditions.
 *
 * A row with no `version_group_id` at all (empty string) is a generic, any-version-group
 * fallback; it is used only when no row has `order <= targetOrder`. This matches the task
 * brief's "equals ctx's version group, or, when there is none, empty" rule, generalized to
 * resolve by order rather than exact id: on real PokeAPI data almost no row has an empty
 * `version_group_id` at all (the field is only ever blank in hand-built test fixtures), and
 * most species have a single, non-empty, non-`black-white` row -- e.g. Charmander's and
 * Charmeleon's evolutions are recorded once, at `red-blue`, and were never revisited -- so
 * resolving purely by exact-id-or-empty would wrongly drop nearly every evolution in gen 5.
 */
function selectByOrder(rows: EvoRow[], targetOrder: number): EvoRow[] {
  let maxOrder = Number.NEGATIVE_INFINITY;
  const atOrBeforeTarget: EvoRow[] = [];
  for (const row of rows) {
    if (row.order !== null && row.order <= targetOrder) {
      atOrBeforeTarget.push(row);
      if (row.order > maxOrder) maxOrder = row.order;
    }
  }
  if (atOrBeforeTarget.length > 0) {
    return atOrBeforeTarget.filter((row) => row.order === maxOrder);
  }
  return rows.filter((row) => row.order === null);
}

/**
 * Friendship evolutions needed 220 through Gen VII; Gen VIII lowered it to 160 for every species
 * (QA bug #11: PokeAPI still records 220 for Pichu, Chingling and Swadloon).
 */
const LAST_GEN_WITH_FRIENDSHIP_220 = 7;
const FRIENDSHIP_FROM_GEN_8 = 160;

/**
 * Beauty (a Contest condition) stopped mattering for evolution after Gen VI: Sun/Moon onward
 * have no Pokéblocks or Contests, and Feebas evolves only by trading with a Prism Scale. Without
 * this, Omega Ruby/Alpha Sapphire's beauty row (the newest Milotic row) would leak into `sm`,
 * `swsh` and `sv`.
 */
const LAST_GEN_WITH_BEAUTY = 6;

/** Whether a row's requirement still exists in `gen` at all (see {@link LAST_GEN_WITH_BEAUTY}). */
function rowExistsIn(row: EvoRow, gen: number): boolean {
  return !(field(row.raw, "minimum_beauty") && gen > LAST_GEN_WITH_BEAUTY);
}

/** `pokemon_evolution` columns {@link buildCondition} turns into `EvoCondition` fields. */
const MAPPED_COLUMNS = new Set([
  "evolution_trigger_id",
  "minimum_level",
  "trigger_item_id",
  "held_item_id",
  "minimum_happiness",
  "time_of_day",
  "known_move_id",
  "known_move_type_id",
  "location_id",
  "gender_id",
  "trade_species_id",
  "relative_physical_stats",
  "party_species_id",
  "minimum_beauty",
  "needs_overworld_rain",
  "turn_upside_down",
  "party_type_id",
  "minimum_affection",
  "nature_bitmask",
  "used_move_id",
  "minimum_move_count",
  "minimum_steps",
  "minimum_damage_taken",
  "needs_multiplayer",
]);

/**
 * `pokemon_evolution` columns deliberately not turned into `EvoCondition` fields:
 *  - row bookkeeping and row selection (`id`, `evolved_species_id`, `version_group_id`,
 *    `is_default`, `region_id`, `required_pokemon_form_id`, `evolved_pokemon_form_id` -- see
 *    {@link selectApplicableRows});
 *  - `near_special_rock`: always paired with `location_id` (the Moss/Ice Rock's location),
 *    which is shown already;
 *  - `condition_expression`/`percentage_chance`: hidden personality-value/encryption-constant
 *    splits (Wurmple's 50/50 into Silcoon or Cascoon, Maushold's 1 % family of three,
 *    Alcremie's spin direction), which the player can't choose; each outcome stays its own
 *    "or" condition.
 */
const IGNORED_COLUMNS = new Set([
  "id",
  "evolved_species_id",
  "version_group_id",
  "is_default",
  "region_id",
  "required_pokemon_form_id",
  "evolved_pokemon_form_id",
  "near_special_rock",
  "condition_expression",
  "percentage_chance",
]);

/**
 * Fails the build when a selected row has a value in a column neither mapped nor deliberately
 * ignored, so a new PokeAPI requirement can't be silently dropped. `0` counts as empty (the flag
 * columns use it for "not required").
 */
function assertKnownColumns(raw: Record<string, string>): void {
  const unknown = Object.entries(raw)
    .filter(([, value]) => value !== "" && value !== "0")
    .map(([column]) => column)
    .filter(
      (column) => !MAPPED_COLUMNS.has(column) && !IGNORED_COLUMNS.has(column),
    );
  if (unknown.length > 0) {
    throw new Error(
      `[evolution] species ${field(raw, "evolved_species_id")}: unmapped pokemon_evolution column(s) ${unknown.join(", ")} -- map them in buildCondition or list them in IGNORED_COLUMNS`,
    );
  }
}

/** A flag column (`1` = required). */
function flag(raw: Record<string, string>, key: string): boolean {
  return field(raw, key) === "1";
}

/**
 * Builds one `EvoCondition` from a `pokemon_evolution` row, or `null` if the row references
 * a move or type not yet available in `gen` (e.g. a fairy-type `known_move_type_id`, or a
 * gen-6 `known_move_id`) -- see the module doc for why items and locations aren't checked
 * the same way.
 */
function buildCondition(
  raw: Record<string, string>,
  idx: EvolutionIndex,
  gen: number,
): EvoCondition | null {
  assertKnownColumns(raw);
  const triggerId = Number(field(raw, "evolution_trigger_id"));
  const triggerIdentifier = idx.triggerIdentifierById.get(triggerId);
  const trigger: EvoCondition["trigger"] =
    triggerIdentifier &&
    KNOWN_TRIGGERS.has(triggerIdentifier as EvoCondition["trigger"])
      ? (triggerIdentifier as EvoCondition["trigger"])
      : "other";

  const condition: EvoCondition = { trigger };

  const minLevel = field(raw, "minimum_level");
  if (minLevel) condition.minLevel = Number(minLevel);

  const triggerItemId = field(raw, "trigger_item_id");
  if (triggerItemId) {
    const item = idx.itemIdentifierById.get(Number(triggerItemId));
    if (item) condition.item = item;
  }

  const heldItemId = field(raw, "held_item_id");
  if (heldItemId) {
    const item = idx.itemIdentifierById.get(Number(heldItemId));
    if (item) condition.heldItem = item;
  }

  // The threshold is generation-wide, not per species: PokeAPI's own value (mostly 160, but
  // 220 for a few rows it never revisited) is only a flag that friendship is required.
  if (field(raw, "minimum_happiness")) {
    condition.minHappiness =
      gen <= LAST_GEN_WITH_FRIENDSHIP_220 ? 220 : FRIENDSHIP_FROM_GEN_8;
  }

  const timeOfDay = field(raw, "time_of_day");
  if (timeOfDay === "day" || timeOfDay === "night")
    condition.timeOfDay = timeOfDay;

  const knownMoveId = field(raw, "known_move_id");
  if (knownMoveId) {
    const move = idx.moveById.get(Number(knownMoveId));
    if (!move || move.generationId > gen) return null;
    condition.knownMove = move.identifier;
  }

  const knownMoveTypeId = field(raw, "known_move_type_id");
  if (knownMoveTypeId) {
    const type = idx.typeById.get(Number(knownMoveTypeId));
    if (!type || type.generationId > gen) return null;
    condition.knownMoveType = type.identifier as TypeSlug;
  }

  const locationId = field(raw, "location_id");
  if (locationId) {
    const location = idx.locationIdentifierById.get(Number(locationId));
    if (location) condition.location = location;
  }

  const genderId = field(raw, "gender_id");
  if (genderId) {
    const gender = idx.genderIdentifierById.get(Number(genderId));
    if (gender === "female" || gender === "male") condition.gender = gender;
  }

  const tradeSpeciesId = field(raw, "trade_species_id");
  if (tradeSpeciesId) {
    const species = idx.speciesById.get(Number(tradeSpeciesId));
    if (species) condition.tradeSpecies = species.identifier;
  }

  const relativeStats = field(raw, "relative_physical_stats");
  if (relativeStats)
    condition.relativeStats = Number(relativeStats) as -1 | 0 | 1;

  const partySpeciesId = field(raw, "party_species_id");
  if (partySpeciesId) {
    const species = idx.speciesById.get(Number(partySpeciesId));
    if (species) condition.partySpecies = species.identifier;
  }

  const minBeauty = field(raw, "minimum_beauty");
  if (minBeauty) condition.minBeauty = Number(minBeauty);

  if (flag(raw, "needs_overworld_rain")) condition.needsRain = true;
  if (flag(raw, "turn_upside_down")) condition.upsideDown = true;
  if (flag(raw, "needs_multiplayer")) condition.needsMultiplayer = true;

  const partyTypeId = field(raw, "party_type_id");
  if (partyTypeId) {
    const type = idx.typeById.get(Number(partyTypeId));
    if (!type || type.generationId > gen) return null;
    condition.partyType = type.identifier as TypeSlug;
  }

  const minAffection = field(raw, "minimum_affection");
  if (minAffection) condition.minAffection = Number(minAffection);

  // The nature bitmask splits Toxtricity's two forms; name the group after the form it yields.
  if (field(raw, "nature_bitmask")) {
    const form = idx.formIdentifierById.get(
      Number(field(raw, "evolved_pokemon_form_id")),
    );
    if (form !== "amped" && form !== "low-key") {
      throw new Error(
        `[evolution] species ${field(raw, "evolved_species_id")}: nature_bitmask on a row evolving into form '${form ?? ""}' (expected amped/low-key)`,
      );
    }
    condition.nature = form;
  }

  const usedMoveId = field(raw, "used_move_id");
  if (usedMoveId) {
    const move = idx.moveById.get(Number(usedMoveId));
    if (!move || move.generationId > gen) return null;
    condition.usedMove = move.identifier;
    const count = field(raw, "minimum_move_count");
    if (count) condition.usedMoveCount = Number(count);
  }

  const minSteps = field(raw, "minimum_steps");
  if (minSteps) condition.minSteps = Number(minSteps);

  const minDamageTaken = field(raw, "minimum_damage_taken");
  if (minDamageTaken) condition.minDamageTaken = Number(minDamageTaken);

  return condition;
}

/**
 * Whether the `pokemon_forms.id` in `formIdField` (if any) is a form of `speciesId`'s default
 * pokemon. An empty field, or a form/species the tables don't know, counts as `true`.
 */
function isFormOfDefault(
  idx: EvolutionIndex,
  formIdField: string,
  speciesId: number,
): boolean {
  if (!formIdField) return true;
  const pokemonId = idx.pokemonByForm.get(Number(formIdField));
  const defaultPokemonId = idx.defaultPokemonBySpecies.get(speciesId);
  if (pokemonId === undefined || defaultPokemonId === undefined) return true;
  return pokemonId === defaultPokemonId;
}

function targetOrderFor(idx: EvolutionIndex, ctx: EvolutionContext): number {
  const order = idx.versionGroupOrderByIdentifier.get(ctx.versionGroup);
  if (order === undefined) {
    throw new Error(`Unknown version group '${ctx.versionGroup}'`);
  }
  return Math.max(order, ctx.maxOrder ?? order);
}

function buildNode(
  species: SpeciesRow,
  conditions: EvoCondition[],
  idx: EvolutionIndex,
  ctx: EvolutionContext,
  targetOrder: number,
): EvoNode {
  const children = (idx.childrenByParent.get(species.id) ?? [])
    .filter((child) => child.id <= ctx.maxSpeciesId)
    .sort((a, b) => a.id - b.id)
    .map((child) => {
      const rows = (idx.evolutionRowsByEvolved.get(child.id) ?? []).filter(
        (row) => rowExistsIn(row, ctx.gen),
      );
      // A region-scoped row (`region_id`: Alola, Galar, Hisui) describes how the species
      // evolves *in that region's game*, e.g. Hisui's Cyndaquil at level 17 -- never the
      // species' own method elsewhere.
      const isOwnLine = (row: EvoRow) =>
        !field(row.raw, "region_id") &&
        isFormOfDefault(
          idx,
          field(row.raw, "evolved_pokemon_form_id"),
          child.id,
        ) &&
        isFormOfDefault(
          idx,
          field(row.raw, "required_pokemon_form_id"),
          species.id,
        );
      const childConditions = selectApplicableRows(rows, targetOrder, isOwnLine)
        .map((row) => buildCondition(row.raw, idx, ctx.gen))
        .filter((condition): condition is EvoCondition => condition !== null);
      return buildNode(child, childConditions, idx, ctx, targetOrder);
    });

  return {
    speciesId: species.id,
    slug: species.identifier,
    conditions,
    children,
  };
}

/**
 * Builds the evolution tree for `chainId` as it looks in `ctx`: species with an id above
 * `ctx.maxSpeciesId` are dropped together with their whole subtree, and each surviving
 * species' evolution conditions are resolved for `ctx.versionGroup` (see
 * {@link selectApplicableRows} and {@link buildCondition} for the generation-awareness
 * rules).
 */
export function buildEvolutionTree(
  chainId: number,
  ctx: EvolutionContext,
  t: Tables,
): EvoNode {
  const idx = getIndex(t);
  const targetOrder = targetOrderFor(idx, ctx);

  const members = idx.speciesByChain.get(chainId) ?? [];
  const root = members.find((species) => species.evolvesFrom === null);
  if (!root) {
    throw new Error(`No root species found for evolution chain ${chainId}`);
  }

  return buildNode(root, [], idx, ctx, targetOrder);
}

/**
 * The species `speciesId`'s evolution tree is rooted at in a generation capped at
 * `maxSpeciesId`: its oldest ancestor that still exists there. A pre-evolution added in a
 * later generation (Pichu for Pikachu in gen I, Budew for Roselia in gen III) is cut off, so
 * the tree starts at the first species that existed -- and siblings whose shared baby is cut
 * off (Hitmonlee/Hitmonchan without Tyrogue) become separate trees.
 */
export function evolutionRoot(
  speciesId: number,
  maxSpeciesId: number,
  t: Tables,
): number {
  const idx = getIndex(t);
  let current = idx.speciesById.get(speciesId);
  if (!current) throw new Error(`Unknown species ${speciesId}`);
  while (current.evolvesFrom !== null && current.evolvesFrom <= maxSpeciesId) {
    const parent = idx.speciesById.get(current.evolvesFrom);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

/**
 * Builds the evolution tree `speciesId` belongs to, as it looks in `ctx` (same rules as
 * {@link buildEvolutionTree}), rooted at {@link evolutionRoot}.
 */
export function buildEvolutionTreeFor(
  speciesId: number,
  ctx: EvolutionContext,
  t: Tables,
): EvoNode {
  const idx = getIndex(t);
  const targetOrder = targetOrderFor(idx, ctx);
  const root = idx.speciesById.get(
    evolutionRoot(speciesId, ctx.maxSpeciesId, t),
  );
  if (!root) throw new Error(`Unknown species ${speciesId}`);
  return buildNode(root, [], idx, ctx, targetOrder);
}
