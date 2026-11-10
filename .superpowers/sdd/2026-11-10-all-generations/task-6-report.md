# Task 6 report: pages for all generations

Status: **DONE**. `bun run ci` is green on worktree branch `worktree-agent-a41759ebe9943e080`,
which was fast-forwarded to `e9d5d04` first.

## Commits

| Commit     | Subject                                                            |
| ---------- | ------------------------------------------------------------------ |
| `36194673` | feat(pages): all nine generations                                  |
| `f7bdacbe` | feat(check-dist): expect pages for every enabled generation        |
| `246b3cb1` | feat(sw): precache only the default generation; per-gen warm lists |
| `526f9a54` | chore(fmt): format the task 4 report so bun fmt --check passes     |
| (this)     | docs(sdd): task 6 report                                           |

`bun fmt --check` failed on `e9d5d04` itself, because the merged `task-4-report.md` was not
formatted. The chore commit formats it. Only the tip passes CI: `36194673` alone fails the
check-dist page count, and `f7bdacbe` fixes that.

## TDD evidence

I wrote the tests first and ran them before any implementation: **14 failed and 2 files did not
load** (`Cannot find module src/lib/gen-view` / `src/lib/list-data`). The failures were
`switchGenUrl`, per-gen `parseListState`, precache per default gen, `shortLabel`/GenSwitcher,
`GenConfig.types`, the Gen VI–IX `formatCondition` phrases and `expectedPageCounts` (missing
export). After implementation: **585 pass, 0 fail** (40 files).

New or changed tests:

- `tests/lib/urls.test.ts`: `switchGenUrl`
  - detail page goes to the same species in the target gen;
  - species missing in the target goes to the target list (Snivy → rb);
  - `?form=` is dropped;
  - list page goes to the list, keeping the language;
  - list page drops type filters the target gen lacks (fairy in rb, dark/steel in rb) and drops
    shiny when the target has none (rb);
  - the 404 page goes to the EN target list.
- `tests/lib/gen-view.test.ts` (new): view models against the real datasets and manifests.
  - `detailSections` per gen: I; II; III–IV; V+.
  - `variantToggles`: rb is back-only; HOME has shiny and female but no back; female only with a
    front-female sprite; features override the manifest.
  - `gateVariants`.
  - `flagChips`: rb offers only legendary and mythical.
  - `pokedexEntries`: EN pair with version colors; EN fallback labeled with the source version
    (sv → "Sword"); RU bw keeps both versions; RU xy shows one «Pokémon GO» entry.
  - `displaySize` and `readableTextOn`.
- `tests/lib/list-data.test.ts` (new; replaces `tests/pages/search-json.test.ts`)
  - `listTuples` shape. Gen I Pikachu evo is `[25, 26]`, with no Pichu. Eevee's whole fan is
    included.
  - **sv list.json gzip ≤ 40 KB.**
  - `searchTuples`: the old bw assertions, plus every gen has `maxSpeciesId` tuples and
    gen-specific types (Clefairy is Normal before gen VI).
- `tests/scripts/list-state.test.ts`
  - Full state round-trip restores every field.
  - Per-gen valid types: `?type=fairy` is garbage in bw; dark/steel are garbage in rb.
  - Without a type list, fairy is valid.
- `tests/sw/logic.test.ts`: the precache holds only the default gen's list pages, `list.json` and
  atlases. Passing another default (`sv`/`home`) switches it. `sw-warm/*` and `search.json` are
  excluded.
- `tests/scripts/check-dist.test.ts`: `expectedPageCounts` (10,780 detail pages, 18 list pages;
  disabled gens skipped). The list-page count error works, and count checks are skipped without
  expected counts.
- `tests/components/gen-switcher.test.ts`: the compact label is `shortLabel` (`RB … USUM, SwSh,
SV`, all distinct). Every row links via `switchGenUrl`, and there are no "soon" rows.
- `tests/data/gen-facts.test.ts`: `GenConfig.types` matches each dataset's types (15/17/18).
- `tests/lib/format.test.ts`: needsRain, upsideDown, partyType, minAffection, nature (both),
  minDamageTaken, needsMultiplayer, usedMove (plural) and minSteps (`1,000` / `1 000 шагов`).
- `tests/scripts/prefetch-assets.test.ts`: the new `prefetchForCard(ids, dir, shiny, queue)`.

