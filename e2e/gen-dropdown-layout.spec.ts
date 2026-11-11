/**
 * The generation dropdown must lay out cleanly for every generation label in both languages at
 * every width: the "VII · 809" meta never wraps, a long label ("Ultra Sun / Ultra Moon") never
 * pushes the meta onto two lines or out of its right-aligned column, and the panel stays inside
 * the viewport on narrow phones.
 * Checked on the sm list page (its own row is the longest label and is bold as the current one).
 */
import { test, expect } from "./fixtures";
import { listPath } from "./helpers";

const WIDTHS = [320, 360, 390, 430, 768, 1280];

for (const lang of ["en", "ru"] as const) {
  for (const width of WIDTHS) {
    test(`generation dropdown rows lay out on one meta line inside the viewport: ${lang} @ ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(listPath(lang, "sm"));
      await page.locator("details.gen > summary").click();
      const dd = page.locator("details.gen .dd");
      await expect(dd).toBeVisible();

      const report = await dd.evaluate((panel) => {
        const box = panel.getBoundingClientRect();
        const rows = Array.from(panel.querySelectorAll<HTMLElement>(".row"));
        return {
          left: box.left,
          right: box.right,
          viewport: document.documentElement.clientWidth,
          rows: rows.map((row) => {
            const meta = row.querySelector("em")!;
            const lineHeight =
              parseFloat(getComputedStyle(meta).lineHeight) || 16;
            const metaBox = meta.getBoundingClientRect();
            return {
              gen: row.dataset.gen,
              metaLines: Math.round(metaBox.height / lineHeight),
              metaInside:
                metaBox.right <= box.right + 0.5 &&
                metaBox.left >= box.left - 0.5,
              metaRight: metaBox.right,
            };
          }),
        };
      });

      expect(report.rows).toHaveLength(9);
      expect(report.left).toBeGreaterThanOrEqual(0);
      expect(report.right).toBeLessThanOrEqual(report.viewport);
      for (const row of report.rows) {
        expect(row.metaLines, `meta of ${row.gen} wraps`).toBe(1);
        expect(row.metaInside, `meta of ${row.gen} leaves the panel`).toBe(
          true,
        );
        // One right-aligned meta column across all rows, however long each label is.
        expect(
          Math.abs(row.metaRight - report.rows[0]!.metaRight),
          `meta of ${row.gen} misaligned`,
        ).toBeLessThan(1);
      }
    });
  }
}
