import type { GenId } from "../data/types";

/** Static config for one generation: what's built for it, and how the switcher shows it. */
export interface GenConfig {
  id: GenId;
  number: number;
  /** PokeAPI `version_groups.identifier` the dataset is resolved against. */
  versionGroup: string;
  /** PokeAPI `versions.identifier` pair, used as the `Pokemon.flavor` keys. */
  versions: [string, string];
  maxSpeciesId: number;
  label: string;
  /** The two colors shown as dots in the generation switcher. */
  colors: [string, string];
  /** Whether this generation's data is actually built and routed. Only `bw` is. */
  enabled: boolean;
}

/** Every generation the switcher lists. Only Black/White (`bw`) ships; I-IV show as "soon". */
export const GENERATIONS: GenConfig[] = [
  {
    id: "rb",
    number: 1,
    versionGroup: "red-blue",
    versions: ["red", "blue"],
    maxSpeciesId: 151,
    label: "Red / Blue",
    colors: ["#da3914", "#2e50d8"],
    enabled: false,
  },
  {
    id: "gs",
    number: 2,
    versionGroup: "gold-silver",
    versions: ["gold", "silver"],
    maxSpeciesId: 251,
    label: "Gold / Silver",
    colors: ["#daa520", "#c0c0c0"],
    enabled: false,
  },
  {
    id: "rs",
    number: 3,
    versionGroup: "ruby-sapphire",
    versions: ["ruby", "sapphire"],
    maxSpeciesId: 386,
    label: "Ruby / Sapphire",
    colors: ["#a00000", "#0000a0"],
    enabled: false,
  },
  {
    id: "dp",
    number: 4,
    versionGroup: "diamond-pearl",
    versions: ["diamond", "pearl"],
    maxSpeciesId: 493,
    label: "Diamond / Pearl",
    colors: ["#aaaaff", "#ffaaaa"],
    enabled: false,
  },
  {
    id: "bw",
    number: 5,
    versionGroup: "black-white",
    versions: ["black", "white"],
    maxSpeciesId: 649,
    label: "Black / White",
    colors: ["#17171a", "#ffffff"],
    enabled: true,
  },
];

/** The only generation actually built for this site. */
export const DEFAULT_GEN: GenId = "bw";

/** Looks up a {@link GenConfig} by its id; `undefined` for an unknown or malformed id. */
export function getGen(id: string): GenConfig | undefined {
  return GENERATIONS.find((gen) => gen.id === id);
}
