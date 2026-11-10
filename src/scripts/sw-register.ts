/**
 * Registers the service worker (`dist/sw.js`, built by `integrations/service-worker.ts`) after
 * `load`, scoped to the site's base path. On a fast, unmetered connection
 * ({@link shouldWarmGeneration}) it then fetches `sw-warm/{gen}.json` (the flat list of the
 * current page's generation's Pokémon slugs) and asks the worker to warm that generation's detail
 * pages, in the current language, into its offline cache in the background -- see
 * `src/sw/sw.ts`'s `message` handler.
 *
 * Called from `src/layouts/Base.astro`, guarded there by `import.meta.env.PROD` so this never
 * runs under `astro dev` (there is no `dist/sw.js` to register in dev). Kept tiny: it ships on
 * every page and counts against the 15 KB gzip/page JS budget (constraints.md).
 */

import { BASE, withBase } from "../lib/urls";
import type { Lang } from "../i18n/ui";
import type { GenId } from "../data/types";
import {
  shouldWarmGeneration,
  warmList,
  type ConnectionInfo,
} from "../sw/logic";

export function registerServiceWorker(lang: Lang, gen: GenId): void {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(withBase("sw.js"), { scope: BASE })
      .then((registration) => warmIfFast(lang, gen, registration))
      .catch(() => {
        // Registration can fail offline, in private mode, or on an unsupported browser -- the
        // site works fine without a service worker, it just loses offline support.
      });
  });
}

async function warmIfFast(
  lang: Lang,
  gen: GenId,
  registration: ServiceWorkerRegistration,
): Promise<void> {
  const connection = (navigator as Navigator & { connection?: ConnectionInfo })
    .connection;
  if (!shouldWarmGeneration(connection)) return;

  try {
    const response = await fetch(withBase(`sw-warm/${gen}.json`));
    if (!response.ok) return;
    const slugs: unknown = await response.json();
    if (!Array.isArray(slugs)) return;

    const worker = registration.active ?? (await waitForActive(registration));
    worker?.postMessage({
      type: "warm",
      urls: warmList(lang, gen, slugs as string[], BASE),
    });
  } catch {
    // No sw-warm/{gen}.json, offline, malformed JSON, ... -- the warm-up is a nice-to-have, skip it
    // quietly and let the SW keep caching pages the usual way as they're visited.
  }
}

/** Resolves once `registration`'s installing/waiting worker becomes `activated` (or already is). */
function waitForActive(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorker | null> {
  return new Promise((resolve) => {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) {
      resolve(registration.active ?? null);
      return;
    }
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve(worker);
    });
  });
}
