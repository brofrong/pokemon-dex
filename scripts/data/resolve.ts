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
 * `type_efficacy_past` overrides per (attacker type, defender type) pair under the same
 * rule; its `damage_factor` (like the current table's) is a percentage, e.g. `200` -> `2`.
 */

const STAT_IDS = [1, 2, 3, 4, 5, 6] as const;

interface TypeRow {
  identifier: string;
  generationId: number;
}

interface PastTypeRow {
  generationId: number;
  typeId: number;
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
  typesByPokemon: Map<number, Map<number, number>>;
  typesPastByPokemon: Map<number, Map<number, PastTypeRow[]>>;
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
  for (const row of t.abilities) {
    abilitiesById.set(Number(row.id), row.identifier);
  }

  const typesByPokemon = new Map<number, Map<number, number>>();
  for (const row of t.pokemon_types) {
    const pokemonId = Number(row.pokemon_id);
    const slots = typesByPokemon.get(pokemonId) ?? new Map<number, number>();
    slots.set(Number(row.slot), Number(row.type_id));
    typesByPokemon.set(pokemonId, slots);
  }

  const typesPastByPokemon = new Map<number, Map<number, PastTypeRow[]>>();
  for (const row of t.pokemon_types_past) {
    const pokemonId = Number(row.pokemon_id);
    const slots =
      typesPastByPokemon.get(pokemonId) ?? new Map<number, PastTypeRow[]>();
    pushTo(slots, Number(row.slot), {
      generationId: Number(row.generation_id),
      typeId: Number(row.type_id),
    });
    typesPastByPokemon.set(pokemonId, slots);
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

/** Resolves a Pokémon's type(s) (in slot order) as they were in generation `gen`. */
export function typesAt(pokemonId: number, gen: number, t: Tables): TypeSlug[] {
  const idx = getIndex(t);
  const current = idx.typesByPokemon.get(pokemonId);
  const past = idx.typesPastByPokemon.get(pokemonId);
  const slots = new Set<number>([
    ...(current?.keys() ?? []),
    ...(past?.keys() ?? []),
  ]);

  const resolved: { slot: number; typeId: number }[] = [];
  for (const slot of slots) {
    const override = pickOverride(past?.get(slot), gen);
    const typeId = override ? override.typeId : current?.get(slot);
    if (typeId !== undefined) resolved.push({ slot, typeId });
  }
  resolved.sort((a, b) => a.slot - b.slot);
  return resolved.map((r) => typeSlug(idx, r.typeId));
}

/** Resolves a Pokémon's base stats as they were in generation `gen`. */
export function statsAt(pokemonId: number, gen: number, t: Tables): Stats {
  const idx = getIndex(t);
  const current = idx.statsByPokemon.get(pokemonId);
  const past = idx.statsPastByPokemon.get(pokemonId);

  const values = STAT_IDS.map((statId) => {
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
  return resolved.map((r) => ({
    slug: idx.abilitiesById.get(r.abilityId) ?? String(r.abilityId),
    hidden: r.hidden,
  }));
}

/** The types that existed by generation `gen` (excludes unknown/shadow pseudo-types). */
export function typesInGen(gen: number, t: Tables): TypeSlug[] {
  const idx = getIndex(t);
  return [...idx.typesById.entries()]
    .filter(([id, row]) => id < 10000 && row.generationId <= gen)
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row.identifier as TypeSlug);
}

/** The attacker -> defender damage chart as it was in generation `gen`. */
export function typeChartAt(gen: number, t: Tables): TypeChart {
  const idx = getIndex(t);
  const chart = {} as TypeChart;

  for (const [key, factor] of idx.efficacy) {
    const [damageTypeId, targetTypeId] = key.split(":").map(Number);
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
