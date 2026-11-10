/**
 * Whether `abilities.json`/`ability-effects.json` cover every ability name/effect referenced
 * across all nine generation datasets. Task 5a (this task) deliberately leaves ability names
 * and effects untranslated — see controller Ruling A6's split with Task 5b, which does that
 * translation work and flips this to `true`. Until then, the ability-coverage tests in
 * `coverage.test.ts` are skipped rather than failing on a gap this task was explicitly told not
 * to fill.
 */
export const ABILITY_TRANSLATIONS_COMPLETE = false;
