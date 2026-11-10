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
