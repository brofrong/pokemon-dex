/**
 * Assigns the list page's shared-element `view-transition-name`s (sprite/name/types) to exactly
 * one card, right at navigation time, instead of baking them into every one of up to 1025 cards' static
 * HTML.
 *
 * Fix round 1 (Task 13): the static approach cost ~6.9 KB gzip (3 `view-transition-name`
 * attributes x 649 cards) and pushed the list page's HTML over the binding 70 KB budget
 * (`scripts/check-dist.ts`'s `LIST_HTML_BUDGET_BYTES`). This module relies on the Navigation
 * API's `pageswap`/`pagereveal` events (Chromium-only as of this writing) instead:
 *  - `pageswap` fires on *this* document right before a cross-document navigation replaces it
 *    (e.g. the user clicked a card); the destination URL is `event.activation.entry.url`.
 *  - `pagereveal` fires on *this* document right after it's shown (including via back/forward);
 *    the document we came FROM is `navigation.activation.from.url` (the global `navigation`
 *    object, not the event -- `pagereveal` carries no `activation` of its own).
 * Either way, once the matching card is found, its sprite/name/types get the exact same
 * `vtName(...)` the detail hero uses for that species' default form (`src/lib/view-transition.ts`
 * -- same helper, so there's no way for the two to drift), so the browser's native
 * `@view-transition { navigation: auto }` (see `tokens.css`) morphs them. `pagereveal`'s names
 * are cleared again once that transition finishes, so a plain reload (or any navigation that
 * doesn't involve that exact card) never carries a leftover name into the next one.
 *
 * Feature-detected via `'onpageswap' in window`; a no-op everywhere else (Firefox as of this
 * writing), which just means those browsers get a plain cross-document navigation with no
 * shared-element morph -- same as before Task 13 added view transitions at all.
 *
 * Fix round 2: Safari 18.2-26.1 ships `pageswap` but not the Navigation API (`window.navigation`),
 * so `pagereveal`'s handler above -- which reads `navigation.activation.from.url` -- silently
 * no-ops there (`nav?.activation?.from?.url` is `undefined`). That leaves the *outgoing* page's
 * card still carrying the name `pageswap` gave it: harmless on a normal forward navigation (that
 * document is gone), but if the visitor returns to it from the browser's back/forward cache
 * (bfcache) -- restored verbatim, scripts included, no re-run of this module -- the stale name is
 * still sitting there. The next `pageswap` away from this same restored document would then
 * briefly carry two differently-reasoned names into the transition (the bfcache leftover and
 * whatever this navigation names), so: (a) `pageshow`'s `persisted` flag (true only on a
 * bfcache restore) clears every card's name as a blanket reset, and (b) `nameCard` below clears
 * whatever this module itself last named before naming the next one, so a `pageswap` can never
 * fire twice in a row with two cards still named.
 *
 * Fix round (Task 8): Chromium aborts a cross-document transition when the visitor navigates
 * again before it settles (or a prerendered page activates), rejecting its promises with
 * `InvalidStateError: Transition was aborted ...`. `pagereveal` used to hang a bare
 * `.finished.then()` off it, which turned that into an uncaught error; both handlers now mark
 * the transition's promises handled (`swallowTransitionAborts`) and clean up either way.
 */
import { swallowTransitionAborts, vtName } from "../lib/view-transition";

/** One list-page card, reduced to what matching/naming needs (kept DOM-free for testability). */
export interface CardRef {
  /** The card's fully-resolved detail-page URL (its anchor's `.href`). */
  href: string;
  /** The species id, i.e. its default form's `vtName` key (`PokemonCard.astro`'s `data-id`). */
  id: string;
}

/**
 * The `{slug}` segment of a Pokémon detail-page URL (`{base}{lang}/{gen}/pokemon/{slug}/...`),
 * or `null` for any URL that isn't shaped like one (the list page itself, a URL outside `base`,
 * unparseable input, ...). Ignores any query string/hash and a missing/extra trailing slash.
 */
export function detailSlugFromUrl(url: string, base: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url, "http://dist").pathname;
  } catch {
    return null;
  }
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  if (!pathname.startsWith(normalizedBase)) return null;
  const segments = pathname
    .slice(normalizedBase.length)
    .split("/")
    .filter(Boolean);
  // [{lang}, {gen}, "pokemon", {slug}]
  if (segments.length !== 4 || segments[2] !== "pokemon") return null;
  return segments[3] ?? null;
}

