/**
 * Background asset prefetch queue for the list page's card sprites (Task 13): a small
 * connection-aware, limited-concurrency loader used by `src/scripts/list.ts` to warm a card's
 * whole evolution chain's animated front sprites once it's near the viewport, and to jump a
 * species to the front of the queue on `pointerenter`/`pointerdown` (the user is very likely
 * about to navigate there).
 *
 * Kept deliberately tiny and dependency-free: `shouldPrefetch`/`createQueue` take plain data/a
 * callback so they're unit-testable with a fake loader (see
 * `tests/scripts/prefetch-assets.test.ts`) without touching the network, `Image`, or `fetch`.
 */
/** The subset of the Network Information API (`navigator.connection`) this module reads. */
export interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * False when the user is on Save-Data or a 2G-class connection (constraints' prefetch guard);
 * true otherwise -- including when the Network Information API isn't available at all (`conn`
 * undefined). Most browsers (Safari, Firefox) never expose `navigator.connection`, so treating
 * "unknown" as "don't prefetch" would silently disable this feature for every one of their users.
 */
export function shouldPrefetch(conn: ConnectionLike | undefined): boolean {
  if (!conn) return true;
  if (conn.saveData) return false;
  return conn.effectiveType !== "slow-2g" && conn.effectiveType !== "2g";
}

/** Loads one URL in the background and resolves once it's settled (success or failure alike). */
export type Loader = (url: string) => Promise<void>;

const IMAGE_RE = /\.(webp|png|jpe?g|gif|avif)(\?.*)?$/i;

/** `new Image()` for images (so the browser's own image decoder/cache picks it up), `fetch` otherwise. */
function defaultLoad(url: string): Promise<void> {
  if (IMAGE_RE.test(url)) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
  }
  return fetch(url, { priority: "low" } as RequestInit)
    .then(() => undefined)
    .catch(() => undefined);
}

export interface PrefetchQueue {
  /**
   * Queues `url`. A no-op if it's already loading or done; if it's already queued but not yet
   * started, a repeat `add(url, true)` promotes it ahead of the plain (non-priority) queue.
   */
  add(url: string, priority?: boolean): void;
  /** How many URLs are queued or in flight right now (0 once everything has settled). */
  size(): number;
}

/**
 * A FIFO queue capped at `limit` concurrent loads, with a separate priority lane that's always
 * drained first. `load` defaults to the real `Image`/`fetch` loader; tests inject a fake one to
 * assert concurrency and ordering without touching the network.
 */
export function createQueue(
  limit: number,
  load: Loader = defaultLoad,
): PrefetchQueue {
  const priorityQueue: string[] = [];
  const normalQueue: string[] = [];
  const inFlight = new Set<string>();
  const done = new Set<string>();

  function pump(): void {
    while (
      inFlight.size < limit &&
      (priorityQueue.length > 0 || normalQueue.length > 0)
    ) {
      const url = (
        priorityQueue.length > 0 ? priorityQueue.shift() : normalQueue.shift()
      )!;
      inFlight.add(url);
      load(url).finally(() => {
        inFlight.delete(url);
        done.add(url);
        pump();
      });
    }
  }

  return {
    add(url, priority = false) {
      if (done.has(url) || inFlight.has(url) || priorityQueue.includes(url))
        return;
      const normalIndex = normalQueue.indexOf(url);
      if (normalIndex !== -1) {
        if (priority) {
          normalQueue.splice(normalIndex, 1);
          priorityQueue.push(url);
          pump();
        }
        return;
      }
      (priority ? priorityQueue : normalQueue).push(url);
      pump();
    },
    size() {
      return priorityQueue.length + normalQueue.length + inFlight.size;
    },
  };
}

/**
 * Queues the animated front sprite (`front` or `front-shiny`, whichever the list is showing) of
 * every species in a card's evolution chain (`ids`, from `list.json` -- just the card's own id
 * until that arrives), from the generation's sprite directory `dir` (e.g.
 * `/pokemon-dex/sprites/home/`, the grid's `data-sprites`).
 */
export function prefetchForCard(
  ids: readonly number[],
  dir: string,
  shiny: boolean,
  queue: PrefetchQueue,
  priority = false,
): void {
  const variant = shiny ? "front-shiny" : "front";
  for (const id of ids) queue.add(`${dir}${variant}/${id}.webp`, priority);
}
