/**
 * Source-level guards for two `.astro` details `bun test` can't render (see
 * `evolution-tree.test.ts`'s module doc): the `x-default` hreflang in `Base.astro`, and that only
 * the generation's own version tags in `PokedexText.astro` are uppercased (Ruling A11).
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) =>
  readFileSync(path.join(import.meta.dir, "../../src", file), "utf-8");

test("Base.astro emits an x-default hreflang pointing at the English (first-language) page", () => {
  const base = read("layouts/Base.astro");
  expect(base).toMatch(
    /hreflang="x-default" href=\{alternateLinks\[0\]\.href\}/,
  );
  expect(read("i18n/ui.ts")).toMatch(
    /export const LANGS: Lang\[\] = \["en", "ru"\]/,
  );
});

test("PokedexText uppercases only the generation's own version tags, not neutral source tags", () => {
  const src = read("components/PokedexText.astro");
  const styles = src.slice(src.indexOf("<style>"));
  // No uppercase on the base `.dex small` rule ...
  const baseRule = /\.dex small\s*\{([^}]*)\}/.exec(styles);
  expect(baseRule).not.toBeNull();
  expect(baseRule![1]).not.toContain("text-transform");
  // ... only on the `.own` (colored, generation's own version) tag.
  expect(styles).toMatch(
    /\.dex small\.own\s*\{[^}]*text-transform\s*:\s*uppercase/,
  );
  expect(src).toMatch(/class:list=\{\{ own: e\.bg \}\}/);
});
