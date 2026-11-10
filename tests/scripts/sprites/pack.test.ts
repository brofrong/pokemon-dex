import { expect, test } from "bun:test";
import { shelfPack } from "../../../scripts/sprites/pack";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True when `a` and `b` are closer than `pad` on both axes (i.e. they conflict). */
function overlaps(a: Box, b: Box, pad: number): boolean {
  return (
    a.x < b.x + b.w + pad &&
    b.x < a.x + a.w + pad &&
    a.y < b.y + b.h + pad &&
    b.y < a.y + a.h + pad
  );
}

const rects = [
  { key: "charmander", w: 41, h: 42 },
  { key: "pikachu", w: 50, h: 46 },
  { key: "unown-a", w: 24, h: 24 },
  { key: "unown-b", w: 24, h: 24 },
  { key: "castform", w: 40, h: 40 },
  { key: "arceus", w: 64, h: 64 },
  { key: "tiny", w: 2, h: 2 },
  { key: "wide", w: 100, h: 20 },
];

test("no two placements overlap, including the padding gap", () => {
  const pad = 1;
  const { placements } = shelfPack(rects, 128, pad);
  const boxes = rects.map((r) => ({ ...placements[r.key]!, w: r.w, h: r.h }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlaps(boxes[i]!, boxes[j]!, pad)).toBe(false);
    }
  }
});

test("every placement stays within maxWidth", () => {
  const maxWidth = 128;
  const { placements, width } = shelfPack(rects, maxWidth);
  expect(width).toBeLessThanOrEqual(maxWidth);
  for (const rect of rects) {
    const { x } = placements[rect.key]!;
    expect(x + rect.w).toBeLessThanOrEqual(maxWidth);
    expect(x).toBeGreaterThanOrEqual(0);
  }
});

test("packing is deterministic regardless of input order", () => {
  const first = shelfPack(rects, 128);
  const shuffled = [...rects].reverse();
  const second = shelfPack(shuffled, 128);
  expect(second).toEqual(first);
});

test("a rect wider than maxWidth throws", () => {
  expect(() => shelfPack([{ key: "too-wide", w: 200, h: 10 }], 128)).toThrow();
});

test("a rect wider than maxWidth throws even when other rects would fit", () => {
  expect(() =>
    shelfPack(
      [
        { key: "fine", w: 10, h: 10 },
        { key: "too-wide", w: 200, h: 10 },
      ],
      128,
    ),
  ).toThrow();
});

test("empty input packs to a zero-size result", () => {
  expect(shelfPack([], 128)).toEqual({
    width: 0,
    height: 0,
    placements: {},
  });
});
