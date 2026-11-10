import type {
  AbilityRef,
  Multiplier,
  Stats,
  TypeChart,
  TypeSlug,
} from "../../src/data/types";
import type { Tables } from "./fetch";

/**
 * Rule for every `*_past` table: a row with `generation_id = G` holds the value that was
 * valid up to and including generation G. To resolve a value for a target `gen`, take the
 * rows whose `generation_id >= gen` and use the one with the smallest such `generation_id`
 * (the earliest later change still covers `gen`); if none qualifies, the current (non-past)
 * table holds the value. `pokemon_abilities_past` overrides per ability slot, and an empty
 * `ability_id` means that slot did not exist yet in that generation (the slot is dropped).
 * `pokemon_stats_past` overrides per stat, independently of the others. `pokemon_types_past`
 * is different: its rows for a given `generation_id` are not per-slot overrides but describe
 * the pokemon's *complete* typing at that generation (e.g. Jigglypuff's single gen-5 row,
 * slot 1 = Normal, means it was mono-Normal then, full stop) -- so when a past generation
 * applies, its rows *replace* the current typing wholesale rather than merge with it slot by
 * slot; a slot that only exists in the current table (like today's Fairy secondary type on
 * Jigglypuff, Marill, Gardevoir, etc.) must not survive into a past generation whose rows
 * don't mention it. `type_efficacy_past` overrides per (attacker type, defender type) pair
 * under the generation-matching rule above; its `damage_factor` (like the current table's)
 * is a percentage, e.g. `200` -> `2`.
 *
 * Generation I had a single Special stat instead of Sp. Atk/Sp. Def: `pokemon_stats_past`
 * records it as `stat_id` 9 (`special`) with `generation_id` 1, and when it applies it fills
 * both the Sp. Atk and Sp. Def slots of {@link Stats}. Abilities whose own
 * `abilities.generation_id` is later than the target generation are dropped (a safety net on
 * top of `pokemon_abilities_past`).
 */

const STAT_IDS = [1, 2, 3, 4, 5, 6] as const;
const SPECIAL_STAT_ID = 9;
const SP_ATK_STAT_ID = 4;
const SP_DEF_STAT_ID = 5;

interface TypeRow {
  identifier: string;
  generationId: number;
}

interface PastStatRow {
  generationId: number;
  base: number;
}

interface CurrentAbility {
  abilityId: number;
  hidden: boolean;
}

interface PastAbilityRow {
  generationId: number;
  abilityId: number | null;
  hidden: boolean;
}

interface PastEfficacyRow {
  generationId: number;
  factor: number;
}

interface ResolveIndex {
  typesById: Map<number, TypeRow>;
  abilitiesById: Map<number, string>;
  /** `abilities.generation_id` by ability id. */
  abilityGenerationById: Map<number, number>;
  typesByPokemon: Map<number, Map<number, number>>;
  /**
   * pokemonId -> generationId -> (slot -> typeId), the complete past typing valid up to and
   * including that generation (see the `pokemon_types_past` note on the doc comment above).
   */
  typesPastByPokemon: Map<number, Map<number, Map<number, number>>>;
  statsByPokemon: Map<number, Map<number, number>>;
  statsPastByPokemon: Map<number, Map<number, PastStatRow[]>>;
  abilitiesByPokemon: Map<number, Map<number, CurrentAbility>>;
  abilitiesPastByPokemon: Map<number, Map<number, PastAbilityRow[]>>;
  efficacy: Map<string, number>;
  efficacyPast: Map<string, PastEfficacyRow[]>;
}

const indexCache = new WeakMap<Tables, ResolveIndex>();