## Sizes (final `bun run ci`)

| Metric                 | Value                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Pages                  | 10,802 total: 18 list, 10,780 detail                                                  |
| Build                  | `astro build` 13.0 s (10,802 pages); whole `bun run ci` ≈ 34 s; check-dist ≈ 8 s      |
| `dist/` size           | 510.9 MB (sprites 153.2 MB); budget 900 MB                                            |
| List HTML gzip, max    | **45.4 KB** (`ru/sv`, 1025 cards); budget 70 KB. bw dropped from 64.7 to 37.3 KB (ru) |
| Detail HTML gzip, max  | **14.5 KB** (`ru/swsh` Alcremie); budget 20 KB                                        |
| JS per page gzip, max  | **6.0 KB**; budget 15 KB                                                              |
| `list.json` gzip, sv   | **28.6 KB**; test bound 40 KB                                                         |
| `search.json` gzip, sv | 26.9 KB (ru) / 25.8 KB (en)                                                           |
| SW precache            | 17 URLs: `_astro/*`, bw list pages, bw `list.json`, bw atlases                        |

List page and `list.json` gzip per generation (en / ru):

| Gen  | List page   | `list.json` |
| ---- | ----------- | ----------- |
| rb   | 14.9 / 16.1 | 4.2         |
| gs   | 18.1 / 19.8 | 7.0         |
| rs   | 23.1 / 25.5 | 10.6        |
| dp   | 25.9 / 28.8 | 13.6        |
| bw   | 33.7 / 37.3 | 17.8        |
| xy   | 31.1 / 35.2 | 19.9        |
| sm   | 33.6 / 38.2 | 22.4        |
| swsh | 36.2 / 41.3 | 25.1        |
| sv   | 39.6 / 45.4 | 28.6        |

## What was built

- **`src/lib/gen-data.ts`**: `getGenData(gen)` and `getSpriteManifest(set)` over eager
  `import.meta.glob` (build time only), plus `speciesExists(slug, gen)`, which caches one Set per
  gen.
- **`src/lib/gen-view.ts`** (pure, build time): `detailSections`, `variantToggles`,
  `gateVariants`, `flagChips`, `pokedexEntries` and `readableTextOn`.
- **`src/lib/sprites.ts`** (client-safe): `spriteDir`, `spriteUrl` and `displaySize` (HOME is
  192 px, shown at 96 CSS px, so 2× density).
- **`src/lib/list-data.ts`**: `listTuples` and `searchTuples`, the payloads of both endpoints.
- **`src/lib/generations.ts`**
  - Adds `shortLabel` and `types`, computed from the generation number: Dark/Steel from II,
    Fairy from VI.
  - Adds `ENABLED_GENS` and `toRoman`.
  - Removes `ROUTED_GENS`.
- **`switchGenUrl(pathname, to, existsIn, search?)`** in `src/lib/urls.ts` (signature from the
  brief, plus an optional `search`):
  - detail page: same species if it exists in the target, else the target list;
  - list page: carries the list state minus types the target gen lacks, and minus shiny when the
    target has none;
  - any other page goes to the EN target list.
- **Pages**
  - List, detail, `search.json` and the new **`list.json`** are routed over `ENABLED_GENS × LANGS`.
  - Detail neighbours wrap within the gen: 1 ↔ `maxSpeciesId` (rb #001 → #151 Mew; sv #1025 →
    #001).
  - Titles include the gen label. The list has a new per-gen `meta.listDescription`. The detail
    description is the first Pokédex entry shown.
  - `Base.astro` emits `hreflang` en/ru alternates on every localized page (not on 404). It also
    sets `<html data-hd>` for the HOME gens, which drives the non-pixelated sprite CSS.
- **Components**
  - `Sprite` takes `set` and adds a `lazy` mode. `PokemonCard` is lean. `Hero` shows the catch
    rate in its meta row in gen I.
  - `VariantSwitcher` uses per-set tile URLs and smooth rendering for HOME.
  - `Abilities` takes a `hiddenBadge` flag. `PokedexText` renders entries.
  - `GenSwitcher` links all gens and uses `shortLabel`. `ListControls` takes `flags` and `shiny`
    props and has a pending note.
  - `SearchPalette` uses the gen's sprite dir. `EvolutionTree`/`EvolutionBranch` pass `set`.
- **Scripts**
  - `list.ts` hydrates from `list.json` and keeps the gen links' query in sync (alongside the
    language links).
  - `detail.ts` uses the payload's `sprites`/`pixelated`. `palette.ts` and `prefetch-assets.ts`
    use the gen's sprite dir.
