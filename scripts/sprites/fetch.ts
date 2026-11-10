import { stat } from "node:fs/promises";
import { SPRITES_SHA } from "../pins";

const REPO_URL = "https://github.com/PokeAPI/sprites.git";

/**
 * Every Black/White animated variant (front, shiny, back, female and their combinations) lives
 * under here as `{key}.gif` / `{subdir}/{key}.gif`. Kept as its own export -- `build.ts` still
 * reads it directly -- even though it's also the first entry of {@link SPARSE_PATHS}.
 */
export const SPARSE_PATH =
  "sprites/pokemon/versions/generation-v/black-white/animated";

/**
 * Every folder the sprite pipeline needs out of the (huge) PokeAPI/sprites repo, one per sprite
 * set (see `scripts/sprites/sets.ts`'s `SPRITE_SETS` for what each actually contains):
 *  - `rb`: gen-I red/blue, static, front+back, no shiny/female.
 *  - `gs`: gen-II crystal, animated front (+shiny), static back (+shiny), no female.
 *  - `rs`: gen-III emerald, animated front (+shiny), static back (+shiny), no female.
 *  - `dp`: gen-IV heartgold/soulsilver, animated front (+shiny, female, shiny/female), static
 *    back (+shiny, female, shiny/female) -- same layout as `bw`'s own folder.
 *  - `bw`: see {@link SPARSE_PATH}.
 *  - `home`: Pokémon HOME renders (front, +shiny, +female, +shiny/female; no back), named by
 *    `pokemonId` rather than our `Form.key`.
 * A git cone-mode sparse checkout of a directory implicitly includes every file under it, so
 * e.g. `.../heartgold-soulsilver/animated` alone covers its `shiny`, `female` and `shiny/female`
 * subdirectories too.
 */
export const SPARSE_PATHS: string[] = [
  SPARSE_PATH,
  "sprites/pokemon/versions/generation-i/red-blue/transparent",
  "sprites/pokemon/versions/generation-ii/crystal/animated",
  "sprites/pokemon/versions/generation-ii/crystal/transparent/back",
  "sprites/pokemon/versions/generation-iii/emerald/animated",
  "sprites/pokemon/versions/generation-iii/emerald/back",
  "sprites/pokemon/versions/generation-iv/heartgold-soulsilver/animated",
  "sprites/pokemon/versions/generation-iv/heartgold-soulsilver/back",
  "sprites/pokemon/other/home",
];

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures a sparse, blobless clone of PokeAPI/sprites exists at `dir`, checked out to `sha`,
 * containing only `paths` -- the full repo has well over a hundred thousand sprite files across
 * every generation and game, so a normal clone would be enormous.
 *
 * If `dir` already holds a clone (from a previous run), this skips the `clone` step. The
 * `sparse-checkout set` call always runs, replacing whatever set of paths an earlier run may
 * have configured -- cheap once cloned, and lets a later run add a new sprite set's folder to
 * an existing cache without a fresh clone.
 */
export async function fetchSprites(
  dir = ".cache/sprites",
  sha = SPRITES_SHA,
  paths: string[] = SPARSE_PATHS,
): Promise<void> {
  if (!(await pathExists(`${dir}/.git`))) {
    await Bun.$`git clone --filter=blob:none --sparse ${REPO_URL} ${dir}`;
  }
  await Bun.$`git -C ${dir} sparse-checkout set ${paths}`;
  await Bun.$`git -C ${dir} checkout ${sha}`;
}

if (import.meta.main) {
  await fetchSprites();
  console.log(`[sprites] fetched PokeAPI/sprites @ ${SPRITES_SHA}`);
}
