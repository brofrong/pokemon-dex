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
    inlineStylesheets: "always",
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
