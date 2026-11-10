# Pokédex (Black/White, EN/RU) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static, ultra-fast Pokédex on GitHub Pages: list of all 649 Pokémon as of Black/White, a detail page per Pokémon with stats, type matchups, evolution tree and sprite variants, in English and Russian.

**Architecture:** Bun scripts turn pinned PokeAPI CSVs and PokeAPI/sprites GIFs into committed JSON and lossless WebP sprites. Astro 7 pre-renders every page (`/{lang}/{gen}/…`) as static HTML with near-zero JS. Speed comes from viewport prefetch, Chrome Speculation Rules prerender, native cross-document View Transitions, a first-frame sprite atlas, and a Service Worker (GitHub Pages cannot set cache headers).

**Tech Stack:** Bun 1.4 (`bun test`, `bun lint`, `bun fmt`, `bun check`), Astro 7.4, TypeScript strict, sharp 0.35, GitHub Actions + Pages.

**Spec:** `docs/draft.md` (design: `docs/design/mockup.html`, the visual source of truth for colors, spacing and components).

## Global Constraints

- Site URL `https://brofrong.github.io`, base path `/pokemon-dex/`, `trailingSlash: 'always'`. Every URL in HTML, CSS, JS and the SW goes through the base.
- Locales `en`, `ru`, all prefixed (`/en/…`, `/ru/…`). Generations: only `bw` is built; the switcher lists I–IV as disabled "soon".
- Routes: `/{lang}/{gen}/` list, `/{lang}/{gen}/pokemon/{slug}/` detail (slug = PokeAPI species identifier), form via `?form={formSlug}`.
- Budgets per page: JS ≤ 15 KB gzip, list page HTML ≤ 50 KB gzip.
- Tooling: `bun lint`, `bun fmt` (+ `format` script alias), `bun check`. No Biome, no ESLint, no Prettier.
- Data must reflect generation V: types, stats, abilities, type chart, evolutions, existing species (≤ 649), no Fairy type.
- Sprites: lossless only (WebP lossless, animated WebP), cropped to alpha bounding box, rendered with `image-rendering: pixelated` at integer scale inside a 96×96 logical box.
- Type icons: `partywhale/pokemon-type-icons` (MIT), credited in the footer. Footer also carries the Nintendo/Game Freak fan-site disclaimer and PokeAPI credit.
- No web fonts: system font stack only.
- Theme: auto / light / dark, persisted in `localStorage` key `pdx:theme`, applied before first paint.
- Hotkeys: `⌘K`/`Ctrl+K` and `/` (search), `S` shiny, `B` back, `G` gender, `←`/`→` neighbours. Hotkeys are ignored while typing in an input.
- Shiny preference persists in `localStorage` key `pdx:shiny` across pages.
- Prefetch: at most 4 concurrent background requests, only when idle, never when `Save-Data` is on or `effectiveType` is `slow-2g`/`2g`.
- `prefers-reduced-motion: reduce` disables view-transition animation.
- Pin upstream data: PokeAPI and PokeAPI/sprites commit SHAs are constants in `scripts/pins.ts`.
- Never write secrets anywhere; none are needed for this project.

## Review Focus

1. **Evolution-member navigation kills the transition**: on a detail page the current Pokémon appears in both the hero and the evolution tree; if both carry the same `view-transition-name` the browser drops the whole transition. Expected: hero and card names are unique per page; the tree's current node has no name. Pinned by `check-dist` uniqueness test (Task 15) and an EvolutionTree render assertion (Task 11).
2. **Search input variety**: `Пика`, `пика`, `ёж`/`еж`, `25`, `025`, `#025`, `mr. mime`, `Mr Mime`. Expected: all find the right Pokémon in both languages. Pinned by `normalizeQuery`/`matchesQuery` tests (Task 10).
3. **Cold deep links with state**: `/ru/bw/?type=fire,flying&sort=speed`, `/en/bw/pokemon/rotom/?form=heat`, `?form=bogus`. Expected: state restored on load; unknown values fall back to defaults without errors. Pinned by `parseListState` and `resolveForm` tests (Tasks 10, 11).
4. **Base path leaks**: an asset or link emitted as `/sprites/...` instead of `/pokemon-dex/sprites/...` works in `astro dev` but 404s on Pages. Expected: every internal URL resolves inside `dist`. Pinned by the `check-dist` link test (Task 15) and SW `classifyRequest` tests with the base (Task 14).
5. **Slow or metered network**: Save-Data or 2G must not trigger viewport prefetch or the whole-generation warm-up (~2–3 MB). Expected: no background traffic beyond what is on screen. Pinned by `shouldPrefetch` and `shouldWarmGeneration` tests (Tasks 13, 14).

---

## File Structure

```
astro.config.mjs                 site/base/i18n/prefetch config
bunfig.toml                      [lint] [fmt] [test]
package.json                     scripts (see Task 1)
scripts/
  pins.ts                        upstream commit SHAs
  data/csv.ts                    CSV parser
  data/fetch.ts                  download pinned CSVs → .cache/csv
  data/resolve.ts                gen-V resolution of types/stats/abilities/type chart
  data/evolution.ts              evolution tree builder
  data/build-gen.ts              tables → GenData; CLI writes src/data/gen/bw.json
  i18n/ru-names.ts               Bulbapedia → src/i18n/data/ru/pokemon.json
  sprites/fetch.ts               sparse clone of PokeAPI/sprites → .cache/sprites
  sprites/bbox.ts, pack.ts       alpha bbox, shelf packer
  sprites/build.ts               GIF → WebP, atlases, manifest
  check-dist.ts                  post-build budget and integrity checks
src/
  data/types.ts                  shared data types (GenData, Pokemon, …)
  data/gen/bw.json               generated, committed
  data/sprites/bw.json           generated sprite manifest, committed
  lib/generations.ts             generation registry
  lib/urls.ts                    base-aware URL helpers
  lib/format.ts                  height/weight/gender/condition formatting
  lib/view-transition.ts         vtName()
  i18n/ui.ts                     UI strings en/ru + t()
  i18n/names.ts                  names/genus/types/abilities/items lookups
  i18n/data/ru/*.json            translations, committed
  assets/types/*.svg + LICENSE   type icons (MIT)
  layouts/Base.astro
  components/*.astro
  scripts/*.ts                   client scripts (theme, list, variants, palette, prefetch, sw-register)
  sw/sw.ts                       service worker source
  pages/index.astro, [lang]/index.astro, [lang]/[gen]/index.astro,
        [lang]/[gen]/pokemon/[slug]/index.astro, [lang]/[gen]/search.json.ts
integrations/service-worker.ts   astro:build:done → dist/sw.js
public/sprites/bw/…              generated sprites, committed
tests/…                          bun tests mirroring the paths above
.github/workflows/deploy.yml
```

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `bunfig.toml`, `.gitignore`, `src/lib/urls.ts`, `src/pages/index.astro` (temporary "hello"), `tests/lib/urls.test.ts`
- Modify: `README.md` (commands section)

**Interfaces:**
- Produces: `BASE = '/pokemon-dex/'`; `withBase(path: string): string` (accepts with or without leading slash, never doubles slashes, keeps query/hash); scripts listed below.

