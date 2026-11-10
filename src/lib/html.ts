/**
 * `escapeHtml`, shared by every client script that interpolates a dataset/translation string into
 * `innerHTML` (the search palette's result rows, the detail page's form-switch re-render) instead
 * of using `textContent`. Originally lived only in `src/scripts/palette.ts`; extracted here (Task
 * 7 fix round 1) so `src/scripts/detail.ts` can reuse the exact same escaping instead of
 * interpolating ability names/effects and stat labels unescaped.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
