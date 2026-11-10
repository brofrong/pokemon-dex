# Task 4 report: sprites for all generations

## Summary

Built five new sprite sets (`rb`, `gs`, `rs`, `dp`, `home`) alongside the existing `bw`, generalizing
the single-set `bw` pipeline into a config-driven one (`scripts/sprites/sets.ts`) with two generic
builders: `build-set.ts` for the five pixel sets and `build-home.ts` for the Pokémon HOME renders
shared by `xy`/`sm`/`swsh`/`sv`. `scripts/sprites/build-all.ts` is the new orchestrator (`bun run
sprites`), building all six sets in one run and reporting bytes per set + grand total against the
200 MB budget. `bun run data` was then re-run for all nine generations so `sprite-availability.ts`
narrows forms/`hasGenderDiff` to what the new manifests actually ship.

`bw`'s own images are byte-identical (confirmed by diff -- `public/sprites/bw/` shows zero changes
in `git status`); only `src/data/sprites/bw.json` changed, gaining the new required `pixelated`
field (`true`) that `SpriteManifest` now carries for every set.

## TDD evidence

Every new module was written test-first (red before green), per `superpowers:test-driven-development`:

| Module                                              | Test file                                  | RED confirmed                                                                  | GREEN confirmed |
| --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ | --------------- |
| `scripts/sprites/sets.ts`                           | `tests/scripts/sprites/sets.test.ts`       | `Cannot find module`                                                           | 6/6 pass        |
| `scripts/sprites/build-set.ts`                      | `tests/scripts/sprites/build-set.test.ts`  | `Cannot find module`, then (after the pokemonId fix) `TypeError: keys.flatMap` | 6/6 pass        |
| `scripts/sprites/build-home.ts`                     | `tests/scripts/sprites/build-home.test.ts` | `Cannot find module`                                                           | 6/6 pass        |
| `scripts/sprites/build-all.ts` (`collectHomeForms`) | `tests/scripts/sprites/build-all.test.ts`  | `Cannot find module`                                                           | 2/2 pass        |

