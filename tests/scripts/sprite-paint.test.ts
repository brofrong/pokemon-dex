import { expect, test } from "bun:test";
import {
  preloadAtlas,
  wireSpritePaint,
  type PreloadableImage,
} from "../../src/scripts/sprite-paint";

/** A minimal stand-in for an `<img class="spr-img">` inside a `.spr` wrapper -- no real DOM. */
function fakeSprite(opts: { complete: boolean; naturalWidth: number }) {
  const classes = new Set<string>();
  const spr = {
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      has: (c: string) => classes.has(c),
    },
  };
  let loadListener: (() => void) | undefined;
  const img = {
    complete: opts.complete,
    naturalWidth: opts.naturalWidth,
    closest: () => spr,
    addEventListener: (type: string, listener: () => void) => {
      if (type === "load") loadListener = listener;
    },
  };
  return {
    img: img as unknown as HTMLImageElement,
    isLoaded: () => classes.has("loaded"),
    fireLoad: () => loadListener?.(),
  };
}

test("wireSpritePaint marks the sprite loaded immediately for an already-complete image", () => {
  const { img, isLoaded } = fakeSprite({ complete: true, naturalWidth: 46 });
  wireSpritePaint(img);
  expect(isLoaded()).toBe(true);
});

test("wireSpritePaint waits for the load event when the image isn't complete yet", () => {
  const { img, isLoaded, fireLoad } = fakeSprite({
    complete: false,
    naturalWidth: 0,
  });
  wireSpritePaint(img);
  expect(isLoaded()).toBe(false);
  fireLoad();
  expect(isLoaded()).toBe(true);
});

test("wireSpritePaint treats complete-but-zero-width as not yet loaded (a broken/empty image)", () => {
  const { img, isLoaded } = fakeSprite({ complete: true, naturalWidth: 0 });
  wireSpritePaint(img);
  expect(isLoaded()).toBe(false);
});

test("wireSpritePaint clears a previous 'loaded' state on a fresh call (e.g. a variant swap)", () => {
  const { img, isLoaded } = fakeSprite({ complete: true, naturalWidth: 46 });
  wireSpritePaint(img);
  expect(isLoaded()).toBe(true);

  // Re-wiring the *same* sprite for a freshly-assigned `src` that hasn't loaded yet.
  (img as unknown as { complete: boolean }).complete = false;
  wireSpritePaint(img);
  expect(isLoaded()).toBe(false);
});

test("wireSpritePaint waits for decode() before marking loaded (the atlas frame hides on .loaded)", async () => {
  const { img, isLoaded, fireLoad } = fakeSprite({
    complete: false,
    naturalWidth: 0,
  });
  let finishDecode!: () => void;
  const decoded = new Promise<void>((resolve) => (finishDecode = resolve));
  Object.assign(img, { src: "a.webp", decode: () => decoded });
  wireSpritePaint(img);
  fireLoad();
  expect(isLoaded()).toBe(false);
  finishDecode();
  await decoded;
  await Promise.resolve();
  expect(isLoaded()).toBe(true);
});

test("wireSpritePaint still marks loaded when currentSrc lags behind a just-assigned src", async () => {
  const { img, isLoaded, fireLoad } = fakeSprite({
    complete: false,
    naturalWidth: 0,
  });
  // A shiny toggle assigns the new `src` right before wiring; `currentSrc` still reports the old
  // image until the new one starts loading, then catches up.
  Object.assign(img, {
    src: "front-shiny/1.webp",
    currentSrc: "front/1.webp",
    decode: () => Promise.resolve(),
  });
  wireSpritePaint(img);
  Object.assign(img, { currentSrc: "front-shiny/1.webp" });
  fireLoad();
  await Promise.resolve();
  await Promise.resolve();
  expect(isLoaded()).toBe(true);
});

test("wireSpritePaint ignores a decode that finishes after the src was swapped", async () => {
  const { img, isLoaded, fireLoad } = fakeSprite({
    complete: false,
    naturalWidth: 0,
  });
  let finishDecode!: () => void;
  const decoded = new Promise<void>((resolve) => (finishDecode = resolve));
  Object.assign(img, { src: "front/1.webp", decode: () => decoded });
  wireSpritePaint(img);
  fireLoad();
  Object.assign(img, { src: "front-shiny/1.webp" });
  finishDecode();
  await decoded;
  await Promise.resolve();
  expect(isLoaded()).toBe(false);
});

test("wireSpritePaint is a safe no-op for null/undefined or an image with no .spr ancestor", () => {
  expect(() => wireSpritePaint(null)).not.toThrow();
  expect(() => wireSpritePaint(undefined)).not.toThrow();
  const orphan = { closest: () => null } as unknown as HTMLImageElement;
  expect(() => wireSpritePaint(orphan)).not.toThrow();
});

/** A fake `Image`-like object for `preloadAtlas`, with manual control over when it "loads". */
function fakePreloadableImage(): {
  image: PreloadableImage;
  resolveLoad: () => void;
  rejectAsError: () => void;
} {
  let loadCb: (() => void) | undefined;
  let errorCb: (() => void) | undefined;
  const image: PreloadableImage = {
    src: "",
    addEventListener: (type, listener) => {
      if (type === "load") loadCb = listener;
      if (type === "error") errorCb = listener;
    },
  };
  return {
    image,
    resolveLoad: () => loadCb?.(),
    rejectAsError: () => errorCb?.(),
  };
}

test("preloadAtlas resolves once the fallback load event fires (no decode())", async () => {
  const { image, resolveLoad } = fakePreloadableImage();
  const promise = preloadAtlas("atlas.webp", () => image);
  expect(image.src).toBe("atlas.webp");
  resolveLoad();
  await expect(promise).resolves.toBeUndefined();
});

test("preloadAtlas resolves (never rejects) even if the image errors", async () => {
  const { image, rejectAsError } = fakePreloadableImage();
  const promise = preloadAtlas("atlas.webp", () => image);
  rejectAsError();
  await expect(promise).resolves.toBeUndefined();
});

test("preloadAtlas prefers decode() and resolves once it settles, even on rejection", async () => {
  let decodeCalls = 0;
  const image: PreloadableImage = {
    src: "",
    decode: () => {
      decodeCalls++;
      return Promise.reject(new Error("decode failed"));
    },
    addEventListener: () => {},
  };
  await expect(
    preloadAtlas("atlas.webp", () => image),
  ).resolves.toBeUndefined();
  expect(decodeCalls).toBe(1);
});
