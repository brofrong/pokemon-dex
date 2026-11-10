import { stat } from "node:fs/promises";
import { SPRITES_SHA } from "../pins";

const REPO_URL = "https://github.com/PokeAPI/sprites.git";

/**
 * The only folder the sprite pipeline needs out of the (huge) PokeAPI/sprites repo: every
 * Black/White animated variant (front, shiny, back, female and their combinations) lives under
 * here as `{key}.gif` / `{subdir}/{key}.gif`.
 */
export const SPARSE_PATH =
  "sprites/pokemon/versions/generation-v/black-white/animated";

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
 * containing only {@link SPARSE_PATH} -- the full repo has well over a hundred thousand sprite
 * files across every generation and game, so a normal clone would be enormous.
 *
 * If `dir` already holds a clone (from a previous run), this skips straight to the checkout:
 * re-running the pipeline after the pin changes is cheap, and re-running it with the same pin
 * is a no-op beyond the `git checkout`.
 */
export async function fetchSprites(
  dir = ".cache/sprites",
  sha = SPRITES_SHA,
): Promise<void> {
  if (!(await pathExists(`${dir}/.git`))) {
    await Bun.$`git clone --filter=blob:none --sparse ${REPO_URL} ${dir}`;
    await Bun.$`git -C ${dir} sparse-checkout set ${SPARSE_PATH}`;
  }
  await Bun.$`git -C ${dir} checkout ${sha}`;
}

if (import.meta.main) {
  await fetchSprites();
  console.log(`[sprites] fetched PokeAPI/sprites @ ${SPRITES_SHA}`);
}
