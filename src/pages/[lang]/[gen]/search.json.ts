/**
 * ⌘K search-palette data source (Task 12): `/{lang}/{gen}/search.json`, a compact per-language
 * index of every Pokémon in one generation (`searchTuples`, `src/lib/list-data.ts`:
 * `[id, slug, displayName, key, types]`), consumed client-side by `src/scripts/palette.ts` so
 * detail pages can search the whole generation without shipping its full dataset. `key` is the
 * same bilingual `searchKey` the list page filters with, so "пика"/"pika"/"25" behave identically
 * here; `types` are the generation's own (Clefairy is Normal before gen VI).
 *
 * Static (`output: 'static'`, prerendered at build time via `getStaticPaths`) like every other
 * route.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { ENABLED_GENS } from "../../../lib/generations";
import { getGenData } from "../../../lib/gen-data";
import { searchTuples } from "../../../lib/list-data";
import { LANGS } from "../../../i18n/ui";
import type { Lang } from "../../../i18n/ui";
import type { GenId } from "../../../data/types";

export type { SearchTuple } from "../../../lib/list-data";

export const getStaticPaths: GetStaticPaths = () =>
  LANGS.flatMap((lang) =>
    ENABLED_GENS.map((g) => ({ params: { lang, gen: g.id } })),
  );

export const GET: APIRoute = ({ params }) => {
  const lang = (params.lang as Lang | undefined) ?? "en";
  const tuples = searchTuples(getGenData(params.gen as GenId), lang);
  return new Response(JSON.stringify(tuples), {
    headers: { "Content-Type": "application/json" },
  });
};
