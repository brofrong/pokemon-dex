/**
 * Pure view-model builder for the evolution tree shown on the detail page (`EvolutionTree.astro`
 * is a thin wrapper around this -- see that file's doc comment and
 * `tests/components/evolution-tree.test.ts` for why the logic lives here rather than being
 * asserted on through a rendered component).
 *
 * The view is: the single lineage from the species root through the currently-viewed species,
 * extended forward through descendants for as long as each one has exactly one child, and --
 * only once that chain actually branches -- that final node's children as separate "branch"
 * tiles instead of continuing the linear chain. Siblings that exist elsewhere in the tree (e.g.
 * the other 6 Eeveelutions when viewing Vaporeon's own page) are deliberately not shown.
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
   * `vtName('sprite', key)` for every node except the current species -- see Review Focus #1:
   * the hero already claims that exact name for the current species/form, and a duplicate
   * `view-transition-name` anywhere in the document drops the whole transition.
   */
  vtName?: string;
}

export interface EvoArrow {
  label: string;
}

export interface EvoBranch {
  node: EvoViewNode;
  label: string;
}

export interface EvolutionView {
  chain: EvoViewNode[];
  arrows: EvoArrow[];
  branches: EvoBranch[];
}

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

/** DFS path from `root` to the node with `speciesId`, inclusive of both ends; `null` if absent. */
function findPath(root: EvoNode, speciesId: number): EvoNode[] | null {
  if (root.speciesId === speciesId) return [root];
  for (const child of root.children) {
    const rest = findPath(child, speciesId);
    if (rest) return [root, ...rest];
  }
  return null;
}

function conditionsLabel(
  conditions: EvoCondition[],
  lang: Lang,
  gen: GenData,
): string {
  return conditions.map((c) => formatCondition(c, lang, gen)).join(" / ");
}

export function buildEvolutionView(
  root: EvoNode,
  currentSpeciesId: number,
  lang: Lang,
  gen: GenData,
): EvolutionView {
  const path = findPath(root, currentSpeciesId) ?? [root];

  const forward: EvoNode[] = [];
  let tail = path[path.length - 1]!;
  while (tail.children.length === 1) {
    tail = tail.children[0]!;
    forward.push(tail);
  }

  const chainNodes = [...path, ...forward];
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
          node: toViewNode(child, currentSpeciesId),
          label: conditionsLabel(child.conditions, lang, gen),
        }))
      : [];

  return { chain, arrows, branches };
}
