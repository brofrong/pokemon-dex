import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CSV_TABLES, fetchCsvs } from "../../../scripts/data/fetch";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pokemon-dex-fetch-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A 200 OK response whose body stream errors partway through, like a dropped connection. */
function droppedConnectionResponse(): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode("partial-data-before-failure"),
      );
      queueMicrotask(() => controller.error(new Error("connection dropped")));
    },
  });
  return new Response(stream, { status: 200 });
}

test("a stream error mid-download leaves no truncated file behind", async () => {
  const fetchImpl = () => Promise.resolve(droppedConnectionResponse());

  let error: unknown;
  try {
    await fetchCsvs("deadbeef", dir, fetchImpl);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);

  const dest = `${dir}/${CSV_TABLES[0]}.csv`;
  expect(await Bun.file(dest).exists()).toBe(false);
  expect(await Bun.file(`${dest}.tmp`).exists()).toBe(false);
});

test("an existing complete file is skipped and fetch is never called", async () => {
  await Promise.all(
    CSV_TABLES.map((name) => Bun.write(`${dir}/${name}.csv`, "a,b\n1,2\n")),
  );
  const fetchImpl = mock(() => {
    throw new Error("fetch should not be called when the file already exists");
  });

  await fetchCsvs("deadbeef", dir, fetchImpl);

  expect(fetchImpl).not.toHaveBeenCalled();
});