- [ ] **Step 1: Create the Astro project with Bun** (`bun create astro@7.4.8` minimal template into the repo root, TypeScript strict, no git init). Delete template sample content.
- [ ] **Step 2: Verify Astro runs on Bun**: `bun --bun astro build` succeeds. If Astro refuses under Bun, record the error and fall back to `astro build` with Node ≥ 22.23.4 for the build script only; everything else stays on Bun.
- [ ] **Step 3: Configure `astro.config.mjs`**: `site: 'https://brofrong.github.io'`, `base: '/pokemon-dex'`, `trailingSlash: 'always'`, `output: 'static'`, `i18n: { locales: ['en','ru'], defaultLocale: 'en', routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false } }`, `prefetch: { prefetchAll: true, defaultStrategy: 'viewport' }`, `build: { inlineStylesheets: 'always' }`. Cross-check option names against the Astro 7 docs (prefetch, i18n guides) and adjust names only, not behaviour.
- [ ] **Step 4: Scripts in `package.json`**:
  `dev` = `bun --bun astro dev`, `build` = `bun --bun astro build`, `preview` = `bun --bun astro preview`,
  `lint` = `bun lint --no-script`, `format` = `bun fmt`, `check` = `bun check --no-script && bun --bun astro check`,
  `test` = `bun test`, `data` = `bun scripts/data/build-gen.ts`, `sprites` = `bun scripts/sprites/build.ts`,
  `check:dist` = `bun scripts/check-dist.ts`, `ci` = `bun lint && bun fmt --check && bun check && bun test && bun run build && bun run check:dist`.
  Add `@astrojs/check` and `typescript` as dev deps (needed by `astro check`).
- [ ] **Step 5: Check `.astro` support** in `bun lint` and `bun fmt` (`bun lint --doctor`, `bun fmt --doctor`). Write the result as a comment in `bunfig.toml`. If `.astro` isn't supported, scope both to `scripts src/**/*.ts tests` and rely on `astro check` for `.astro`.
- [ ] **Step 6: `.gitignore`** gets `.cache/`, `dist/`, `node_modules/`, `.astro/`.
- [ ] **Step 7: Write the failing test** `tests/lib/urls.test.ts`:

```ts
expect(withBase('/en/bw/')).toBe('/pokemon-dex/en/bw/');
expect(withBase('en/bw/')).toBe('/pokemon-dex/en/bw/');
expect(withBase('/sprites/bw/front/1.webp')).toBe('/pokemon-dex/sprites/bw/front/1.webp');
expect(withBase('/en/bw/?type=fire#x')).toBe('/pokemon-dex/en/bw/?type=fire#x');
expect(withBase('/')).toBe('/pokemon-dex/');
```

- [ ] **Step 8: Run `bun test tests/lib/urls.test.ts`**. Expected: FAIL (module missing).
- [ ] **Step 9: Implement `withBase` in `src/lib/urls.ts`**.
- [ ] **Step 10: Run `bun run ci`** minus `check:dist` (not written yet). Expected: all green.
- [ ] **Step 11: Commit** `chore: scaffold Astro on Bun with lint/fmt/check`.

---

### Task 2: CSV parser and pinned fetch

**Files:**
- Create: `scripts/pins.ts`, `scripts/data/csv.ts`, `scripts/data/fetch.ts`, `tests/scripts/data/csv.test.ts`

**Interfaces:**
- Produces: `POKEAPI_SHA: string`, `SPRITES_SHA: string` (from `gh api repos/PokeAPI/pokeapi/commits/master --jq .sha` and the same for `PokeAPI/sprites`, recorded at implementation time); `parseCsv(text: string): Record<string, string>[]` (header row becomes keys, empty field = `''`); `CSV_TABLES: readonly string[]` (every table name used in Tasks 3–5); `loadTables(dir?: string): Promise<Tables>` where `Tables = Record<(typeof CSV_TABLES)[number], Record<string,string>[]>`; `fetchCsvs(sha: string, dir = '.cache/csv'): Promise<void>` (skips files already present).

`CSV_TABLES`: `pokemon, pokemon_species, pokemon_forms, pokemon_evolution, evolution_triggers, pokemon_types, pokemon_types_past, pokemon_stats, pokemon_stats_past, pokemon_abilities, pokemon_abilities_past, type_efficacy, type_efficacy_past, types, versions, version_groups, pokemon_species_flavor_text, pokemon_species_names, abilities, ability_names, items, item_names, locations, location_names, moves, move_names, egg_groups, pokemon_egg_groups, stats, genders`.

- [ ] **Step 1: Write the failing tests**

```ts
test('quoted field with comma, newline and escaped quote', () => {
  expect(parseCsv('a,b\n1,"x, ""y""\nz"\n')).toEqual([{ a: '1', b: 'x, "y"\nz' }]);
});
test('CRLF and missing trailing newline', () => {
  expect(parseCsv('a,b\r\n1,2\r\n3,')).toEqual([{ a: '1', b: '2' }, { a: '3', b: '' }]);
});
test('form-feed characters inside flavor text are preserved for later cleanup', () => {
  expect(parseCsv('t\n"a\fb"')[0].t).toBe('a\fb');
});
```

- [ ] **Step 2: Run `bun test tests/scripts/data/csv.test.ts`**. Expected: FAIL.
- [ ] **Step 3: Implement `parseCsv`** as a single-pass RFC 4180 state machine (no dependency).
- [ ] **Step 4: Implement `fetchCsvs`** from `https://raw.githubusercontent.com/PokeAPI/pokeapi/${sha}/data/v2/csv/${name}.csv`, concurrency 8, and `loadTables`.
- [ ] **Step 5: Run tests**. Expected: PASS. Run `bun -e "await (await import('./scripts/data/fetch.ts')).fetchCsvs((await import('./scripts/pins.ts')).POKEAPI_SHA)"`. Expected: 30 files in `.cache/csv`.
- [ ] **Step 6: Commit** `feat(data): CSV parser and pinned PokeAPI fetch`.

---

### Task 3: Generation-V resolution (types, stats, abilities, type chart)

**Files:**
- Create: `src/data/types.ts`, `scripts/data/resolve.ts`, `tests/scripts/data/resolve.test.ts`

**Interfaces:**
- Produces in `src/data/types.ts`:
  `type GenId = 'bw'`;
  `type TypeSlug = 'normal'|'fighting'|'flying'|'poison'|'ground'|'rock'|'bug'|'ghost'|'steel'|'fire'|'water'|'grass'|'electric'|'psychic'|'ice'|'dragon'|'dark'|'fairy'`;
  `type Stats = [hp: number, atk: number, def: number, spa: number, spd: number, spe: number]`;
  `interface AbilityRef { slug: string; hidden: boolean }`;
  `type TypeChart = Record<TypeSlug, Partial<Record<TypeSlug, number>>>` (attacker → defender → factor, only non-1 entries stored);
  `type Multiplier = 0 | 0.25 | 0.5 | 1 | 2 | 4`.
