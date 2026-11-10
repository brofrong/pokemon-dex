/**
 * Theme preference (`auto`/`light`/`dark`), persisted in `localStorage` under `pdx:theme`.
 *
 * The pure `resolveTheme`/`nextThemePref` below are the single source of truth for the theme
 * semantics; they are deliberately duplicated (in spirit, not in code) by the tiny inline
 * blocking script in `Base.astro` that runs before first paint -- that script can't import this
 * module (it must stay under 400 bytes and run synchronously with no module graph), so keep the
 * two in sync by hand if this logic ever changes.
 */

export type ThemePref = "auto" | "light" | "dark";

const STORAGE_KEY = "pdx:theme";

/** The glyph shown on the toggle button for each preference. */
const ICONS: Record<ThemePref, string> = { auto: "◐", light: "☀", dark: "☾" };

/** Resolves a stored preference to the concrete theme to apply, given the OS's dark preference. */
export function resolveTheme(
  pref: ThemePref,
  systemDark: boolean,
): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}

/** Cycles the three-way preference in the order the toggle button follows: auto -> light -> dark -> auto. */
export function nextThemePref(pref: ThemePref): ThemePref {
  if (pref === "auto") return "light";
  if (pref === "light") return "dark";
  return "auto";
}

function readStoredPref(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "auto" || raw === "light" || raw === "dark") return raw;
  } catch {
    // localStorage unavailable (private mode, disabled storage, ...) -- fall back to auto.
  }
  return "auto";
}

function systemPrefersDark(): boolean {
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

function labelFor(
  button: HTMLButtonElement,
  pref: ThemePref,
): string | undefined {
  const key = `label${pref[0]!.toUpperCase()}${pref.slice(1)}`;
  return button.dataset[key];
}

function applyPref(pref: ThemePref, button: HTMLButtonElement): void {
  document.documentElement.dataset.theme = resolveTheme(
    pref,
    systemPrefersDark(),
  );
  button.dataset.pref = pref;
  const icon = button.querySelector("[data-icon]");
  if (icon) icon.textContent = ICONS[pref];
  const label = labelFor(button, pref);
  if (label) button.setAttribute("aria-label", label);
}

/**
 * Wires a theme toggle `button`: clicking cycles the preference, persists it to `localStorage`,
 * re-applies the resolved theme plus the button's icon/label (read from its `data-label-auto` /
 * `data-label-light` / `data-label-dark` attributes), and -- while the preference is `auto` --
 * keeps the resolved theme in sync with OS-level `prefers-color-scheme` changes.
 */
export function initThemeToggle(button: HTMLButtonElement): void {
  let pref = readStoredPref();
  applyPref(pref, button);

  button.addEventListener("click", () => {
    pref = nextThemePref(pref);
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // ignore -- the preference just won't survive a reload.
    }
    applyPref(pref, button);
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (pref === "auto") applyPref(pref, button);
  });
}
