import type { AbilityRef, Form, TypeSlug } from "../../src/data/types";
import type { Tables } from "./fetch";
import { abilitiesAt, statsAt, typesAt, typesInGen } from "./resolve";

/**
 * Species whose type equals the item they hold: Arceus (Plates) and Silvally (Memories). In
 * the games each form's type is that item's type, which PokeAPI's CSVs don't encode as a
 * per-`pokemon_id` fact -- all their alt forms share one `pokemon_id` with the base form (see
 * {@link buildForms}), so `typesAt` alone would report every form as Normal. `buildForms`
 * corrects this with an explicit override for these two species only (their
 * `form_identifier`s are type slugs); nothing else (e.g. Burmy, whose cloaks are genuinely all
 * Bug-typed in-game) is affected.
 */
const TYPE_FORM_SPECIES = new Set([493, 773]);

/** Per-generation rules for which forms exist (see {@link buildForms}). */
export interface FormRules {
  /** Generation number types, stats and abilities are resolved at. */
  gen: number;
  /** Forms introduced in a version group with a later `version_groups.order` are dropped. */
  maxOrder: number;
  /** Mega Evolutions and Primal Reversions (only `xy` and `sm`). */
  megas: boolean;
  /** Gigantamax and Eternamax forms (only `swsh`). */
  gmax: boolean;
  /** Totem forms (only `sm`). */
  totems: boolean;
  /**
   * Cosplay Pikachu (Gen VI only). They come from Omega Ruby/Alpha Sapphire, past `xy`'s
   * content ceiling, so in practice no generation has them.
   */
  cosplay: boolean;
  /**
   * Applied to every form's resolved abilities (the generation's ability features); defaults to
   * keeping them as resolved.
   */
  abilities?: (abilities: AbilityRef[]) => AbilityRef[];
}

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

const hasPart = (identifier: string, part: string) =>
  identifier.split("-").includes(part);

/** Omega Ruby/Alpha Sapphire's Cosplay Pikachu forms (a Gen VI Contest gimmick). */
const COSPLAY_FORMS = new Set([
  "cosplay",
  "rock-star",
  "belle",
  "pop-star",
  "phd",
  "libre",
]);

/**
 * Let's Go's partner Pikachu/Eevee (`pikachu-starter`, `eevee-starter`): those games are a
 * side branch none of our generations represents (`sm` only reaches Let's Go for Meltan and
 * Melmetal), so the partner forms are never included.
 */
const PARTNER_FORM = "starter";

/** Whether a form row survives `rules` (the default form is checked separately). */
function formAllowed(row: FormRow, rules: FormRules): boolean {
  if (row.introducedOrder > rules.maxOrder) return false;
  const id = row.formIdentifier;
  if ((row.isMega || hasPart(id, "primal")) && !rules.megas) return false;
  if ((id.includes("gmax") || id === "eternamax") && !rules.gmax) return false;
  if (hasPart(id, "totem") && !rules.totems) return false;
  if (COSPLAY_FORMS.has(id) && !rules.cosplay) return false;
  if (id === PARTNER_FORM) return false;
  return true;
}

/**
 * Builds the `forms[]` list for one species, as it exists under `rules`:
 *  - a form introduced in a version group whose `order` is later than `rules.maxOrder` is
 *    dropped (Alolan forms before `sm`, Galarian forms before `swsh`, Arceus-Fairy before
 *    `xy`, ...);
 *  - Mega Evolutions (`is_mega`) and Primal Reversions exist only when `rules.megas`;
 *    Gigantamax (`form_identifier` containing "gmax") and Eternamax only when `rules.gmax`;
 *    Totem forms only when `rules.totems`.
 *
 * `forms[0]` is always the species' default form (the form row belonging to the `pokemon`
 * row with `is_default = 1`, itself marked `is_default = 1`); the rest follow
 * `pokemon_forms.form_order`, then `order`. A form shares its `pokemon_id` with the default
 * form exactly when it's a cosmetic variant (Unown letters, Shellos, Deerling, Burmy) --
 * resolving types/stats/abilities from that shared `pokemon_id` naturally gives it the same
 * data as the default form, with no special-casing needed. Arceus and Silvally are the
 * exception: see {@link TYPE_FORM_SPECIES}.
 */
export function buildForms(
  speciesId: number,
  rules: FormRules,
  t: Tables,
): Form[] {
  const idx = getIndex(t);
  const pokemonRows = idx.pokemonBySpecies.get(speciesId) ?? [];
  const defaultPokemon = pokemonRows.find((p) => p.isDefault) ?? pokemonRows[0];
  if (!defaultPokemon) {
    throw new Error(`No pokemon row found for species ${speciesId}`);
  }

  const allRows = pokemonRows.flatMap(
    (p) => idx.formsByPokemon.get(p.id) ?? [],
  );
  const defaultRow =
    allRows.find(
      (row) => row.pokemonId === defaultPokemon.id && row.isDefault,
    ) ?? allRows.find((row) => row.pokemonId === defaultPokemon.id);
  if (!defaultRow) {
    throw new Error(`No default form found for species ${speciesId}`);
  }

  let rest = allRows.filter(
    (row) => row !== defaultRow && formAllowed(row, rules),
  );

  // Arceus'/Silvally's `form_identifier`s are type slugs (the base form is literally
  // "normal"), except for Arceus' "unknown" (the "???" type, retired and not a real
  // `TypeSlug`) -- drop any row whose identifier isn't a type that exists in `rules.gen` (this
  // also covers "fairy" before gen 6, already excluded by `introducedOrder` for Arceus, as a
  // second line of defense).
  if (TYPE_FORM_SPECIES.has(speciesId)) {
    const validTypes = new Set<string>(typesInGen(rules.gen, t));
    rest = rest.filter((row) => validTypes.has(row.formIdentifier));
  }

  rest.sort((a, b) => a.formOrder - b.formOrder || a.order - b.order);

  return [defaultRow, ...rest].map((row) =>
    buildForm(row, speciesId, defaultRow, defaultPokemon.id, rules, t),
  );
}

function buildForm(
  row: FormRow,
  speciesId: number,
  defaultRow: FormRow,
  defaultPokemonId: number,
  rules: FormRules,
  t: Tables,
): Form {
  const isDefaultForm = row === defaultRow;
  const isTypeForm = TYPE_FORM_SPECIES.has(speciesId) && !isDefaultForm;
  const abilities = abilitiesAt(row.pokemonId, rules.gen, t);

  return {
    key: isDefaultForm
      ? String(speciesId)
      : `${speciesId}-${row.formIdentifier}`,
    pokemonId: row.pokemonId,
    formSlug: isDefaultForm ? null : row.formIdentifier,
    // Arceus/Silvally: override the shared-`pokemon_id` type with the held item's own type
    // (see `TYPE_FORM_SPECIES`); every other form resolves types normally from its `pokemon_id`.
    types: isTypeForm
      ? [row.formIdentifier as TypeSlug]
      : typesAt(row.pokemonId, rules.gen, t),
    stats: statsAt(row.pokemonId, rules.gen, t),
    abilities: rules.abilities ? rules.abilities(abilities) : abilities,
    battleOnly: row.isBattleOnly,
    // A type form no longer shares *all* its data with the default (its type differs), so
    // it's not really "cosmetic" anymore despite sharing a `pokemon_id`.
    cosmetic:
      !isDefaultForm && !isTypeForm && row.pokemonId === defaultPokemonId,
  };
}
