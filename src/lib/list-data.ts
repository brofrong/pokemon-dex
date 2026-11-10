/**
 * Payload builders for a generation's two JSON endpoints, kept pure (dataset in, tuples out) so
 * they're unit tested against the real datasets (`tests/lib/list-data.test.ts`):
 *  - {@link listTuples} -> `/{lang}/{gen}/list.json`: what the list page's filters/sort need but
 *    its cards no longer carry (a 1025-card page has to fit 70 KB gzip): the bilingual search key,
 *    base stats, the whole evolution chain's species ids (sprite prefetch) and every flag.
 *  - {@link searchTuples} -> `/{lang}/{gen}/search.json`: the ⌘K palette's index.
 * Tuples rather than objects: no repeated field names across up to 1025 entries.
 */
import type { EvoNode, Flag, GenData, Stats, TypeSlug } from "../data/types";
import type { Lang } from "../i18n/ui";
import { pokemonName } from "../i18n/names";
import { searchKey } from "./search";

/** One list-page card's data: id, bilingual search key, base stats, evolution-chain ids, flags. */
export type ListTuple = [
  id: number,
  searchKey: string,
  stats: Stats,
  evoIds: number[],
  flags: Flag[],
];

/** One Pokémon's palette entry: id, slug, localized display name, bilingual search key, types. */
export type SearchTuple = [
  id: number,
  slug: string,
  displayName: string,
  key: string,
  types: TypeSlug[],
];

/** Every species id in an evolution chain, depth first. */
export function flattenEvo(node: EvoNode): number[] {
  return [node.speciesId, ...node.children.flatMap(flattenEvo)];
}

export function listTuples(gen: GenData): ListTuple[] {
  return gen.pokemon.map((p) => [
    p.id,
    searchKey(p),
    p.stats,
    flattenEvo(p.evolution),
    p.flags,
  ]);
}

export function searchTuples(gen: GenData, lang: Lang): SearchTuple[] {
  return gen.pokemon.map((p) => [
    p.id,
    p.slug,
    pokemonName(lang, p),
    searchKey(p),
    p.types,
  ]);
}
