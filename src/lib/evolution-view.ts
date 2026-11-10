/**
 * Pure view-model builder for the evolution tree shown on the detail page (`EvolutionTree.astro`
 * and `EvolutionBranch.astro` are thin wrappers around this -- see those files' doc comments and
 * `tests/components/evolution-tree.test.ts` for why the logic lives here rather than being
 * asserted on through a rendered component).
 *
 * The view renders the species' **whole** evolution tree, not just the current species' own
 * lineage: a linear chain for as long as each node has exactly one child, and -- at the point a
 * node actually has more than one child -- a branch per child, each carrying its own full
 * sub-tree (recursively: a branch can itself end in a further branch). The currently-viewed
 * species is marked `current` wherever it sits in that tree (chain or nested inside a branch);
 * every other node carries `vtName('sprite', key)` (Review Focus #1: the hero already claims
 * that exact name for the current species, so it alone must have none, and every node across the
 * whole tree needs a name unique from every other node's).
 *
 * Fix round 1, finding #2: an earlier version anchored the view on the current species' own DFS
 * path and only showed its parent's *direct* children as unexpanded branch tiles, which dropped
 * every evolution past the first branch point entirely (Wurmple's page never showed
 * Beautifly/Dustox). Building from the root down, unconditionally, fixes that for every species.
 */
import type { EvoCondition, EvoNode, GenData } from "../data/types";
import type { Lang } from "../i18n/ui";
import { formatCondition } from "./format";
import { vtName } from "./view-transition";

export interface EvoViewNode {
  speciesId: number;
  slug: string;
  /** Default-form sprite key (the species id, as a string). */
  key: string;
  current: boolean;
  /**
   * `vtName('sprite', key)` for every node except the current species -- see the module doc
   * above (Review Focus #1).
   */
  vtName?: string;
}

export interface EvoArrow {
  label: string;
}

/** One child of a branching node, carrying its own full sub-tree. */
export interface EvoBranch {
  /** The condition(s) evolving the branch point into this branch's first node. */
  label: string;
  segment: EvoSegment;
}

/** A linear run of nodes, plus (only once it actually branches) each child's own sub-tree. */
export interface EvoSegment {
  /** The linear run of nodes starting at this segment's root (length >= 1). */
  chain: EvoViewNode[];
  /** One label per adjacent pair in `chain` (length = `chain.length - 1`). */
  arrows: EvoArrow[];
  /** `chain`'s last node's children, each with its own sub-tree, when it has more than one. */
  branches: EvoBranch[];
}

/** The whole-tree view for one detail page; an alias kept for call-site clarity. */
export type EvolutionView = EvoSegment;

function toViewNode(node: EvoNode, currentSpeciesId: number): EvoViewNode {
  const key = String(node.speciesId);
  const current = node.speciesId === currentSpeciesId;
  return {
    speciesId: node.speciesId,
    slug: node.slug,
    key,
    current,
    vtName: current ? undefined : vtName("sprite", key),
  };
}

/**
 * One evolution step's display phrase, deduplicated. Fix round 1, finding #1: a species with
 * several cosmetic sub-forms (e.g. Wormadam's 3 cloaks, Gastrodon's 2 colors) repeats the exact
 * same `EvoCondition` once per sub-form in the raw data, which used to render as e.g.
 * "Ур. 20 / только самки / Ур. 20 / только самки / Ур. 20 / только самки" instead of once.
 * Deduplicating by the *formatted* string (simpler than a deep-equal over `EvoCondition`, and
 * sufficient since two conditions that render identically are indistinguishable to the reader).
 */
function conditionsLabel(
  conditions: EvoCondition[],
  lang: Lang,
  gen: GenData,
): string {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const c of conditions) {
    const label = formatCondition(c, lang, gen);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.join(" / ");
}

function buildSegment(
  node: EvoNode,
  currentSpeciesId: number,
  lang: Lang,
  gen: GenData,
): EvoSegment {
  const chainNodes: EvoNode[] = [node];
  let tail = node;
  while (tail.children.length === 1) {
    tail = tail.children[0]!;
    chainNodes.push(tail);
  }

  const chain = chainNodes.map((n) => toViewNode(n, currentSpeciesId));

  const arrows: EvoArrow[] = [];
  for (let i = 1; i < chainNodes.length; i++) {
    arrows.push({
      label: conditionsLabel(chainNodes[i]!.conditions, lang, gen),
    });
  }

  const branches: EvoBranch[] =
    tail.children.length > 1
      ? tail.children.map((child) => ({
          label: conditionsLabel(child.conditions, lang, gen),
          segment: buildSegment(child, currentSpeciesId, lang, gen),
        }))
      : [];

  return { chain, arrows, branches };
}

/** Builds the whole-tree evolution view rooted at `root` (a species' own `evolution` field). */
export function buildEvolutionView(
  root: EvoNode,
  currentSpeciesId: number,
  lang: Lang,
  gen: GenData,
): EvolutionView {
  return buildSegment(root, currentSpeciesId, lang, gen);
}

/** Every node across the whole view, depth-first -- for invariant checks (current/vt-name uniqueness). */
export function flattenEvolutionView(view: EvolutionView): EvoViewNode[] {
  const nodes = [...view.chain];
  for (const branch of view.branches) {
    nodes.push(...flattenEvolutionView(branch.segment));
  }
  return nodes;
}

/** A node's own primary type, for the `.t-{type}` tint; `undefined` if it's not in this gen's dataset. */
export function evoNodePrimaryType(
  gen: GenData,
  speciesId: number,
): string | undefined {
  return gen.pokemon.find((x) => x.id === speciesId)?.types[0];
}

/** A node's display name, falling back to its evolution-chain slug if it's missing from the dataset. */
export function evoNodeDisplayName(
  gen: GenData,
  speciesId: number,
  fallback: string,
): string {
  return gen.pokemon.find((x) => x.id === speciesId)?.name ?? fallback;
}
