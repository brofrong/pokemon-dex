/**
 * `createDataLoader` (Task 12 fix round 1, finding #2): a failed fetch must not be cached
 * forever -- the next call has to retry instead of permanently replaying the same failure (which
 * is what the palette's "offline" vs. "no results" distinction depends on).
 */
import { expect, test } from "bun:test";
import { createDataLoader } from "../../src/scripts/palette-data";

test("retries after a failure instead of caching it forever", async () => {
  let calls = 0;
  const fakeFetch = async (): Promise<Response> => {
    calls++;
    if (calls === 1) throw new Error("network down");
    return new Response(JSON.stringify([1, 2, 3]));
  };
  const load = createDataLoader<number[]>(fakeFetch, "/x/search.json");

  expect(await load()).toEqual({ ok: false });
  expect(await load()).toEqual({ ok: true, data: [1, 2, 3] });
  expect(calls).toBe(2);
});

test("memoizes a successful fetch -- no refetch on later calls", async () => {
  let calls = 0;
  const fakeFetch = async (): Promise<Response> => {
    calls++;
    return new Response(JSON.stringify(["a"]));
  };
  const load = createDataLoader<string[]>(fakeFetch, "/x");

  expect(await load()).toEqual({ ok: true, data: ["a"] });
  expect(await load()).toEqual({ ok: true, data: ["a"] });
  expect(calls).toBe(1);
});

test("a non-2xx response is treated as a failure, not a successful empty result", async () => {
  const fakeFetch = async (): Promise<Response> =>
    new Response("", { status: 500 });
  const load = createDataLoader<unknown>(fakeFetch, "/x");

  expect(await load()).toEqual({ ok: false });
});

test("concurrent callers while a fetch is in flight share one request", async () => {
  let calls = 0;
  const fakeFetch = async (): Promise<Response> => {
    calls++;
    return new Response(JSON.stringify(["x"]));
  };
  const load = createDataLoader<string[]>(fakeFetch, "/x");

  const [a, b] = await Promise.all([load(), load()]);
  expect(a).toEqual({ ok: true, data: ["x"] });
  expect(b).toEqual({ ok: true, data: ["x"] });
  expect(calls).toBe(1);
});