- Produces in `scripts/data/resolve.ts` (all take numeric `gen`, e.g. `5`):
  `typesAt(pokemonId: number, gen: number, t: Tables): TypeSlug[]`,
  `statsAt(pokemonId: number, gen: number, t: Tables): Stats`,
  `abilitiesAt(pokemonId: number, gen: number, t: Tables): AbilityRef[]`,
  `typesInGen(gen: number, t: Tables): TypeSlug[]` (excludes ids ≥ 10000 and types whose `generation_id > gen`),
  `typeChartAt(gen: number, t: Tables): TypeChart`,
  `defensiveProfile(types: TypeSlug[], chart: TypeChart, inGen: TypeSlug[]): Record<TypeSlug, Multiplier>` (only types in `inGen`).

Rule for every `*_past` table (write it as a doc comment): a row with `generation_id = G` holds the value valid **up to and including** generation G. For target `gen`, take rows with `generation_id >= gen` and use the smallest such `G`; otherwise use the current table. For `pokemon_abilities_past` the override is per slot, and an empty `ability_id` means the slot did not exist (drop it). `type_efficacy_past` overrides per (attacker, defender) pair with the same rule; `damage_factor` is in percent (`200` → `2`).

- [ ] **Step 1: Write failing tests** against small hand-written `Tables` fixtures in the test file:

```ts
test('Clefairy is Normal in gen 5, Fairy now', () => {
  expect(typesAt(35, 5, t)).toEqual(['normal']);
  expect(typesAt(35, 9, t)).toEqual(['fairy']);
});
test('stats past per stat', () => {
  expect(statsAt(25, 5, t)).toEqual([35, 55, 30, 50, 40, 90]); // Pikachu gen 5
});
test('empty ability_id removes the slot', () => {
  expect(abilitiesAt(1, 4, t)).toEqual([{ slug: 'overgrow', hidden: false }]);
});
test('no fairy in gen 5', () => expect(typesInGen(5, t)).not.toContain('fairy'));
test('steel resists ghost in gen 5', () => {
  expect(defensiveProfile(['steel'], typeChartAt(5, t), typesInGen(5, t)).ghost).toBe(0.5);
});
test('dual type multiplies', () => {
  expect(defensiveProfile(['grass', 'flying'], chart, inGen).ice).toBe(4);
});
```

- [ ] **Step 2: Run `bun test tests/scripts/data/resolve.test.ts`**. Expected: FAIL.
- [ ] **Step 3: Implement** the functions in `scripts/data/resolve.ts`. Index tables into `Map`s once (memoize per `Tables` object) so a full build stays under a few seconds.
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Commit** `feat(data): resolve types, stats, abilities and type chart per generation`.

---

### Task 4: Evolution trees

**Files:**
- Create: `scripts/data/evolution.ts`, `tests/scripts/data/evolution.test.ts`
- Modify: `src/data/types.ts`

**Interfaces:**
- Consumes: `Tables`.
- Produces in `src/data/types.ts`:

```ts
interface EvoCondition {
  trigger: 'level-up' | 'trade' | 'use-item' | 'shed' | 'other';
  minLevel?: number; item?: string; heldItem?: string; minHappiness?: number;
  timeOfDay?: 'day' | 'night'; knownMove?: string; knownMoveType?: TypeSlug;
  location?: string; gender?: 'female' | 'male'; tradeSpecies?: string;
  relativeStats?: -1 | 0 | 1; partySpecies?: string; minBeauty?: number;
}
interface EvoNode { speciesId: number; slug: string; conditions: EvoCondition[]; children: EvoNode[] }
```

- Produces: `buildEvolutionTree(chainId: number, ctx: { gen: number; versionGroup: string; maxSpeciesId: number }, t: Tables): EvoNode`. Rules: drop species with id > `maxSpeciesId` together with their subtrees; for each evolved species keep `pokemon_evolution` rows whose `version_group_id` equals the id of `ctx.versionGroup`, or, when there is none, rows with an empty `version_group_id`; skip rows that reference items, moves or locations introduced after the generation. Multiple surviving rows become multiple `conditions` (shown as "or"). Children are sorted by `speciesId`.

- [ ] **Step 1: Write failing tests** with fixtures modelled on the real rows:

```ts
test('linear chain with levels', () => {
  const tree = buildEvolutionTree(2, ctx, t); // Charmander
  expect(tree.slug).toBe('charmander');
  expect(tree.children[0].conditions).toEqual([{ trigger: 'level-up', minLevel: 16 }]);
  expect(tree.children[0].children[0].conditions[0].minLevel).toBe(36);
});
test('Eevee in gen 5 has 7 branches and no Sylveon', () => {
  const tree = buildEvolutionTree(67, ctx, t);
  expect(tree.children.map((c) => c.slug)).toEqual(
    ['vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon']);
});
test('version-group specific row wins over generic', () => {
  expect(leafeonNode.conditions).toEqual([{ trigger: 'level-up', location: 'pinwheel-forest' }]);
});
```

- [ ] **Step 2: Run tests**. Expected: FAIL.
- [ ] **Step 3: Implement `buildEvolutionTree`** in `scripts/data/evolution.ts`.
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Commit** `feat(data): generation-aware evolution trees`.

---

### Task 5: Build GenData for Black/White

**Files:**
- Create: `src/lib/generations.ts`, `scripts/data/build-gen.ts`, `src/data/gen/bw.json` (generated), `tests/data/bw-facts.test.ts`
- Modify: `src/data/types.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces in `src/lib/generations.ts`:

```ts
interface GenConfig { id: GenId; number: number; versionGroup: string; versions: [string, string];
  maxSpeciesId: number; label: string; colors: [string, string]; enabled: boolean }
const GENERATIONS: GenConfig[]  // I–IV enabled:false (labels/colors from mockup), bw enabled:true
const DEFAULT_GEN: GenId = 'bw'
function getGen(id: string): GenConfig | undefined
```

  bw = `{ id:'bw', number:5, versionGroup:'black-white', versions:['black','white'], maxSpeciesId:649, label:'Black / White', colors:['#17171a','#ffffff'], enabled:true }`.
- Produces in `src/data/types.ts`:

```ts
type Flag = 'legendary' | 'mythical' | 'baby' | 'new';
interface Form { key: string; formSlug: string | null; types: TypeSlug[]; stats: Stats;
  abilities: AbilityRef[]; battleOnly: boolean; cosmetic: boolean }
interface Pokemon {
  id: number; slug: string; name: string; genus: string;      // English; RU comes from i18n
  types: TypeSlug[]; stats: Stats; abilities: AbilityRef[]; flags: Flag[];
  heightDm: number; weightHg: number; genderRate: number;     // -1 genderless, else female eighths
  eggGroups: string[]; hatchCounter: number; captureRate: number;
  hasGenderDiff: boolean; flavor: Partial<Record<string, string>>; // keyed by version slug
  evolution: EvoNode; forms: Form[];                          // forms[0] is the default form
}
interface GenData { gen: GenId; types: TypeSlug[]; chart: TypeChart; pokemon: Pokemon[];
  names: { abilities: Record<string, string>; items: Record<string, string>;
           locations: Record<string, string>; moves: Record<string, string>;
           eggGroups: Record<string, string> } }               // English display names
