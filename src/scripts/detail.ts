/**
 * Client behavior for the Pokémon detail page:
 *  - shiny/back/gender toggles (+ `S`/`B`/`G` hotkeys), shiny persisted to `pdx:shiny` (same key
 *    the list page uses, see `src/scripts/list.ts`);
 *  - form-tile switching: updates `?form=` with `replaceState` and re-renders the
 *    types/stats/abilities/matchups sections from the `#pdx-forms` JSON payload, no request;
 *  - `←`/`→` and horizontal swipe (>= 60px, mostly horizontal) neighbour navigation, via the
 *    `rel="prev"`/`rel="next"` links `NeighbourNav.astro` already rendered;
 *  - after `load`, in idle time, preloads every sprite variant of the current form with
 *    `new Image()` -- skipped on Save-Data/2G, same guard the constraints require of prefetch.
 */
import { BUCKET_CLASS, BUCKET_LABEL, MATCHUP_BUCKETS } from "../lib/matchups";
import { statColor } from "../lib/format";
import { statRowIndices, statTotal } from "../lib/stats";
import { displaySize, heroFit } from "../lib/sprites";
import { withViewTransition } from "../lib/view-transition";
import { escapeHtml } from "../lib/html";
import { langSwitchHref, switchGenUrl } from "../lib/urls";
import { availableVariants, variantFor } from "./variants";
import type { VariantState } from "./variants";
import type { DetailPayload, FormPayload } from "./detail-data";
import type { GenId, TypeSlug, Variant } from "../data/types";
import type { Lang } from "../i18n/ui";

const SHINY_KEY = "pdx:shiny";
type Axis = "shiny" | "back" | "female";

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

/** Mirrors the constraints' Save-Data/2G prefetch guard, applied here to sprite preloading. */
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

// `label` is `payload.typeNames[...]`, a translated string (fix round 2); `type` is a `TypeSlug`
// union member so it can never actually carry HTML, but it's `escapeHtml`-ed too for robustness
// since it still goes straight into the class/`href` via template-literal interpolation.
// Exported so the escaping is unit tested directly (`tests/scripts/detail.test.ts`).
export function typeBadgeHtml(type: TypeSlug, label: string): string {
  const ty = escapeHtml(type);
  return `<span class="tb t-${ty}"><svg class="ti"><use href="#t-${ty}"></use></svg>${escapeHtml(label)}</span>`;
}

/**
 * One ability's `<details>` HTML (mirrors `Abilities.astro`'s markup exactly), used by
 * `renderAbilities` on a form switch. Exported, and kept a pure function of the payload's
 * per-ability view-model, so the `escapeHtml` of `name`/`small`/`effect` -- translated strings
 * from `src/i18n/data/ru/ability-effects.json`, not literal HTML -- is unit tested directly
 * (`tests/scripts/detail.test.ts`) without needing a DOM.
 */
export function abilityItemHtml(a: FormPayload["abilities"][number]): string {
  const small = a.small ? `<small>${escapeHtml(a.small)}</small>` : "";
  return (
    `<details class="abil"><summary><b>${escapeHtml(a.name)}</b>${small}` +
    `<span class="chev" aria-hidden="true">▾</span></summary>` +
    `<p>${escapeHtml(a.effect)}</p></details>`
  );
}

