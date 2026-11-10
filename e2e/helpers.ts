/**
 * Small shared helpers for the e2e suite: URL builders that mirror `src/lib/urls.ts` (kept
 * independent on purpose -- these tests must catch a regression in the real `urls.ts`, so they
 * can't import it) and a couple of page-level assertions reused across spec files.
 */
import type { Page } from "@playwright/test";

export type Lang = "en" | "ru";
export type GenId =
  "rb" | "gs" | "rs" | "dp" | "bw" | "xy" | "sm" | "swsh" | "sv";

/** e.g. `listPath('ru', 'bw')` -> `'ru/bw/'` (relative to the baseURL, which already ends `/pokemon-dex/`). */
export function listPath(lang: Lang, gen: GenId, query = ""): string {
  const base = `${lang}/${gen}/`;
  return query ? `${base}?${query.replace(/^\?/, "")}` : base;
}

/** e.g. `detailPath('en', 'bw', 'rotom', 'heat')` -> `'en/bw/pokemon/rotom/?form=heat'`. */
export function detailPath(
  lang: Lang,
  gen: GenId,
  slug: string,
  formSlug?: string,
): string {
  const base = `${lang}/${gen}/pokemon/${slug}/`;
  return formSlug ? `${base}?form=${formSlug}` : base;
}

/** One `/{lang}/{gen}/list.json` tuple: `[id, searchKey, stats, evoIds, flags]`. */
export type ListTuple = [number, string, number[], number[], string[]];

/** Fetches and parses a generation's `list.json` via Playwright's own request context (no page
 *  navigation needed) -- used to compute ground truth (e.g. "the fastest species") against the
 *  live served data rather than hardcoding a number that could drift from the dataset. */
export async function fetchListJson(
  page: Page,
  baseURL: string,
  lang: Lang,
  gen: GenId,
): Promise<ListTuple[]> {
  const res = await page.request.get(`${baseURL}${lang}/${gen}/list.json`);
  return res.json();
}

/** Whether the page has any horizontal overflow at its current viewport. */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth > el.clientWidth;
  });
}

/**
 * The `data-id` of the visually-first visible card in the list grid. `list.ts` sorts by setting
 * each card's CSS `order` (a grid/flex layout property), never by moving it in the DOM -- so
 * Playwright's own document-order-based `.first()` would just return whichever card happened to
 * be server-rendered first (Pokédex-number order), regardless of the live sort. This reads the
 * actual rendered order instead.
 */
export async function firstVisibleCardId(page: Page): Promise<number> {
  const id = await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(".card:not([hidden])"),
    );
    let best: HTMLElement | null = null;
    let bestOrder = Infinity;
    for (const card of cards) {
      const order = Number(card.style.order || "0");
      if (order < bestOrder) {
        bestOrder = order;
        best = card;
      }
    }
    return best?.dataset.id ?? null;
  });
  if (id === null) throw new Error("no visible card found");
  return Number(id);
}

/** Waits until `#pdx-grid` is no longer `aria-busy` (a filter/sort that needed `list.json` has
 *  resolved) *and* no list view transition is in flight -- used instead of a fixed timeout
 *  wherever a test cares about the settled state. With motion allowed, `list.ts` applies a
 *  filter/sort/shiny change (`reflow()`) inside `document.startViewTransition`'s update callback,
 *  which the browser only invokes after capturing the old state on a later frame; `aria-busy` is
 *  already `false` in between, so on a slow machine a test could read the *pre*-click order.
 *  `withViewTransition` puts `vt-list` on `<html>` synchronously in the click handler and removes
 *  it only after the update has been applied (finished, skipped or timed out alike). */
export async function waitForListSettled(page: Page): Promise<void> {
  await page.locator("#pdx-grid").first().waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const grid = document.getElementById("pdx-grid");
    return (
      !!grid &&
      grid.getAttribute("aria-busy") !== "true" &&
      !document.documentElement.classList.contains("vt-list")
    );
  });
}
