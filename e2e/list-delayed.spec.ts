/**
 * The list page before/while `list.json` is still loading (constraints' Review Focus #4): name
 * and number search must already work off the server-rendered card markup, and anything that
 * genuinely needs the deferred data (a stat sort, a flag filter) must show a pending state instead
 * of silently doing nothing, then resolve the moment the data lands.
 *
 * `page.route` holds the `list.json` response until the test explicitly releases it, so the window
 * to observe "search already works" and "pending, then resolved" stays open for exactly as long as
 * the test needs, on any machine. (It used to be a fixed 2s delay: `list.json` is requested right
 * after first paint, while `page.goto` waits for the `load` event -- the eager sprites and the
 * atlas preload -- and on a slower CI runner `load` landed after the delayed response had already
 * arrived, so the sort below never went pending at all.)
 */
import { test, expect } from "./fixtures";
import {
  fetchListJson,
  firstVisibleCardId,
  listPath,
  waitForListSettled,
  type ListTuple,
} from "./helpers";

test("search works immediately; a stat sort shows pending then resolves", async ({
  page,
  baseURL,
}) => {
  const tuples: ListTuple[] = await fetchListJson(page, baseURL!, "en", "bw");
  const fastest = tuples.reduce((best, t) => (t[2][5] > best[2][5] ? t : best));

  let releaseList!: () => void;
  const listGate = new Promise<void>((resolve) => (releaseList = resolve));
  let listRequested!: () => void;
  const listRequest = new Promise<void>((resolve) => (listRequested = resolve));
  await page.route("**/list.json", async (route) => {
    listRequested();
    await listGate;
    await route.continue();
  });

  await page.goto(listPath("en", "bw"));

  // A stat sort needs `list.json`: the grid goes "busy" and the pending note shows while it's
  // still in flight (it was already requested right after first paint and is being held).
  await listRequest;
  await page.locator("#pdx-sort").selectOption("spe");
  await page.locator("#pdx-dir").click();
  await expect(page.locator("#pdx-grid")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#pdx-pending")).toBeVisible();

  // Name/number search reads the card's own markup, not `list.json` -- works right away, even
  // while the sort above is still pending on the held response.
  await page.locator("#pdx-search").fill("pikachu");
  await expect(page.locator('.card[data-id="25"]')).toBeVisible();
  await page.locator("#pdx-search").fill("");

  // Once the held response lands, the pending state clears and the sort actually applies.
  releaseList();
  await waitForListSettled(page);
  await expect(page.locator("#pdx-pending")).toBeHidden();
  expect(await firstVisibleCardId(page)).toBe(fastest[0]);
});