```

- Produces: `buildGeneration(gen: GenConfig, t: Tables): GenData`; CLI writes `src/data/gen/bw.json` (pretty-printed off, sorted keys for stable diffs).

Rules: species with `generation_id ≤ gen.number`. `flags`: `is_legendary`, `is_mythical`, `is_baby`, `new` when `generation_id === gen.number`. Flavor: English (`language_id` 9) for `gen.versions`, whitespace (`\n`, `\f`, soft hyphen) normalized to single spaces. `hasGenderDiff` = `has_gender_differences === '1'` (Task 8 later ANDs it with sprite availability). Forms: `pokemon_forms` rows whose `introduced_in_version_group_id` has `version_groups.order` ≤ that of `black-white`, excluding `is_mega`; `cosmetic` = the form shares `pokemon_id` with the default form (Unown letters, Shellos, Deerling) and therefore shares its data; non-cosmetic forms resolve types, stats and abilities from their own `pokemon_id`. `key` = species id for the default, `${speciesId}-${form_identifier}` otherwise (matches sprite filenames like `479-heat`). The `names` maps contain only the slugs actually referenced.

- [ ] **Step 1: Implement `generations.ts`, `buildGeneration` and the CLI**. Run `bun run data`. Expected: `src/data/gen/bw.json` written; the script prints Pokémon count and file size.
- [ ] **Step 2: Write golden-fact tests** in `tests/data/bw-facts.test.ts` reading the committed JSON:

```ts
const bw: GenData = await Bun.file('src/data/gen/bw.json').json();
const p = (slug: string) => bw.pokemon.find((x) => x.slug === slug)!;
test('649 species, ids 1..649', () => expect(bw.pokemon.map((x) => x.id)).toEqual(range(1, 649)));
test('no fairy anywhere', () => expect(bw.types).not.toContain('fairy'));
test('Clefairy normal', () => expect(p('clefairy').types).toEqual(['normal']));
test('Charmander total 309', () => expect(sum(p('charmander').stats)).toBe(309));
test('Pikachu gen-5 stats', () => expect(p('pikachu').stats).toEqual([35, 55, 30, 50, 40, 90]));
test('Gengar has Levitate, not Cursed Body', () =>
  expect(p('gengar').abilities.map((a) => a.slug)).toEqual(['levitate']));
test('Charmander hidden ability Solar Power', () =>
  expect(p('charmander').abilities).toContainEqual({ slug: 'solar-power', hidden: true }));
test('Eevee 7 branches', () => expect(p('eevee').evolution.children).toHaveLength(7));
test('Golbat evolves by happiness', () =>
  expect(findNode(p('zubat').evolution, 'crobat')!.conditions[0].minHappiness).toBeGreaterThan(0));
test('Rotom has 6 forms with Electric + form type', () => {
  expect(p('rotom').forms).toHaveLength(6);
  expect(p('rotom').forms.find((f) => f.formSlug === 'heat')!.types).toEqual(['electric', 'fire']);
});
test('Mewtwo legendary, Mew mythical, Pichu baby, Snivy new', () => {
  expect(p('mewtwo').flags).toContain('legendary'); expect(p('mew').flags).toContain('mythical');
  expect(p('pichu').flags).toContain('baby'); expect(p('snivy').flags).toContain('new');
});
test('every Pokémon has black and white flavor text', () =>
  bw.pokemon.forEach((x) => { expect(x.flavor.black).toBeTruthy(); expect(x.flavor.white).toBeTruthy(); }));
```

- [ ] **Step 3: Run `bun test tests/data`**. Expected: PASS. Any failure is a bug in Tasks 3–5 (or a real data gap): fix the resolver, not the test. If PokeAPI genuinely lacks a fact (for example, a missing flavor text), document it next to the test and relax only that one assertion.
- [ ] **Step 4: Commit** `feat(data): generate Black/White dataset` (including `bw.json`).

---

### Task 6: Russian Pokémon names

**Files:**
- Create: `scripts/i18n/ru-names.ts`, `src/i18n/data/ru/pokemon.json`, `tests/scripts/i18n/ru-names.test.ts`, `tests/fixtures/ru-names.wikitext` (a ~20-row excerpt of the real page)

**Interfaces:**
- Produces: `parseRuNames(wikitext: string): Record<number, string>`; `src/i18n/data/ru/pokemon.json` as `{ "1": "Бульбазавр", … }` covering ids 1–649.

- [ ] **Step 1: Download the wikitext** of `List_of_Russian_Pokémon_names` via `https://bulbapedia.bulbagarden.net/w/api.php?action=parse&page=List_of_Russian_Pok%C3%A9mon_names&prop=wikitext&format=json`. Save a 20-row excerpt (including the first Kanto rows and one row with a non-transcribed name) as the fixture. If Bulbapedia blocks the request, stop and tell the user; don't scrape around it.
- [ ] **Step 2: Write the failing test**:

```ts
const names = parseRuNames(await Bun.file('tests/fixtures/ru-names.wikitext').text());
expect(names[1]).toBe('Бульбазавр');
expect(names[4]).toBe('Чармандер');
expect(Object.values(names).every((n) => /^[А-ЯЁа-яё0-9 .:'’-]+$/.test(n))).toBe(true);
```

- [ ] **Step 3: Run test**. Expected: FAIL. **Step 4: Implement `parseRuNames`** for the row template the excerpt shows.
- [ ] **Step 5: Run test**. Expected: PASS. Run the CLI to write `pokemon.json`; it must report 649 of 649. Spot-check against the mockup: 4 Чармандер, 5 Чармилион, 6 Чаризард, 25 Пикачу, 133 Иви, 495 Снайви, 644 Зекром. Where they differ, the Bulbapedia value wins, and you also fix the mockup text.
- [ ] **Step 6: Commit** `feat(i18n): official Russian Pokémon names`.

---

### Task 7: UI strings and Russian translations

**Files:**
- Create: `src/i18n/ui.ts`, `src/i18n/names.ts`, `src/i18n/data/ru/{types,egg-groups,abilities,genus,items,locations,moves,flavor}.json`, `tests/i18n/coverage.test.ts`, `tests/i18n/ui.test.ts`

**Interfaces:**
- Consumes: `GenData` (Task 5), `ru/pokemon.json` (Task 6).
- Produces:
  `type Lang = 'en' | 'ru'`; `LANGS: Lang[] = ['en','ru']`;
  `t(lang: Lang, key: UiKey, vars?: Record<string, string | number>): string`, where `UiKey` is derived from the `en` dictionary so a missing `ru` key is a type error;
  `pokemonName(lang, p: Pokemon): string`, `genus(lang, p)`, `typeName(lang, slug)`, `abilityName(lang, slug, gen: GenData)`, `itemName`, `locationName`, `moveName`, `eggGroupName`, `flavorText(lang, p, version: string): string`. Each falls back to English when a translation is missing and in dev logs a warning once per key.
- RU type names are fixed: normal Обычный, fighting Боевой, flying Летающий, poison Яд, ground Земля, rock Камень, bug Жук, ghost Призрак, steel Сталь, fire Огонь, water Вода, grass Трава, electric Электро, psychic Психо, ice Лёд, dragon Дракон, dark Тёмный, fairy Фея.
- JSON shapes: `genus.json` and `flavor.json` are keyed by species id (`flavor.json`: `{ "4": { "black": "…", "white": "…" } }`); the other files are keyed by slug.

