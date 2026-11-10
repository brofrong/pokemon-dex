import type { Form, TypeSlug } from "../../src/data/types";
import type { Tables } from "./fetch";
import { abilitiesAt, statsAt, typesAt, typesInGen } from "./resolve";

/**
 * Arceus's species id. In the games its type equals whatever Plate it's holding, which
 * PokeAPI's CSVs don't encode as a per-`pokemon_id` fact -- all of Arceus' alt forms share
 * `pokemon_id` 493 with the base form (see {@link buildForms}), so `typesAt` alone would
 * report every form as Normal. `buildForms` corrects this with an explicit, Arceus-only
 * override (see below); nothing else (e.g. Burmy, whose cloaks are genuinely all Bug-typed
 * in-game) is affected.
 */
const ARCEUS_SPECIES_ID = 493;

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
 * forms, Basculin's white-striped form, Arceus-Fairy -- the latter is also excluded by the
 * Arceus-only type-slug filter below, since Fairy isn't in `typesInGen(5)`).
 *
 * `forms[0]` is always the species' default form (the form row belonging to the `pokemon`
 * row with `is_default = 1`, itself marked `is_default = 1`); the rest follow
 * `pokemon_forms.form_order`, then `order`. A form shares its `pokemon_id` with the default
 * form exactly when it's a cosmetic variant (Unown letters, Shellos, Deerling, Burmy) --
 * resolving types/stats/abilities from that shared `pokemon_id` naturally gives it the same
 * data as the default form, with no special-casing needed. Arceus is the one exception: see
 * {@link ARCEUS_SPECIES_ID}.
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

  let rows = pokemonRows
    .flatMap((p) => idx.formsByPokemon.get(p.id) ?? [])
    .filter((row) => !row.isMega && row.introducedOrder <= blackWhiteOrder);

  // Arceus' `form_identifier`s are type slugs (its base form is literally "normal"), except
  // for "unknown" (the "???" type, retired and not a real `TypeSlug`) -- drop any row whose
  // identifier isn't a type that exists in `gen` (this also covers "fairy", already excluded
  // above by `introducedOrder`, as a second line of defense).
  if (speciesId === ARCEUS_SPECIES_ID) {
    const validTypes = new Set<string>(typesInGen(gen, t));
    rows = rows.filter((row) => validTypes.has(row.formIdentifier));
  }

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
  const isArceusPlate = speciesId === ARCEUS_SPECIES_ID && !isDefaultForm;

  return {
    key: isDefaultForm
      ? String(speciesId)
      : `${speciesId}-${row.formIdentifier}`,
    formSlug: isDefaultForm ? null : row.formIdentifier,
    // Arceus: override the shared-`pokemon_id` type with the plate's own type (see
    // `ARCEUS_SPECIES_ID`); every other form resolves types normally from its `pokemon_id`.
    types: isArceusPlate
      ? [row.formIdentifier as TypeSlug]
      : typesAt(row.pokemonId, gen, t),
    stats: statsAt(row.pokemonId, gen, t),
    abilities: abilitiesAt(row.pokemonId, gen, t),
    battleOnly: row.isBattleOnly,
    // An Arceus plate form no longer shares *all* its data with the default (its type
    // differs), so it's not really "cosmetic" anymore despite sharing a `pokemon_id`.
    cosmetic:
      !isDefaultForm && !isArceusPlate && row.pokemonId === defaultPokemonId,
  };
}
