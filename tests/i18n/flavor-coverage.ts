/**
 * How many species ids (inclusive) must have ru/en-complete `black` *and* `white` flavor text
 * in `flavor.json`. Task 7a ships flavor translations as `{}`, so this is 0 — every subsequent
 * batch (7b/7c/7d) raises it, in order: 220, 440, 649. Keeping every commit green while the
 * translation work is split across tasks is the whole point of this constant: see Ruling R10
 * in the project ledger.
 */
export const FLAVOR_TRANSLATED_UP_TO = 220;
