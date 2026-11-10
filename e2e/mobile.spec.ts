/**
 * Mobile-viewport (390x844, touch) regression coverage: the QA report's recurring bug class was
 * horizontal overflow at narrow widths (a skipped `content-visibility: auto` card reporting a
 * too-wide intrinsic size, a header label that couldn't shrink, ...). Swept across a representative
 * spread of generations (a pixel-sprite one, the HOME-era ones, old and new) and both languages,
 * on both the list and detail page.
 */
import { test, expect } from "./fixtures";
import {
  detailPath,
  hasHorizontalOverflow,
  listPath,
  type GenId,
  type Lang,
} from "./helpers";

const GENS: GenId[] = ["rb", "bw", "sm", "sv"];
const LANGS: Lang[] = ["en", "ru"];
// Species #25 (Pikachu) exists in every enabled generation (max species id only grows).
const SLUG = "pikachu";

for (const gen of GENS) {
  for (const lang of LANGS) {
    test(`no horizontal overflow: ${lang}/${gen} list and detail`, async ({
      page,
    }) => {
      await page.goto(listPath(lang, gen));
      expect(await hasHorizontalOverflow(page)).toBe(false);

      await page.goto(detailPath(lang, gen, SLUG));
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }
}

/**
 * QA bug #17: long, unbroken form-tile labels ("Toxtricity (Low Key Gmax)", «Узор Ледяной Снег»)
 * didn't wrap, so the grid column -- and the whole page -- overflowed at <=360px. These are the
 * exact species/generation/language combinations the QA report measured overflowing, re-checked
 * at the narrowest viewport the brief calls out (320px) rather than this file's usual 390px.
 */
const FORM_OVERFLOW_CASES: Array<[Lang, GenId, string]> = [
  ["ru", "xy", "vivillon"],
  ["ru", "sm", "vivillon"],
  ["ru", "sv", "ogerpon"],
  ["ru", "swsh", "toxtricity"],
  ["ru", "swsh", "alcremie"],
];

for (const [lang, gen, slug] of FORM_OVERFLOW_CASES) {
  test(`no horizontal overflow at 320px: ${lang}/${gen}/${slug}'s form tiles`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(detailPath(lang, gen, slug));
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}
