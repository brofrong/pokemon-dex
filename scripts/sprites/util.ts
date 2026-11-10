import { readdir, rm, stat } from "node:fs/promises";

/** How many processed jobs between progress log lines. */
export const PROGRESS_INTERVAL = 100;

/** Shelf atlases never exceed this width (matches the existing `bw` pipeline). */
export const ATLAS_MAX_WIDTH = 2048;

/** A default form's sprite filename stem is just the species id, with no `-formSlug` suffix. */
export const DEFAULT_FORM_KEY = /^\d+$/;

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Every regular file under `dir`, as slash-joined paths relative to `dir`. Missing `dir` -> `[]`. */
export async function listFilesRecursive(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await listFilesRecursive(`${dir}/${entry.name}`);
      files.push(...nested.map((f) => `${entry.name}/${f}`));
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files;
}

/** Runs `jobs` through a simple promise pool of `concurrency` workers, in input order per worker. */
export async function runPool<T>(
  jobs: T[],
  concurrency: number,
  worker: (job: T) => Promise<void>,
): Promise<void> {
  const queue = [...jobs];
  const workerCount = Math.max(1, Math.min(concurrency, jobs.length) || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      await worker(job);
    }
  });
  await Promise.all(workers);
}

/** Deletes anything under `out` that isn't in `produced` -- a stale sprite/atlas from a previous
 * run (dropped form/variant, or an atlas under its old content hash). Scoped to `out`, so running
 * this for one sprite set never touches another set's files. */
export async function cleanupStale(
  out: string,
  produced: Set<string>,
): Promise<void> {
  const existing = await listFilesRecursive(out);
  await Promise.all(
    existing
      .filter((f) => !produced.has(f))
      .map((f) => rm(`${out}/${f}`, { force: true })),
  );
}

export function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
