import type { Flag, GenId, SpriteSetId, TypeSlug } from "../data/types";

/** Every type in in-game order, as of generation VI (the newest type, Fairy, is last). */
const ALL_TYPES: readonly TypeSlug[] = [
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
  "fairy",
];

/** The types that exist in generation `number`: Dark/Steel from II, Fairy from VI. */
function typesOf(number: number): TypeSlug[] {
  return ALL_TYPES.filter(
    (ty) =>
      !(number < 2 && (ty === "dark" || ty === "steel")) &&
      !(number < 6 && ty === "fairy"),
  );
}

/**
 * Which data/UI blocks a generation's games actually had. Pages hide what's `false` (and the
 * dataset represents it explicitly, see `Pokemon` in `src/data/types.ts`).
 */
export interface GenFeatures {
  /** Abilities exist from generation III. */
  abilities: boolean;
  /** Hidden abilities exist from generation V. */
  hiddenAbilities: boolean;
  /** Gender, egg groups and egg cycles exist from generation II. */
  breeding: boolean;
  /** Shiny Pokémon (and shiny sprites) exist from generation II. */
  shiny: boolean;
  /** Back sprites exist in the pixel sets (I-V); Pokémon HOME renders have none. */
  back: boolean;
}

/** Static config for one generation: what's built for it, and how the switcher shows it. */
export interface GenConfig {
  id: GenId;
  number: number;
  /** PokeAPI `version_groups.identifier` the dataset is resolved against. */
  versionGroup: string;
  /** PokeAPI `versions.identifier` pair, used as the `Pokemon.flavor` keys. */
  versions: [string, string];
  /**
   * The versions Pokédex text is taken from, in priority order: the pair itself, then every
   * earlier version newest -> oldest, then (last resort, for species that only appeared in a
   * later game of the same generation, e.g. Meltan in Let's Go for `sm`) later versions of the
   * same generation. Only versions that have Pokédex text are listed.
   */
  flavorVersions: string[];
  maxSpeciesId: number;
  label: string;
  /**
   * A short, unambiguous abbreviation (`RB`, `USUM`, `SwSh`, ...), shown by the generation
   * switcher at very narrow widths instead of the full label -- initials were ambiguous
   * ("Ultra Sun / Ultra Moon" -> "U / U", "Sword / Shield" -> "S / S").
   */
  shortLabel: string;
  /** The types that exist in this generation (15 / 17 / 18), in in-game order. */
  types: TypeSlug[];
  /**
   * The flag chips this generation's list page offers, in display order: only flags some but not
   * all of its species have (gen I: every species is "new", none is a baby). Static so client
   * code (`switchGenUrl`) can use it without the dataset; pinned to the data's own
   * `flagChips` by `tests/lib/gen-view.test.ts`.
   */
  listFlags: Flag[];
  /** The two colors shown as dots in the generation switcher. */
  colors: [string, string];
  /** Which sprite set this generation's pages show. */
  spriteSet: SpriteSetId;
  features: GenFeatures;
  /** Whether this generation's data is built and its pages routed. */
  enabled: boolean;
}

/**
 * Every main-series version with English Pokédex text in PokeAPI, grouped by version group in
 * `version_groups.order` (oldest first). Colosseum/XD have no Pokédex and the DLC "versions"
 * no text of their own, so they're left out.
 */
const VERSION_HISTORY: { gen: number; versions: string[] }[] = [
  { gen: 1, versions: ["red", "blue"] },
  { gen: 1, versions: ["yellow"] },
  { gen: 2, versions: ["gold", "silver"] },
  { gen: 2, versions: ["crystal"] },
  { gen: 3, versions: ["ruby", "sapphire"] },
  { gen: 3, versions: ["emerald"] },
  { gen: 3, versions: ["firered", "leafgreen"] },
  { gen: 4, versions: ["diamond", "pearl"] },
  { gen: 4, versions: ["platinum"] },
  { gen: 4, versions: ["heartgold", "soulsilver"] },
  { gen: 5, versions: ["black", "white"] },
  { gen: 5, versions: ["black-2", "white-2"] },
  { gen: 6, versions: ["x", "y"] },
  { gen: 6, versions: ["omega-ruby", "alpha-sapphire"] },
  { gen: 7, versions: ["sun", "moon"] },
  { gen: 7, versions: ["ultra-sun", "ultra-moon"] },
  { gen: 7, versions: ["lets-go-pikachu", "lets-go-eevee"] },
  { gen: 8, versions: ["sword", "shield"] },
  { gen: 8, versions: ["brilliant-diamond", "shining-pearl"] },
  { gen: 8, versions: ["legends-arceus"] },
  { gen: 9, versions: ["scarlet", "violet"] },
];

/** Builds `GenConfig.flavorVersions` for the version pair `versions` (see its doc). */
function flavorVersionsFor(versions: [string, string]): string[] {
  const index = VERSION_HISTORY.findIndex((group) =>
    group.versions.includes(versions[0]),
  );
  if (index === -1) throw new Error(`Unknown version '${versions[0]}'`);
  const gen = VERSION_HISTORY[index]!.gen;
  const earlier = VERSION_HISTORY.slice(0, index)
    .reverse()
    .flatMap((group) => group.versions);
  const laterSameGen = VERSION_HISTORY.slice(index + 1)
    .filter((group) => group.gen === gen)
    .flatMap((group) => group.versions);
  return [...versions, ...earlier, ...laterSameGen];
}

