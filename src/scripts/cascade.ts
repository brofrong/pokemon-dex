/**
 * Ends the list page's first-load card cascade (`PokemonCard.astro`'s `card-in`) for good.
 *
 * The cascade rule (`.card[style*="--i"]`) would otherwise stay applied for the page's lifetime,
 * and CSS restarts an animation whenever its element goes from `display: none` back to rendered
 * -- so cards 1-24 re-faded every time a filter or search un-hid them, even mid view transition
 * (Task 8 fix round 1). Once ended, the grid gets `.no-cascade` (`animation: none`) and the
 * cascade can never run again on this page.
 *
 * It ends at the first of: every cascade card reporting `animationend`/`animationcancel`; a
 * fallback timer (reduced motion, or cards whose animation never ran); or the visitor's first
 * interaction with the controls (`stopNow`). DOM-free so it's unit-testable.
 */

/** Fallback: the last card's delay (300 ms) + duration (360 ms), with headroom for first paint. */
export const CASCADE_FALLBACK_MS = 1000;

export interface CascadeEnder {
  /** One cascade card's animation ended or was cancelled. */
  ended(): void;
  /** End the cascade now (idempotent). */
  stopNow(): void;
  readonly done: boolean;
}

export function cascadeEnder(expected: number, stop: () => void): CascadeEnder {
  let remaining = expected;
  let done = false;
  const api: CascadeEnder = {
    ended() {
      remaining--;
      if (remaining <= 0) api.stopNow();
    },
    stopNow() {
      if (done) return;
      done = true;
      stop();
    },
    get done() {
      return done;
    },
  };
  if (expected <= 0) api.stopNow();
  return api;
}
