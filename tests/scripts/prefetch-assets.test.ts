import { expect, test } from "bun:test";
import {
  createQueue,
  prefetchForCard,
  shouldPrefetch,
  type Loader,
  type PrefetchQueue,
} from "../../src/scripts/prefetch-assets";

test("prefetchForCard queues every evolution-chain species from the generation's sprite dir", () => {
  const added: [string, boolean][] = [];
  const queue: PrefetchQueue = {
    add: (url, priority = false) => void added.push([url, priority]),
    size: () => added.length,
  };
  prefetchForCard([1, 2, 3], "/pokemon-dex/sprites/home/", false, queue);
  prefetchForCard([25], "/pokemon-dex/sprites/gs/", true, queue, true);
  expect(added).toEqual([
    ["/pokemon-dex/sprites/home/front/1.webp", false],
    ["/pokemon-dex/sprites/home/front/2.webp", false],
    ["/pokemon-dex/sprites/home/front/3.webp", false],
    ["/pokemon-dex/sprites/gs/front-shiny/25.webp", true],
  ]);
});

/** Lets the microtask queue (including `.finally()` continuations) fully drain. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A `Loader` whose promises only resolve when the test calls the matching `resolve(url)`, so
 * tests can assert the queue's concurrency/ordering behavior at each step instead of racing real
 * timers or network calls.
 */
function fakeLoader(): {
  load: Loader;
  calls: string[];
  active: number;
  resolve: (url: string) => void;
} {
  const resolvers = new Map<string, () => void>();
  const state = {
    load: ((url: string) =>
      new Promise<void>((res) => {
        state.calls.push(url);
        state.active++;
        resolvers.set(url, () => {
          state.active--;
          res();
        });
      })) as Loader,
    calls: [] as string[],
    active: 0,
    resolve(url: string) {
      resolvers.get(url)?.();
      resolvers.delete(url);
    },
  };
  return state;
}

test("shouldPrefetch is false on Save-Data", () => {
  expect(shouldPrefetch({ saveData: true })).toBe(false);
});

test("shouldPrefetch is false on a 2G-class connection", () => {
  expect(shouldPrefetch({ effectiveType: "2g" })).toBe(false);
  expect(shouldPrefetch({ effectiveType: "slow-2g" })).toBe(false);
});

test("shouldPrefetch is true when the Network Information API is unavailable", () => {
  expect(shouldPrefetch(undefined)).toBe(true);
});

test("shouldPrefetch is true on a fast, non-metered connection", () => {
  expect(shouldPrefetch({ effectiveType: "4g" })).toBe(true);
  expect(shouldPrefetch({ saveData: false, effectiveType: "4g" })).toBe(true);
});

test("createQueue never runs more than `limit` loads at once", async () => {
  const fake = fakeLoader();
  const queue = createQueue(4, fake.load);
  for (let i = 0; i < 10; i++) queue.add(`u${i}`);
  await flush();
  expect(fake.calls).toHaveLength(4);
  expect(fake.active).toBe(4);

  fake.resolve("u0");
  await flush();
  expect(fake.calls).toHaveLength(5);
  expect(fake.active).toBe(4);
});

test("createQueue dedupes URLs: a repeated add never loads twice", async () => {
  const fake = fakeLoader();
  const queue = createQueue(4, fake.load);
  queue.add("same");
  queue.add("same");
  queue.add("same");
  await flush();
  expect(fake.calls).toEqual(["same"]);
});

test("createQueue runs a priority URL before queued normal ones", async () => {
  const fake = fakeLoader();
  const queue = createQueue(1, fake.load); // limit 1: only "a" starts immediately
  queue.add("a");
  queue.add("b");
  queue.add("c", true); // should jump ahead of "b"
  await flush();
  expect(fake.calls).toEqual(["a"]);

  fake.resolve("a");
  await flush();
  expect(fake.calls).toEqual(["a", "c"]);

  fake.resolve("c");
  await flush();
  expect(fake.calls).toEqual(["a", "c", "b"]);
});

test("createQueue: marking an already-queued URL priority moves it to the front", async () => {
  const fake = fakeLoader();
  const queue = createQueue(1, fake.load);
  queue.add("a");
  queue.add("b");
  queue.add("c");
  queue.add("d");
  queue.add("c", true); // promote c ahead of b and d
  await flush();
  expect(fake.calls).toEqual(["a"]);

  fake.resolve("a");
  await flush();
  expect(fake.calls).toEqual(["a", "c"]);
});

test("createQueue.size() reflects queued + in-flight work, down to zero once drained", async () => {
  const fake = fakeLoader();
  const queue = createQueue(2, fake.load);
  queue.add("a");
  queue.add("b");
  queue.add("c");
  expect(queue.size()).toBe(3);

  fake.resolve("a");
  await flush();
  expect(queue.size()).toBe(2);

  fake.resolve("b");
  fake.resolve("c");
  await flush();
  expect(queue.size()).toBe(0);
});
