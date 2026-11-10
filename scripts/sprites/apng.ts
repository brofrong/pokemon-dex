// @ts-expect-error -- upng-js ships no type declarations.
import UPNG from "upng-js";

/** One (A)PNG's decoded frames, ready to re-encode (e.g. into an animated WebP). */
export interface ApngFrames {
  width: number;
  height: number;
  /** Fully-composited RGBA8 buffers, one per frame, each exactly `width * height * 4` bytes. */
  frames: Uint8Array[];
  /** Per-frame delay in milliseconds, same length and order as `frames`. */
  delays: number[];
}

interface UpngFrame {
  delay: number;
}

interface UpngImage {
  width: number;
  height: number;
  frames: UpngFrame[];
}

/**
 * Decodes every frame of an (A)PNG buffer into fully-composited RGBA8 frames with their
 * per-frame delays (ms).
 *
 * sharp/libvips' PNG loader does not implement the APNG extension: it silently decodes only the
 * base image even when asked for `{ animated: true }` (confirmed: Emerald Bulbasaur's 52-frame
 * animated front sprite round-trips through sharp as a single-page, ~0.5 KB WebP). `rs`
 * (Emerald) and `dp` (HeartGold/SoulSilver) -- unlike `bw`/`gs`, whose animated front sprites are
 * GIFs -- need a real APNG decoder for their animated variants.
 *
 * `UPNG.toRGBA8` already composites each frame per its `dispose`/`blend` ops (APNG frames are
 * deltas against the previous frame unless told otherwise), so the frames this returns are ready
 * to use directly -- no manual compositing needed.
 *
 * A plain, non-animated PNG (no `fcTL` chunks) decodes as a single frame with `delays: [0]`
 * (`UPNG.decode` reports zero `frames` entries for one, but `UPNG.toRGBA8` still returns the one
 * base image) -- harmless, since callers only reach for this on the known-animated path, but
 * kept correct rather than crashing on a mismatched `frames`/`delays` length.
 */
export function decodeApngFrames(buffer: Buffer | Uint8Array): ApngFrames {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const image = UPNG.decode(arrayBuffer) as UpngImage;
  const rgba = UPNG.toRGBA8(image) as ArrayBuffer[];
  const delays = image.frames.map((frame) => frame.delay || 0);

  return {
    width: image.width,
    height: image.height,
    frames: rgba.map((frame) => new Uint8Array(frame)),
    delays: delays.length === rgba.length ? delays : rgba.map(() => 0),
  };
}
