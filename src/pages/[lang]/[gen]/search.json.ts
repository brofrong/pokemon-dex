/**
 * ⌘K search-palette data source (Task 12): a compact per-language index of every Pokémon in a
 * generation, consumed client-side by `src/scripts/palette.ts` so detail pages can search the
 * whole Pokédex without shipping `bw.json`'s full per-Pokémon payload (stats, abilities,
 * evolution, flavor text, …) just to render a results list.
 *
 * Tuples (`[id, slug, displayName, key, types]`) rather than objects: no repeated field names
 * across 649 entries, which keeps the gzipped payload well under the 20 KB this task's test
 * pins (`tests/pages/search-json.test.ts`) -- measured ~4-5 KB gzip per language.
 *
 * `key` is `searchKey(p)` (see `src/lib/search.ts`): the same bilingual, normalized string the
 * list page's instant search already filters with, so typing "пика"/"pika"/"25" behaves
 * identically here. `displayName` is localized (`pokemonName`); `slug` feeds `pokemonUrl` for
 * navigation.
 *
 * Static (`output: 'static'`, prerendered at build time via `getStaticPaths`) like every other
 * route -- both inputs (`lang`, `gen`) are fixed per path, so there's nothing to read at request
 * time.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { GENERATIONS } from "../../../lib/generations";
import { LANGS } from "../../../i18n/ui";
import type { Lang } from "../../../i18n/ui";
import type { GenData, TypeSlug } from "../../../data/types";
import { pokemonName } from "../../../i18n/names";
import { searchKey } from "../../../lib/search";
import bwJson from "../../../data/gen/bw.json";

export const getStaticPaths: GetStaticPaths = () => {
  const enabledGens = GENERATIONS.filter((g) => g.enabled);
  return LANGS.flatMap((lang) =>
    enabledGens.map((g) => ({ params: { lang, gen: g.id } })),
  );
};

/** One Pokémon's palette entry: id, slug, localized display name, bilingual search key, types. */
export type SearchTuple = [
  id: number,
  slug: string,
  displayName: string,
  key: string,
  types: TypeSlug[],
];

export const GET: APIRoute = ({ params }) => {
  const lang = (params.lang as Lang | undefined) ?? "en";
  // Only `bw` is enabled/built (see `getStaticPaths` above and `GENERATIONS`), so this is always
  // the Black/White dataset -- the same assumption the list and detail pages already make.
  const genData = bwJson as unknown as GenData;

  const tuples: SearchTuple[] = genData.pokemon.map((p) => [
    p.id,
    p.slug,
    pokemonName(lang, p),
    searchKey(p),
    p.types,
  ]);

  return new Response(JSON.stringify(tuples), {
    headers: { "Content-Type": "application/json" },
  });
};
