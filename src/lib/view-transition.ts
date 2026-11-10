/**
 * View Transition helpers.
 *
 * 1. Cross-document `view-transition-name` values for the detail page's shared elements (the
 *    sprite, name and type badges that "fly" from a list card into the hero, and from the hero
 *    into a neighbouring page's evolution tile -- see `docs/design/mockup.html` section 2's note).
 *    Deliberately trivial (`${kind}-${formKey}`): the real complexity lives in callers making sure
 *    no two elements on the *same* page ever get the same name (Review Focus #1 -- a duplicate
 *    `view-transition-name` anywhere in a document drops the whole transition). In particular,
 *    `EvolutionTree` must omit this for the chain's current-species node, since the hero already
 *    claims `vtName('sprite'|'name'|'types', formKey)` for that exact species/form.
 *
 * 2. `withViewTransition` (Task 8): same-document transitions for the list's filter/sort/shiny
 *    and the detail hero's variant/form switch. Progressive and defensive: no API, reduced motion,
 *    or a transition already in flight all mean "just apply the update", and nothing here throws.
 *
 * 3. `listVtNames`: the per-card names the list assigns to on-screen cards for the duration of
 *    one transition only (never in the static HTML -- the 70 KB list budget).
 */

export type VtKind = "sprite" | "name" | "types";

/** e.g. `vtName('sprite', '479-heat')` -> `"sprite-479-heat"`. */
export function vtName(kind: VtKind, formKey: string): string {
  return `${kind}-${formKey}`;
}

/** The subset of a browser `ViewTransition` this module touches. */
interface TransitionLike {
  finished: Promise<unknown>;
  ready?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
  skipTransition?(): void;
}

/** Injectable environment (the real `document`/`matchMedia` by default; a fake in tests). */
export interface VtEnv {
  document?: {
    startViewTransition?(update: () => unknown): TransitionLike;
    documentElement?: {
      classList: { add(c: string): void; remove(c: string): void };
    };
  };
  matchMedia?: (query: string) => { matches: boolean };
}

export interface VtOptions {
  /** Run `update` directly, no transition (e.g. too many cards would move, data not ready). */
  skip?: boolean;
  /** Runs right before the old state is captured -- only when a transition really starts. */
  before?: () => void;
  /** Runs once the transition settles (finished, skipped or failed) -- always, if `before` ran. */
  after?: () => void;
  /** A class on `<html>` for the transition's lifetime, to scope its `::view-transition-*` CSS. */
  rootClass?: string;
}

/** Hard ceiling after which a stuck transition (a `finished` that never settles) is released. */
const SETTLE_TIMEOUT_MS = 3000;

interface Running {
  /** Applies the captured update now if the browser hasn't yet (idempotent). */
  flush: () => void;
  skip: () => void;
}

let running: Running | null = null;

/** Test hook: forget any in-flight transition. */
export function resetViewTransitionState(): void {
  running = null;
}

function defaultEnv(): VtEnv {
  return {
    document: typeof document === "undefined" ? undefined : document,
    matchMedia:
      typeof matchMedia === "function"
        ? (q: string) => matchMedia(q)
        : undefined,
  };
}

function reducedMotion(env: VtEnv): boolean {
  try {
    return Boolean(
      env.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    );
  } catch {
    return false;
  }
}

const swallow = (): void => {};

/**
 * Applies `update` inside `document.startViewTransition` when that's available, motion is
 * allowed and no other transition is in flight; otherwise calls it directly. Never throws
 * (beyond whatever `update` itself throws on the direct path).
 *
 * Re-entrancy: a call while a transition is still running first applies the earlier update if
 * the browser hasn't invoked it yet (so updates always land in order, each exactly once), skips
 * that transition, and applies this one directly -- rapid clicking never queues animations or
 * loses a state change. The next call after it settles animates again.
 *
 * `update` may return a promise (e.g. waiting briefly for a new sprite to decode); the browser
 * holds the new-state capture until it settles. Its argument says whether it runs as a
 * transition's update callback (so it may assign transition-only names, which `after` clears)
 * or directly (no transition: assign nothing that would need cleaning up).
 */
