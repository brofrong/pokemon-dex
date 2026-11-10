import type {
  GenData,
  SpriteManifest,
  SpriteSetId,
} from "../../src/data/types";

/** Where `scripts/sprites/build.ts` writes the manifest of sprite set `set`. */
export function spriteManifestPath(set: SpriteSetId): string {
  return `src/data/sprites/${set}.json`;
}

/**
 * Loads a sprite manifest if `scripts/sprites/build.ts` has already produced it. Returns
 * `undefined` if it hasn't (e.g. the very first `bun run data`, before `bun run sprites` has
 * ever run, or a sprite set that isn't built yet) -- there is nothing wrong with the generated
 * data in that case, it just hasn't been narrowed to what actually has sprites yet.
 */
export async function loadSpriteManifest(
  path = spriteManifestPath("bw"),
): Promise<SpriteManifest | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  return (await file.json()) as SpriteManifest;
}

/**
 * Applies sprite availability facts to an already-built `GenData`:
 *  - A non-default form with no front sprite in `manifest` can never be shown in the UI, so it's
 *    dropped (with a `console.warn` naming it) rather than kept as dead data pointing at nothing.
 *  - The species' *default* form (`forms[0]`) can't be dropped the same way -- callers throughout
 *    the app (`src/scripts/variants.ts`'s `resolveForm`, `detail.ts`, ...) assume `forms[0]`
 *    always exists and is valid, so silently filtering it out would just produce a differently-
 *    broken `forms[0]` (some other form's data masquerading as the default) or an empty `forms`
 *    array. If the default form has no front sprite, that's a data/sprite-pipeline bug, not
 *    something the UI can route around -- fail loudly, naming the species, instead.
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
    const defaultForm = species.forms[0];
    if (
      !defaultForm ||
      manifest.sprites[defaultForm.key]?.front === undefined
    ) {
      throw new Error(
        `[data] species '${species.slug}' (#${species.id}): default form '${defaultForm?.key ?? "<missing>"}' has no front sprite in the manifest -- cannot build a valid forms[0]`,
      );
    }

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
