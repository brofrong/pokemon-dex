/**
 * Which base stats a generation shows, and how they add up (Ruling R-B9, QA bug #9).
 *
 * Generation I had one Special stat instead of Sp. Atk and Sp. Def. The `rb` dataset keeps the
 * six-slot `Stats` shape every generation shares, with the Special value in both special
 * slots (`spa === spd` for all 151), so the detail page shows it as one «Special»/«Спец.» row and
 * every total (detail page, list sort) counts it once: Gengar 425, Mew 500. Pure and DOM-free, so
 * the server-rendered `StatBars`, the client-side form switch (`detail.ts`) and the list sort
 * (`list.ts`) share it.
 */
import type { GenId } from "../data/types";

/** Index of the Sp. Def slot, which a single-Special generation doesn't show or count. */
const SP_DEF = 4;

/** Whether generation `gen` had a single Special stat (only `rb`). */
export function hasSingleSpecial(gen: GenId): boolean {
  return gen === "rb";
}

/** The {@link Stats} indices shown as rows, in game order: all six, or five with one Special. */
export function statRowIndices(singleSpecial: boolean): number[] {
  return [0, 1, 2, 3, 4, 5].filter((i) => !(singleSpecial && i === SP_DEF));
}

/** The base stat total, counting a single Special once. */
export function statTotal(
  stats: readonly number[],
  singleSpecial: boolean,
): number {
  return statRowIndices(singleSpecial).reduce(
    (sum, i) => sum + (stats[i] ?? 0),
    0,
  );
}
