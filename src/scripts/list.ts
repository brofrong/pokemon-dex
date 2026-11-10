/**
 * Client behavior for the Pokémon list page: instant search, type/flag filters, sort, shiny
 * toggle, URL state sync, and lazy sprite loading. Everything here runs against the
 * server-rendered `#pdx-grid` cards (see `PokemonCard.astro`) and the controls in
 * `ListControls.astro` -- no DOM is created, only `hidden`/`style.order`/`class` are toggled, so
 * 649 cards stay cheap to filter and sort on every keystroke.
 */

import { matchesQuery, normalizeQuery } from "../lib/search";
import {
  parseListState,
  serializeListState,
  type ListState,
  type SortField,
} from "./list-state";
import { tCount, type Lang } from "../i18n/ui";
import type { Flag, TypeSlug } from "../data/types";

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
  q: string;
  types: string[];
  flags: string[];
  stats: number[];
  id: number;
  name: string;
}

function sortValue(c: CardEntry, sort: SortField): number | string {
  if (sort === "id") return c.id;
  if (sort === "name") return c.name;
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
  const shinyChip = root.querySelector<HTMLButtonElement>("#pdx-shiny");
  const sortSelect = root.querySelector<HTMLSelectElement>("#pdx-sort");
  const dirButton = root.querySelector<HTMLButtonElement>("#pdx-dir");
  const countEl = root.querySelector<HTMLElement>("#pdx-count");
  const emptyEl = root.querySelector<HTMLElement>("#pdx-empty");

  if (!grid || !searchInput || !sortSelect || !dirButton || !countEl) return;

  const cards: CardEntry[] = Array.from(
    grid.querySelectorAll<HTMLAnchorElement>(".card"),
  ).map((el) => ({
    el,
    q: el.dataset.q ?? "",
    types: (el.dataset.types ?? "").split(" ").filter(Boolean),
    flags: (el.dataset.flags ?? "").split(" ").filter(Boolean),
    stats: (el.dataset.stats ?? "")
      .split(" ")
      .filter(Boolean)
      .map((n) => Number(n)),
    id: Number(el.dataset.id),
    name: el.querySelector(".nm")?.textContent ?? "",
  }));

  let state: ListState = parseListState("");

  // From here on, `grid`/`searchInput`/`sortSelect`/`dirButton`/`countEl` are non-null (checked
  // above). They're captured by the arrow functions below rather than hoisted `function`
  // declarations so TypeScript's control-flow narrowing actually carries into their bodies.
  const readInitialState = (): ListState => {
    const parsed = parseListState(location.search);
    // The URL is the source of truth for shiny when it says so explicitly; otherwise fall back
    // to the cross-page `pdx:shiny` preference (see the constraints' shared-preference rule).
    if (!new URLSearchParams(location.search).has("shiny")) {
      parsed.shiny = readStoredShiny();
    }
    return parsed;
  };

  const applyShinyVariant = (): void => {
    const atlas = state.shiny
      ? grid.dataset.atlasShiny
      : grid.dataset.atlasFront;
    if (atlas) grid.style.setProperty("--atlas", `url(${atlas})`);
    for (const img of grid.querySelectorAll<HTMLImageElement>(".spr-img")) {
      const base = img.dataset.src;
      if (!base) continue;
      const target = state.shiny
        ? base.replace("/front/", "/front-shiny/")
        : base.replace("/front-shiny/", "/front/");
      img.dataset.src = target;
      if (img.getAttribute("src")) img.src = target;
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
    const q = normalizeQuery(state.q);
    let visible = 0;
    for (const c of cards) {
      const typeOk = state.types.every((ty) => c.types.includes(ty));
      const flagOk =
        state.flags.length === 0 ||
        state.flags.some((f) => c.flags.includes(f));
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

  const reflow = (): void => {
    applyControls();
    applyFilterAndSort();
    scheduleUrlSync();
  };

  const restore = (): void => {
    state = readInitialState();
    reflow();
  };

  restore();
  window.addEventListener("pageshow", restore);

  searchInput.addEventListener("input", () => {
    state = { ...state, q: searchInput.value };
    applyFilterAndSort();
    scheduleUrlSync();
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
      reflow();
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
      reflow();
    });
  }

  shinyChip?.addEventListener("click", () => {
    state = { ...state, shiny: !state.shiny };
    writeStoredShiny(state.shiny);
    reflow();
  });

  sortSelect.addEventListener("change", () => {
    state = { ...state, sort: sortSelect.value as SortField };
    applyControls();
    applyFilterAndSort();
    scheduleUrlSync();
  });

  dirButton.addEventListener("click", () => {
    state = { ...state, dir: state.dir === "asc" ? "desc" : "asc" };
    reflow();
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

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const img = entry.target;
        if (img instanceof HTMLImageElement && img.dataset.src) {
          img.src = img.dataset.src;
        }
      }
    },
    { rootMargin: "200px" },
  );
  // `:not([src])` skips priority sprites (`Sprite.astro` already gave them a real `src` eagerly).
  for (const img of grid.querySelectorAll<HTMLImageElement>(
    ".spr-img[data-src]:not([src])",
  )) {
    observer.observe(img);
  }
}
