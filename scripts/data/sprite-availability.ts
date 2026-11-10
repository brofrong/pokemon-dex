import type { GenData, SpriteManifest } from "../../src/data/types";

/** Where `scripts/sprites/build.ts` writes the sprite manifest this reads sprite facts from. */
const MANIFEST_PATH = "src/data/sprites/bw.json";

/**
 * Loads the sprite manifest if `scripts/sprites/build.ts` has already produced one. Returns
 * `undefined` if it hasn't (e.g. the very first `bun run data`, before `bun run sprites` has
 * ever run) -- there is nothing wrong with the generated data in that case, it just hasn't been
 * narrowed to what actually has sprites yet.
 */
export async function loadSpriteManifest(
  path = MANIFEST_PATH,
): Promise<SpriteManifest | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  return (await file.json()) as SpriteManifest;
}

/**
 * Applies sprite availability facts to an already-built `GenData`:
 *  - A form with no front sprite in `manifest` can never be shown in the UI, so it's dropped
 *    (with a `console.warn` naming it) rather than kept as dead data pointing at nothing.
 *  - `hasGenderDiff` is ANDed with whether the species' default form has a front-female sprite:
 *    PokeAPI's own `has_gender_differences` flag is about the games in general, not specifically
 *    about whether Black/White's animated sprite set actually shipped that female sprite.
 *
 * When `manifest` is `undefined`, `data` is returned unchanged (see {@link loadSpriteManifest}).
 */
export function applySpriteAvailability(
  data: GenData,
  manifest: SpriteManifest | undefined,
): GenData {
  if (!manifest) return data;

  const pokemon = data.pokemon.map((species) => {
    const forms = species.forms.filter((form) => {
      const hasFront = manifest.sprites[form.key]?.front !== undefined;
      if (!hasFront) {
        console.warn(
          `[data] dropping form '${form.key}' of ${species.slug}: no front sprite`,
        );
      }
      return hasFront;
    });

    const hasGenderDiff =
      species.hasGenderDiff &&
      manifest.sprites[String(species.id)]?.["front-female"] !== undefined;

    return { ...species, forms, hasGenderDiff };
  });

  return { ...data, pokemon };
}