/** Wires up the detail page. Safe no-op if the expected markup/payload isn't present. */
export function initDetail(): void {
  const root = document.getElementById("pdx-detail");
  const dataEl = document.getElementById("pdx-forms");
  if (!root || !(dataEl instanceof HTMLScriptElement)) return;

  let payload: DetailPayload;
  try {
    payload = JSON.parse(dataEl.textContent ?? "{}") as DetailPayload;
  } catch {
    return;
  }
  const forms = payload.forms;
  if (!Array.isArray(forms) || forms.length === 0) return;

  // The page is fully static (no SSR), so it always server-renders the *default* form --
  // there's no request to read `?form=` from at build time. The query string is only ever
  // available here, client-side, after load; this is what makes a cold `?form=heat` deep link
  // (constraints' Review Focus #3) actually switch to that form.
  const initialFormSlug =
    new URLSearchParams(location.search).get("form") ?? "";
  let currentForm: FormPayload =
    forms.find((f) => f.formSlug === initialFormSlug) ?? forms[0]!;

  const hero = document.getElementById("pdx-hero");
  const stage = document.getElementById("pdx-stage");
  const nameText = document.getElementById("pdx-name-text");
  const typesEl = document.getElementById("pdx-types");
  const statsEl = document.getElementById("pdx-stats");
  const abilitiesEl = document.getElementById("pdx-abilities");
  const matchupsEl = document.getElementById("pdx-matchups");
  const variantsEl = document.getElementById("pdx-variants");
  const formTilesEl = document.getElementById("pdx-form-tiles");

  let state: VariantState = {
    shiny: readStoredShiny(),
    // Fix round 1, finding #3: `payload.forms` never contains a pure gender-variant pseudo-form
    // (e.g. Frillish's "female") -- `?form=female` would otherwise just no-op onto `forms[0]`.
    // Map it onto the gender toggle instead; `variantFor`'s own fallback chain ignores it
    // gracefully on a species with no female sprite at all.
    female: initialFormSlug === "female",
    back: false,
  };

  function applySprite(): void {
    if (!stage) return;
    const entry = currentForm.manifest;
    const variant = variantFor(state, entry);
    const raw = entry[variant];
    const size = raw ? displaySize(raw, payload.pixelated) : undefined;
    const img = stage.querySelector<HTMLImageElement>(".spr-img");
    const atlas = stage.querySelector<HTMLElement>(".spr-atlas");
    if (atlas) atlas.style.backgroundImage = "none";
    const wrap = stage.querySelector<HTMLElement>(".spr");
    if (!img || !size || !wrap) return;
    const src = `${payload.sprites}${variant}/${currentForm.key}.webp`;
    img.width = size.w;
    img.height = size.h;
    img.alt = currentForm.name;
    img.dataset.src = src;
    img.src = src;
    wrap.style.setProperty("--w", `${size.w}px`);
    wrap.style.setProperty("--h", `${size.h}px`);
    // Same per-form scale/stage size `Hero.astro` computed for the server-rendered form.
    const fit = heroFit(entry, payload.pixelated);
    wrap.style.setProperty("--s", String(fit.scale));
    wrap.style.setProperty("--box", `${96 * fit.scale}px`);
    stage.style.setProperty("--hero-w", `${fit.w}px`);
    stage.style.setProperty("--hero-h", `${fit.h}px`);
  }

  function applyVariantControls(): void {
    if (!variantsEl) return;
    const available = availableVariants(currentForm.manifest);
    for (const seg of variantsEl.querySelectorAll<HTMLElement>(".vseg")) {
      const axis = seg.dataset.axis as Axis | undefined;
      if (!axis) continue;
      seg.hidden = !available[axis];
      const on = state[axis];
      for (const btn of seg.querySelectorAll<HTMLButtonElement>("button")) {
        const pressed = btn.dataset.value === (on ? "1" : "0");
        btn.classList.toggle("on", pressed);
        btn.setAttribute("aria-pressed", String(pressed));
      }
    }
  }

  function renderTypes(): void {
    if (!typesEl) return;
    typesEl.innerHTML = currentForm.types
      .map((ty) => typeBadgeHtml(ty, payload.typeNames[ty] ?? ty))
      .join("");
  }

  function renderStats(): void {
    if (!statsEl) return;
    const labels = payload.statLabels;
    const rows = statRowIndices(payload.singleSpecial)
      .map((i) => {
        const v = currentForm.stats[i]!;
        const width = Math.min(100, v / 1.6);
        return `<div class="stat"><span>${escapeHtml(labels[i]!)}</span><b>${v}</b><i style="--w:${width}%;--sc:${statColor(v)}"></i></div>`;
      })
      .join("");
    const total = statTotal(currentForm.stats, payload.singleSpecial);
    statsEl.innerHTML = `${rows}<div class="stat total"><span>${escapeHtml(labels[6])}</span><b>${total}</b><span></span></div>`;
  }

  // Mirrors `Abilities.astro`'s markup exactly (`<details>`/`<summary>` + chevron) so the
  // form-switch re-render looks identical to the server-rendered default form. A full
  // `innerHTML` replace naturally resets every `<details>` to closed -- the only sensible
  // default once the abilities themselves may have changed. Every dataset/translation string
  // (`name`/`small`/`effect`) is `escapeHtml`-ed before going into `innerHTML` -- extracted into
  // its own pure function (exported) so this escaping is unit tested directly.
  function renderAbilities(): void {
    if (!abilitiesEl) return;
    abilitiesEl.innerHTML = currentForm.abilities.map(abilityItemHtml).join("");
  }

  function renderMatchups(): void {
    if (!matchupsEl) return;
    const entries = Object.entries(currentForm.matchups) as [
      TypeSlug,
      number,
    ][];
    matchupsEl.innerHTML = MATCHUP_BUCKETS.map((mult) => {
      const types = entries.filter(([, m]) => m === mult).map(([ty]) => ty);
      if (types.length === 0) return "";
      const badges = types
        .map((ty) => typeBadgeHtml(ty, payload.typeNames[ty] ?? ty))
        .join("");
      return `<div class="mult"><b class="${BUCKET_CLASS[mult]}">${BUCKET_LABEL[mult]}</b>${badges}</div>`;
    }).join("");
  }

  function renderName(): void {
    if (nameText) nameText.textContent = currentForm.name;
  }

  function applyHeroTint(): void {
    if (!hero) return;
    hero.className = hero.className.replace(/\bt-\w+\b/g, "").trim();
    const primary = currentForm.types[0];
    if (primary) hero.classList.add(`t-${primary}`);
  }

  function applyFormTiles(): void {
    if (!formTilesEl) return;
    for (const btn of formTilesEl.querySelectorAll<HTMLButtonElement>(
      ".form",
    )) {
      const on = (btn.dataset.formSlug ?? "") === currentForm.formSlug;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    }
  }

  /**
   * Keeps the header's language- and generation-switch links in sync with the current
   * client-side form, the same way `list.ts`'s `syncHeaderLinks` keeps them in sync with the
   * live filter/sort state (QA #6: the language link always pointed at the default form, and
   * the generation link always dropped `?form=` even when the target generation had that
   * form). `existsIn`/`formExistsIn` are backed by `payload.speciesGens`/`payload.formGens`,
   * built at this page's own generation at build time -- see `DetailPayload`'s doc.
   */
  function syncHeaderLinks(): void {
    const formSlug = currentForm.formSlug;
    const search = formSlug ? `form=${formSlug}` : "";
    for (const a of document.querySelectorAll<HTMLAnchorElement>(
      "a[data-lang]",
    )) {
      const to = a.dataset.lang as Lang | undefined;
      if (to) a.href = langSwitchHref(location.pathname, to, search);
    }
    const existsIn = (_slug: string, gen: GenId): boolean =>
      payload.speciesGens.includes(gen);
    const formExistsIn = (_slug: string, fSlug: string, gen: GenId): boolean =>
      (payload.formGens[fSlug] ?? []).includes(gen);
    for (const a of document.querySelectorAll<HTMLAnchorElement>(
      "a[data-gen]",
    )) {
      const to = a.dataset.gen as GenId | undefined;
      if (to) {
        a.href = switchGenUrl(
          location.pathname,
          to,
          existsIn,
          "",
          formSlug,
          formExistsIn,
        );
      }
    }
  }

  function render(): void {
    applySprite();
    applyVariantControls();
    renderTypes();
    renderStats();
    renderAbilities();
    renderMatchups();
    renderName();
    applyHeroTint();
    applyFormTiles();
    syncHeaderLinks();
  }

  // The server always rendered `forms[0]` (non-shiny, non-female); only re-render when the
  // client state actually differs from that -- a returning shiny-preference user, a
  // `?form=heat`-style deep link (`currentForm` above already resolved away from `forms[0]`; a
  // naive comparison against `initialFormSlug` would trivially always be equal and silently
  // never re-render), or a `?form=female` deep link (mapped to `state.female` above).
  if (state.shiny || state.female || currentForm.key !== forms[0]!.key)
    render();
  else {
    applyVariantControls();
    // `render()` wasn't needed for the sprite/stats/etc, but the header links still need the
    // live `existsIn`/`formExistsIn` pass -- cheap, and keeps them byte-for-byte identical to
    // what a form switch would produce (QA #6).
    syncHeaderLinks();
  }

  /**
   * Runs a hero change as a cross-fade (`html.vt-hero` in `tokens.css`: only the hero sprite is
   * its own group, everything else rides the page cross-fade), holding the new-state capture
   * up to 250 ms for the new sprite to decode so the fade lands on it rather than popping later.
   * `withViewTransition` skips it under reduced motion / without the API / while one runs.
   */
  function heroTransition(update: () => void): void {
    withViewTransition(
      (inTransition) => {
        update();
        const img = stage?.querySelector<HTMLImageElement>(".spr-img");
        if (!inTransition || !img) return;
        return Promise.race([
          img.decode().catch(() => {}),
          new Promise((r) => setTimeout(r, 250)),
        ]);
      },
      { rootClass: "vt-hero" },
    );
  }

  function setAxis(axis: Axis, value: boolean): void {
    state = { ...state, [axis]: value };
    if (axis === "shiny") writeStoredShiny(value);
    heroTransition(() => {
      applySprite();
      applyVariantControls();
    });
  }

  variantsEl?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-value]",
    );
    const seg = btn?.closest<HTMLElement>(".vseg");
    const axis = seg?.dataset.axis as Axis | undefined;
    if (!btn || !axis) return;
    setAxis(axis, btn.dataset.value === "1");
  });

  formTilesEl?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".form");
    if (!btn) return;
    const slug = btn.dataset.formSlug ?? "";
    const next = forms.find((f) => f.formSlug === slug);
    if (!next || next === currentForm) return;
    currentForm = next;
    const url = new URL(location.href);
    if (slug) url.searchParams.set("form", slug);
    else url.searchParams.delete("form");
    history.replaceState(null, "", url);
    heroTransition(render);
  });

  function toggleAxis(axis: Axis): void {
    const available = availableVariants(currentForm.manifest);
    if (!available[axis]) return;
    setAxis(axis, !state[axis]);
  }

  function goNeighbour(rel: "prev" | "next"): void {
    const link = document.querySelector<HTMLAnchorElement>(`a[rel="${rel}"]`);
    if (link) location.href = link.href;
  }

  document.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "s") toggleAxis("shiny");
    else if (key === "b") toggleAxis("back");
    else if (key === "g") toggleAxis("female");
    else if (e.key === "ArrowLeft") goNeighbour("prev");
    else if (e.key === "ArrowRight") goNeighbour("next");
  });

  // Horizontal swipe navigation: mostly-horizontal, at least 60px.
  let touchStartX = 0;
  let touchStartY = 0;
  root.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    { passive: true },
  );
  root.addEventListener(
    "touchend",
    (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      goNeighbour(dx < 0 ? "next" : "prev");
    },
    { passive: true },
  );

  // Stat bars grow in when they come into view (CSS in `StatBars.astro`: the grow animation runs
  // by default, so above-the-fold bars animate from first paint with no JS at all). Bars still
  // below the fold are parked at zero width (`.stats-wait`, off screen, so no visible flash) and
  // released on intersection, which restarts the animation where the visitor can see it.
  if (
    statsEl &&
    typeof IntersectionObserver === "function" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    statsEl.getBoundingClientRect().top > window.innerHeight
  ) {
    statsEl.classList.add("stats-wait");
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        statsEl.classList.remove("stats-wait");
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(statsEl);
  }

  // After load, in idle time, preload every available variant of the current form.
  window.addEventListener("load", () => {
    if (isMeteredConnection()) return;
    const run = (): void => {
      for (const variant of Object.keys(currentForm.manifest) as Variant[]) {
        new Image().src = `${payload.sprites}${variant}/${currentForm.key}.webp`;
      }
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run);
    else setTimeout(run, 200);
  });
}
