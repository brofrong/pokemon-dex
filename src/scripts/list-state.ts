/**
 * The list page's filter/sort/shiny state, round-tripped through the URL's query string
 * (`history.replaceState`, see `list.ts`) so a cold deep link like `?type=fire,flying&sort=spe`
 * restores exactly. Defaults are omitted from the serialized string (so the default state
 * serializes to `""`, no `?`), and any unknown value in a parsed string is silently ignored
 * (falls back to its default) rather than throwing -- a cold link must never error.
 */

import type { Flag, TypeSlug } from "../data/types";

/**
 * Every Pokémon type that exists in generation V. Fairy was introduced in generation VI, so it
 * is deliberately excluded here even though it's a valid {@link TypeSlug} in general (the type
 * filter row only ever renders gen-V types, and an incoming `?type=fairy` is garbage for this
 * site, same as a typo).
 */
const GEN_V_TYPES: readonly TypeSlug[] = [
  "normal",
  "fighting",
  "flying",
  "poison",
  "ground",
  "rock",
  "bug",
  "ghost",
  "steel",
  "fire",
  "water",
  "grass",
  "electric",
  "psychic",
  "ice",
  "dragon",
  "dark",
];
const VALID_TYPES = new Set<string>(GEN_V_TYPES);

const VALID_FLAGS = new Set<Flag>(["legendary", "mythical", "baby", "new"]);

export type SortField =
  "id" | "name" | "total" | "hp" | "atk" | "def" | "spa" | "spd" | "spe";
const VALID_SORTS = new Set<SortField>([
  "id",
  "name",
  "total",
  "hp",
  "atk",
  "def",
  "spa",
  "spd",
  "spe",
]);

export interface ListState {
  q: string;
  types: TypeSlug[];
  flags: Flag[];
  sort: SortField;
  dir: "asc" | "desc";
  shiny: boolean;
}

/** The state a bare `/{lang}/{gen}/` (no query string) represents. */
export const DEFAULT_LIST_STATE: ListState = {
  q: "",
  types: [],
  flags: [],
  sort: "id",
  dir: "asc",
  shiny: false,
};

function isTypeSlug(value: string): value is TypeSlug {
  return VALID_TYPES.has(value);
}

function isFlag(value: string): value is Flag {
  return VALID_FLAGS.has(value as Flag);
}

/** Parses a query string (with or without a leading `?`) into a {@link ListState}. */
export function parseListState(search: string): ListState {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );

  const q = params.get("q") ?? DEFAULT_LIST_STATE.q;

  const types = (params.get("type") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isTypeSlug)
    .slice(0, 2);

  const flags = (params.get("flag") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isFlag);

  const sortRaw = params.get("sort") ?? "";
  const sort: SortField = VALID_SORTS.has(sortRaw as SortField)
    ? (sortRaw as SortField)
    : DEFAULT_LIST_STATE.sort;

  const dirRaw = params.get("dir");
  const dir: ListState["dir"] =
    dirRaw === "asc" || dirRaw === "desc" ? dirRaw : DEFAULT_LIST_STATE.dir;

  const shiny = params.get("shiny") === "1";

  return { q, types, flags, sort, dir, shiny };
}

/** Serializes a {@link ListState} back to a query string, omitting every default value. */
export function serializeListState(s: ListState): string {
  const params = new URLSearchParams();
  if (s.q) params.set("q", s.q);
  if (s.types.length > 0) params.set("type", s.types.slice(0, 2).join(","));
  if (s.flags.length > 0) params.set("flag", s.flags.join(","));
  if (s.sort !== DEFAULT_LIST_STATE.sort) params.set("sort", s.sort);
  if (s.dir !== DEFAULT_LIST_STATE.dir) params.set("dir", s.dir);
  if (s.shiny) params.set("shiny", "1");
  return params.toString();
}
