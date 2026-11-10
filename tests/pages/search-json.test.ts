/**
 * `src/pages/[lang]/[gen]/search.json.ts` is the ⌘K palette's data source (Task 12): a compact
 * tuple-array index of every Pokémon in one language/generation. This test calls its `GET`
 * directly (no running server -- same approach as testing any other pure function here), casting
 * a minimal `{ params }` object to `APIContext` since `GET` only reads `params`.
 */
import { expect, test } from "bun:test";
import type { APIContext } from "astro";
import { GET } from "../../src/pages/[lang]/[gen]/search.json.ts";

function call(lang: string, gen: string) {
  return GET({ params: { lang, gen } } as unknown as APIContext);
}

test("ru/bw: 649 tuples, Content-Type json, gzip body < 20 KB", async () => {
  const res = await call("ru", "bw");
  expect(res.headers.get("content-type")).toContain("application/json");
  const text = await res.text();
  const data = JSON.parse(text) as unknown[][];
  expect(data).toHaveLength(649);

  const gz = Bun.gzipSync(Buffer.from(text));
  expect(gz.length).toBeLessThan(20 * 1024);
});

test("ru/bw: charmander tuple is [4, 'charmander', 'Чармандер', bilingual key, ['fire']]", async () => {
  const res = await call("ru", "bw");
  const data = (await res.json()) as [
    number,
    string,
    string,
    string,
    string[],
  ][];
  const charmander = data.find((t) => t[0] === 4)!;
  expect(charmander[0]).toBe(4);
  expect(charmander[1]).toBe("charmander");
  expect(charmander[2]).toBe("Чармандер");
  expect(charmander[3]).toContain("чармандер");
  expect(charmander[3]).toContain("charmander");
  expect(charmander[4]).toEqual(["fire"]);
});

test("en/bw: charmander display name is English", async () => {
  const res = await call("en", "bw");
  const data = (await res.json()) as [
    number,
    string,
    string,
    string,
    string[],
  ][];
  const charmander = data.find((t) => t[0] === 4)!;
  expect(charmander[2]).toBe("Charmander");
});
