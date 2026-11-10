/**
 * Defensive type matchups for a set of defending types, computed purely from the generation's
 * already-resolved type chart (`GenData.chart`). This is the runtime counterpart of
 * `scripts/data/resolve.ts`'s `defensiveProfile` (same formula), kept dependency-free from the
 * build-time scripts so pages/components can import it directly.
 */
import type { Multiplier, TypeChart, TypeSlug } from "../data/types";

/** The damage multiplier each attacking type in `inGen` deals to a defender with `types`. */
export function matchups(
  types: TypeSlug[],
  chart: TypeChart,
  inGen: TypeSlug[],
): Record<TypeSlug, Multiplier> {
  const result = {} as Record<TypeSlug, Multiplier>;
  for (const attacker of inGen) {
    let multiplier = 1;
    for (const defender of types) {
      multiplier *= chart[attacker]?.[defender] ?? 1;
    }
    result[attacker] = multiplier as Multiplier;
  }
  return result;
}

/** The five displayed buckets, worst-for-the-defender first, matching the mockup's row order. */
export const MATCHUP_BUCKETS: Multiplier[] = [4, 2, 0.5, 0.25, 0];

/**
 * Display metadata for each bucket, shared by the server-rendered `TypeMatchups.astro` and the
 * client-side re-render in `src/scripts/detail.ts` (a form switch, e.g. Rotom, can change which
 * types are super/not-very effective) so the two never drift apart.
 */
export const BUCKET_LABEL: Record<Multiplier, string> = {
  4: "×4",
  2: "×2",
  1: "×1",
  0.5: "×½",
  0.25: "×¼",
  0: "×0",
};

export const BUCKET_CLASS: Record<Multiplier, string> = {
  4: "x4",
  2: "x2",
  1: "",
  0.5: "xh",
  0.25: "xq",
  0: "x0",
};

/**
 * Groups a {@link matchups} profile into the five displayed buckets, in {@link MATCHUP_BUCKETS}
 * order; neutral (×1) matchups are dropped entirely (not one of the five rows).
 */
export function groupMatchups(
  profile: Partial<Record<TypeSlug, Multiplier>>,
): Map<Multiplier, TypeSlug[]> {
  const groups = new Map<Multiplier, TypeSlug[]>(
    MATCHUP_BUCKETS.map((m) => [m, []]),
  );
  for (const [type, mult] of Object.entries(profile) as [
    TypeSlug,
    Multiplier,
  ][]) {
    groups.get(mult)?.push(type);
  }
  return groups;
}
