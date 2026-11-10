/**
 * Cross-document `view-transition-name` values for the detail page's shared elements (the
 * sprite, name and type badges that "fly" from a list card into the hero, and from the hero into
 * a neighbouring page's evolution tile -- see `docs/design/mockup.html` section 2's note).
 *
 * Deliberately trivial (`${kind}-${formKey}`): the real complexity lives in callers making sure
 * no two elements on the *same* page ever get the same name (Review Focus #1 -- a duplicate
 * `view-transition-name` anywhere in a document drops the whole transition). In particular,
 * `EvolutionTree` must omit this for the chain's current-species node, since the hero already
 * claims `vtName('sprite'|'name'|'types', formKey)` for that exact species/form.
 */

export type VtKind = "sprite" | "name" | "types";

/** e.g. `vtName('sprite', '479-heat')` -> `"sprite-479-heat"`. */
export function vtName(kind: VtKind, formKey: string): string {
  return `${kind}-${formKey}`;
}