export function withViewTransition(
  update: (inTransition: boolean) => void | Promise<unknown>,
  options: VtOptions = {},
  env: VtEnv = defaultEnv(),
): void {
  const doc = env.document;
  if (running) {
    const prev = running;
    prev.flush();
    try {
      prev.skip();
    } catch {
      // already finished/skipped -- nothing to do.
    }
    update(false);
    return;
  }
  if (
    options.skip ||
    !doc ||
    typeof doc.startViewTransition !== "function" ||
    reducedMotion(env)
  ) {
    update(false);
    return;
  }

  // Applies `update` exactly once: as the transition's callback (`inTransition` true) or, if the
  // transition is superseded, fails to start or never settles, directly (false) -- in those cases
  // nothing will capture the new state, so transition-only names would be pointless.
  let applied = false;
  let result: void | Promise<unknown>;
  const apply = (inTransition: boolean): void | Promise<unknown> => {
    if (applied) return result;
    applied = true;
    result = update(inTransition);
    return result;
  };

  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const token: Running = { flush: () => void apply(false), skip: swallow };
  const cleanup = (): void => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    apply(false); // never leave the state un-applied, whatever happened to the transition
    try {
      options.after?.();
    } finally {
      if (options.rootClass)
        doc.documentElement?.classList.remove(options.rootClass);
      if (running === token) running = null;
    }
  };

  try {
    options.before?.();
    if (options.rootClass)
      doc.documentElement?.classList.add(options.rootClass);
    running = token;
    const t = doc.startViewTransition(() => apply(true));
    token.skip = () => t.skipTransition?.();
    t.ready?.catch(swallow);
    t.updateCallbackDone?.catch(swallow);
    t.finished.then(cleanup, cleanup);
    timer = setTimeout(cleanup, SETTLE_TIMEOUT_MS);
  } catch {
    cleanup();
  }
}

/**
 * Marks a browser-created (cross-document) `ViewTransition`'s promises as handled. When Chromium
 * aborts one -- navigating again before the previous transition settled, a prerendered page
 * activating, "Page already revealed" -- they reject with `InvalidStateError`; any `.then()` a
 * page hangs off them without a rejection handler (or the promises themselves) would otherwise
 * surface as an uncaught error. Returns the transition's `finished`, never rejecting.
 */
export function swallowTransitionAborts(
  vt: TransitionLike | null | undefined,
): Promise<void> {
  if (!vt) return Promise.resolve();
  vt.ready?.catch(swallow);
  vt.updateCallbackDone?.catch(swallow);
  return Promise.resolve(vt.finished).then(swallow, swallow);
}

/**
 * Inline `<head>` script (`Base.astro`) that swallows aborted cross-document view transitions.
 * Chromium aborts the native `@view-transition` one when the visitor navigates again before it
 * settles, or a prerendered page activates, rejecting the browser-created transition's promises
 * with `InvalidStateError: Transition was aborted because of invalid state ...` -- often before
 * `pageswap`/`pagereveal` reach any page script, so there is no promise to `.catch()` in time and
 * it surfaced as an uncaught page error. Cancelling exactly that rejection (nothing else) is
 * harmless: the navigation itself completes. Inline in <head> so it's registered before the new
 * page's first rendering opportunity, ahead of every deferred module script. ~170 bytes.
 */
export const VT_ABORT_GUARD_SCRIPT =
  'addEventListener("unhandledrejection",function(e){var r=e.reason;' +
  'r&&r.name==="InvalidStateError"&&/^Transition was aborted/.test(r.message)&&e.preventDefault()})';

/** Per-transition card names beyond this many skip the list transition entirely. */
export const LIST_VT_CAP = 60;

/**
 * Unique `view-transition-name`s for the given card ids (first occurrence wins, order kept), or
 * `null` when there are more than `cap` distinct cards -- the caller then skips the transition
 * rather than capturing dozens of snapshots. The `lc-` prefix can't collide with `vtName`'s
 * `sprite-`/`name-`/`types-` names, which may be on the same page at navigation time.
 */
export function listVtNames(
  ids: readonly number[],
  cap: number = LIST_VT_CAP,
): Map<number, string> | null {
  const names = new Map<number, string>();
  for (const id of ids) {
    if (names.has(id)) continue;
    if (names.size >= cap) return null;
    names.set(id, `lc-${id}`);
  }
  return names;
}
