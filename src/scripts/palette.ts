/**
 * Client behavior for the ⌘K / Ctrl+K / `/` search palette (Task 12), wired up by
 * `SearchPalette.astro`'s markup. The native `<dialog>` (`showModal`) gives Esc-closes and focus
 * trapping for free; this file only wires: open/close, the `search.json` fetch (on first open,
 * and idle-prefetched after `load`), live filtering with the list page's own
 * `matchesQuery`/`normalizeQuery`, keyboard navigation (↑/↓/Enter) and click navigation.
 *
 * Only ever bundled into a page that renders `<SearchPalette>` (detail pages); the list page's
 * `src/scripts/list.ts` binds the same hotkeys to its own always-visible search field instead, so
 * the two scripts never both run on one page.
 */
import { matchesQuery, normalizeQuery } from "../lib/search";
import { pokemonUrl, withBase } from "../lib/urls";
import { escapeHtml } from "../lib/html";
import { createDataLoader, type LoadResult } from "./palette-data";
import type { Lang } from "../i18n/ui";
import type { GenId, TypeSlug } from "../data/types";

/**
 * Mirrors `src/pages/[lang]/[gen]/search.json.ts`'s `SearchTuple` shape. Defined locally rather
 * than imported from there: that file is a build-time/server endpoint module (it pulls in the
 * full `GenData` JSON, `i18n/names`, etc.), not something a client bundle should reference.
 */
type SearchTuple = [
  id: number,
  slug: string,
  displayName: string,
  key: string,
  types: TypeSlug[],
];

const MAX_RESULTS = 8;

/** True for form fields (and anything editable) -- `/` must not fire while typing elsewhere. */
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

/**
 * Mirrors the constraints' Save-Data/2G prefetch guard, applied here to the idle prefetch only --
 * the fetch triggered by actually opening the palette always runs; the feature can't work
 * without it.
 */
function isMeteredConnection(): boolean {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  const conn = nav.connection;
  if (!conn) return false;
  return (
    Boolean(conn.saveData) ||
    conn.effectiveType === "slow-2g" ||
    conn.effectiveType === "2g"
  );
}

