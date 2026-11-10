/**
 * Astro integration (Task 14): bundles `src/sw/sw.ts` into `dist/sw.js` after the static build,
 * and writes `dist/sw-warm/{gen}.json` for every enabled generation -- the flat list of that
 * generation's Pokémon slugs `src/scripts/sw-register.ts` fetches (for the current page's
 * generation only) before asking the service worker to warm that generation's detail pages into
 * the offline cache. The slugs are read straight from `src/data/gen/{gen}.json`.
 *
 * Runs entirely in `astro:build:done`, after every page/asset is already written to `dir`: the
 * precache list (`buildPrecacheList`, `src/sw/logic.ts`) is built from that finished `dist/`
 * listing, and `VERSION` is a hash of that list -- so a changed page naturally produces a new
 * precache list, a new `VERSION`, and (via `sw.ts`'s `activate` handler) the previous build's
 * caches get dropped on the next visit.
 *
 * `sw.ts` is bundled standalone with `Bun.build` rather than through Vite: it's never imported
 * from a page, Astro doesn't know about it, and it needs `VERSION`/`PRECACHE` injected as
 * build-time constants (`define`) rather than imported at runtime. `package.json`'s `build`
 * script runs `bun --bun astro build`, so `Bun.build`/`Bun.Glob`/`Bun.hash`/`Bun.write` are all
 * available here even though the rest of the site builds through Astro/Vite.
 */
import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { buildPrecacheList } from "../src/sw/logic";
import { BASE } from "../src/lib/urls";
import { DEFAULT_GEN, ENABLED_GENS, getGen } from "../src/lib/generations";

const SW_ENTRY = fileURLToPath(new URL("../src/sw/sw.ts", import.meta.url));

export default function serviceWorker(): AstroIntegration {
  return {
    name: "service-worker",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const distPath = fileURLToPath(dir);

        const distFiles: string[] = [];
        const glob = new Bun.Glob("**/*");
        for await (const file of glob.scan({
          cwd: distPath,
          onlyFiles: true,
        })) {
          distFiles.push(file.replaceAll("\\", "/"));
        }

        const precache = buildPrecacheList(distFiles, BASE, {
          gen: DEFAULT_GEN,
          spriteSet: getGen(DEFAULT_GEN)!.spriteSet,
        });
        const version = Bun.hash(precache.join("\n")).toString(36);

        const result = await Bun.build({
          entrypoints: [SW_ENTRY],
          target: "browser",
          format: "iife",
          minify: true,
          define: {
            VERSION: JSON.stringify(version),
            PRECACHE: JSON.stringify(precache),
          },
        });

        if (!result.success) {
          for (const log of result.logs) logger.error(String(log));
          throw new Error("service-worker: failed to bundle src/sw/sw.ts");
        }

        const [bundle] = result.outputs;
        await Bun.write(new URL("sw.js", dir), await bundle!.text());

        for (const gen of ENABLED_GENS) {
          const data = (await Bun.file(
            new URL(`../src/data/gen/${gen.id}.json`, import.meta.url),
          ).json()) as { pokemon: { slug: string }[] };
          const slugs = data.pokemon.map((p) => p.slug);
          await Bun.write(
            new URL(`sw-warm/${gen.id}.json`, dir),
            JSON.stringify(slugs),
          );
        }

        logger.info(
          `sw.js: ${precache.length} precached URL(s), version ${version}`,
        );
      },
    },
  };
}
