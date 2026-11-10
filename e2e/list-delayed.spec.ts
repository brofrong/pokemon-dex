/**
 * The list page before/while `list.json` is still loading (constraints' Review Focus #4): name
 * and number search must already work off the server-rendered card markup, and anything that
 * genuinely needs the deferred data (a stat sort, a flag filter) must show a pending state instead
 * of silently doing nothing, then resolve the moment the data lands.
 *
 * `page.route` delays the `list.json` response by 2s so there's a real window to observe "search
 * already works" and "pending, then resolved" without racing a fast local response. The sort
 * change happens right after `goto` -- before anything else runs the clock down -- so the pending
 * window is still open when it's asserted.
 */
import { test, expect } from "./fixtures";
import {
  fetchListJson,
  firstVisibleCardId,
  listPath,
  waitForListSettled,
  type ListTuple,
} from "./helpers";

const DELAY_MS = 2000;

test("search works immediately; a stat sort shows pending then resolves", async ({
  page,
  baseURL,
}) => {
  const tuples: ListTuple[] = await fetchListJson(page, baseURL!, "en", "bw");
  const fastest = tuples.reduce((best, t) => (t[2][5] > best[2][5] ? t : best));

  await page.route("**/list.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    await route.continue();
  });

  await page.goto(listPath("en", "bw"));

  // A stat sort needs `list.json`: the grid goes "busy" and the pending note shows while it's
  // still in flight (it was already requested right after first paint, so this fires immediately).
  await page.locator("#pdx-sort").selectOption("spe");
  await page.locator("#pdx-dir").click();
  await expect(page.locator("#pdx-grid")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#pdx-pending")).toBeVisible();

  // Name/number search reads the card's own markup, not `list.json` -- works right away, even
  // while the sort above is still pending on the delayed response.
  await page.locator("#pdx-search").fill("pikachu");
  await expect(page.locator('.card[data-id="25"]')).toBeVisible();
  await page.locator("#pdx-search").fill("");

  // Once the delayed response lands, the pending state clears and the sort actually applies.
  await waitForListSettled(page);
  await expect(page.locator("#pdx-pending")).toBeHidden();
  expect(await firstVisibleCardId(page)).toBe(fastest[0]);
});
