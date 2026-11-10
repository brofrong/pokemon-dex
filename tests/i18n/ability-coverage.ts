/**
 * Whether `abilities.json`/`ability-effects.json` cover every ability name/effect referenced
 * across all nine generation datasets. Task 5a deliberately left ability names and effects
 * untranslated — see controller Ruling A6's split with Task 5b, which did that translation work
 * (306 ability names and effects total) and flips this to `true`. The ability-coverage tests in
 * `coverage.test.ts` only run while this is `true`.
 */
export const ABILITY_TRANSLATIONS_COMPLETE = true;