/** Wires up the palette. Safe no-op if the expected markup isn't present. */
export function initPalette(): void {
  const dialog = document.getElementById("pdx-palette");
  if (!(dialog instanceof HTMLDialogElement)) return;

  const lang = (dialog.dataset.lang as Lang) || "en";
  const gen = (dialog.dataset.gen as GenId) || "bw";
  const src = dialog.dataset.src ?? "";
  const spriteDir = dialog.dataset.sprites ?? withBase("sprites/bw/");
  const emptyText = dialog.dataset.empty ?? "";
  const offlineText = dialog.dataset.offline ?? "";

  const input = dialog.querySelector<HTMLInputElement>("#pdx-palette-input");
  const list = dialog.querySelector<HTMLUListElement>("#pdx-palette-list");
  if (!input || !list) return;

  // From here on, `dialog`/`input`/`list` are non-null (checked above). They're captured by the
  // arrow functions below rather than hoisted `function` declarations so TypeScript's
  // control-flow narrowing actually carries into their bodies (same reasoning as `list.ts`).
  //
  // `loadData` only ever caches a *successful* fetch (see `palette-data.ts`): a failure clears
  // itself so the next call retries instead of permanently replaying `{ ok: false }`.
  const loadData = createDataLoader<SearchTuple[]>(fetch, src);

  let data: SearchTuple[] = [];
  let results: SearchTuple[] = [];
  let activeIndex = -1;
  let lastFocused: HTMLElement | null = null;
  // True only while the most recent fetch attempt failed and hasn't been retried successfully
  // yet -- distinct from "fetch succeeded, zero matches", which must not show the same message
  // (fix round 1, finding #2).
  let offline = false;

  const applyLoadResult = (result: LoadResult<SearchTuple[]>): void => {
    if (result.ok) {
      data = result.data;
      offline = false;
    } else {
      offline = true;
    }
    if (dialog.open) render();
  };

  const rowHtml = (entry: SearchTuple, index: number): string => {
    const [id, slug, name, , types] = entry;
    const primary = types[0] ?? "normal";
    const typeIcons = types
      .map(
        (ty) =>
          `<svg class="ti ti-sm t-${ty}" aria-hidden="true"><use href="#t-${ty}"></use></svg>`,
      )
      .join("");
    const sprite = `${spriteDir}front/${id}.webp`;
    return (
      `<li role="option" id="pal-opt-${index}" class="pal-opt t-${primary}" data-slug="${slug}" aria-selected="false">` +
      `<span class="pal-spr"><img src="${sprite}" alt="" width="32" height="32" loading="lazy" decoding="async" /></span>` +
      `<span class="pal-no">#${String(id).padStart(3, "0")}</span>` +
      `<span class="pal-nm">${escapeHtml(name)}</span>` +
      `<span class="pal-types">${typeIcons}</span>` +
      `</li>`
    );
  };

  const setActive = (index: number): void => {
    const options = list.querySelectorAll<HTMLElement>(".pal-opt");
    activeIndex =
      options.length === 0
        ? -1
        : Math.max(0, Math.min(index, options.length - 1));
    options.forEach((opt, i) => {
      const on = i === activeIndex;
      opt.classList.toggle("active", on);
      opt.setAttribute("aria-selected", String(on));
    });
    const active = activeIndex >= 0 ? options[activeIndex] : undefined;
    if (active) input.setAttribute("aria-activedescendant", active.id);
    else input.removeAttribute("aria-activedescendant");
  };

  const render = (): void => {
    const q = normalizeQuery(input.value);
    if (q === "") {
      results = [];
      list.innerHTML = "";
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      setActive(-1);
      return;
    }
    if (offline) {
      // Retry on every keystroke while offline (cheap: `loadData` dedupes an in-flight attempt
      // and only ever starts a new one once the previous attempt has actually failed).
      // `applyLoadResult` re-renders on its own once (if) a retry succeeds.
      loadData().then(applyLoadResult);
      results = [];
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      list.innerHTML = `<li class="pal-empty">${escapeHtml(offlineText)}</li>`;
      setActive(-1);
      return;
    }
    results = data
      .filter((row) => matchesQuery(row[3], q))
      .slice(0, MAX_RESULTS);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    list.innerHTML =
      results.length > 0
        ? results.map((r, i) => rowHtml(r, i)).join("")
        : `<li class="pal-empty">${escapeHtml(emptyText)}</li>`;
    setActive(results.length > 0 ? 0 : -1);
  };

  const navigateTo = (slug: string): void => {
    location.href = pokemonUrl(lang, gen, slug);
  };

  const open = (): void => {
    if (dialog.open) return;
    lastFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    input.value = "";
    dialog.showModal();
    render();
    input.focus();
    loadData().then(applyLoadResult);
  };

  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  input.addEventListener("input", render);

  input.addEventListener("keydown", (e) => {
    // IME composition (e.g. a Russian/Japanese input method committing a candidate) fires
    // "Enter" too, and some IME candidate windows use the arrow keys themselves -- hijacking
    // either with `preventDefault`/navigation here would break composing, not just navigate
    // the results list. `keyCode === 229` covers browsers that don't set `isComposing` on the
    // final "Enter" that commits the composition (notably older WebKit).
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const slug = results[activeIndex]?.[1];
      if (slug) navigateTo(slug);
    }
  });

  list.addEventListener("click", (e) => {
    const opt = (e.target as HTMLElement).closest<HTMLElement>(".pal-opt");
    const slug = opt?.dataset.slug;
    if (slug) navigateTo(slug);
  });

  // Native <dialog> closes on Esc by itself; clicking the dialog element directly (not a
  // descendant) only happens when the click landed on its `::backdrop`, i.e. outside the panel.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  // Fires for every way the dialog closes (Esc, backdrop click, our own `close()`), so focus
  // restoration lives here once instead of being duplicated at every call site.
  dialog.addEventListener("close", () => {
    lastFocused?.focus();
  });

  // ⌘K/Ctrl+K opens the palette even while typing into some other field (per the constraints'
  // hotkey table); `/` only when not already typing and the palette isn't open yet.
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      open();
      return;
    }
    if (e.key === "/" && !dialog.open && !isTypingTarget(e.target)) {
      e.preventDefault();
      open();
    }
  });

  window.addEventListener("load", () => {
    if (isMeteredConnection()) return;
    const run = (): void => {
      loadData().then(applyLoadResult);
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run);
    else setTimeout(run, 200);
  });
}
