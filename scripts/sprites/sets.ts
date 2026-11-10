import type { SpriteSetId, Variant } from "../../src/data/types";

/** Where one variant's upstream source files live for a sprite set, inside the sparse
 * `PokeAPI/sprites` checkout rooted at `.cache/sprites`. */
export interface VariantSource {
  /** Directory holding `{key}.{ext}` files (e.g. `{pokemonId}.png` for `home`), relative to
   * the sparse checkout root (`.cache/sprites`). */
  dir: string;
  /** Upstream file extension, without the dot. */
  ext: "png" | "gif";
}

/**
 * Static config for one sprite set, consumed by `scripts/sprites/build-set.ts` (the pixel sets:
 * `rb`, `gs`, `rs`, `dp`, `bw`) and `scripts/sprites/build-home.ts` (`home`). Values come from
 * `constraints.md`'s Global Constraints (sprite sets) and the design spec's «Спрайты VI–IX».
 */
export interface SpriteSetConfig {
  id: SpriteSetId;
  /** Every variant this set might produce a file for; others are never attempted. */
  variants: Variant[];
  /** Per-variant upstream source location; a variant with no entry is never attempted. */
  sources: Partial<Record<Variant, VariantSource>>;
  /** Variants whose upstream file is kept as a full animation (every frame); the rest keep only
   * the first frame as a static image. */
  animatedVariants: Variant[];
  /** Pixel sets re-encode losslessly; `home`'s photographic 3D renders are encoded lossy. */
  lossless: boolean;
  /** `home` only: resize every sprite to fit inside this many px (aspect kept, background
   * transparent) before encoding. Pixel sets keep their native (tiny) size untouched. */
  resize?: number;
  /** `home` only: lossy WebP quality (0-100). */
  quality?: number;
  /** Whether this set's sprites are crisp pixel art (`image-rendering: pixelated`) or a smooth
   * 3D render; recorded in the manifest so the `Sprite` component (Task 6) can pick the right
   * CSS per set. */
  pixelated: boolean;
  /** Atlas cell target size in px; defaults to each sprite's own (native) size when omitted.
   * `home`'s atlas is downscaled further than its per-sprite files to keep it small. */
  atlasCell?: number;
  /**
   * Which stem upstream non-default-form files use: `bw` and `gs` name them by our own
   * `{speciesId}-{formSlug}` `Form.key` (e.g. `386-attack.gif`), but `rs` and `dp` -- like
   * `home` -- only have a `{pokemonId}` file (e.g. `10001.png`), with no per-form-named file at
   * all. A default form's key and pokemonId are always the same number, so this only matters
   * for non-default forms.
   */
  filenameBy: "key" | "pokemonId";
}

const V = "sprites/pokemon/versions";

/** `rb`, `gs`, `rs`, `dp`, `bw` share this directory layout under their own root: the front
 * variants live directly under `front`/`front/shiny`/`front/female`/`front/shiny/female`, the
 * back variants under the matching `back/...` path. Not every set has every subpath (see
 * `pathsFor`). */
function pixelSources(
  frontDir: string,
  frontExt: "png" | "gif",
  backDir: string,
  backExt: "png" | "gif",
  hasFemale: boolean,
): Partial<Record<Variant, VariantSource>> {
  const front = (sub: string): VariantSource => ({
    dir: sub ? `${frontDir}/${sub}` : frontDir,
    ext: frontExt,
  });
  const back = (sub: string): VariantSource => ({
    dir: sub ? `${backDir}/${sub}` : backDir,
    ext: backExt,
  });
  const sources: Partial<Record<Variant, VariantSource>> = {
    front: front(""),
    "front-shiny": front("shiny"),
    back: back(""),
    "back-shiny": back("shiny"),
  };
  if (hasFemale) {
    sources["front-female"] = front("female");
    sources["front-shiny-female"] = front("shiny/female");
    sources["back-female"] = back("female");
    sources["back-shiny-female"] = back("shiny/female");
  }
  return sources;
}

