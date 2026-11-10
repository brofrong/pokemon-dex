/**
 * The custom 404 page (`src/pages/404.astro`), served by GitHub Pages (and by `astro preview`)
 * for any unknown path under the site's base.
 */
import { test, expect } from "./fixtures";

test("an unknown path serves the custom 404 page with a 404 status", async ({
  page,
  errorGuard,
}) => {
  errorGuard.allow404("/nope/");

  const response = await page.goto("nope/");
  expect(response?.status()).toBe(404);

  await expect(page.locator(".nf-code")).toHaveText("404");
  // Both languages get a way back, in their own language, per the module doc.
  await expect(page.locator(".nf-line a").first()).toHaveAttribute(
    "href",
    /\/en\/bw\/$/,
  );
  await expect(page.locator("#pdx-404-ru a")).toHaveAttribute(
    "href",
    /\/ru\/bw\/$/,
  );
});
