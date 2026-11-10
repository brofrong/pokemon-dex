/**
 * `abilityItemHtml` (`src/scripts/detail.ts`): the pure template function `renderAbilities` maps
 * over to rebuild the abilities list on a form switch, mirroring `Abilities.astro`'s
 * server-rendered markup exactly. Pinned here (Task 7 fix round 1) so an ability name/small-label/
 * effect string is always `escapeHtml`-ed before reaching `innerHTML`, even though every real
 * dataset/translation string is currently free of HTML metacharacters.
 */
import { expect, test } from "bun:test";
import { abilityItemHtml } from "../../src/scripts/detail";

test("renders the expected <details>/<summary> structure for a plain, non-hidden ability", () => {
  expect(
    abilityItemHtml({
      name: "Blaze",
      small: null,
      effect: "Powers up Fire moves.",
    }),
  ).toBe(
    '<details class="abil"><summary><b>Blaze</b><span class="chev" aria-hidden="true">▾</span></summary><p>Powers up Fire moves.</p></details>',
  );
});

test("includes the <small> reference line only when present", () => {
  expect(
    abilityItemHtml({
      name: "Solar Power",
      small: "hidden",
      effect: "Boosts Special Attack in harsh sunlight.",
    }),
  ).toBe(
    '<details class="abil"><summary><b>Solar Power</b><small>hidden</small><span class="chev" aria-hidden="true">▾</span></summary><p>Boosts Special Attack in harsh sunlight.</p></details>',
  );
});

test("escapes HTML metacharacters in name, small and effect alike -- a crafted effect can't inject markup", () => {
  const html = abilityItemHtml({
    name: `<b>Weird</b> & Ability`,
    small: `"quoted" & 'small'`,
    effect: `Deals <b>extra</b> damage & heals.`,
  });
  // The template's own `<b>name</b>` wrapper is legitimate; what must never appear unescaped is
  // the crafted name/effect's *own* embedded tags.
  expect(html).not.toContain("<b>Weird</b>");
  expect(html).not.toContain("<b>extra</b>");
  expect(html).toBe(
    '<details class="abil"><summary><b>&lt;b&gt;Weird&lt;/b&gt; &amp; Ability</b>' +
      "<small>&quot;quoted&quot; &amp; &#39;small&#39;</small>" +
      '<span class="chev" aria-hidden="true">▾</span></summary>' +
      "<p>Deals &lt;b&gt;extra&lt;/b&gt; damage &amp; heals.</p></details>",
  );
});
