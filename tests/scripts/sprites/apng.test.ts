import { expect, test } from "bun:test";
import { decodeApngFrames } from "../../../scripts/sprites/apng";

test("decodes every frame of a real Emerald APNG, with delays preserved", async () => {
  const buf = await Bun.file("tests/fixtures/sprites/rs/1.png").arrayBuffer();

  const { width, height, frames, delays } = decodeApngFrames(Buffer.from(buf));

  expect(width).toBe(64);
  expect(height).toBe(64);
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.length).toBe(delays.length);
  // Every frame is a fully-composited RGBA8 buffer the full size of the canvas.
  for (const frame of frames) {
    expect(frame.byteLength).toBe(width * height * 4);
  }
  // Real delays from the fcTL chunks, not a placeholder (every value > 0).
  expect(delays.every((d) => d > 0)).toBe(true);
});

test("decodes every frame of a real HeartGold/SoulSilver APNG, with delays preserved", async () => {
  const buf = await Bun.file("tests/fixtures/sprites/dp/1.png").arrayBuffer();

  const { width, height, frames, delays } = decodeApngFrames(Buffer.from(buf));

  expect(frames.length).toBeGreaterThan(1);
  expect(frames.length).toBe(delays.length);
  for (const frame of frames) {
    expect(frame.byteLength).toBe(width * height * 4);
  }
  expect(delays.every((d) => d > 0)).toBe(true);
});

test("a plain (non-animated) PNG decodes as a single frame with a zero delay", async () => {
  const buf = await Bun.file("tests/fixtures/sprites/rb/1.png").arrayBuffer();

  const { frames, delays } = decodeApngFrames(Buffer.from(buf));

  expect(frames.length).toBe(1);
  expect(delays).toEqual([0]);
});