const PIXEL: GenFeatures = {
  abilities: true,
  hiddenAbilities: true,
  breeding: true,
  shiny: true,
  back: true,
};
const HOME: GenFeatures = { ...PIXEL, back: false };

function defineGen(
  config: Omit<
    GenConfig,
    "flavorVersions" | "enabled" | "types" | "listFlags"
  > & {
    listFlags?: Flag[];
  },
): GenConfig {
  return {
    ...config,
    types: typesOf(config.number),
    listFlags: config.listFlags ?? ["legendary", "mythical", "baby", "new"],
    flavorVersions: flavorVersionsFor(config.versions),
    enabled: true,
  };
}

/** Every generation, oldest first. All nine have a dataset. */
export const GENERATIONS: GenConfig[] = [
  defineGen({
    id: "rb",
    number: 1,
    versionGroup: "red-blue",
    versions: ["red", "blue"],
    maxSpeciesId: 151,
    label: "Red / Blue",
    shortLabel: "RB",
    colors: ["#da3914", "#2e50d8"],
    spriteSet: "rb",
    listFlags: ["legendary", "mythical"],
    features: {
      abilities: false,
      hiddenAbilities: false,
      breeding: false,
      shiny: false,
      back: true,
    },
  }),
  defineGen({
    id: "gs",
    number: 2,
    versionGroup: "gold-silver",
    versions: ["gold", "silver"],
    maxSpeciesId: 251,
    label: "Gold / Silver",
    shortLabel: "GS",
    colors: ["#daa520", "#c0c0c0"],
    spriteSet: "gs",
    features: { ...PIXEL, abilities: false, hiddenAbilities: false },
  }),
  defineGen({
    id: "rs",
    number: 3,
    versionGroup: "ruby-sapphire",
    versions: ["ruby", "sapphire"],
    maxSpeciesId: 386,
    label: "Ruby / Sapphire",
    shortLabel: "RS",
    colors: ["#a00000", "#0000a0"],
    spriteSet: "rs",
    features: { ...PIXEL, hiddenAbilities: false },
  }),
  defineGen({
    id: "dp",
    number: 4,
    versionGroup: "diamond-pearl",
    versions: ["diamond", "pearl"],
    maxSpeciesId: 493,
    label: "Diamond / Pearl",
    shortLabel: "DP",
    colors: ["#aaaaff", "#ffaaaa"],
    spriteSet: "dp",
    features: { ...PIXEL, hiddenAbilities: false },
  }),
  defineGen({
    id: "bw",
    number: 5,
    versionGroup: "black-white",
    versions: ["black", "white"],
    maxSpeciesId: 649,
    label: "Black / White",
    shortLabel: "BW",
    colors: ["#17171a", "#ffffff"],
    spriteSet: "bw",
    features: PIXEL,
  }),
  defineGen({
    id: "xy",
    number: 6,
    versionGroup: "x-y",
    versions: ["x", "y"],
    maxSpeciesId: 721,
    label: "X / Y",
    shortLabel: "XY",
    colors: ["#1f64b8", "#d3233a"],
    spriteSet: "home",
    features: HOME,
  }),
  defineGen({
    id: "sm",
    number: 7,
    versionGroup: "ultra-sun-ultra-moon",
    versions: ["ultra-sun", "ultra-moon"],
    maxSpeciesId: 809,
    label: "Ultra Sun / Ultra Moon",
    shortLabel: "USUM",
    colors: ["#f28a22", "#6b3fa8"],
    spriteSet: "home",
    features: HOME,
  }),
  defineGen({
    id: "swsh",
    number: 8,
    versionGroup: "sword-shield",
    versions: ["sword", "shield"],
    maxSpeciesId: 905,
    label: "Sword / Shield",
    shortLabel: "SwSh",
    colors: ["#00a0e4", "#d2006e"],
    spriteSet: "home",
    features: HOME,
  }),
  defineGen({
    id: "sv",
    number: 9,
    versionGroup: "scarlet-violet",
    versions: ["scarlet", "violet"],
    maxSpeciesId: 1025,
    label: "Scarlet / Violet",
    shortLabel: "SV",
    colors: ["#e0262c", "#8a3fbe"],
    spriteSet: "home",
    features: HOME,
  }),
];

/** The generation the site opens on. */
export const DEFAULT_GEN: GenId = "bw";

/** The generations whose data is built and pages routed, oldest first. */
export const ENABLED_GENS: readonly GenConfig[] = GENERATIONS.filter(
  (gen) => gen.enabled,
);

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

/** A generation number as a roman numeral (`5` -> `"V"`), as shown in the UI. */
export function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}

/** Looks up a {@link GenConfig} by its id; `undefined` for an unknown or malformed id. */
export function getGen(id: string): GenConfig | undefined {
  return GENERATIONS.find((gen) => gen.id === id);
}
