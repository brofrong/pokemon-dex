/**
 * Makes a native `<details>` disclosure close like a typical dropdown menu: Escape closes it
 * (and returns focus to its `<summary>`, so keyboard users don't lose their place), and a click
 * anywhere outside it closes it too. `<details>` has neither behavior built in -- QA bug #5: the
 * generation switcher (`GenSwitcher.astro`'s `details.gen`) only ever closed when its `<summary>`
 * was clicked again.
 *
 * Kept generic (any `<details>`, not just `.gen`) and DOM-free at its core (`isOutsideClick` is a
 * pure predicate, unit-testable without a browser) in case another disclosure ever needs the same
 * behavior; `wireDismissableDetails` is the thin, side-effecting wiring around it.
 */

/** Duck-types a DOM `Node` via `nodeType` instead of `instanceof Node` -- keeps this module (and
 *  its unit test) independent of a global `Node` constructor, which only a real browser/DOM
 *  environment provides. */
function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "nodeType" in value;
}

/** True when `target` is outside `details` (its own `<summary>`/content included) -- i.e. a click
 *  that should close it rather than being an interaction with the disclosure itself. */
export function isOutsideClick(
  details: Node,
  target: EventTarget | null,
): boolean {
  return !isNode(target) || !details.contains(target);
}

/** Closes `details`, and -- unless the close was itself caused by a focus change elsewhere (an
 *  outside click already moving focus) -- returns focus to its `<summary>` so keyboard users
 *  don't lose their place. */
function close(details: HTMLDetailsElement, refocus: boolean): void {
  if (!details.open) return;
  details.open = false;
  if (refocus) details.querySelector("summary")?.focus();
}

/** Wires every `<details>` matching `selector` under `root` to close on Escape or an outside
 *  click. Safe no-op if none exist. */
export function wireDismissableDetails(
  root: ParentNode,
  selector: string,
): void {
  const list = Array.from(root.querySelectorAll<HTMLDetailsElement>(selector));
  if (list.length === 0) return;

  for (const details of list) {
    details.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !details.open) return;
      event.stopPropagation();
      close(details, true);
    });
  }

  // One document-level listener for every instance, rather than one per `<details>`: cheap, and
  // correct regardless of how many disclosures `selector` matches.
  document.addEventListener("click", (event) => {
    for (const details of list) {
      if (details.open && isOutsideClick(details, event.target)) {
        close(details, false);
      }
    }
  });
}
