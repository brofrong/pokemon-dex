/**
 * `abilityItemHtml`/`typeBadgeHtml` (`src/scripts/detail.ts`): the pure template functions
 * `renderAbilities`/`renderTypes`/`renderMatchups` use to rebuild the detail page's sections on a
 * form switch, mirroring the server-rendered Astro components' markup exactly. Pinned here (Task
 * 7 fix rounds 1-2) so an ability name/small-label/effect and a type's localized label are always
 * `escapeHtml`-ed before reaching `innerHTML`, even though every real dataset/translation string
 * is currently free of HTML metacharacters.
 */
import { expect, test } from "bun:test";
import { abilityItemHtml, typeBadgeHtml } from "../../src/scripts/detail";
import type { TypeSlug } from "../../src/data/types";

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

test("typeBadgeHtml renders the expected badge for a plain type/label", () => {
  expect(typeBadgeHtml("fire", "Fire")).toBe(
    '<span class="tb t-fire"><svg class="ti"><use href="#t-fire"></use></svg>Fire</span>',
  );
});

test("typeBadgeHtml escapes a translated label containing HTML metacharacters", () => {
  const html = typeBadgeHtml("fire", `<b>Огонь</b> & friends`);
  expect(html).not.toContain("<b>Огонь</b>");
  expect(html).toBe(
    '<span class="tb t-fire"><svg class="ti"><use href="#t-fire"></use></svg>&lt;b&gt;Огонь&lt;/b&gt; &amp; friends</span>',
  );
});

test("typeBadgeHtml escapes `type` defensively even though TypeSlug can never carry HTML", () => {
  // Simulates a caller bypassing the type system (defense-in-depth, fix round 2) -- the real
  // `TypeSlug` union never contains HTML metacharacters, but the function must not trust that.
  const crafted = `fire"><script>alert(1)</script>` as TypeSlug;
  const html = typeBadgeHtml(crafted, "Fire");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain('"><script');
});
