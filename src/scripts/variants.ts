/**
 * Pure helpers for the detail page's variant/form selection: which of the three togglable axes
 * (shiny/back/female) an entry in the sprite manifest actually has, which concrete `Variant` a
 * given toggle state resolves to (gracefully degrading when that exact combination doesn't
 * exist), and which `Form` a `?form=` query value resolves to. No DOM dependency, so these are
 * unit tested directly and reused as-is by `src/scripts/detail.ts`.
 */
import type { Form, Pokemon, Size, Variant } from "../data/types";

export interface VariantState {
  shiny: boolean;
  back: boolean;
  female: boolean;
}

/** Which of the three togglable axes this sprite entry actually has (so the switcher only shows those). */
export function availableVariants(entry: Partial<Record<Variant, Size>>): {
  shiny: boolean;
  back: boolean;
  female: boolean;
} {
  return {
    shiny: Boolean(entry["front-shiny"]),
    back: Boolean(entry.back),
    female: Boolean(entry["front-female"]),
  };
}

function variantKey(state: VariantState): Variant {
  const base = state.back ? "back" : "front";
  const shiny = state.shiny ? "-shiny" : "";
  const female = state.female ? "-female" : "";
  return `${base}${shiny}${female}` as Variant;
}

/**
 * The sprite variant to show for `state` against `entry`, falling back to the nearest variant
 * that actually exists by dropping, in order: female, then back, then shiny. `entry` is expected
 * to always have at least a plain `front`, which is the ultimate fallback.
 */
export function variantFor(
  state: VariantState,
  entry: Partial<Record<Variant, Size>>,
): Variant {
  const attempts: VariantState[] = [
    state,
    { ...state, female: false },
    { ...state, female: false, back: false },
    { ...state, female: false, back: false, shiny: false },
  ];
  for (const attempt of attempts) {
    const key = variantKey(attempt);
    if (entry[key]) return key;
  }
  return "front";
}

/** The `Form` a `?form=` query value resolves to; an unknown or missing slug falls back to `forms[0]`. */
export function resolveForm(p: Pokemon, formSlug: string | null): Form {
  if (formSlug) {
    const match = p.forms.find((f) => f.formSlug === formSlug);
    if (match) return match;
  }
  return p.forms[0]!;
}

/**
 * Fix round 1, finding #3 (Controller Ruling R22): Frillish/Jellicent's "female" form is a pure
 * cosmetic gender variant -- same types/stats/abilities as the default form (`cosmetic: true`),
 * existing only because its sprite differs -- and that sprite is already reachable through the
 * default form's own manifest entry via the gender toggle (`availableVariants`/`variantFor`
 * already see its `front-female` size). Rendering it as a *second*, separate form tile as well
 * left the ♂/♀ toggle and the forms grid both controlling the same thing, out of sync with each
 * other.
 */
export function isGenderVariantForm(
  hasGenderDiff: boolean,
  form: Form,
): boolean {
  return form.formSlug === "female" && form.cosmetic && hasGenderDiff;
}

/**
 * The forms a species actually offers as selectable UI -- form tiles, and `?form=` switch
 * targets -- excluding pure gender variants (see {@link isGenderVariantForm}), which the
 * shiny/back/gender toggle already covers. Always includes the default form (`forms[0]`, whose
 * `formSlug` is `null`, never `"female"`).
 */
export function selectableForms(p: Pokemon): Form[] {
  return p.forms.filter((f) => !isGenderVariantForm(p.hasGenderDiff, f));
}