- [ ] **Step 1: Write the UI dictionaries** for every string in the mockup (header, filters, flags `★ Легенда`/`✦ Миф`/`Малыш`/`Unova`, section titles, stat names `HP, Атака, Защита, Сп. атака, Сп. защита, Скорость, Сумма`, variant toggles, footer, palette, theme labels, evolution condition phrases with `{level}` and `{item}` placeholders).
- [ ] **Step 2: Write the failing coverage test**. It loads `bw.json` and every RU file and asserts that each referenced slug or id has a non-empty translation. On failure it prints the missing keys grouped by file.
- [ ] **Step 3: Run `bun test tests/i18n`**. Expected: FAIL, listing everything to translate.
- [ ] **Step 4: Translate**: types (above), egg groups, abilities, genus (649), evolution items, locations and moves, then flavor texts (649 × black/white). Translate natural Russian prose from the English source, keep game terms consistent with the names files, and use the official Russian Pokémon names inside texts. Work in batches of about 100 ids per file write (this is parallelizable across subagents by id range).
- [ ] **Step 5: Run coverage test**. Expected: PASS. `ui.test.ts` checks `t('ru','stat.total') === 'Сумма'` and placeholder substitution: `t('ru','evo.level',{level:16}) === 'Ур. 16'`.
- [ ] **Step 6: Commit** `feat(i18n): UI strings and Russian translations`.

---

### Task 8: Sprite pipeline

**Files:**
- Create: `scripts/sprites/fetch.ts`, `scripts/sprites/bbox.ts`, `scripts/sprites/pack.ts`, `scripts/sprites/build.ts`, `src/data/sprites/bw.json` (generated), `public/sprites/bw/**` (generated), `tests/scripts/sprites/{bbox,pack,build}.test.ts`, `tests/fixtures/sprites/` (3 real GIFs: `4.gif`, `shiny/4.gif`, `female/25.gif`)
- Modify: `scripts/data/build-gen.ts` (AND `hasGenderDiff` with sprite availability; drop forms without a front sprite, with a warning)

**Interfaces:**
- Produces:
  `type Variant = 'front' | 'front-shiny' | 'back' | 'back-shiny' | 'front-female' | 'front-shiny-female' | 'back-female' | 'back-shiny-female'`;
  `interface Box { x: number; y: number; w: number; h: number }`;
  `alphaBBox(rgba: Uint8Array, width: number, pageHeight: number, pages: number): Box | null` (union over all frames; `null` if fully transparent);
  `shelfPack(rects: { key: string; w: number; h: number }[], maxWidth: number, pad = 1): { width: number; height: number; placements: Record<string, { x: number; y: number }> }`;
  manifest `src/data/sprites/bw.json` typed as `SpriteManifest`:

```ts
interface SpriteManifest {
  canvas: 96;
  sprites: Record<string /* form key */, Partial<Record<Variant, Box /* crop inside 96×96 */>>>;
  atlas: Record<'front' | 'front-shiny', { file: string; width: number; height: number;
                                           cells: Record<string /* default form key */, { x: number; y: number }> }>;
}
```

  Files: `public/sprites/bw/{variant}/{key}.webp` (animated, lossless); atlases `public/sprites/bw/atlas-front.{hash8}.webp` and `atlas-front-shiny.{hash8}.webp` (first frames, lossless, content-hashed so the SW can cache them forever).
- Source paths in PokeAPI/sprites `sprites/pokemon/versions/generation-v/black-white/animated/`: `{key}.gif`, `shiny/`, `back/`, `back/shiny/`, `female/`, `shiny/female/`, `back/female/`, `back/shiny/female/`.

- [ ] **Step 1: Write failing tests** for `alphaBBox` (a 2-frame synthetic buffer where frame 1 has a pixel at (10,10) and frame 2 at (40,50) → `{x:10,y:10,w:31,h:41}`; all-transparent → `null`) and `shelfPack` (no two placements overlap including padding; all within `maxWidth`; deterministic for the same input).
- [ ] **Step 2: Run tests**. Expected: FAIL. **Step 3: Implement** `bbox.ts` and `pack.ts`. **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Implement `fetch.ts`**: `git clone --filter=blob:none --sparse` of PokeAPI/sprites into `.cache/sprites`, sparse-checkout the black-white folder only, `git checkout ${SPRITES_SHA}`.
- [ ] **Step 6: Implement `build.ts`**: for each form key in `bw.json` and each variant source that exists, use sharp (`animated: true`) to read raw RGBA, compute the bbox, extract the box from every frame, and write animated WebP with `{ lossless: true, effort: 6 }` while preserving frame delays and loop. Record the box. Build both atlases from the first frames of default forms with `shelfPack(…, 2048)`. Write the manifest. Delete stale files under `public/sprites/bw` that weren't produced this run.
- [ ] **Step 7: Write the build test** on the fixtures (via an exported `buildSprites({ src, out, keys })`): output `front/4.webp` exists, `sharp(...).metadata()` has `pages > 1`, box width/height < 96, `front-shiny` box equals `front` box size within 2 px, `front-female` exists for 25.
- [ ] **Step 8: Run `bun run sprites`**. Expected: it prints the count per variant and total bytes. Total for `public/sprites/bw` must be ≤ 25 MB (spec estimate 10–20 MB). If over, stop and report the numbers.
- [ ] **Step 9: Re-run `bun run data`** (`hasGenderDiff` now uses sprite availability). Add to `bw-facts.test.ts`: `p('pikachu').hasGenderDiff === true`, `p('charmander').hasGenderDiff === false`, and the number of Pokémon with `hasGenderDiff` is between 90 and 110 (the spec says 106 female sprites).
- [ ] **Step 10: Run all tests**. Expected: PASS. **Step 11: Commit** `feat(sprites): lossless cropped WebP sprites and first-frame atlases`.

---

### Task 9: Layout, header, theme, type icons, footer

**Files:**
- Create: `src/layouts/Base.astro`, `src/components/{Header,GenSwitcher,LangSwitch,ThemeToggle,TypeSprite,TypeIcon,TypeBadge,Footer}.astro`, `src/scripts/theme.ts`, `src/assets/types/*.svg` + `src/assets/types/LICENSE`, `src/pages/index.astro`, `src/pages/[lang]/index.astro`, `src/styles/tokens.css`, `tests/scripts/theme.test.ts`, `tests/lib/urls.test.ts` (extend)
- Modify: `src/lib/urls.ts`

**Interfaces:**
- Consumes: `GENERATIONS`, `t`, `withBase`.
- Produces:
  `listUrl(lang: Lang, gen: GenId, query?: string): string`, `pokemonUrl(lang: Lang, gen: GenId, slug: string, formSlug?: string | null): string`, `swapLang(pathname: string, to: Lang): string` (in `src/lib/urls.ts`);
  `type ThemePref = 'auto' | 'light' | 'dark'`; `resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark'`; `nextThemePref(p: ThemePref): ThemePref` (auto→light→dark→auto);
  `Base.astro` props `{ lang: Lang; gen: GenId; title: string; description: string }` with slots `default` and `head`;
  `<TypeBadge type lang size?: 'sm' | 'md' />`, `<TypeIcon type size? />`, which uses `<use href="#t-{type}">` from the `<TypeSprite />` inlined once per page.

