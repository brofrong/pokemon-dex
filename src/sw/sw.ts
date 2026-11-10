/**
 * The service worker: precaches the app shell + immutable assets at install, serves
 * `immutable`/`sprite` requests cache-first and `html`/`data` requests stale-while-revalidate
 * (see {@link classifyRequest} for what falls into each bucket), drops every cache from an older
 * build on activate, and -- on a `{ type: 'warm', urls }` message from
 * `src/scripts/sw-register.ts` -- fetches a whole generation's detail pages into the HTML cache
 * in the background (two at a time, skipping anything already cached, dropping any URL that
 * fails rather than aborting the rest) so a visitor on a fast connection can keep browsing
 * offline after their first visit.
 *
 * Bundled standalone by `integrations/service-worker.ts` via `Bun.build` at `astro:build:done`
 * -- this file is never imported from a page and isn't processed by Vite/Astro. `VERSION` (a
 * hash of the precache list) and `PRECACHE` (the list itself) are injected there as build-time
 * constants via `Bun.build`'s `define`, hence the `declare const` below instead of an import: by
 * the time this runs in the browser, both are literal values baked into the bundle.
 *
 * This file's global scope is a `ServiceWorkerGlobalScope`, not a `Window`. The project's
 * `tsconfig.json` is shared with the rest of the (DOM-typed) codebase and adding the `webworker`
 * lib there would conflict with `lib.dom.d.ts`'s incompatible `self`/event types for every other
 * file, so the handful of SW-only globals this needs are declared locally below instead -- a
 * `declare const self: ...` inside an ES module only shadows the ambient `Window` one within
 * this module, with no effect anywhere else. `caches`/`fetch`/`Request`/`Response`/`Promise` are
 * unaffected: their shape is identical in a service worker and already covered by the DOM lib.
 */

declare const VERSION: string;
declare const PRECACHE: string[];

import {
  cacheKey,
  classifyRequest,
  isCacheableResponse,
  matchIgnoreSearch,
  type RequestKind,
} from "./logic";
import { BASE } from "../lib/urls";

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}
interface ExtendableMessageEvent extends ExtendableEvent {
  readonly data: unknown;
}
interface ServiceWorkerGlobalScopeLike {
  location: { origin: string };
  addEventListener(
    type: "install" | "activate",
    listener: (event: ExtendableEvent) => void,
  ): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
  addEventListener(
    type: "message",
    listener: (event: ExtendableMessageEvent) => void,
  ): void;
  skipWaiting(): void;
  clients: { claim(): Promise<void> };
}

declare const self: ServiceWorkerGlobalScopeLike;

/** The request kinds the SW actually caches; `other` requests are left to the network untouched. */
type CacheableKind = Exclude<RequestKind, "other">;

const CACHE_KINDS: CacheableKind[] = ["immutable", "sprite", "html", "data"];

/** This build's cache name for `kind`, e.g. `pdx-html-1a2b3c4d`. */
function cacheName(kind: CacheableKind): string {
  return `pdx-${kind}-${VERSION}`;
}

const CURRENT_CACHE_NAMES = new Set<string>(CACHE_KINDS.map(cacheName));

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(dropStaleCaches());
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const kind = classifyRequest(url, BASE);
  if (kind === "other") return;

  event.respondWith(
    kind === "immutable" || kind === "sprite"
      ? cacheFirst(request, kind)
      : staleWhileRevalidate(request, kind),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  const urls =
    data !== null &&
    typeof data === "object" &&
    (data as { type?: unknown }).type === "warm" &&
    Array.isArray((data as { urls?: unknown }).urls)
      ? ((data as { urls: unknown[] }).urls.filter(
          (u): u is string => typeof u === "string",
        ) as string[])
      : undefined;
  if (urls) event.waitUntil(warm(urls));
});

/**
 * Groups {@link PRECACHE} by the cache each URL belongs to, then populates every cache. Each URL
 * is fetched and cached independently (`Promise.allSettled`, not `cache.addAll`, which rejects
 * the whole batch -- and so would fail the entire install -- the moment a single URL 404s or the
 * network drops mid-fetch): one bad entry just stays uncached, every other entry still installs.
 */