/**
 * The `id` of the card in `cards` whose own `href` resolves to the same detail-page slug as
 * `url`, or `null` if `url` isn't a detail-page URL or no card matches. Pure and DOM-free so it's
 * directly unit-testable (see `tests/scripts/card-vt-names.test.ts`) without a browser.
 */
export function cardKeyForUrl(
  url: string,
  base: string,
  cards: readonly CardRef[],
): string | null {
  const targetSlug = detailSlugFromUrl(url, base);
  if (!targetSlug) return null;
  for (const card of cards) {
    if (detailSlugFromUrl(card.href, base) === targetSlug) return card.id;
  }
  return null;
}

/** The handful of `PageSwapEvent`/`PageRevealEvent`/Navigation API fields this module reads. */
interface ViewTransitionLike {
  finished: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
}
interface PageSwapEventLike extends Event {
  viewTransition: ViewTransitionLike | null;
  activation: { entry: { url: string } } | null;
}
interface PageRevealEventLike extends Event {
  viewTransition: ViewTransitionLike | null;
}
interface NavigationLike {
  activation?: { from?: { url: string } | null } | null;
}

function setCardNames(card: HTMLElement, id: string): void {
  const sprite = card.querySelector<HTMLElement>(".spr");
  const nm = card.querySelector<HTMLElement>(".nm");
  const types = card.querySelector<HTMLElement>(".types");
  if (sprite) sprite.style.viewTransitionName = vtName("sprite", id);
  if (nm) nm.style.viewTransitionName = vtName("name", id);
  if (types) types.style.viewTransitionName = vtName("types", id);
}

function clearCardNames(card: HTMLElement): void {
  const sprite = card.querySelector<HTMLElement>(".spr");
  const nm = card.querySelector<HTMLElement>(".nm");
  const types = card.querySelector<HTMLElement>(".types");
  if (sprite) sprite.style.viewTransitionName = "";
  if (nm) nm.style.viewTransitionName = "";
  if (types) types.style.viewTransitionName = "";
}

/**
 * Wires `pageswap`/`pagereveal` on `window` for the list page's cards (`.card` anchors under
 * `root`). Safe no-op if the browser doesn't support the Navigation API's page-transition events.
 */
export function initCardViewTransitionNames(
  root: ParentNode,
  base: string,
): void {
  if (!("onpageswap" in window)) return;

  const cardEls = Array.from(root.querySelectorAll<HTMLAnchorElement>(".card"));
  if (cardEls.length === 0) return;
  const cardRefs: CardRef[] = cardEls.map((el) => ({
    href: el.href,
    id: el.dataset.id ?? "",
  }));

  // The one card (if any) this module itself last named, so a fresh `pageswap` can clear it
  // before naming a different card -- see the module doc's "Fix round 2" note.
  let lastNamed: HTMLAnchorElement | null = null;

  function findCard(id: string): HTMLAnchorElement | null {
    return cardEls.find((el) => el.dataset.id === id) ?? null;
  }

  function nameCard(card: HTMLAnchorElement, id: string): void {
    if (lastNamed && lastNamed !== card) clearCardNames(lastNamed);
    setCardNames(card, id);
    lastNamed = card;
  }

  window.addEventListener("pageswap", (event) => {
    const e = event as PageSwapEventLike;
    void swallowTransitionAborts(e.viewTransition);
    if (!e.viewTransition || !e.activation) return;
    const id = cardKeyForUrl(e.activation.entry.url, base, cardRefs);
    if (!id) return;
    const card = findCard(id);
    if (card) nameCard(card, id);
  });

  window.addEventListener("pagereveal", (event) => {
    const e = event as PageRevealEventLike;
    const settled = swallowTransitionAborts(e.viewTransition);
    if (!e.viewTransition) return;
    const nav = (window as Window & { navigation?: NavigationLike }).navigation;
    const fromUrl = nav?.activation?.from?.url;
    if (!fromUrl) return;
    const id = cardKeyForUrl(fromUrl, base, cardRefs);
    if (!id) return;
    const card = findCard(id);
    if (!card) return;
    nameCard(card, id);
    // Finished, skipped or aborted alike: never leave the name behind.
    void settled.then(() => {
      clearCardNames(card);
      if (lastNamed === card) lastNamed = null;
    });
  });

  // Safari 18.2-26.1 (see "Fix round 2" above): a bfcache restore of *this* document means
  // `pageswap` already ran on it once (for the navigation that originally left it) and may never
  // have been cleaned up by a `pagereveal` that no-ops without the Navigation API. Blanket-clear
  // every card rather than trying to track which one -- cheap, and correct regardless of why a
  // name was left behind.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    for (const card of cardEls) clearCardNames(card);
    lastNamed = null;
  });
}
