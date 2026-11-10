import type { EvoCondition, EvoNode, TypeSlug } from "../../src/data/types";
import type { Tables } from "./fetch";

/** The generation-aware context `buildEvolutionTree` resolves conditions against. */
export interface EvolutionContext {
  gen: number;
  versionGroup: string;
  maxSpeciesId: number;
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

  return {
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
 * (the `order` of `ctx.versionGroup`).
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
function selectApplicableRows(rows: EvoRow[], targetOrder: number): EvoRow[] {
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

  const minHappiness = field(raw, "minimum_happiness");
  if (minHappiness) condition.minHappiness = Number(minHappiness);

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

  return condition;
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
      const rows = idx.evolutionRowsByEvolved.get(child.id) ?? [];
      const childConditions = selectApplicableRows(rows, targetOrder)
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

  const targetOrder = idx.versionGroupOrderByIdentifier.get(ctx.versionGroup);
  if (targetOrder === undefined) {
    throw new Error(`Unknown version group '${ctx.versionGroup}'`);
  }

  const members = idx.speciesByChain.get(chainId) ?? [];
  const root = members.find((species) => species.evolvesFrom === null);
  if (!root) {
    throw new Error(`No root species found for evolution chain ${chainId}`);
  }

  return buildNode(root, [], idx, ctx, targetOrder);
}