function efficacyKey(damageTypeId: number, targetTypeId: number): string {
  return `${damageTypeId}:${targetTypeId}`;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

function buildIndex(t: Tables): ResolveIndex {
  const typesById = new Map<number, TypeRow>();
  for (const row of t.types) {
    typesById.set(Number(row.id), {
      identifier: row.identifier,
      generationId: Number(row.generation_id),
    });
  }

  const abilitiesById = new Map<number, string>();
  const abilityGenerationById = new Map<number, number>();
  for (const row of t.abilities) {
    abilitiesById.set(Number(row.id), row.identifier);
    abilityGenerationById.set(Number(row.id), Number(row.generation_id));
  }

  const typesByPokemon = new Map<number, Map<number, number>>();
  for (const row of t.pokemon_types) {
    const pokemonId = Number(row.pokemon_id);
    const slots = typesByPokemon.get(pokemonId) ?? new Map<number, number>();
    slots.set(Number(row.slot), Number(row.type_id));
    typesByPokemon.set(pokemonId, slots);
  }

  const typesPastByPokemon = new Map<
    number,
    Map<number, Map<number, number>>
  >();
  for (const row of t.pokemon_types_past) {
    const pokemonId = Number(row.pokemon_id);
    const genId = Number(row.generation_id);
    const byGen =
      typesPastByPokemon.get(pokemonId) ??
      new Map<number, Map<number, number>>();
    const slots = byGen.get(genId) ?? new Map<number, number>();
    slots.set(Number(row.slot), Number(row.type_id));
    byGen.set(genId, slots);
    typesPastByPokemon.set(pokemonId, byGen);
  }

  const statsByPokemon = new Map<number, Map<number, number>>();
  for (const row of t.pokemon_stats) {
    const pokemonId = Number(row.pokemon_id);
    const stats = statsByPokemon.get(pokemonId) ?? new Map<number, number>();
    stats.set(Number(row.stat_id), Number(row.base_stat));
    statsByPokemon.set(pokemonId, stats);
  }

  const statsPastByPokemon = new Map<number, Map<number, PastStatRow[]>>();
  for (const row of t.pokemon_stats_past) {
    const pokemonId = Number(row.pokemon_id);
    const stats =
      statsPastByPokemon.get(pokemonId) ?? new Map<number, PastStatRow[]>();
    pushTo(stats, Number(row.stat_id), {
      generationId: Number(row.generation_id),
      base: Number(row.base_stat),
    });
    statsPastByPokemon.set(pokemonId, stats);
  }

  const abilitiesByPokemon = new Map<number, Map<number, CurrentAbility>>();
  for (const row of t.pokemon_abilities) {
    const pokemonId = Number(row.pokemon_id);
    const slots =
      abilitiesByPokemon.get(pokemonId) ?? new Map<number, CurrentAbility>();
    slots.set(Number(row.slot), {
      abilityId: Number(row.ability_id),
      hidden: row.is_hidden === "1",
    });
    abilitiesByPokemon.set(pokemonId, slots);
  }

  const abilitiesPastByPokemon = new Map<
    number,
    Map<number, PastAbilityRow[]>
  >();
  for (const row of t.pokemon_abilities_past) {
    const pokemonId = Number(row.pokemon_id);
    const slots =
      abilitiesPastByPokemon.get(pokemonId) ??
      new Map<number, PastAbilityRow[]>();
    pushTo(slots, Number(row.slot), {
      generationId: Number(row.generation_id),
      abilityId: row.ability_id === "" ? null : Number(row.ability_id),
      hidden: row.is_hidden === "1",
    });
    abilitiesPastByPokemon.set(pokemonId, slots);
  }

  const efficacy = new Map<string, number>();
  for (const row of t.type_efficacy) {
    efficacy.set(
      efficacyKey(Number(row.damage_type_id), Number(row.target_type_id)),
      Number(row.damage_factor) / 100,
    );
  }

  const efficacyPast = new Map<string, PastEfficacyRow[]>();
  for (const row of t.type_efficacy_past) {
    pushTo(
      efficacyPast,
      efficacyKey(Number(row.damage_type_id), Number(row.target_type_id)),
      {
        generationId: Number(row.generation_id),
        factor: Number(row.damage_factor) / 100,
      },
    );
  }

  return {
    typesById,
    abilitiesById,
    abilityGenerationById,
    typesByPokemon,
    typesPastByPokemon,
    statsByPokemon,
    statsPastByPokemon,
    abilitiesByPokemon,
    abilitiesPastByPokemon,
    efficacy,
    efficacyPast,
  };
}

function getIndex(t: Tables): ResolveIndex {
  const cached = indexCache.get(t);
  if (cached) return cached;
  const built = buildIndex(t);
  indexCache.set(t, built);
  return built;
}

/** Picks the smallest-`generationId` row whose `generationId >= gen`, if any. */
function pickOverride<T extends { generationId: number }>(
  rows: T[] | undefined,
  gen: number,
): T | undefined {
  if (!rows) return undefined;
  let best: T | undefined;
  for (const row of rows) {
    if (
      row.generationId >= gen &&
      (!best || row.generationId < best.generationId)
    ) {
      best = row;
    }
  }
  return best;
}

function typeSlug(idx: ResolveIndex, typeId: number): TypeSlug {
  const row = idx.typesById.get(typeId);
  if (!row) throw new Error(`Unknown type id ${typeId}`);
  return row.identifier as TypeSlug;
}

/**
 * Resolves a Pokémon's type(s) (in slot order) as they were in generation `gen`. Unlike
 * stats and abilities, past typing is wholesale: if a past generation applies, its rows
 * alone determine the typing (see the `pokemon_types_past` note on the doc comment above) --
 * there is no merging with the current table's slots.
 */
export function typesAt(pokemonId: number, gen: number, t: Tables): TypeSlug[] {
  const idx = getIndex(t);
  const current = idx.typesByPokemon.get(pokemonId);
  const byGen = idx.typesPastByPokemon.get(pokemonId);

  let bestGen: number | undefined;
  for (const genId of byGen?.keys() ?? []) {
    if (genId >= gen && (bestGen === undefined || genId < bestGen)) {
      bestGen = genId;
    }
  }

  const slots = bestGen !== undefined ? byGen?.get(bestGen) : current;
  return [...(slots?.entries() ?? [])]
    .sort(([slotA], [slotB]) => slotA - slotB)
    .map(([, typeId]) => typeSlug(idx, typeId));
}

/** Resolves a Pokémon's base stats as they were in generation `gen`. */
export function statsAt(pokemonId: number, gen: number, t: Tables): Stats {
  const idx = getIndex(t);
  const current = idx.statsByPokemon.get(pokemonId);
  const past = idx.statsPastByPokemon.get(pokemonId);

  const special = pickOverride(past?.get(SPECIAL_STAT_ID), gen);
  const values = STAT_IDS.map((statId) => {
    if (special && (statId === SP_ATK_STAT_ID || statId === SP_DEF_STAT_ID)) {
      return special.base;
    }
    const override = pickOverride(past?.get(statId), gen);
    if (override) return override.base;
    const base = current?.get(statId);
    if (base === undefined) {
      throw new Error(`Missing stat ${statId} for pokemon ${pokemonId}`);
    }
    return base;
  });
  return values as Stats;
}

/** Resolves a Pokémon's abilities (in slot order) as they were in generation `gen`. */
export function abilitiesAt(
  pokemonId: number,
  gen: number,
  t: Tables,
): AbilityRef[] {
  const idx = getIndex(t);
  const current = idx.abilitiesByPokemon.get(pokemonId);
  const past = idx.abilitiesPastByPokemon.get(pokemonId);
  const slots = new Set<number>([
    ...(current?.keys() ?? []),
    ...(past?.keys() ?? []),
  ]);

  const resolved: { slot: number; abilityId: number; hidden: boolean }[] = [];
  for (const slot of slots) {
    const override = pickOverride(past?.get(slot), gen);
    if (override) {
      if (override.abilityId === null) continue; // slot didn't exist yet
      resolved.push({
        slot,
        abilityId: override.abilityId,
        hidden: override.hidden,
      });
      continue;
    }
    const base = current?.get(slot);
    if (base) resolved.push({ slot, ...base });
  }
  resolved.sort((a, b) => a.slot - b.slot);
  return resolved
    .filter((r) => (idx.abilityGenerationById.get(r.abilityId) ?? 0) <= gen)
    .map((r) => ({
      slug: idx.abilitiesById.get(r.abilityId) ?? String(r.abilityId),
      hidden: r.hidden,
    }));
}

/**
 * Types in PokeAPI's `types` table that no Pokémon can have: Stellar (gen 9) exists only as a
 * Terastal type, with no damage relations of its own.
 */
const NON_POKEMON_TYPES = new Set(["stellar"]);

/**
 * The ids of types that existed by generation `gen` (excludes the unknown/shadow pseudo-types
 * and {@link NON_POKEMON_TYPES}).
 */
function typeIdsInGen(idx: ResolveIndex, gen: number): Set<number> {
  const ids = new Set<number>();
  for (const [id, row] of idx.typesById) {
    if (
      id < 10000 &&
      row.generationId <= gen &&
      !NON_POKEMON_TYPES.has(row.identifier)
    ) {
      ids.add(id);
    }
  }
  return ids;
}

/** The types that existed by generation `gen` (excludes unknown/shadow pseudo-types). */
export function typesInGen(gen: number, t: Tables): TypeSlug[] {
  const idx = getIndex(t);
  return [...typeIdsInGen(idx, gen)]
    .sort((a, b) => a - b)
    .map((id) => typeSlug(idx, id));
}

/**
 * The attacker -> defender damage chart as it was in generation `gen`. Both the attacker and
 * defender side are restricted to {@link typeIdsInGen}, so a type that didn't exist yet in
 * `gen` (e.g. Fairy before gen 6) never appears, as either attacker or defender.
 */
export function typeChartAt(gen: number, t: Tables): TypeChart {
  const idx = getIndex(t);
  const validIds = typeIdsInGen(idx, gen);
  const chart = {} as TypeChart;

  for (const [key, factor] of idx.efficacy) {
    const [damageTypeId, targetTypeId] = key.split(":").map(Number);
    if (!validIds.has(damageTypeId) || !validIds.has(targetTypeId)) continue;

    const override = pickOverride(idx.efficacyPast.get(key), gen);
    const finalFactor = override ? override.factor : factor;
    if (finalFactor === 1) continue;

    const attacker = typeSlug(idx, damageTypeId);
    const defender = typeSlug(idx, targetTypeId);
    const row = chart[attacker] ?? (chart[attacker] = {});
    row[defender] = finalFactor;
  }

  return chart;
}

/**
 * The damage multiplier a Pokémon with `types` takes from each attacking type in `inGen`,
 * combining its defending types multiplicatively.
 */
export function defensiveProfile(
  types: TypeSlug[],
  chart: TypeChart,
  inGen: TypeSlug[],
): Record<TypeSlug, Multiplier> {
  const result = {} as Record<TypeSlug, Multiplier>;
  for (const attacker of inGen) {
    let multiplier = 1;
    for (const defender of types) {
      multiplier *= chart[attacker]?.[defender] ?? 1;
    }
    result[attacker] = multiplier as Multiplier;
  }
  return result;
}