- **Sprite CSS** moved to `src/styles/sprite.css`, which `Sprite` and `PokemonCard` share. The
  HOME rules lay the image out at its final size instead of scaling up with `transform`.
- **SW**
  - `buildPrecacheList(files, base, { gen, spriteSet })` covers only the default gen.
  - The integration writes `sw-warm/{gen}.json` for every enabled gen.
  - `sw-register` posts the current page's gen.
- **check-dist**: `expectedPageCounts(GENERATIONS, LANGS.length)`. It adds a list-page count
  check and reports `json.list.gzipMaxBytes`.
- **UI keys**
  - `chip.unovaOnly` becomes `chip.newInGen` («New in this generation» / «Новые в этом
    поколении»), and `flag.new` RU «Unova» becomes «Новый».
  - New keys: `meta.listDescription` and `list.pending`. `gen.soon` is removed.
  - `tCount` now accepts a display form for `{count}` in `vars.count`, so the RU style guide gets
    `1 000`.

## Decisions

1. **List page before `list.json` arrives**
   - **Search** matches `normalizeQuery("{id} {displayed name}")` from the card DOM, i.e. the
     number and the name in the page language. Bilingual search starts once the data lands.
   - **Type filter** reads the card's type badge classes, so it works immediately.
   - **Flag filters and stat sorts** do not filter or reorder until the data arrives. The grid
     gets `aria-busy="true"` (opacity 0.7) and a «Loading stats…» note in the status line;
     everything is re-applied when the data lands.
   - **Fetch timing**: the fetch starts right after first paint (`rAF` + `setTimeout`), or at
     once when the URL state needs it. A deep link `ru/sv/?sort=spe&flag=legendary` fetched it
     before DOMContentLoaded.
   - **Failure**: the shared `createDataLoader` (from `palette-data.ts`) retries on the next
     interaction.
2. **`list.json` content is language-independent**: the search key is bilingual. It still sits
   under `{lang}`, as specified, which duplicates it (≈ 2 × 150 KB raw in total, negligible).
3. **Card sprite URLs come from `data-id` and the grid's `data-sprites`**. That removes `data-src`,
   `alt`, `width`/`height` and every `data-*` except `data-id` from 1025 cards. Card images have
   `alt=""` because the card's own name text labels the link.
4. **Gen I layout**: the Breeding box is dropped (the Pokédex box spans the row) and the catch
   rate moves to the hero meta row, rather than leaving a "Breeding" box with only a catch rate.
   Gen I–II: the abilities/matchups box shows only the matchups.
5. **Flag chips and card pills only for flags that discriminate** (`flagChips`). In rb all 151
   species are "new" and none is a baby, so those chips and pills are hidden. Unknown flag params
   are dropped from a deep link on gens without that chip.
6. **Version tags**: the generation's own pair uses its `GenConfig.colors`, with readable text
   from a brightness check. Fallback-version and «Pokémon GO» tags are neutral.
7. **Precache**: only the bw list pages, bw `list.json` and the bw atlases (the HOME atlases alone
   are 4 MB). `search.json` and the warm lists are cached on use.
8. **`switchGenUrl` drops `?form=`** when going detail → detail, because a form may not exist in
   the target gen (megas, gmax, regional forms). The landing page is the species' default form.

## Deviations and extra fixes

- **Pre-existing bug fixed**: sprites in the detail page's evolution tree **never loaded**. They
  only had `data-src`, and nothing on detail pages observes them; verified in the baseline
  build, where they had no `src` and no atlas. `Sprite` gained a `lazy` mode (`src` +
  `loading="lazy"`) for the evolution tree.
- **RU default-form tile fixed**: the forms grid used `formName()` for the default form too,
  which returns English (e.g. "Vulpix", "Rotom") in RU. It now uses `pokemonName` for the default
  form, matching the hero/payload.
- `tests/pages/search-json.test.ts` was removed. It imported the endpoint, which now reads data
  through `import.meta.glob`, unavailable in `bun test`. Its assertions moved to
  `tests/lib/list-data.test.ts` against `searchTuples`.
