/**
 * Client behavior for a generation's Pokémon list page: instant search, type/flag filters, sort,
 * shiny toggle, URL state sync, lazy sprite loading. Everything here runs against the
 * server-rendered `#pdx-grid` cards (see `PokemonCard.astro`) and the controls in
 * `ListControls.astro` -- no DOM is created, only `hidden`/`style.order`/`class` are toggled, so
 * up to 1025 cards stay cheap to filter and sort on every keystroke.
 *
 * Cards carry only what they display (number, name, type badges, `data-id`); the rest --
 * bilingual search keys, stats, evolution ids, every flag -- comes from the grid's `data-list`
 * (`/{lang}/{gen}/list.json`), fetched right after first paint (or at once when the URL state
 * already needs it). Until it arrives:
 *  - search matches the card's own number and displayed name (`#025`, "Pikachu"/"Пикачу"), and
 *    the type filter reads the card's type badges, so typing right after load already works;
 *  - flag filters and stat sorts (which need the data) wait: the grid shows a subtle busy state
 *    and the "loading" note, the rest of the state still applies, and the moment the data lands
 *    everything is re-applied. A failed fetch is retried on the next interaction -- never an error.
 */

import { matchesQuery, normalizeQuery } from "../lib/search";
import {
  parseListState,
  serializeListState,
  type ListState,
  type SortField,
} from "./list-state";
import { tCount, type Lang } from "../i18n/ui";
import type { Flag, GenId, TypeSlug } from "../data/types";
import type { ListTuple } from "../lib/list-data";
import {
  createQueue,
  prefetchForCard,
  shouldPrefetch,
} from "./prefetch-assets";
import { initCardViewTransitionNames } from "./card-vt-names";
import { createDataLoader } from "./palette-data";
import { BASE, langSwitchHref, switchGenUrl } from "../lib/urls";
import {
  LIST_VT_CAP,
  listVtNames,
  withViewTransition,
} from "../lib/view-transition";
import { CASCADE_FALLBACK_MS, cascadeEnder } from "./cascade";

const SHINY_KEY = "pdx:shiny";

function readStoredShiny(): boolean {
  try {
    return localStorage.getItem(SHINY_KEY) === "1";
  } catch {
    return false; // private mode / disabled storage -- fall back to the non-shiny default.
  }
}

function writeStoredShiny(value: boolean): void {
  try {
    localStorage.setItem(SHINY_KEY, value ? "1" : "0");
  } catch {
    // ignore -- the preference just won't survive a reload.
  }
}

/** True for form fields (and anything editable) -- hotkeys that type text must not fire there. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

const STAT_INDEX: Record<string, number> = {
  hp: 0,
  atk: 1,
  def: 2,
  spa: 3,
  spd: 4,
  spe: 5,
};

interface CardEntry {
  el: HTMLAnchorElement;
  img: HTMLImageElement | null;
  id: number;
  name: string;
  types: string[];
  /** Search key: number + displayed name until `list.json` arrives, then the bilingual key. */
  q: string;
  /** `null` until `list.json` arrives. */
  stats: number[] | null;
  flags: string[] | null;
  /** Species ids of the whole evolution chain (just this one until `list.json` arrives). */
  evo: number[];
}

/** Whether `state` filters/sorts on something only `list.json` has. */
function needsData(state: ListState): boolean {
  return (
    state.flags.length > 0 || (state.sort !== "id" && state.sort !== "name")
  );
}

function sortValue(c: CardEntry, sort: SortField): number | string {
  if (sort === "id") return c.id;
  if (sort === "name") return c.name;
  if (!c.stats) return c.id; // no data yet: keep Pokédex order (the grid shows it's pending)
  if (sort === "total") return c.stats.reduce((a, b) => a + b, 0);
  return c.stats[STAT_INDEX[sort]!] ?? 0;
}

