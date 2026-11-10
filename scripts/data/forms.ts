import type { Form } from "../../src/data/types";
import type { Tables } from "./fetch";
import { abilitiesAt, statsAt, typesAt } from "./resolve";

interface PokemonRow {
  id: number;
  isDefault: boolean;
}

interface FormRow {
  pokemonId: number;
  formIdentifier: string;
  isDefault: boolean;
  isBattleOnly: boolean;
  isMega: boolean;
  formOrder: number;
  order: number;
  /** `version_groups.order` of `introduced_in_version_group_id`. */
  introducedOrder: number;
}

interface FormsIndex {
  pokemonBySpecies: Map<number, PokemonRow[]>;
  formsByPokemon: Map<number, FormRow[]>;
}

const indexCache = new WeakMap<Tables, FormsIndex>();

function buildIndex(t: Tables): FormsIndex {
  const versionGroupOrderById = new Map<number, number>();
  for (const row of t.version_groups) {
    versionGroupOrderById.set(Number(row.id), Number(row.order));
  }

  const pokemonBySpecies = new Map<number, PokemonRow[]>();
  for (const row of t.pokemon) {
    const speciesId = Number(row.species_id);
    const list = pokemonBySpecies.get(speciesId) ?? [];
    list.push({ id: Number(row.id), isDefault: row.is_default === "1" });
    pokemonBySpecies.set(speciesId, list);
  }

  const formsByPokemon = new Map<number, FormRow[]>();
  for (const row of t.pokemon_forms) {
    const pokemonId = Number(row.pokemon_id);
    const introducedId = Number(row.introduced_in_version_group_id);
    const list = formsByPokemon.get(pokemonId) ?? [];
    list.push({
      pokemonId,
      formIdentifier: row.form_identifier,
      isDefault: row.is_default === "1",
      isBattleOnly: row.is_battle_only === "1",
      isMega: row.is_mega === "1",
      formOrder: Number(row.form_order),
      order: Number(row.order),
      introducedOrder: versionGroupOrderById.get(introducedId) ?? 0,
    });
    formsByPokemon.set(pokemonId, list);
  }

  return { pokemonBySpecies, formsByPokemon };
}

function getIndex(t: Tables): FormsIndex {
  const cached = indexCache.get(t);
  if (cached) return cached;
  const built = buildIndex(t);
  indexCache.set(t, built);
  return built;
}

/**
 * Builds the `forms[]` list for one species, as available by `blackWhiteOrder` (the
 * `version_groups.order` of Black/White). Mega forms are dropped outright; any form
 * introduced in a later version group than that is dropped too (e.g. Darmanitan's Galar
 * forms, Basculin's white-striped form, Arceus-Fairy).
 *
 * `forms[0]` is always the species' default form (the form row belonging to the `pokemon`
 * row with `is_default = 1`, itself marked `is_default = 1`); the rest follow
 * `pokemon_forms.form_order`, then `order`. A form shares its `pokemon_id` with the default
 * form exactly when it's a cosmetic variant (Unown letters, Shellos, Deerling, Burmy,
 * Arceus' plate types) -- resolving types/stats/abilities from that shared `pokemon_id`
 * naturally gives it the same data as the default form, with no special-casing needed.
 */
export function buildForms(
  speciesId: number,
  gen: number,
  blackWhiteOrder: number,
  t: Tables,
): Form[] {
  const idx = getIndex(t);
  const pokemonRows = idx.pokemonBySpecies.get(speciesId) ?? [];
  const defaultPokemon = pokemonRows.find((p) => p.isDefault) ?? pokemonRows[0];
  if (!defaultPokemon) {
    throw new Error(`No pokemon row found for species ${speciesId}`);
  }

  const rows = pokemonRows
    .flatMap((p) => idx.formsByPokemon.get(p.id) ?? [])
    .filter((row) => !row.isMega && row.introducedOrder <= blackWhiteOrder);

  const defaultRow =
    rows.find((row) => row.pokemonId === defaultPokemon.id && row.isDefault) ??
    rows.find((row) => row.pokemonId === defaultPokemon.id);
  if (!defaultRow) {
    throw new Error(`No default form found for species ${speciesId}`);
  }

  const rest = rows
    .filter((row) => row !== defaultRow)
    .sort((a, b) => a.formOrder - b.formOrder || a.order - b.order);

  return [defaultRow, ...rest].map((row) =>
    buildForm(row, speciesId, defaultRow, defaultPokemon.id, gen, t),
  );
}

function buildForm(
  row: FormRow,
  speciesId: number,
  defaultRow: FormRow,
  defaultPokemonId: number,
  gen: number,
  t: Tables,
): Form {
  const isDefaultForm = row === defaultRow;

  return {
    key: isDefaultForm
      ? String(speciesId)
      : `${speciesId}-${row.formIdentifier}`,
    formSlug: isDefaultForm ? null : row.formIdentifier,
    types: typesAt(row.pokemonId, gen, t),
    stats: statsAt(row.pokemonId, gen, t),
    abilities: abilitiesAt(row.pokemonId, gen, t),
    battleOnly: row.isBattleOnly,
    cosmetic: !isDefaultForm && row.pokemonId === defaultPokemonId,
  };
}