- `checkDist` skips the count checks when no expected counts are passed, so the synthetic
  fixtures keep working. `main()` always passes them.
- `switchGenUrl` has an extra optional `search` parameter, used by the list page to carry its
  filter state across generations.

## Browser smoke check (`astro preview`, DOM evaluation)

Screenshots timed out in the preview tool, so every check below was done by evaluating the DOM.
The tab I opened is closed.

- **rb list**
  - 151 cards; 15 type buttons (no dark/steel/fairy).
  - Only the Legendary and Mythical chips; no shiny chip; compact label `RB`.
  - hreflang en/ru present; gen links keep `?sort=spe&dir=desc`.
  - Search `pika`, `25` and `пика` each find only Pikachu.
  - Speed sort desc: Electrode, Jolteon, Aerodactyl.
- **rb Pikachu detail**
  - No abilities block and no Breeding box; the meta row shows Height | Weight | Catch rate 190.
  - Only the back toggle; Red/Blue dex tags.
  - Evolution sprites load (rb, 96 px); prev/next Arbok/Raichu.
  - Gen links go to Pikachu in every gen.
- **xy Charizard**
  - `data-hd` set; hero image 192 px source shown at 192 CSS px (scale 2) with
    `image-rendering: auto` and no scale transform.
  - Only the shiny toggle (no back); X/Y tags; matchups include Fairy.
  - Forms Charizard, Mega X, Mega Y. Switching to Mega X gives Fire/Dragon and loads
    `home/front/6-mega-x.webp`; shiny gives `front-shiny/6-mega-x.webp`.
- **Forms per gen** (fetched HTML)
  - Vulpix: no form tiles in xy; sm has Vulpix + Vulpix (Alola), RU «Валпикс (Алола)».
  - Charizard: swsh has Charizard + Charizard (Gmax); sv has no tiles.
  - sv Wooper: Wooper + Wooper (Paldea).
- **Snivy (bw) gen links**: rb, gs, rs and dp go to those gens' list pages; xy, sm, swsh and sv go
  to Snivy's page.
- **RU flavor**: ru/xy Pikachu shows one «Pokémon GO» entry; ru/bw keeps Black/White.
- **en/sv Bulbasaur**: one entry tagged "Sword", which is also used as the meta description.
- **Evolution phrases**
  - Annihilape: "Lvl. 28", "Used “Rage Fist” 20×".
  - ru Pawmot: «Ур. 18», «1 000 шагов вместе».
- **ru/sv list**
  - The deep link `?sort=spe&flag=legendary` fetched `list.json` before DOMContentLoaded and
    showed 71 legendaries, slowest first.
  - Chips include «Новые в этом поколении». No failed resource requests and no broken images
    after scrolling the whole page.
  - Shiny switches to the HOME shiny atlas and `front-shiny/`.

## Concerns / follow-ups

- **Search before `list.json` arrives was not observed in a live browser.** The preview always
  had the data within about 20 ms locally. The logic is straightforward (DOM text key), but the
  Task 9 e2e should pin it, e.g. by delaying `list.json` with route interception.
- **HOME rendering was not visually inspected**, because screenshots weren't available. The
  computed styles are right, but someone should look at it in Task 10 QA, along with the alpha
  fringing deferred from Task 4.
- **Pre-existing look on the pixel sets**: the `.spr-fill` placeholder is a solid type-colored
  rounded box behind every pixel sprite, visible through transparent pixels. I left it unchanged.
  For HOME, where the box would be a full 96 px square behind a transparent render, it is a soft
  translucent blob instead. Worth a look in Task 8/10.
- `src/lib/urls.ts` now imports `generations.ts` and `list-state.ts` (for `switchGenUrl`), so the
  shared `urls` chunk loaded on every page is ~2 KB gzip. That is within budget (max JS 6.0 KB of
  15 KB). If budget gets tight, `switchGenUrl` could move to its own module.
- The pre-existing deferred minor remains: the compact GenSwitcher label (now `shortLabel`) has
  no full accessible name at ≤ 380 px.
- When smoke-testing against `astro preview` after a rebuild, the SW's stale-while-revalidate
  serves the previous build's HTML on the first fetch. This is expected behavior, but it can
  mislead manual QA; use a fresh profile or bypass the SW.