- [ ] **Step 1: Write failing tests**: `resolveTheme('auto', true) === 'dark'`, `resolveTheme('light', true) === 'light'`, `nextThemePref` cycle; `pokemonUrl('ru','bw','rotom','heat') === '/pokemon-dex/ru/bw/pokemon/rotom/?form=heat'`; `swapLang('/pokemon-dex/en/bw/pokemon/eevee/', 'ru') === '/pokemon-dex/ru/bw/pokemon/eevee/'`.
- [ ] **Step 2: Run tests**. Expected: FAIL. **Step 3: Implement** them.
- [ ] **Step 4: Build the layout**. `<html lang>`, the CSS tokens from the mockup (`.site` / `.site.dark` → `:root` / `[data-theme=dark]`, the type colors `--c` per `.t-{type}`), an inline blocking theme script (≤ 400 bytes, reads `pdx:theme`, sets `data-theme`), `@view-transition { navigation: auto; }` inside `@media (prefers-reduced-motion: no-preference)`, the system font stack, and `<link rel="preload" as="image">` for the front atlas on list pages via the `head` slot. Header per mockup: logo, GenSwitcher (dropdown with I–IV disabled and a "soon" note; the B/W entry shows its color dots), LangSwitch (links via `swapLang`, keeps query), ThemeToggle. No search in the header. Footer: disclaimer, PokeAPI credit, type-icon MIT credit.
- [ ] **Step 5: Root pages**. `src/pages/index.astro` is a static page that picks `ru` when `navigator.language` starts with `ru`, else `en`, and redirects with `location.replace` to `/{lang}/bw/`; it also has `<noscript>` and `<meta http-equiv="refresh">` fallbacks to `/en/bw/`. `src/pages/[lang]/index.astro` redirects to `/{lang}/bw/` the same way.
- [ ] **Step 6: Run tests, `bun run build`, `bun run preview`**, and check both themes and both languages by eye against the mockup header.
- [ ] **Step 7: Commit** `feat(ui): base layout, header, theme toggle, type icons`.

---

### Task 10: List page with search, filters, sort, shiny

**Files:**
- Create: `src/pages/[lang]/[gen]/index.astro`, `src/components/{PokemonCard,Sprite,ListControls}.astro`, `src/scripts/list.ts`, `src/scripts/list-state.ts`, `src/lib/search.ts`, `tests/lib/search.test.ts`, `tests/scripts/list-state.test.ts`

**Interfaces:**
- Consumes: `GenData`, `SpriteManifest`, i18n, URL helpers.
- Produces:
  `normalizeQuery(q: string): string` (lowercase, `ё`→`е`, strip `#`, punctuation → space, collapse spaces, strip leading zeros of a pure number);
  `searchKey(p: Pokemon): string` (`id` + EN name + RU name, normalized; emitted as `data-q` on cards);
  `matchesQuery(key: string, q: string): boolean` (number query → exact id token match; text → every query word is a prefix of some key word);
  `interface ListState { q: string; types: TypeSlug[]; flags: Flag[]; sort: 'id' | 'name' | 'total' | 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'; dir: 'asc' | 'desc'; shiny: boolean }`;
  `parseListState(search: string): ListState` / `serializeListState(s: ListState): string` (defaults omitted; unknown values ignored; at most 2 types);
  `<Sprite formKey variant scale={1|2} lang vtName? priority? />`: renders a 96×96·scale box. The atlas cell is a background positioned by the manifest box (offset `box.x`, `box.y` inside the canvas, `image-rendering: pixelated`). An `<img>` of the animated WebP is placed on top at the same box and gets its `src` from `data-src` when it nears the viewport (shared IntersectionObserver in `list.ts`, `rootMargin: '200px'`). Before the atlas paints, the box shows a type-colored silhouette. `Sprite` is reused on the detail page.
- Card markup (server-rendered, one per Pokémon) carries `data-q`, `data-types="fire flying"`, `data-flags`, `data-stats="39 52 43 60 50 65"`, `data-id`, `data-evo="4 5 6"` (species ids in the chain, used by Task 13), and links to `pokemonUrl`.

- [ ] **Step 1: Write failing tests**:

```ts
test.each([['Пика', 25], ['пика', 25], ['25', 25], ['025', 25], ['#025', 25], ['pika', 25],
           ['mr mime', 122], ['Mr. Mime', 122], ['мистер майм', 122]])('%s finds %d', (q, id) => {
  expect(ids.filter((i) => matchesQuery(keys[i], normalizeQuery(q)))).toContain(id);
});
test('25 does not match 250 or 125', () => {
  expect(matchesQuery(keys[250], normalizeQuery('25'))).toBe(false);
});
test('ё equals е', () => expect(normalizeQuery('Ёж')).toBe('еж'));
test('state round trip and defaults', () => {
  const s = parseListState('?type=fire,flying&sort=spe&dir=desc&shiny=1');
  expect(s).toMatchObject({ types: ['fire', 'flying'], sort: 'spe', dir: 'desc', shiny: true });
  expect(serializeListState(parseListState(''))).toBe('');
});
test('garbage ignored', () => expect(parseListState('?type=fairy,bogus&sort=x').types).toEqual([]));
```

  (`keys` is built with `searchKey` from `bw.json` plus RU names, so `мистер майм` must match the real RU name for 122; adjust that one string to the Bulbapedia spelling.)
- [ ] **Step 2: Run tests**. Expected: FAIL. **Step 3: Implement** `search.ts` and `list-state.ts`. **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Build the page** per mockup section 1. Large search field on top with a `⌘K` badge (`Ctrl K` on non-Mac). Type filter row with only gen-V types, flags chips, a `✦ Shiny` chip, sort select, live count. Grid with 4 columns on desktop and 2 on phones. Cards use `content-visibility: auto; contain-intrinsic-size: auto 190px`.
- [ ] **Step 6: Client `list.ts`**. Filtering toggles `hidden` on cards; sorting sets `style.order` (no DOM moves). State syncs to the URL with `history.replaceState` and is restored on load and `pageshow`. `⌘K`/`Ctrl+K`/`/` focus the field (`preventDefault`, ignored while typing elsewhere). The shiny chip switches the atlas class and the `data-src` variant and persists `pdx:shiny`. Input stays synchronous with no debounce: 649 items are cheap. Measure that a keystroke-to-paint stays under one frame on a mid laptop (Performance panel), and if not, batch writes with `requestAnimationFrame`.
- [ ] **Step 7: Run tests and the build**. Check the page in preview: filters, sort, URL restore, shiny, both langs, both themes.
- [ ] **Step 8: Commit** `feat(list): Pokémon grid with instant search, filters, sort and shiny`.

---

### Task 11: Pokémon detail page