/** Wires up the list page. Safe no-op if the expected markup isn't present. */
export function initList(): void {
  const root = document.getElementById("pdx-list");
  if (!root) return;

  const lang = (root.dataset.lang as Lang) || "en";
  const grid = root.querySelector<HTMLElement>("#pdx-grid");
  const searchInput = root.querySelector<HTMLInputElement>("#pdx-search");
  const kbd = root.querySelector<HTMLElement>("#pdx-kbd");
  const typeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>(".tf"),
  );
  const flagChips = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-flag]"),
  );
  // Absent in generations without shiny Pokémon (gen I): shiny then always stays off.
  const shinyChip = root.querySelector<HTMLButtonElement>("#pdx-shiny");
  const sortSelect = root.querySelector<HTMLSelectElement>("#pdx-sort");
  const dirButton = root.querySelector<HTMLButtonElement>("#pdx-dir");
  const countEl = root.querySelector<HTMLElement>("#pdx-count");
  const emptyEl = root.querySelector<HTMLElement>("#pdx-empty");
  const pendingEl = root.querySelector<HTMLElement>("#pdx-pending");
  // The header's EN/RU switch and generation links (outside `#pdx-list`): their hrefs are
  // recomputed below so switching language or generation never drops the live filter/sort/shiny
  // state (QA bug: the RU link used to point at the bare `/ru/bw/`, or carry a stray `?shiny=1`).
  const langLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("a.lang[data-lang]"),
  );
  const genLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(".gen a[data-gen]"),
  );

  if (!grid || !searchInput || !sortSelect || !dirButton || !countEl) return;

  // Assigns this list page's shared-element view-transition-names at navigation time (fix round
  // 1: baking them into every card's static HTML broke the 70 KB list-page HTML budget). No-op
  // outside Chromium -- see `card-vt-names.ts`'s module doc.
  initCardViewTransitionNames(grid, BASE);

  const genTypes = typeButtons
    .map((b) => b.dataset.type as TypeSlug | undefined)
    .filter((ty): ty is TypeSlug => Boolean(ty));
  const spriteDir = grid.dataset.sprites ?? "";
  const loadList = createDataLoader<ListTuple[]>(
    (url) => fetch(url),
    grid.dataset.list ?? "",
  );
  let loaded = false;

  const cards: CardEntry[] = Array.from(
    grid.querySelectorAll<HTMLAnchorElement>(".card"),
  ).map((el) => {
    const id = Number(el.dataset.id);
    const name = el.querySelector(".nm")?.textContent ?? "";
    return {
      el,
      img: el.querySelector<HTMLImageElement>(".spr-img"),
      id,
      name,
      types: Array.from(el.querySelectorAll(".types .tb"), (b) =>
        (b.classList[1] ?? "").slice(2),
      ),
      q: normalizeQuery(`${id} ${name}`),
      stats: null,
      flags: null,
      evo: [id],
    };
  });
  const byId = new Map(cards.map((c) => [c.id, c]));

  let state: ListState = parseListState("", genTypes);

  const spriteSrc = (c: CardEntry): string =>
    `${spriteDir}${state.shiny ? "front-shiny" : "front"}/${c.id}.webp`;

  // From here on, `grid`/`searchInput`/`sortSelect`/`dirButton`/`countEl` are non-null (checked
  // above). They're captured by the arrow functions below rather than hoisted `function`
  // declarations so TypeScript's control-flow narrowing actually carries into their bodies.
  const readInitialState = (): ListState => {
    const parsed = parseListState(location.search, genTypes);
    // The URL is the source of truth for shiny when it says so explicitly; otherwise fall back
    // to the cross-page `pdx:shiny` preference (see the constraints' shared-preference rule).
    if (!new URLSearchParams(location.search).has("shiny")) {
      parsed.shiny = readStoredShiny();
    }
    // Drop flag filters this generation doesn't offer (no chip to turn them off again).
    const offered = new Set(flagChips.map((c) => c.dataset.flag));
    parsed.flags = parsed.flags.filter((f) => offered.has(f));
    if (!shinyChip) parsed.shiny = false;
    return parsed;
  };

  const applyShinyVariant = (): void => {
    const atlas = state.shiny
      ? grid.dataset.atlasShiny
      : grid.dataset.atlasFront;
    if (atlas) grid.style.setProperty("--atlas", `url(${atlas})`);
    for (const c of cards) {
      if (c.img?.getAttribute("src")) c.img.src = spriteSrc(c);
    }
  };

  const applyControls = (): void => {
    searchInput.value = state.q;
    for (const btn of typeButtons) {
      const on = state.types.includes(btn.dataset.type as TypeSlug);
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    }
    for (const chip of flagChips) {
      const on = state.flags.includes(chip.dataset.flag as Flag);
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-pressed", String(on));
    }
    if (shinyChip) {
      shinyChip.classList.toggle("on", state.shiny);
      shinyChip.setAttribute("aria-pressed", String(state.shiny));
    }
    sortSelect.value = state.sort;
    dirButton.textContent = state.dir === "asc" ? "↑" : "↓";
    dirButton.dataset.dir = state.dir;
    dirButton.setAttribute(
      "aria-label",
      (state.dir === "asc"
        ? dirButton.dataset.ascLabel
        : dirButton.dataset.descLabel) ?? "",
    );
    applyShinyVariant();
  };

  const applyFilterAndSort = (): void => {
    const pending = !loaded && needsData(state);
    if (pending) void ensureData();
    grid.setAttribute("aria-busy", String(pending));
    if (pendingEl) pendingEl.hidden = !pending;

    const q = normalizeQuery(state.q);
    let visible = 0;
    for (const c of cards) {
      const typeOk = state.types.every((ty) => c.types.includes(ty));
      // Before the data arrives a flag filter can't be evaluated: show the card (busy state).
      const flagOk =
        state.flags.length === 0 ||
        !c.flags ||
        state.flags.some((f) => c.flags!.includes(f));
      const searchOk = q === "" || matchesQuery(c.q, q);
      const show = typeOk && flagOk && searchOk;
      c.el.hidden = !show;
      if (show) visible++;
    }

    const dirMul = state.dir === "asc" ? 1 : -1;
    const ordered = [...cards].sort((a, b) => {
      const va = sortValue(a, state.sort);
      const vb = sortValue(b, state.sort);
      if (va < vb) return -1 * dirMul;
      if (va > vb) return 1 * dirMul;
      return a.id - b.id; // stable, deterministic tiebreaker
    });
    ordered.forEach((c, i) => {
      c.el.style.order = String(i);
    });

    // Exactly one of these two is visible at a time, so the shared status region (see
    // ListControls.astro's `role="status"`) announces one unambiguous message per change
    // instead of both the count and the empty-state text together.
    countEl.textContent = tCount(lang, "list.count", visible);
    countEl.hidden = visible === 0;
    if (emptyEl) emptyEl.hidden = visible !== 0;
  };

  /** Fetches `list.json` once (a failure retries on the next call) and re-applies the state. */
  const ensureData = async (): Promise<void> => {
    if (loaded) return;
    const result = await loadList();
    if (!result.ok || loaded) return;
    for (const [id, key, stats, evo, flags] of result.data) {
      const c = byId.get(id);
      if (!c) continue;
      c.q = key;
      c.stats = stats;
      c.evo = evo;
      c.flags = flags;
    }
    loaded = true;
    applyFilterAndSort();
  };

  let urlSyncScheduled = false;
  const scheduleUrlSync = (): void => {
    if (urlSyncScheduled) return;
    urlSyncScheduled = true;
    requestAnimationFrame(() => {
      urlSyncScheduled = false;
      const qs = serializeListState(state);
      const url = qs ? `${location.pathname}?${qs}` : location.pathname;
      history.replaceState(null, "", url);
    });
  };

  // Recomputes from `state` via `serializeListState` -- the exact same source `scheduleUrlSync`
  // writes to the URL -- so a link here can never carry a param `state` doesn't actually have
  // (no stale leftovers from how the page happened to load, no params invented from some other
  // source like the shiny `localStorage` fallback leaking in on its own). Generation links get
  // the same query minus what the target generation can't apply (`switchGenUrl`).
  const syncHeaderLinks = (): void => {
    const qs = serializeListState(state);
    for (const a of langLinks) {
      const to = a.dataset.lang as Lang | undefined;
      if (to) a.href = langSwitchHref(location.pathname, to, qs);
    }
    for (const a of genLinks) {
      const to = a.dataset.gen as GenId | undefined;
      if (to) a.href = switchGenUrl(location.pathname, to, () => false, qs);
    }
  };

  const reflow = (): void => {
    applyControls();
    applyFilterAndSort();
    scheduleUrlSync();
    syncHeaderLinks();
  };

  /** Non-hidden cards currently intersecting the viewport (one forced layout, then rect reads). */
  const onScreenCards = (): CardEntry[] => {
    const h = window.innerHeight;
    return cards.filter((c) => {
      if (c.el.hidden) return false;
      const r = c.el.getBoundingClientRect();
      return r.bottom > 0 && r.top < h && r.height > 0;
    });
  };

  // Cards carrying a transition-only `view-transition-name` right now (cleared on settle).
  const named = new Set<HTMLElement>();
  const clearNames = (): void => {
    for (const el of named) el.style.viewTransitionName = "";
    named.clear();
  };
  const nameCards = (ids: readonly number[]): void => {
    const names = listVtNames(ids);
    if (!names) return;
    for (const [id, name] of names) {
      const el = byId.get(id)?.el;
      if (!el) continue;
      el.style.viewTransitionName = name;
      named.add(el);
    }
  };

  /**
   * `reflow()` inside a same-document view transition, so filtered/sorted cards glide to their
   * new spots (`tokens.css`, `html.vt-list`). Only cards on screen before or after get a name, for
   * this one transition; it's skipped outright when too many would be captured or when the state
   * needs `list.json` that hasn't arrived (the grid would just re-sort again on arrival).
   * `withViewTransition` handles reduced motion, missing API and rapid re-clicks.
   */
  const animatedReflow = (): void => {
    stopCascade();
    let before: number[] = [];
    let skip = !loaded && needsData(state);
    if (!skip) {
      before = onScreenCards().map((c) => c.id);
      skip = listVtNames(before) === null;
    }
    withViewTransition(
      (inTransition) => {
        reflow();
        if (!inTransition) return;
        // New on-screen set: names for cards entering (or still) in view, within the cap -- the
        // old ones keep theirs so they morph rather than cross-fade.
        const after = onScreenCards().map((c) => c.id);
        const union = [...new Set([...before, ...after])].slice(0, LIST_VT_CAP);
        nameCards(union);
      },
      {
        skip,
        before: () => nameCards(before),
        after: clearNames,
        rootClass: "vt-list",
      },
    );
  };

  /** Shiny swap: a plain page cross-fade, holding the capture briefly for on-screen sprites. */
  const animatedShiny = (): void => {
    stopCascade();
    withViewTransition(
      (inTransition) => {
        reflow();
        if (!inTransition) return;
        const imgs = onScreenCards()
          .map((c) => c.img)
          .filter((img): img is HTMLImageElement =>
            Boolean(img?.getAttribute("src")),
          );
        return Promise.race([
          Promise.all(imgs.map((img) => img.decode().catch(() => {}))),
          new Promise((r) => setTimeout(r, 250)),
        ]);
      },
      { rootClass: "vt-list" },
    );
  };

  const restore = (): void => {
    state = readInitialState();
    reflow();
  };

  // First-load card cascade (`PokemonCard.astro`'s `--i`, CSS only) is for a fresh visit to the
  // default grid: not when coming back (history traversal / bfcache), not when a view transition
  // is morphing a card into place, not for a deep link whose first screen isn't cards 1-24.
  // Usually set before first paint; if this script runs later it just cuts the cascade short.
  // And it plays once: ended for good after it finishes or on the first interaction, so cards
  // un-hidden later by a filter/search never replay it (`cascade.ts`).
  const cascade = cascadeEnder(
    grid.querySelectorAll('.card[style*="--i"]').length,
    () => grid.classList.add("no-cascade"),
  );
  const stopCascade = cascade.stopNow;
  const onCascadeEvent = (e: AnimationEvent): void => {
    if (e.animationName === "card-in") cascade.ended();
  };
  grid.addEventListener("animationend", onCascadeEvent);
  grid.addEventListener("animationcancel", onCascadeEvent);
  setTimeout(stopCascade, CASCADE_FALLBACK_MS);
  const navEntry = performance.getEntriesByType?.("navigation")[0] as
    PerformanceNavigationTiming | undefined;
  if (navEntry?.type === "back_forward") stopCascade();
  window.addEventListener("pagereveal", (e) => {
    if ((e as Event & { viewTransition?: unknown }).viewTransition)
      stopCascade();
  });

  restore();
  if (serializeListState({ ...state, shiny: false })) stopCascade();
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) stopCascade();
    restore();
  });

  // Right after first paint (or already, above, if the URL state needs it).
  requestAnimationFrame(() => setTimeout(() => void ensureData(), 0));

  searchInput.addEventListener("input", () => {
    stopCascade();
    state = { ...state, q: searchInput.value };
    applyFilterAndSort();
    scheduleUrlSync();
    syncHeaderLinks();
  });

  for (const btn of typeButtons) {
    btn.addEventListener("click", () => {
      const ty = btn.dataset.type as TypeSlug | undefined;
      if (!ty) return;
      if (state.types.includes(ty)) {
        state = { ...state, types: state.types.filter((t) => t !== ty) };
      } else if (state.types.length < 2) {
        state = { ...state, types: [...state.types, ty] };
      } else {
        // Already have 2: drop the oldest selection, keep the most recently picked one, add this.
        state = { ...state, types: [state.types[1]!, ty] };
      }
      animatedReflow();
    });
  }

  for (const chip of flagChips) {
    chip.addEventListener("click", () => {
      const f = chip.dataset.flag as Flag | undefined;
      if (!f) return;
      state = {
        ...state,
        flags: state.flags.includes(f)
          ? state.flags.filter((x) => x !== f)
          : [...state.flags, f],
      };
      animatedReflow();
    });
  }

  shinyChip?.addEventListener("click", () => {
    state = { ...state, shiny: !state.shiny };
    writeStoredShiny(state.shiny);
    animatedShiny();
  });

  sortSelect.addEventListener("change", () => {
    state = { ...state, sort: sortSelect.value as SortField };
    animatedReflow();
  });

  dirButton.addEventListener("click", () => {
    state = { ...state, dir: state.dir === "asc" ? "desc" : "asc" };
    animatedReflow();
  });

  // ⌘K/Ctrl+K always focuses search; '/' does too, but only when not already typing somewhere
  // (so it doesn't hijack typing into the search field itself, or any other control).
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    if (e.key === "/" && !isTypingTarget(e.target)) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  if (kbd && !/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) {
    kbd.textContent = "Ctrl K";
  }

  // Background sprite prefetch (Task 13): warms the animated front sprite of every species in a
  // card's evolution chain once the card is near the viewport, so stepping from the list into a
  // detail page (or along its evolution tree) rarely needs a fresh network request. Gated once,
  // up front, by the Save-Data/2G guard the constraints require -- `null` disables it entirely.
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  const prefetchQueue = shouldPrefetch(nav.connection) ? createQueue(4) : null;

  const idle = (fn: () => void): void => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(fn);
    else setTimeout(fn, 200); // Safari has no `requestIdleCallback`.
  };

  const prefetch = (c: CardEntry, priority = false): void => {
    if (prefetchQueue)
      prefetchForCard(c.evo, spriteDir, state.shiny, prefetchQueue, priority);
  };

  if (prefetchQueue) {
    for (const c of cards) {
      const requeue = (): void => prefetch(c, true);
      c.el.addEventListener("pointerenter", requeue);
      c.el.addEventListener("pointerdown", requeue);
      // Priority cards (the first 2-3 rows) already have a real `src` and so never fire the
      // IntersectionObserver callback below -- but they're on screen right away, so warm them too.
      if (c.img?.getAttribute("src")) idle(() => prefetch(c));
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const c = byId.get(
          Number(entry.target.closest<HTMLElement>(".card")?.dataset.id),
        );
        if (!c?.img) continue;
        c.img.src = spriteSrc(c);
        if (prefetchQueue) idle(() => prefetch(c));
      }
    },
    { rootMargin: "200px" },
  );
  // Priority sprites already have a `src` (`PokemonCard.astro`); everything else loads on approach.
  for (const c of cards) {
    if (c.img && !c.img.getAttribute("src")) observer.observe(c.img);
  }
}
