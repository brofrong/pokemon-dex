/**
 * `/{lang}/{gen}/list.json`: the list page's deferred card data -- per species `[id, searchKey,
 * stats, evoIds, flags]` (`listTuples`, `src/lib/list-data.ts`). The list page's cards carry only
 * what they display (a 1025-card page must fit 70 KB gzip); `src/scripts/list.ts` fetches this
 * right after first paint for bilingual search, stat sorts, flag filters and evolution-chain
 * sprite prefetch. The content is the same for both languages (the search key is bilingual); it
 * sits under `{lang}` so each list page fetches a sibling URL. Prerendered at build time.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { ENABLED_GENS } from "../../../lib/generations";
import { getGenData } from "../../../lib/gen-data";
import { listTuples } from "../../../lib/list-data";
import { LANGS } from "../../../i18n/ui";
import type { GenId } from "../../../data/types";

export const getStaticPaths: GetStaticPaths = () =>
  LANGS.flatMap((lang) =>
    ENABLED_GENS.map((g) => ({ params: { lang, gen: g.id } })),
  );

export const GET: APIRoute = ({ params }) => {
  const tuples = listTuples(getGenData(params.gen as GenId));
  return new Response(JSON.stringify(tuples), {
    headers: { "Content-Type": "application/json" },
  });
};