**Files:**
- Create: `src/pages/[lang]/[gen]/pokemon/[slug]/index.astro`, `src/components/{Hero,VariantSwitcher,TypeMatchups,StatBars,Abilities,EvolutionTree,PokedexText,Breeding,NeighbourNav}.astro`, `src/scripts/variants.ts`, `src/scripts/detail.ts`, `src/lib/format.ts`, `src/lib/view-transition.ts`, `tests/lib/format.test.ts`, `tests/scripts/variants.test.ts`, `tests/components/evolution-tree.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  `vtName(kind: 'sprite' | 'name' | 'types', formKey: string): string` → e.g. `sprite-479-heat`;
  `formatHeight(dm: number, lang: Lang): string` (`ru`: `0,6 м`, `en`: `0.6 m`); `formatWeight(hg: number, lang)` (`8,5 кг` / `8.5 kg`); `formatGender(rate: number, lang)` (`-1` → genderless label, `1` → `♂ 87,5%`); `formatCondition(c: EvoCondition, lang: Lang, gen: GenData): string`; `statColor(v: number): string` with thresholds `<50 #e06c5a`, `<70 #e8a33d`, `<90 #d7c53a`, `<110 #7cc35a`, else `#2fa36b`;
  `availableVariants(entry: Partial<Record<Variant, Box>>): { shiny: boolean; back: boolean; female: boolean }`;
  `variantFor(state: { shiny: boolean; back: boolean; female: boolean }, entry): Variant` (falls back to the nearest existing variant: drop female, then back, then shiny);
  `resolveForm(p: Pokemon, formSlug: string | null): Form` (unknown → `forms[0]`).
- Page data: one `<script type="application/json" id="pdx-forms">` holding, per form, the types, stats, localized ability names, matchups and manifest entry, so a form switch needs no request.

- [ ] **Step 1: Write failing tests**:

```ts
expect(formatHeight(6, 'ru')).toBe('0,6 м'); expect(formatWeight(85, 'en')).toBe('8.5 kg');
expect(formatGender(1, 'ru')).toBe('♂ 87,5%');
expect(formatCondition({ trigger: 'level-up', minLevel: 16 }, 'ru', bw)).toBe('Ур. 16');
expect(formatCondition({ trigger: 'use-item', item: 'fire-stone' }, 'ru', bw)).toBe('Огненный камень');
expect(formatCondition({ trigger: 'level-up', minHappiness: 220, timeOfDay: 'day' }, 'ru', bw)).toBe('Дружба, днём');
expect(statColor(39)).toBe('#e06c5a'); expect(statColor(110)).toBe('#2fa36b');
expect(variantFor({ shiny: true, back: false, female: true }, charmanderEntry)).toBe('front-shiny');
expect(resolveForm(rotom, 'bogus').formSlug).toBeNull();
```

  `tests/components/evolution-tree.test.ts` renders `EvolutionTree` for Charmander's page with Astro's container API (`experimental_AstroContainer`, or whatever Astro 7 calls it) and asserts: exactly one `.mon.cur`; the current node has **no** `view-transition-name`; the other nodes carry `vtName('sprite', key)`; Eevee renders 7 branches.
- [ ] **Step 2: Run tests**. Expected: FAIL. **Step 3: Implement** `format.ts`, `view-transition.ts`, `variants.ts`. **Step 4: Run tests**. Expected: PASS (EvolutionTree passes after Step 5).
- [ ] **Step 5: Build the page** per mockup section 2, sections in this order:
  1. hero: `Sprite` at scale 2 with `vtName` sprite/name/types for the current form key, number, name, EN name and genus in small type, type badges, VariantSwitcher, then height/weight/gender/egg groups;
  2. base stats;
  3. abilities with hidden marked, plus defensive matchups (×4, ×2, ×½, ×¼, ×0 rows, empty rows hidden);
  4. evolution tree: horizontal chain, branches as a grid of tiles (mockup section 3); vertical on phones;
  5. Pokédex text for Black and White;
  6. breeding.

  NeighbourNav: crumbs line plus bottom bar, wrapping at 1 and 649. VariantSwitcher shows only available toggles; forms appear as tiles when `forms.length > 1`.
- [ ] **Step 6: Client `detail.ts`**:
  - Toggles and hotkeys `S`/`B`/`G` swap the sprite `src` via `variantFor`. Shiny persists in `pdx:shiny`.
  - Form tiles update `?form=` with `replaceState` and re-render types, stats, abilities and matchups from `#pdx-forms`.
  - `←`/`→` and horizontal swipes (≥ 60 px, mostly horizontal) navigate to neighbours.
  - After `load`, in idle time, preload every available variant of the current form with `new Image()`.
- [ ] **Step 7: Run tests and the build**. Expected: 1298 detail pages (649 × 2), plus the list and redirect pages. Check Charmander, Eevee, Rotom (`?form=heat`), Pikachu (♀), Unown (cosmetic forms) and #649 → #1 wrap in preview.
- [ ] **Step 8: Commit** `feat(detail): Pokémon page with matchups, stats, evolution tree and variants`.

---

### Task 12: ⌘K search palette on non-list pages

**Files:**
- Create: `src/pages/[lang]/[gen]/search.json.ts`, `src/components/SearchPalette.astro`, `src/scripts/palette.ts`, `tests/pages/search-json.test.ts`

**Interfaces:**
- Consumes: `normalizeQuery`, `matchesQuery`, `searchKey`, `pokemonUrl`.
- Produces: static endpoint `/{lang}/{gen}/search.json` → `[id, slug, displayName, key, types][]` (compact tuples); `<SearchPalette lang gen />` included on detail pages only.

- [ ] **Step 1: Write the failing test**: the endpoint's `GET` for `ru`/`bw` returns 649 tuples; the tuple for 4 is `[4, 'charmander', 'Чармандер', <key containing 'чармандер' and 'charmander'>, ['fire']]`; gzip size of the body < 20 KB.
- [ ] **Step 2: Run test**. Expected: FAIL. **Step 3: Implement the endpoint.** **Step 4: Run test**. Expected: PASS.
- [ ] **Step 5: Implement the palette**: `⌘K`/`Ctrl+K`/`/` opens a `<dialog>`; the first open fetches `search.json` (it is also prefetched in idle after `load`); results show sprite atlas cell, number, name and types; up/down arrows plus Enter navigate; Esc closes; the top 8 results are kept.
- [ ] **Step 6: Check in preview** on a detail page in both langs. **Step 7: Commit** `feat(search): Cmd/Ctrl+K palette on detail pages`.

---

### Task 13: Prefetch, prerender and view transitions polish

**Files:**
- Create: `src/scripts/prefetch-assets.ts`, `tests/scripts/prefetch-assets.test.ts`
- Modify: `src/layouts/Base.astro`, `src/components/PokemonCard.astro`, `src/components/EvolutionTree.astro`

**Interfaces:**
- Produces:
  `shouldPrefetch(conn: { saveData?: boolean; effectiveType?: string } | undefined): boolean` (false on saveData or `slow-2g`/`2g`; true when `conn` is undefined);
  `createQueue(limit: number): { add(url: string, priority?: boolean): void; size(): number }` (dedupes URLs, runs at most `limit` loads, priority items jump the queue; loads via `new Image()` for images and `fetch(url, { priority: 'low' })` otherwise);
  `prefetchForCard(card: HTMLElement, queue)`: queues the animated front sprites of every species in `data-evo`.