A real bug was caught mid-implementation this way: the first `build-set.ts` resolved every
set's non-default-form source file by `Form.key` (e.g. `386-speed.png`), which is correct for
`bw`/`gs` but **wrong** for `rs`/`dp` -- Emerald and HeartGold/SoulSilver only ship non-default
forms under their `pokemonId` (e.g. `10003.png`), with no per-form-named file at all. This first
showed up as a real-world regression, not a unit test: after the first `bun run sprites` + `bun
run data`, the pre-existing test `tests/data/gen-facts.test.ts`'s `"dp > Rotom has forms"` failed
(Rotom's 5 appliance forms were dropped as "no front sprite" even though the sprites exist). I
wrote a new failing unit test (`"rs/dp-style set: a non-default form's source file is named by
pokemonId, not by key"`), watched it fail, added `SpriteSetConfig.filenameBy: "key" | "pokemonId"`
and a `stemFor()` resolver, watched it pass, then re-ran the full pipeline (see "Forms dropped"
below -- the fix restored every affected form).

A second, more subtle issue surfaced the same way: after the `filenameBy` fix, re-running `bun run
sprites` alone did **not** restore the forms, because `build-all.ts` reads each set's keys from
`src/data/gen/{id}.json`, which by then was already the _narrowed_ dataset from the previous
(buggy) round -- the dropped forms were never asked for again. Fixed by deleting the five affected
manifests (`rb`/`gs`/`rs`/`dp`/`home`), re-running `bun run data` (now unnarrowed, since no manifest
exists), then `bun run sprites`, then `bun run data` again. This is a real operational gotcha for
whoever re-runs this pipeline after a forms-affecting fix and is worth documenting in `scripts/
sprites/build-all.ts` or the project README if someone revisits this; I did not add that note
since it's outside this task's file list.

Final full-suite result: **`bun test` -- 416 pass, 0 fail, 48197 expect() calls.**

## Per-set upstream source mapping

| Set    | Source root(s)                                                                                                       | Front encoding                                        | Back encoding | Shiny | Female | Non-default filename                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `rb`   | `generation-i/red-blue/transparent` (+`/back`)                                                                       | static PNG, lossless WebP                             | static PNG    | none  | none   | n/a (no forms)                                                                                                 |
| `gs`   | `generation-ii/crystal/animated` (+`/shiny`); backs `crystal/transparent/back` (+`/shiny`)                           | animated GIF, lossless animated WebP                  | static PNG    | yes   | none   | by `Form.key` (e.g. `201-a.gif`)                                                                               |
| `rs`   | `generation-iii/emerald/animated` (+`/shiny`); backs `emerald/back` (+`/shiny`)                                      | animated APNG, lossless animated WebP                 | static PNG    | yes   | none   | by `pokemonId` only                                                                                            |
| `dp`   | `generation-iv/heartgold-soulsilver/animated` (+`/shiny`,`/female`,`/shiny/female`); backs mirrored under `.../back` | animated APNG, lossless animated WebP                 | static PNG    | yes   | yes    | by `pokemonId` only                                                                                            |
| `bw`   | unchanged (`generation-v/black-white/animated`)                                                                      | unchanged                                             | unchanged     | yes   | yes    | by `Form.key`                                                                                                  |
| `home` | `other/home` (+`/shiny`,`/female`,`/shiny/female`)                                                                   | static PNG (512px), resized to ≤192px, lossy WebP q70 | none          | yes   | yes    | by `pokemonId` (our `Form.key` → `pokemonId` mapped via `Form.pokemonId`, merged across `xy`/`sm`/`swsh`/`sv`) |

Verified per-set native canvas sizes (recorded, not hard-coded beyond what sharp reports):
rb 96×96, gs 56×56, rs 64×64, dp 80×80, bw ~37×38 (tightly cropped per sprite, pre-existing), home
512×512 source → ≤192×192 output. `SpriteManifest.canvas` stays `96` for every set (the CSS box
size); `pixelated` is `true` for `rb`-`bw`, `false` for `home`.

`home`'s atlas cells are downscaled further, to ≤96px, from the already-encoded 192px WebP bytes
(re-resized + re-encoded lossy), per the brief; its atlas and per-sprite files are lossy, unlike
every pixel set's lossless atlas/files.

Two Form.key → pokemonId mapping collisions were found and logged (not fixed -- this is a Task 3
forms-data bug, not a sprite one): `849-gmax` (Toxtricity's Amped/Low-Key Gmax forms both reduce to
one key) and `892-gmax` (Urshifu's Single/Rapid Strike Gmax forms, same issue) disagree on
`pokemonId` between `swsh.json` and `sv.json`. `collectHomeForms` keeps the first value seen and
warns; worth a Task 3 follow-up to disambiguate these two keys.

## Byte/file counts per set (`bun run sprites`, final run)

| Set       | Files     | Bytes                          |
| --------- | --------- | ------------------------------ |
| `bw`      | 3292      | 71.06 MB                       |
| `rb`      | 302       | 0.17 MB                        |
| `gs`      | 1104      | 1.88 MB                        |
| `rs`      | 1668      | 1.40 MB                        |
| `dp`      | 2602      | 2.32 MB                        |
| `home`    | 3227      | 24.46 MB                       |
| **Total** | **12195** | **101.30 MB** (budget: 200 MB) |

`du -sh public/sprites` reports 135 MB (block-rounded); `check-dist.ts` reports
`sprites.totalBytes` = 101.3 MB and `dist.totalBytes` = 143.7 MB (budget: 900 MB).

## Forms dropped per generation after the final `bun run data`

Compared against each generation's full, unnarrowed form set (no manifest):

- **rb**: 0 dropped (151/151 forms).
- **gs**: 0 dropped (276/276 forms).
- **rs**: 0 dropped (417/417 forms) -- after the `filenameBy` fix; the pre-fix run had wrongly
  dropped Castform's 3 weather forms and Deoxys-Speed.
- **dp**: 0 dropped (557/557 forms) -- after the fix; the pre-fix run had wrongly dropped
  Castform ×3, Deoxys ×3 (attack/defense/speed), Rotom ×5 (heat/wash/frost/fan/mow),
  Giratina-Origin, and Shaymin-Sky (13 forms total, all confirmed to have real upstream sprites
  by pokemonId).
- **bw**: unchanged from Task 3's committed baseline -- still drops Pichu's cosmetic
  `172-spiky-eared` (no front sprite in `bw`'s animated set; pre-existing, not something this task
  touched).
- **xy / sm / swsh**: 0 dropped.
- **sv**: 8 forms dropped, confirmed as a genuine upstream gap (verified no file exists under
  `other/home/` for any of these `pokemonId`s): Koraidon's 4 "build" forms
  (`1007-limited-build`/`sprinting-build`/`swimming-build`/`gliding-build`, pokemonIds
  10264-10267) and Miraidon's 4 "mode" forms (`1008-low-power-mode`/`drive-mode`/`aquatic-mode`/
  `glide-mode`, pokemonIds 10268-10271).

`hasGenderDiff` flips (PokeAPI said `true`, but no `front-female` sprite shipped in that set):
only **`dp` → Eevee** (confirmed: no `133.png` under `heartgold-soulsilver/animated/female/`).
No other generation's `hasGenderDiff` changed.

Only `src/data/gen/dp.json` and `src/data/gen/sv.json` differ from Task 3's committed baseline
(one line each, i.e. exactly the Eevee `hasGenderDiff` flip and the 8 dropped sv forms
respectively) -- `rb`/`gs`/`rs`/`bw`/`xy`/`sm`/`swsh` are byte-identical to what Task 3 committed.

## Verification

- `bun test`: **416 pass, 0 fail**, 48197 `expect()` calls.
- `bun lint --no-script scripts src/**/*.ts tests`: no problems (82 files, then 83 after new test file).
- `bun fmt --check scripts src/**/*.ts tests`: all files formatted.
- `bun check --no-script`: no type errors.
- `bun --bun astro check`: 0 errors, 0 warnings, 2 pre-existing hints (unrelated: `keyCode`
  deprecation in `palette.ts`, an async-function suggestion in `prefetch-assets.ts`).
- `bun run build`: 1304 pages built successfully (pages still route `bw` only, as expected --
  `ROUTED_GENS` is unchanged by this task).
- `bun run check:dist`: OK -- `sprites.totalBytes` 101.3 MB / 200 MB budget,
  `dist.totalBytes` 143.7 MB / 900 MB budget, all page/JS/HTML budgets within range.

## Files

Code + tests (commit `feat(sprites): sprite sets for all generations`):

- `scripts/sprites/sets.ts` (new) -- `SPRITE_SETS` config for all six sets.
- `scripts/sprites/build-set.ts` (new) -- generic pixel-set builder (`rb`, `gs`, `rs`, `dp`).
- `scripts/sprites/build-home.ts` (new) -- HOME builder (resize, lossy, pokemonId→key mapping).
- `scripts/sprites/build-all.ts` (new) -- orchestrator (`bun run sprites`), `collectHomeForms`.
- `scripts/sprites/util.ts` (new) -- shared helpers (`runPool`, `cleanupStale`, etc.), not imported
  by `build.ts` (kept untouched to guarantee byte-identical `bw` output).
- `scripts/sprites/fetch.ts` (modified) -- `SPARSE_PATHS` for all six sets' source dirs; always
  re-runs `sparse-checkout set` (not just on first clone) so a later run can add a set without a
  fresh clone.
- `scripts/sprites/build.ts` (modified) -- extracted `buildBw()` (used by the orchestrator);
  manifest gains `pixelated: true`. No other line changed.
- `src/data/types.ts` (modified) -- `SpriteManifest.pixelated: boolean` (required field).
- `package.json` (modified) -- `"sprites"` script now runs `build-all.ts`.
- `tests/scripts/sprites/{sets,build-set,build-home,build-all}.test.ts` (new).
- `tests/fixtures/sprites/{rb,gs,home}/**` (new) -- small real PokeAPI/sprites fixtures, same
  convention as the existing `bw` fixtures.
- `tests/scripts/data/sprite-availability.test.ts` (modified) -- added `pixelated: true` to every
  literal `SpriteManifest` fixture.

Generated assets (commit `chore(sprites): generated sprites for rb, gs, rs, dp, home`):

- `public/sprites/{rb,gs,rs,dp,home}/**` (new).
- `src/data/sprites/{rb,gs,rs,dp,home}.json` (new), `src/data/sprites/bw.json` (modified, `pixelated` field only).
- `src/data/gen/dp.json`, `src/data/gen/sv.json` (modified by `bun run data`; see "Forms dropped" above).

## Concerns

1. **Task 3 forms bug** (not fixed here, out of this task's scope/file list): Toxtricity's and
   Urshifu's two Gigantamax forms each collide on the same `Form.key` (`849-gmax`, `892-gmax`)
   despite being distinct Pokémon with distinct `pokemonId`s. `collectHomeForms` logs a warning
   and keeps the first value; whichever variant "loses" silently shows the other's sprite. Worth a
   follow-up in `scripts/data/forms.ts` to disambiguate (e.g. `849-amped-gmax`/`849-low-key-gmax`).
2. **sv's 8 dropped forms** (Koraidon/Miraidon "build"/"mode" formes) are a genuine Pokémon HOME
   gap, not a pipeline bug -- confirmed no file exists for any of the 8 `pokemonId`s under
   `other/home/`. Nothing to fix; flagged here so it isn't mistaken for a regression later.
3. **Re-running the pipeline after any fix that changes which forms get sprites** requires
   deleting the affected set(s)' manifest(s) under `src/data/sprites/` before `bun run data`,
   otherwise `build-all.ts` only ever asks for the forms the _previous_ (already-narrowed) dataset
   still has. This bit me mid-task (see TDD evidence); not a new bug in the delivered code, just an
   operational note for whoever next changes `build-set.ts`/`build-home.ts`'s behavior.
4. `home`'s cosmetic-form duplication (e.g. all 26 Unown letters share one underlying render) means
   `build-home.ts` writes the same encoded bytes to ~190+ separate output files; this is correct
   (matches what HOME actually has) and the cache-by-`(variant, pokemonId)` avoids re-running
   `sharp` for each, but it does mean `public/sprites/home/` has real, if small, duplication.

## Fix round 1

Two real bugs fixed, per the coordinator's review.

### 1. CRITICAL: `rs`/`dp` front variants were static, not animated

**Root cause**: sharp/libvips' PNG loader does not implement the APNG extension. `{ animated:
true }` on a PNG input silently decodes only the base image -- confirmed on Emerald Bulbasaur's
source (52 `fcTL` chunks) round-tripping through sharp as a single-page, 486-byte WebP. `bw`/`gs`
were unaffected because their animated front sprites are GIFs, which sharp decodes correctly;
only `rs` (Emerald) and `dp` (HeartGold/SoulSilver) ship APNG for their animated fronts.

**Fix**: added `upng-js` (pure-JS APNG decoder, pinned `2.1.0`, dev dependency) and a new module
`scripts/sprites/apng.ts` (`decodeApngFrames`) that does a real decode: `UPNG.decode` +
`UPNG.toRGBA8` (which already composites each frame per its `dispose`/`blend` ops -- no manual
compositing needed) + each `fcTL`'s `delay` (already normalized to ms by `upng-js`). The frames
are stacked into one tall raw RGBA buffer and handed to `sharp(buf, { raw: { width, height:
height * frameCount, channels: 4, pageHeight: height } })`, which is how sharp builds a
multi-page image from raw pixel data; `.webp({ lossless: true, loop: 0, delay: [...] })` then
produces a real animated WebP. `scripts/sprites/build-set.ts`'s `convertOne` routes to this path
only for `animated && ext === "png"`; GIF-animated (`bw`/`gs`) and every static/back variant are
untouched. Atlases still composite frame 1 only (via sharp's existing `{ pages: 1 }` extraction,
unaffected by the bug since it only ever wanted one frame).

**Tests** (`tests/scripts/sprites/apng.test.ts`, extended `build-set.test.ts`): decode a real
Emerald fixture (`tests/fixtures/sprites/rs/1.png`, 52 frames) and a real HeartGold/SoulSilver
fixture (`tests/fixtures/sprites/dp/1.png`, 19 frames); a plain non-animated PNG decodes as one
frame with delay `[0]`; `buildSpriteSet` on those fixtures produces a WebP whose `pages` and
summed `delay` match the source exactly.

**Verified frame counts/delays** (real upstream sprites, after the fix):

| Set | Species       | Pages | Delay sum (ms) |
| --- | ------------- | ----- | -------------- |
| rs  | Bulbasaur (1) | 52    | 2133           |
| rs  | Charizard (6) | 39    | 1795           |
| dp  | Bulbasaur (1) | 19    | 3146           |
| dp  | Mewtwo (150)  | 31    | 3724           |

**New sizes per set** (`bun run sprites`, after the fix; `rb`/`gs`/`bw` unaffected):

| Set       | Files | Bytes (before fix round) | Bytes (after)                  |
| --------- | ----- | ------------------------ | ------------------------------ |
| rs        | 1668  | 1.40 MB                  | 27.78 MB                       |
| dp        | 2602  | 2.32 MB                  | 27.79 MB                       |
| home      | 3231  | 24.46 MB                 | 24.51 MB (key fix, below)      |
| **Total** |       | **101.30 MB**            | **153.20 MB** (budget: 200 MB) |

`bun run check:dist`: `sprites.totalBytes` 153.2 MB / 200 MB budget, `dist.totalBytes` 195.6 MB /
900 MB budget -- both still comfortably within range (~47 MB and ~704 MB headroom respectively).

### 2. Toxtricity's/Urshifu's two Gigantamax forms collided onto one `Form.key`

**Root cause**: PokeAPI's `pokemon_forms.form_identifier` is literally `"gmax"` for _both_ of a
species' Gigantamax variants (Toxtricity's Amped-Gmax and Low-Key-Gmax; Urshifu's Single-Strike-
Gmax and Rapid-Strike-Gmax) -- `scripts/data/forms.ts` built `Form.key` as
`` `${speciesId}-${row.formIdentifier}` ``, so both forms got `849-gmax` / `892-gmax`, and
whichever iteration order won silently shadowed the other.

**Fix**: `scripts/data/forms.ts` now disambiguates when a species' forms share a
`form_identifier`: `uniqueSlugFor` derives the unique suffix from the form's own fully-qualified
`pokemon_forms.identifier` (e.g. `toxtricity-low-key-gmax`) with the species' own
`pokemon_species.identifier` prefix stripped (e.g. `low-key-gmax`), giving final keys
`849-amped-gmax`, `849-low-key-gmax`, `892-single-strike-gmax`, `892-rapid-strike-gmax` -- exactly
the coordinator's suggested scheme. `FormRow` gained an `identifier` field (from
`pokemon_forms.identifier`) to support this; forms whose `form_identifier` is already unique are
completely unaffected (`slugFor` only takes the `uniqueSlugFor` branch when
`identifierCounts.get(row.formIdentifier) > 1`).

**Tests**: `tests/scripts/data/forms.test.ts` gained a Toxtricity fixture (real structure: base
`849` "amped", non-gmax `10184` "low-key", and the two colliding `10219`/`10228` "gmax" forms)
asserting all four keys are unique and match the expected disambiguated slugs. A new golden test
in `tests/data/gen-facts.test.ts` (`describe.each` over all nine generations) asserts every
form key is unique both within its species and globally across each generation's real, built
dataset -- this is what would have caught the original bug directly against `src/data/gen/
swsh.json`.

**Key changes after regenerating** (`bun run data`, `swsh` is the only generation affected --
`sv`'s rules have `gmax: false`, so it never had these forms at all):

| Species                | Before (lost to collision)                                 | After                                                                           |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Toxtricity (849, swsh) | `849-gmax` → pokemonId 10228 only (10219 silently dropped) | `849-amped-gmax` (10219) and `849-low-key-gmax` (10228), both kept              |
| Urshifu (892, swsh)    | `892-gmax` → pokemonId 10227 only (10226 silently dropped) | `892-single-strike-gmax` (10226) and `892-rapid-strike-gmax` (10227), both kept |

`swsh.json` form count: 1305 → 1309 (the 4 previously-shadowed forms are no longer lost; see the
"stale manifest" gotcha below for why an intermediate `bun run data` still briefly showed 1305).

**`collectHomeForms` dedup-warning workaround removed**: per the coordinator's note, since
`Form.key` is now guaranteed unique per species (pinned by the new golden test), a `pokemonId`
mismatch for the same key across generations' datasets can no longer happen for real data --
`scripts/sprites/build-all.ts`'s `collectHomeForms` no longer special-cases or warns on a
conflicting `pokemonId`, it's a plain first-wins merge. Updated its doc comment accordingly and
replaced the old mismatch-handling test in `tests/scripts/sprites/build-all.test.ts` with one
confirming the same key with the same `pokemonId` across datasets merges cleanly (using
Toxtricity's now-real, now-unique `849-amped-gmax` as the example instead of the old colliding
`849-gmax`).

### Operational note hit again mid-fix (now documented in code, per item 3)

Fixing the `Form.key` collision has the exact same "stale manifest" trap as fix round 0's `rs`/`dp`
`filenameBy` fix: the first `bun run data` after the `forms.ts` fix still produced `swsh.json`
with only 1305 forms (the 4 newly-unique keys were immediately dropped as "no front sprite" --
`src/data/sprites/home.json` still had the _old_, stale key→pokemonId mapping from before the
fix). Deleting `src/data/sprites/home.json`, `bun run data` (unnarrowed), `bun run sprites`
(rebuilds `home.json` with the new keys), `bun run data` again (narrows correctly) resolved it --
`swsh.json` ends at 1309 forms. `scripts/sprites/build-all.ts` now carries a comment above
`formsForGen` spelling this out for the next person who changes something forms-affecting.

### Verification (fix round 1)

- `bun test`: **431 pass, 0 fail**, 53687 `expect()` calls.
- `bun lint --no-script scripts src/**/*.ts tests`: no problems (85 files).
- `bun fmt --check scripts src/**/*.ts tests`: all files formatted.
- `bun check --no-script`: no type errors.
- `bun --bun astro check`: 0 errors, 0 warnings, 2 pre-existing hints (unrelated).
- `bun run build`: 1304 pages built successfully.
- `bun run check:dist`: OK -- `sprites.totalBytes` 153.2 MB / 200 MB, `dist.totalBytes` 195.6 MB /
  900 MB, all page/JS/HTML budgets within range.

### Files touched in fix round 1

Code + tests:

- `scripts/sprites/apng.ts` (new), `tests/scripts/sprites/apng.test.ts` (new).
- `scripts/sprites/build-set.ts` (modified: `convertApngAnimated`, `convertOne` now takes `ext`).
- `scripts/data/forms.ts` (modified: `FormRow.identifier`, `uniqueSlugFor`, `speciesSlugFor`).
- `scripts/sprites/build-all.ts` (modified: simplified `collectHomeForms`, added the stale-
  manifest operational comment above `formsForGen`).
- `tests/scripts/data/forms.test.ts`, `tests/data/gen-facts.test.ts`,
  `tests/scripts/sprites/build-set.test.ts`, `tests/scripts/sprites/build-all.test.ts` (all
  modified/extended).
- `tests/fixtures/sprites/rs/1.png`, `tests/fixtures/sprites/dp/1.png` (new real APNG fixtures).
- `package.json`, `bun.lock` (new dev dependency `upng-js@2.1.0`).

Regenerated assets:

- `public/sprites/rs/**`, `public/sprites/dp/**` (every front/front-shiny file rewritten with
  real animation; back/female variants untouched since their sources were never APNG).
- `public/sprites/home/**` (4 stale `*-gmax` files removed, 8 new disambiguated-key files added).
- `src/data/sprites/home.json` (new key→pokemonId mapping for the 4 disambiguated forms).
- `src/data/gen/swsh.json` (the 4 previously-shadowed forms restored).

### Concerns (fix round 1)

- `rs`/`dp` grew from ~1.4-2.3 MB each to ~27.8 MB each -- real animated WebP is simply much
  bigger than the ~0.5 KB static placeholder the bug was producing. Total `public/sprites` is now
  153.2 MB against the 200 MB budget (~47 MB headroom); a future sixth/seventh sprite set or a
  resolution bump would need to watch this more closely than before.
- The APNG decode path (`upng-js`, pure JS) is slower than sharp's native GIF path, proportional
  to frame count; `rs`/`dp`'s build step is the slowest part of `bun run sprites` now. Not a
  correctness issue, just worth knowing if the pipeline's run time ever matters.
- I did not re-audit every other species for a similar `form_identifier` collision beyond
  Toxtricity/Urshifu -- the new golden test in `gen-facts.test.ts` would catch any other instance
  across all nine generations' real data (and did not flag one), so I'm confident none remain
  among the currently-enabled generations' forms.