/** Every sprite set the pipeline knows how to build, keyed by `SpriteSetId`. */
export const SPRITE_SETS: Record<SpriteSetId, SpriteSetConfig> = {
  rb: {
    id: "rb",
    variants: ["front", "back"],
    sources: {
      front: { dir: `${V}/generation-i/red-blue/transparent`, ext: "png" },
      back: { dir: `${V}/generation-i/red-blue/transparent/back`, ext: "png" },
    },
    animatedVariants: [],
    lossless: true,
    pixelated: true,
    filenameBy: "key",
  },
  gs: {
    id: "gs",
    variants: ["front", "front-shiny", "back", "back-shiny"],
    sources: pixelSources(
      `${V}/generation-ii/crystal/animated`,
      "gif",
      `${V}/generation-ii/crystal/transparent/back`,
      "png",
      false,
    ),
    animatedVariants: ["front", "front-shiny"],
    lossless: true,
    pixelated: true,
    // Crystal has a per-form file for every non-default form it has (confirmed for Unown's 26
    // letters: `201-a.gif` .. `201-z.gif`, alongside the default `201.gif`).
    filenameBy: "key",
  },
  rs: {
    id: "rs",
    variants: ["front", "front-shiny", "back", "back-shiny"],
    sources: pixelSources(
      `${V}/generation-iii/emerald/animated`,
      "png",
      `${V}/generation-iii/emerald/back`,
      "png",
      false,
    ),
    animatedVariants: ["front", "front-shiny"],
    lossless: true,
    pixelated: true,
    // Emerald has no per-form files at all -- Deoxys-Speed's only sprite is its pokemonId's
    // `10003.png`, there is no `386-speed.png`.
    filenameBy: "pokemonId",
  },
  dp: {
    id: "dp",
    variants: [
      "front",
      "front-shiny",
      "front-female",
      "front-shiny-female",
      "back",
      "back-shiny",
      "back-female",
      "back-shiny-female",
    ],
    sources: pixelSources(
      `${V}/generation-iv/heartgold-soulsilver/animated`,
      "png",
      `${V}/generation-iv/heartgold-soulsilver/back`,
      "png",
      true,
    ),
    animatedVariants: [
      "front",
      "front-shiny",
      "front-female",
      "front-shiny-female",
    ],
    lossless: true,
    pixelated: true,
    // Same as `rs`: HeartGold/SoulSilver has no per-form files, only pokemonId ones (confirmed
    // for Castform/Deoxys/Rotom/Giratina/Shaymin's forms).
    filenameBy: "pokemonId",
  },
  bw: {
    id: "bw",
    variants: [
      "front",
      "front-shiny",
      "front-female",
      "front-shiny-female",
      "back",
      "back-shiny",
      "back-female",
      "back-shiny-female",
    ],
    sources: pixelSources(
      `${V}/generation-v/black-white/animated`,
      "gif",
      `${V}/generation-v/black-white/animated/back`,
      "gif",
      true,
    ),
    animatedVariants: [
      "front",
      "front-shiny",
      "front-female",
      "front-shiny-female",
    ],
    lossless: true,
    pixelated: true,
    filenameBy: "key",
  },
  home: {
    id: "home",
    variants: ["front", "front-shiny", "front-female", "front-shiny-female"],
    sources: {
      front: { dir: "sprites/pokemon/other/home", ext: "png" },
      "front-shiny": { dir: "sprites/pokemon/other/home/shiny", ext: "png" },
      "front-female": { dir: "sprites/pokemon/other/home/female", ext: "png" },
      "front-shiny-female": {
        dir: "sprites/pokemon/other/home/shiny/female",
        ext: "png",
      },
    },
    animatedVariants: [],
    lossless: false,
    resize: 192,
    quality: 70,
    pixelated: false,
    atlasCell: 96,
    // Moot here (`build-home.ts` always resolves by `pokemonId` directly, never reads this
    // field), but `pokemonId` documents the real convention for consistency with `rs`/`dp`.
    filenameBy: "pokemonId",
  },
};
