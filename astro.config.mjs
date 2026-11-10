import { defineConfig } from "astro/config";
import serviceWorker from "./integrations/service-worker.ts";

export default defineConfig({
  site: "https://brofrong.github.io",
  base: "/pokemon-dex",
  trailingSlash: "always",
  output: "static",
  integrations: [serviceWorker()],
  i18n: {
    locales: ["en", "ru"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },
  build: {
    // CSS is shared across pages as hashed `_astro/*.css` files, not inlined per page: with
    // ~10,800 detail pages coming (Task 2, constraints.md), inlining the ~17 KB stylesheet into
    // every page would dominate each page's weight. The stylesheet `<link>` Astro emits in
    // `<head>` is render-blocking by default, so there's no FOUC; the service worker precaches
    // `_astro/*` (including these CSS files, see `buildPrecacheList` in `src/sw/logic.ts`), and
    // the browser/CDN cache them forever since the filename is content-hashed.
    inlineStylesheets: "never",
  },
  vite: {
    css: {
      transformer: "lightningcss",
    },
    build: {
      cssMinify: "lightningcss",
    },
  },
});