async function precache(): Promise<void> {
  const byKind = new Map<CacheableKind, string[]>();
  for (const url of PRECACHE) {
    const kind = classifyRequest(new URL(url, self.location.origin), BASE);
    if (kind === "other") continue;
    const bucket = byKind.get(kind) ?? [];
    bucket.push(url);
    byKind.set(kind, bucket);
  }
  await Promise.all(
    [...byKind.entries()].map(async ([kind, urls]) => {
      const cache = await caches.open(cacheName(kind));
      await Promise.allSettled(urls.map((url) => precacheOne(cache, url)));
    }),
  );
}

/** Fetches and caches one precache URL; any failure here only drops this one entry. */
async function precacheOne(cache: Cache, url: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (isCacheableResponse(response)) {
      await cache.put(url, response);
    } else {
      console.warn(`[sw] not caching ${url} (status ${response.status})`);
    }
  } catch (error) {
    console.warn(`[sw] failed to precache ${url}`, error);
  }
}

/** Deletes every `pdx-*` cache that doesn't belong to this build's {@link VERSION}. */
async function dropStaleCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) => name.startsWith("pdx-") && !CURRENT_CACHE_NAMES.has(name),
      )
      .map((name) => caches.delete(name)),
  );
}

/** `immutable`/`sprite`: serve from cache if present, else fetch and cache the result. */
async function cacheFirst(
  request: Request,
  kind: CacheableKind,
): Promise<Response> {
  const cache = await caches.open(cacheName(kind));
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(response)) await cache.put(request, response.clone());
  return response;
}

/**
 * `html`/`data`: serve the cached response immediately if present (while refreshing the cache in
 * the background), otherwise wait on the network. GitHub Pages can only set a 10-minute
 * `max-age`, so this is what keeps a repeat visit instant while still picking up new deploys.
 *
 * `html` lookups ignore the request's query string ({@link matchIgnoreSearch}, QA #7): the query
 * only drives client-side list/form state, never which file the server serves, so a page cached
 * under one query (or none) is still a hit for a request with any other query. `data` lookups
 * stay exact. The response is also *stored* under {@link cacheKey}, which for `html` strips the
 * search first -- otherwise every distinct query string ever fetched for the same page would pile
 * up as its own duplicate full-HTML entry instead of overwriting the one canonical entry that
 * `ignoreSearch` lookups already treat as equivalent (contract: `html` bytes must not vary by
 * query string -- see {@link matchIgnoreSearch}).
 */
async function staleWhileRevalidate(
  request: Request,
  kind: CacheableKind,
): Promise<Response> {
  const cache = await caches.open(cacheName(kind));
  const cached = await cache.match(request, {
    ignoreSearch: matchIgnoreSearch(kind),
  });
  const update = fetch(request).then((response) => {
    if (isCacheableResponse(response))
      cache.put(cacheKey(request.url, kind), response.clone());
    return response;
  });
  if (cached) {
    update.catch(() => {
      // Offline, or the server errored -- the cached response above already served this
      // request, so there's nothing more to do.
    });
    return cached;
  }
  return update;
}

/**
 * Fetches `urls` into the HTML cache in the background: two at a time (two workers pulling from
 * one shared queue, each fetching sequentially), skipping anything already cached, and silently
 * dropping any URL that fails (offline mid-warm-up, a 404, ...) rather than aborting the rest.
 */
async function warm(urls: string[]): Promise<void> {
  const cache = await caches.open(cacheName("html"));
  const queue = [...urls];

  async function worker(): Promise<void> {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      try {
        if (await cache.match(url)) continue;
        const response = await fetch(url);
        if (isCacheableResponse(response))
          await cache.put(cacheKey(url, "html"), response);
      } catch {
        // Offline / network error -- skip this URL and move on to the next.
      }
    }
  }

  await Promise.all([worker(), worker()]);
}
