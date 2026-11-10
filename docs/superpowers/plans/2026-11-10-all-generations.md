# All Generations, Abilities, Animations, Bug-free Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shipped B/W Pokédex bug-free and extend it to all nine generations, with ability descriptions and livelier (reduced-motion-safe) animations.

**Architecture:** The existing build pipeline (pinned PokeAPI CSV → per-generation JSON; PokeAPI/sprites → per-sprite-set WebP + atlas; Pokémon GO RU localization + our translations) is generalized from `bw` to a registry of nine generations. Pages are generated for every enabled generation from per-generation JSON loaded through one data accessor. CSS moves out of HTML into one cached file to fit ~10,800 pages inside GitHub Pages limits. Playwright smoke tests guard regressions in CI.

**Tech Stack:** Bun 1.4 (`bun test`, `bun lint`, `bun fmt`, `bun check`), Astro 7.4.8, TypeScript strict, sharp 0.35 (build-time), Playwright (e2e, dev-only), GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-11-10-all-generations-design.md` (extends `docs/draft.md`; design source of truth remains `docs/design/mockup.html`). Previous plan for context: `docs/superpowers/plans/2026-11-10-pokedex-bw.md`.

## Global Constraints

- Everything from the previous plan's Global Constraints still holds (base `/pokemon-dex/`, locales `en`/`ru` prefixed, `bun lint`/`bun fmt`/`bun check` only, native CSS, system fonts, lossless pixel sprites, `prefers-reduced-motion` respected, prefetch ≤ 4 concurrent and never on Save-Data/2G, hotkeys ignored while typing, `pdx:theme`/`pdx:shiny` keys, pinned upstreams in `scripts/pins.ts`, no secrets).
- Generation ids and order: `rb, gs, rs, dp, bw, xy, sm, swsh, sv`; default `bw`. All nine enabled.
- Max species: rb 151, gs 251, rs 386, dp 493, bw 649, xy 721, sm 809, swsh 905, sv 1025.
- Version groups and flavor versions: rb `red-blue` [red, blue]; gs `gold-silver` [gold, silver]; rs `ruby-sapphire` [ruby, sapphire]; dp `diamond-pearl` [diamond, pearl]; bw `black-white` [black, white]; xy `x-y` [x, y]; sm `ultra-sun-ultra-moon` [ultra-sun, ultra-moon]; swsh `sword-shield` [sword, shield]; sv `scarlet-violet` [scarlet, violet]. Missing flavor → latest earlier version's English text, labeled with that version.
- Feature availability by generation: abilities from gen 3; hidden abilities from gen 5; gender, egg groups, hatch steps and shiny from gen 2; back sprites for sprite sets rb–bw only (HOME has none).
- Forms: introduced in a version group whose `order` ≤ the generation's version group order; megas only in `xy` and `sm`; Gigantamax only in `swsh`; Arceus plate override applies wherever Arceus exists.
- Sprite sets: `rb` (gen I transparent PNG, static, no shiny), `gs` (crystal animated), `rs` (emerald animated), `dp` (HGSS animated, female), `bw` (existing), `home` (Pokémon HOME renders for xy/sm/swsh/sv, resized to 192 px, lossy WebP q 70, front/front-shiny/front-female/front-shiny-female, no back). Pixel sets stay lossless; animated front variants animated, backs static first frame.
- Budgets (enforced by `check-dist`): per-page JS ≤ 15 KB gzip; list-page HTML ≤ 70 KB gzip for every generation (incl. 1025 cards); detail-page HTML ≤ 20 KB gzip; total `dist/` ≤ 900 MB.
- CSS is not inlined (`build.inlineStylesheets: 'never'`), served as hashed files and precached by the SW.
- RU texts: names/genus/forms from GO (pinned file); RU flavor for `bw` = our translations, for other generations = GO description labeled «Pokémon GO»; anything missing in GO is translated by us (style guide of the previous plan's Task 7b–d brief: «Покемон» capitalized, ёлочки, spaced em dash, declined names, U+2212 minus, «3 000»). No fabricated "official" claims.

## Review Focus

1. **Generation-specific UI**: gen I page shows no abilities, gender, eggs, shiny toggle; HOME generations show no back toggle. Expected: hidden, not empty boxes or broken toggles. Pinned by view-model tests (Task 6) and e2e (Task 9).
2. **Cross-generation navigation**: switching generation on a detail page whose species doesn't exist in the target generation (e.g. Snivy → Red/Blue). Expected: land on the target generation's list (or nearest valid page), never a 404. Pinned by `switchGenUrl` tests (Task 6).
3. **Forms per generation**: Alolan Vulpix absent in `xy`, present in `sm`; Mega Charizard in `xy`/`sm`, absent in `swsh`/`sv`; Gigantamax only in `swsh`. Pinned by golden tests (Task 3).
4. **1025-card list budget and search before `list.json` arrives**: typing immediately after load still finds by name/number; filters/sort work once data arrives. Pinned by list tests (Task 6) and e2e (Task 9).
5. **Animation regressions**: reduced-motion users get no motion; filter/sort transitions never leave cards hidden/duplicated if a transition is interrupted. Pinned by e2e with `reducedMotion: 'reduce'` and rapid toggling (Task 9).

---

### Task 1: Fix QA report bugs

**Files:** as needed per bug; tests next to the code they cover.

**Interfaces:** none new.

- [ ] **Step 1:** Read `qa/2026-11-10-qa-report.md`. For every Critical/Major/Minor bug, write a failing test where the logic is unit-testable (pure helpers in `src/lib`/`src/scripts`); for pure markup/CSS bugs, describe the manual check.
- [ ] **Step 2:** Fix each bug; Cosmetic ones too if cheap.
- [ ] **Step 3:** `bun run ci` green; re-verify each bug in the browser preview where possible.
- [ ] **Step 4:** Commit per logical fix group (`fix(...)`), list bug → commit mapping in the report.

---

### Task 2: Externalize CSS and per-page budgets

**Files:** `astro.config.mjs`, `src/sw/logic.ts` (+ test), `scripts/check-dist.ts` (+ test), `README.md`.

**Interfaces:**
- Produces: `buildPrecacheList` includes `_astro/*.css`; `checkDist` adds `html.detail.gzipMaxBytes` ≤ 20 KB and `dist.totalBytes` ≤ 900 MB checks.

- [ ] **Step 1:** Write failing tests: precache list contains a fixture `_astro/x.abcd1234.css`; checkDist errors on a 21 KB-gzip detail page and on a dist over the size limit (use a tiny injected limit in the test via an options param).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; set `build.inlineStylesheets: 'never'` (keep Lightning CSS). Make sure critical theme script stays inline and there's no FOUC (stylesheet `<link>` in head is render-blocking by design).
- [ ] **Step 4:** `bun run ci` green; report detail-page HTML raw/gzip before/after and number/size of CSS files.
- [ ] **Step 5:** Commit `perf(css): serve shared hashed stylesheets instead of inlining`.

---

### Task 3: Data for all generations

**Files:** `src/lib/generations.ts`, `src/data/types.ts`, `scripts/data/build-gen.ts`, `scripts/data/forms.ts`, `scripts/data/resolve.ts`, `scripts/data/names.ts`, `scripts/data/fetch.ts` (add tables), `src/data/gen/{rb,gs,rs,dp,bw,xy,sm,swsh,sv}.json` (generated), `tests/data/gen-facts.test.ts` (new; keep `bw-facts.test.ts`).

**Interfaces:**
- Produces in `generations.ts`: `GenConfig` gains `spriteSet: SpriteSetId`, `flavorVersions: string[]` (the two versions first, then earlier fallbacks newest→oldest), `features: { abilities: boolean; hiddenAbilities: boolean; breeding: boolean; shiny: boolean; back: boolean }`; all nine entries `enabled: true`; `type SpriteSetId = 'rb' | 'gs' | 'rs' | 'dp' | 'bw' | 'home'` exported from `src/data/types.ts`; `GenId` covers all nine ids.
- Produces in `types.ts`: `Form.pokemonId: number`; `Pokemon.flavor: Partial<Record<string, string>>` keeps version-slug keys and may hold a fallback version not in the pair; `GenData.names.abilityEffects: Record<string, string>` (English short effect).
- `CSV_TABLES` adds `ability_prose`, `ability_flavor_text` (check exact names in the pinned repo).
- CLI: `bun run data` builds all nine files; `bun run data -- --gen xy` builds one.

- [ ] **Step 1: Golden tests (failing)** in `tests/data/gen-facts.test.ts`, per generation:
  `rb`: 151 species; no `dark`/`steel`/`fairy` types; Magnemite `['electric']`; every Pokémon has no abilities; ghost→psychic factor 0 in the chart.
  `gs`: 251; Magnemite `['electric','steel']`; no abilities; Togepi `['normal']`.
  `rs`: 386; Gengar abilities `['levitate']`; no hidden abilities anywhere.
  `dp`: 493; Rotom has forms; Togekiss `['normal','flying']`.
  `xy`: 721; Clefairy `['fairy']`; Charizard forms include mega-x and mega-y; no Alolan forms.
  `sm`: 809; Vulpix has an alola form `['ice']`; megas present; Meltan (808) present.
  `swsh`: 905; Charizard has a gmax form and no mega forms; Galarian Meowth present.
  `sv`: 1025; no mega/gmax forms; Wooper has a paldea form; Gengar abilities `['cursed-body']`.
  All: no species id > max; every form has `pokemonId`; flavor non-empty for every species (fallback allowed); for `bw` the file is byte-identical to before except for added fields (`pokemonId`, `abilityEffects`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Generalize the builder: feature rules (abilities by `abilities.generation_id ≤ gen`, none before gen 3, hidden only from gen 5), breeding fields omitted/neutral before gen 2 (document the representation in types), forms rules from Global Constraints, flavor fallback by `flavorVersions`, `abilityEffects` from `ability_prose` (local_language 9, short_effect, strip `[x]{y}` markup to plain text).
- [ ] **Step 4:** `bun run data`; run tests → PASS; report file sizes and species/form counts per gen.
- [ ] **Step 5:** Commit `feat(data): datasets for all nine generations`.

---

### Task 4: Sprites for all generations

**Files:** `scripts/sprites/fetch.ts`, `scripts/sprites/build.ts`, `scripts/sprites/sets.ts` (new: per-set config), `scripts/data/sprite-availability.ts`, `src/data/sprites/{rb,gs,rs,dp,bw,home}.json`, `public/sprites/{rb,gs,rs,dp,home}/**`, tests.

**Interfaces:**
- Consumes: `GenConfig.spriteSet`, `Form.key`, `Form.pokemonId` (Task 3).
- Produces: one `SpriteManifest` per set at `src/data/sprites/{set}.json` (same shape as bw); files `public/sprites/{set}/{variant}/{key}.webp`; HOME files keyed by our `Form.key` (mapped from `pokemonId` at build time) so pages never care about naming; atlases per set (HOME atlas of 1025 default forms at 96 px cells, lossy).
- `sets.ts`: `SPRITE_SETS: Record<SpriteSetId, { sourceDir: string; animated: boolean; lossless: boolean; variants: Variant[]; resize?: number; quality?: number }>` with values from Global Constraints.

- [ ] **Step 1:** Tests (failing): sets config covers all six; build on fixtures — a HOME PNG fixture becomes lossy WebP ≤ 192 px with expected key; a gen-I PNG stays lossless; atlas cells exist for defaults.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; extend sparse checkout to the needed source dirs; respect the existing stale-file cleanup per set (never touch other sets).
- [ ] **Step 4:** `bun run sprites` (all sets) then `bun run data`; report bytes per set and total (`public/sprites` ≤ 200 MB, else stop and report).
- [ ] **Step 5:** Commit code and generated assets separately.

---

### Task 5: Russian data for all generations

**Files:** `scripts/i18n/ru-pogo.ts` (+ tests), `src/i18n/data/ru/{pokemon,genus,forms}.json` (regenerated, 1–1025), `src/i18n/data/ru/flavor-go.json` (new, GO descriptions by species id), `src/i18n/data/ru/flavor-extra.json` (new, our translations for species/gens missing in GO), `src/i18n/data/ru/{abilities,ability-effects,items,locations,moves,egg-groups}.json`, `src/i18n/names.ts`, `tests/i18n/coverage.test.ts`.

**Interfaces:**
- Produces: `flavorText(lang, p, version, gen: GenId): { text: string; source: 'game' | 'go' }` (bw ru → `flavor.json`; other gens ru → `flavor-go.json`, else `flavor-extra.json`; en → the version text); `abilityEffect(lang, slug, gen: GenData): string`; names for ids 1–1025.
- Coverage test iterates all nine generation files.

- [ ] **Step 1:** Extend extraction to ids 1–1025 (names, genus, forms incl. regional/mega/gmax via GO `form_*` keys, descriptions). Coverage test fails listing missing keys.
- [ ] **Step 2:** Translate what GO lacks (≈17 names as transliterations, missing genus/descriptions from the English text of the latest generation), all new ability names and every ability effect (~310), new evolution items/locations/moves. Work in batches (parallelizable by file); follow the RU style guide.
- [ ] **Step 3:** Coverage test PASS; `bun run ci` green.
- [ ] **Step 4:** Commit per batch.

---

### Task 6: Pages for all generations

**Files:** `src/lib/gen-data.ts` (new), `src/pages/[lang]/[gen]/**`, `src/components/*` (Hero, VariantSwitcher, Abilities, Breeding, PokedexText, GenSwitcher, PokemonCard, ListControls, Sprite), `src/scripts/list.ts`, `src/scripts/detail.ts`, `src/lib/urls.ts`, `integrations/service-worker.ts`, `scripts/check-dist.ts`, tests.

**Interfaces:**
- Produces: `getGenData(gen: GenId): GenData` and `getSpriteManifest(set: SpriteSetId): SpriteManifest` (build-time accessors over `import.meta.glob(..., { eager: true })`); `switchGenUrl(pathname: string, to: GenId, existsIn: (slug: string, gen: GenId) => boolean): string`; endpoint `/{lang}/{gen}/list.json` → `[id, searchKey, statsTuple, evoIds, flags][]`; `search.json` per gen; SW warm list per gen.
- Consumes: Tasks 2–5.

- [ ] **Step 1:** Tests (failing): `switchGenUrl` (detail → same species in another gen; species missing → target list), view-model helpers that decide which sections/toggles render per `features`, list-state still restores, `list.json` shape and gzip ≤ 40 KB for `sv`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement: routes over all enabled gens × langs; gen-aware UI (hide absent sections/toggles; PokedexText shows the version label or «Pokémon GO»); list cards keep minimal markup and `list.ts` hydrates search keys/stats/evo from `list.json` (name/number search works from DOM text before it arrives); GenSwitcher links via `switchGenUrl`; hreflang; SW precache per gen list pages only.
- [ ] **Step 4:** `bun run ci` (check-dist counts pages dynamically: Σ species × 2 detail pages, 18 list pages); report build time, dist size, max HTML gzip per page type.
- [ ] **Step 5:** Commit `feat(pages): all nine generations`.

---

### Task 7: Abilities with descriptions

**Files:** `src/components/Abilities.astro`, `src/scripts/detail.ts` (form switching updates descriptions), `src/scripts/detail-data.ts`, tests.

- [ ] **Step 1:** Each ability renders as `<details>` with name, hidden badge and the localized effect (`abilityEffect`); keyboard accessible; form switch updates them from `#pdx-forms` (add effect strings to the payload only for that page's abilities).
- [ ] **Step 2:** View-model test for the payload; `bun run ci` green; detail-page HTML stays ≤ 20 KB gzip.
- [ ] **Step 3:** Commit `feat(detail): ability descriptions`.

---

### Task 8: Animations

**Files:** `src/styles/tokens.css`, `src/components/PokemonCard.astro`, `src/components/StatBars.astro`, `src/components/EvolutionTree.astro`/`EvolutionBranch.astro`, `src/components/SearchPalette.astro`, `src/scripts/list.ts`, `src/scripts/detail.ts`, tests.

**Interfaces:** `withViewTransition(update: () => void): void` in `src/lib/view-transition.ts` (uses `document.startViewTransition` when available and motion allowed, else calls `update` directly; never throws; skips if a transition is already running).

- [ ] **Step 1:** Unit-test `withViewTransition` with a fake document (no API → direct call; reduced motion → direct call; API → wrapped; re-entrancy guard).
- [ ] **Step 2:** Implement per spec «Анимации»: first-screen card cascade (CSS only, delays ≤ 300 ms, first load only), hover lift + sprite hop, filter/sort/shiny via `withViewTransition` with per-card `view-transition-name` assigned only during the transition for visible cards (budget: no static names in list HTML), stat bars grow on reveal, variant/form switch cross-fade, evolution arrows fade-in, palette open/close; everything off under `prefers-reduced-motion: reduce`.
- [ ] **Step 3:** `bun run ci` green; JS budget holds; check there are no duplicate names during list transitions (unit-test the name-assignment helper).
- [ ] **Step 4:** Commit `feat(ui): livelier animations`.

---

### Task 9: End-to-end smoke tests

**Files:** `e2e/*.spec.ts`, `playwright.config.ts`, `package.json` (`e2e` script, `@playwright/test` dev dep), `.github/workflows/deploy.yml` (install Chromium, run e2e after build).

- [ ] **Step 1:** Specs (Chromium; desktop + mobile viewport; one run with `reducedMotion: 'reduce'`): list loads with sprites and zero console errors; search `пика` → Pikachu; type filter + sort; shiny chip; card → detail; detail toggles S/B/G; form switch Rotom heat updates types; evolution link; ⌘K palette Enter navigates; language switch keeps page; generation switch on a species missing in the target gen lands on the list; gen I page hides abilities; HOME gen hides back toggle; 404 page; rapid filter toggling leaves the right number of visible cards.
- [ ] **Step 2:** `bun run e2e` against `astro preview` green locally; CI step added (`bunx playwright install --with-deps chromium`).
- [ ] **Step 3:** Commit `test(e2e): Playwright smoke suite`.

---

### Task 10: Final QA and deploy

- [ ] **Step 1:** Fresh browser QA pass over all generations (same matrix as the first QA run plus generation switching), report to `qa/`.
- [ ] **Step 2:** Fix wave for anything found, with tests.
- [ ] **Step 3:** `bun run ci` + `bun run e2e` green; push `main`; watch the Pages deploy; smoke-check live URLs for each generation.