- [ ] **Step 1: Write failing tests**: `shouldPrefetch({ saveData: true })` false; `shouldPrefetch({ effectiveType: '2g' })` false; `shouldPrefetch(undefined)` true; with a fake loader, `createQueue(4)` never has more than 4 in flight, dedupes, and runs a priority URL before queued normal ones.
- [ ] **Step 2: Run tests**. Expected: FAIL. **Step 3: Implement.** **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Wire it up**:
  - Astro viewport prefetch stays on for HTML.
  - In `Base.astro` add `<script type="speculationrules">` with `prerender` for `href_matches: "/pokemon-dex/*/*/pokemon/*"` at `eagerness: "moderate"`.
  - Cards in the viewport call `prefetchForCard` in `requestIdleCallback` (Safari fallback: `setTimeout(…, 200)`).
  - `pointerenter`/`pointerdown` on a card re-queues with priority.
  - Everything is gated by `shouldPrefetch(navigator.connection)`.
  - Card sprite, name and types carry `vtName` for the default form key, matching the detail hero.
  - Add `::view-transition-group(*)` timing of 250 ms ease-out, and keep the pixelated look during the morph (`::view-transition-old/new(*) { image-rendering: pixelated }`).
- [ ] **Step 6: Manual check** in Chrome and Safari: list → Charmander morphs the sprite, name and types; Charmander → Charmeleon via the tree morphs; Firefox navigates without animation and without errors; with reduced motion there is no animation.
- [ ] **Step 7: Commit** `feat(perf): asset prefetch queue, speculation rules, view transitions`.

---

### Task 14: Service Worker and offline warm-up

**Files:**
- Create: `src/sw/sw.ts`, `src/sw/logic.ts`, `integrations/service-worker.ts`, `src/scripts/sw-register.ts`, `tests/sw/logic.test.ts`
- Modify: `astro.config.mjs` (add integration), `src/layouts/Base.astro`

**Interfaces:**
- Produces in `src/sw/logic.ts`:
  `type RequestKind = 'immutable' | 'html' | 'sprite' | 'data' | 'other'`;
  `classifyRequest(url: URL, base: string): RequestKind` (`_astro/*` and `*.{hash8}.webp` → `immutable`; navigations or paths ending `/` under base → `html`; `sprites/` → `sprite`; `*.json` → `data`; other origins → `other`);
  `buildPrecacheList(distFiles: string[], base: string): string[]` (all `_astro/*`, atlases, `/{lang}/bw/` list pages and `search.json` for both langs);
  `shouldWarmGeneration(conn: { saveData?: boolean; effectiveType?: string; type?: string } | undefined): boolean` (true only when `conn` exists, no saveData, `type !== 'cellular'`, `effectiveType === '4g'`);
  `warmList(lang: Lang, gen: GenId, slugs: string[], base: string): string[]` (all detail page URLs for that lang/gen).
- `integrations/service-worker.ts`: at `astro:build:done` bundle `src/sw/sw.ts` with `Bun.build` (target browser, minified) into `dist/sw.js`, injecting `VERSION` (hash of the precache list) and `PRECACHE` as constants.
- SW strategies: `immutable` and `sprite` → cache-first; `html` and `data` → stale-while-revalidate; old caches dropped on `activate` by `VERSION`. Messages: `{ type: 'warm', urls: string[] }` → fetch sequentially in the background, 2 at a time, into the HTML cache.
- Registration: `navigator.serviceWorker.register(withBase('sw.js'), { scope: BASE })` after `load`; then, if `shouldWarmGeneration(navigator.connection)`, post `warm` with `warmList` for the current lang (slugs come from `search.json`).

- [ ] **Step 1: Write failing tests** for `classifyRequest` (one case per kind, all with base `/pokemon-dex/`; `/sprites/...` without base → `other`), `buildPrecacheList` (contains both list pages and atlases, no detail pages), `shouldWarmGeneration` (undefined → false; `{ effectiveType: '4g', type: 'wifi' }` → true; `{ effectiveType: '4g', type: 'cellular' }` → false; saveData → false), `warmList` (649 URLs, all starting with `/pokemon-dex/ru/bw/pokemon/` and ending `/`).
- [ ] **Step 2: Run tests**. Expected: FAIL. **Step 3: Implement** `logic.ts`, `sw.ts`, the integration and the registration. **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Verify in preview**: DevTools → Application shows the SW active with scope `/pokemon-dex/`; on reload everything comes from the SW; in Offline mode a visited detail page and the list open; after warm-up any detail page opens offline. Build twice with a changed page: the new `VERSION` replaces old caches.
- [ ] **Step 6: Commit** `feat(sw): service worker caching and offline warm-up`.

---

### Task 15: Dist checks, CI and deploy

**Files:**
- Create: `scripts/check-dist.ts`, `tests/scripts/check-dist.test.ts`, `.github/workflows/deploy.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: `checkDist(dir: string, base: string): { errors: string[]; report: Record<string, number> }`. Checks:
  1. every `href`/`src`/`srcset` and CSS `url()` that points inside the site resolves to a file in `dist` (strip the base, map `/` to `index.html`, ignore the query);
  2. per page, the gzip of JS it loads (inline plus external) is ≤ 15 KB;
  3. each list page's HTML gzip is ≤ 50 KB;
  4. no page has a duplicate `view-transition-name`, from inline styles and `style` attributes;
  5. each page has `<html lang>` equal to its path locale;
  6. exactly 2 × 649 detail pages exist.

  The CLI prints the report and exits 1 on errors.

- [ ] **Step 1: Write failing tests** on a tiny synthetic dist in a temp dir: broken link detected; duplicate `view-transition-name` detected; oversize inline script detected; clean fixture → no errors.
- [ ] **Step 2: Run tests**. Expected: FAIL. **Step 3: Implement `checkDist`.** **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Run `bun run ci`** end to end. Expected: green, and the report shows list HTML gzip, max JS gzip per page and total sprite bytes. Fix any budget breach in the owning component, never by raising the limit.
- [ ] **Step 6: Workflow** `.github/workflows/deploy.yml`: on push to `main` and `workflow_dispatch`, run `oven-sh/setup-bun` with the Bun version from `package.json`'s `packageManager`, then `bun install --frozen-lockfile`, `bun run ci`, `actions/upload-pages-artifact` (path `dist`), and `actions/deploy-pages`. Set permissions `pages: write` and `id-token: write`, and concurrency group `pages`.
- [ ] **Step 7: README**: commands, data/sprite regeneration, pins, credits.
- [ ] **Step 8: Commit** `ci: dist checks and GitHub Pages deploy`.
- [ ] **Step 9: Ask the user before publishing.** Creating the GitHub repo `brofrong/pokemon-dex` (if missing), pushing, and enabling Pages (Settings → Pages → GitHub Actions) are outward-facing; confirm first, then run them and report the live URL `https://brofrong.github.io/pokemon-dex/en/bw/`.
