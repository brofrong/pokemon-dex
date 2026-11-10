<img src="assets/icon.svg" width="64" height="64" alt="">

# pokemon-dex

A static Pokédex (generation V / Black & White) built with Astro on Bun, deployed to
[GitHub Pages](https://brofrong.github.io/pokemon-dex/).

## Commands

All commands run with [Bun](https://bun.com) 1.4+.

| Command              | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `bun install`        | Install dependencies.                                                        |
| `bun run dev`        | Start the Astro dev server.                                                  |
| `bun run build`      | Build the static site into `dist/`.                                          |
| `bun run preview`    | Preview the production build locally.                                        |
| `bun run lint`       | Lint `scripts`, `src/**/*.ts` and `tests` with `bun lint`.                   |
| `bun run format`     | Format the project with `bun fmt`.                                           |
| `bun run check`      | Type-check TS (`bun check`) and `.astro` files (`astro check`).              |
| `bun test`           | Run the unit tests.                                                          |
| `bun run data`       | Rebuild the generation V data JSON from PokeAPI.                             |
| `bun run sprites`    | Rebuild the sprite assets.                                                   |
| `bun run check:dist` | Validate the built `dist/` output (links, budgets, etc.; see Budgets below). |
| `bun run ci`         | Run lint, format check, type-check, tests, build and dist checks, in order.  |

## Data and sprites

The generation V (Black/White) dataset and sprites are generated, not hand-written, and are
checked into `src/data/gen/bw.json` / `public/sprites/bw/` so a fresh checkout builds without
network access.

To regenerate them from upstream (e.g. after bumping a pin in `scripts/pins.ts`, or to pick up
new PokeAPI data):

```sh
bun run sprites  # fetches/convert the Black/White sprite set into public/sprites/bw/
bun run data     # fetches PokeAPI CSVs and rebuilds src/data/gen/bw.json
```

`bun run sprites` must run first: `bun run data` reads the sprite manifest it writes
(`src/data/sprites/bw.json`) to drop forms that have no front sprite. Both scripts cache their
upstream fetches under `.cache/` so re-running them is cheap; delete that directory to force a
clean re-fetch.

## Budgets

`scripts/check-dist.ts` fails the build (`bun run check:dist`, part of `bun run ci`) if any of
these are exceeded:

| Budget                  | Limit  |
| ----------------------- | ------ |
| Per-page JS (gzip)      | 15 KB  |
| List-page HTML (gzip)   | 70 KB  |
| Detail-page HTML (gzip) | 20 KB  |
| Total `dist/` size      | 900 MB |

CSS is not inlined (`astro.config.mjs`'s `build.inlineStylesheets: "never"`): it's served as
shared, content-hashed `_astro/*.css` files instead, which is what keeps the per-page budgets
above workable once the site grows past Black/White to all nine generations (~10,800 detail
pages). The stylesheet `<link>` Astro emits in `<head>` is render-blocking, so there's no
flash-of-unstyled-content; the service worker precaches those CSS files alongside the rest of
`_astro/*` (`buildPrecacheList`, `src/sw/logic.ts`), and browsers/CDNs cache them indefinitely
since the filename changes whenever the content does.

## Pinned upstream sources

Reproducible builds pin every upstream data/asset source to a commit SHA in `scripts/pins.ts`:

- [PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi) -- species/move/ability/type data (CSVs).
- [PokeAPI/sprites](https://github.com/PokeAPI/sprites) -- the Black/White animated sprite set.
- [PokeMiners/pogo_assets](https://github.com/PokeMiners/pogo_assets) -- Russian names/genus/form
  text mined from the Pokémon GO client (Ruling R8: replaces Bulbapedia as the RU name source).
- [partywhale/pokemon-type-icons](https://github.com/partywhale/pokemon-type-icons) -- the 18 type
  icon SVGs vendored under `src/assets/types/`.

Bumping a pin and re-running `bun run sprites`/`bun run data` is the only supported way to pick up
upstream changes.

## Deploying

`.github/workflows/deploy.yml` builds and deploys this site to GitHub Pages on every push to
`main` (and via manual `workflow_dispatch`): it installs with `bun install --frozen-lockfile`,
runs `bun run ci` (lint, format check, type-check, tests, build, `check:dist`), and publishes
`dist/` with `actions/upload-pages-artifact` + `actions/deploy-pages`. A red `check:dist` (a
broken link, a budget breach -- see Budgets above -- a duplicate `view-transition-name`, a wrong
`<html lang>`, or a missing detail page) fails the build before anything is published -- fix it in
the component that owns the problem, never by raising a budget.

## Credits

Pokémon and Pokémon character names are trademarks of Nintendo. This is an unofficial,
non-commercial fan site, not affiliated with Nintendo, Game Freak or The Pokémon Company.

- Data from [PokeAPI](https://pokeapi.co/).
- Type icons by [pokemon-type-icons](https://github.com/partywhale/pokemon-type-icons) (MIT
  license).

Created in [T3 Code](https://t3.codes).
