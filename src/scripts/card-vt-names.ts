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
 * so a `pagereveal` handler that reads `navigation.activation.from.url` silently no-ops there
 * (`nav?.activation?.from?.url` is `undefined`). That leaves the *outgoing* page's card still
 * carrying the name `pageswap` gave it: harmless on a normal forward navigation (that document is
 * gone), but if the visitor returns to it from the browser's back/forward cache (bfcache) --
 * restored verbatim, scripts included, no re-run of this module -- the stale name is still
 * sitting there. The next `pageswap` away from this same restored document would then briefly
 * carry two differently-reasoned names into the transition (the bfcache leftover and whatever
 * this navigation names), so: (a) `pageshow`'s `persisted` flag (true only on a bfcache restore)
 * clears every card's name as a blanket reset, and (b) `nameCard` below clears whatever this
 * module itself last named before naming the next one, so a `pageswap` can never fire twice in a
 * row with two cards still named.
 *
 * Fix round (Task 8): Chromium aborts a cross-document transition when the visitor navigates
 * again before it settles (or a prerendered page activates), rejecting its promises with
 * `InvalidStateError: Transition was aborted ...`. `pagereveal` used to hang a bare
 * `.finished.then()` off it, which turned that into an uncaught error; the handler now marks the
 * transition's promises handled (`swallowTransitionAborts`) and cleans up either way.
 *
 * Fix round 3 (QA bug #8): this module's OWN `pagereveal` listener used to live here, wired up by
 * `initCardViewTransitionNames` below -- but that only runs from this list page's own `<script
 * type="module">`, which the HTML spec defers like `defer` (runs right before `DOMContentLoaded`).
 * QA measured `pagereveal` firing at ~27ms (`readyState` already `interactive`) and
 * `DOMContentLoaded` at ~85ms on the exact same navigation: by the time this module's listener
 * was ever added, the event had already fired to zero listeners and was gone for good, so no card
 * was ever named coming back from a detail page (the forward direction, `pageswap`, still worked
 * fine -- it's registered long after hydration, since nobody clicks a card before the page has
 * loaded). The fix moves `pagereveal` handling to `pageRevealScript` below: a plain, synchronous,
 * non-deferred inline script the list page runs in its `<head>` (`index.astro`), ahead of every
 * deferred script -- see that function's own doc. `initCardViewTransitionNames` now only owns
 * `pageswap` (forward morph) and the bfcache `pageshow` cleanup, both unaffected by this timing
 * issue.
 */
import { swallowTransitionAborts, vtName } from "../lib/view-transition";

/** The list page's card grid `id` (`index.astro`): `pageRevealScript` looks cards up under it and
 *  render-blocks on it being parsed (see "Fix round 4" on `pageRevealScript`). */
export const GRID_ID = "pdx-grid";
/** An empty sentinel `index.astro` renders right after the grid: the target of
 *  `pageRevealScript`'s `<link rel="expect">`. Chromium releases that render block as soon as the
 *  target element is *inserted*, not once its subtree is done, so blocking on the grid itself let
 *  `pagereveal` run with only part of it parsed; the element after it only exists once every card
 *  does. */
export const GRID_END_ID = "pdx-grid-end";

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

/** The handful of `PageSwapEvent`/Navigation API fields this module reads. */
interface ViewTransitionLike {
  finished: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
}
interface PageSwapEventLike extends Event {
  viewTransition: ViewTransitionLike | null;
  activation: { entry: { url: string } } | null;
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
 * Wires `pageswap` (forward morph: this list page names the card the visitor clicked) and the
 * bfcache `pageshow` cleanup on `window` for the list page's cards (`.card` anchors under `root`).
 * `pagereveal` (backward morph) is handled separately -- see `pageRevealScript`'s doc and the
 * module doc's "Fix round 3". Safe no-op if the browser doesn't support the Navigation API's
 * page-transition events.
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

/**
 * Plain, synchronous (`is:inline` -- not `type="module"`/`defer`) inline-script *source* for the
 * list page's `pagereveal` handling (QA bug #8, module doc's "Fix round 3"). Injected into the
 * list page's `<head>` (`index.astro`), ahead of every deferred script, so the listener it adds
 * is already in place before Chromium fires `pagereveal` (QA measured that at ~27ms, well before
 * this module's own deferred `<script type="module">` would otherwise register one at ~85ms).
 *
 * It can't `import` `detailSlugFromUrl`/`cardKeyForUrl`/`vtName` above -- an inline script isn't
 * part of the module graph -- so it deliberately duplicates (small and self-contained, exercised
 * below via `evalPageRevealScript` the same way `VT_ABORT_GUARD_SCRIPT` is tested with
 * `new Function(...)`) just enough of their logic: extract the detail-page slug from a URL, find
 * the `.card` whose own `href` resolves to that same slug, and assign it the exact `sprite-{id}`/
 * `name-{id}`/`types-{id}` names `vtName(...)` would. Cleans the name up once the transition
 * settles (finished, skipped or aborted alike), the same as the `pageswap` handler above, so a
 * plain reload or any other navigation never carries a leftover name forward.
 *
 * Fix round 4 (CI e2e flake): Chromium fires `pagereveal` at the document's *first rendering
 * opportunity*, which on a streamed, ~400 KB list page can come while the parser is still inside
 * the grid (`readyState === "loading"`) -- measured under 4x CPU throttling: only 56-145 of bw's
 * 649 cards existed when `pagereveal` ran, so coming back from Eevee (#133) found no card to name
 * and the morph silently fell back to a plain cross-fade. (QA's "~27ms, already `interactive`"
 * measurement only held on a fast machine.) So when this document is being entered *from a
 * detail page* -- the only case `pagereveal` names anything -- and motion is allowed (the only
 * case `@view-transition` is on, see `tokens.css`), the script adds a
 * `<link rel="expect" href="#pdx-grid-end" blocking="render">` to `<head>`: the platform's own
 * mechanism for cross-document view transitions, which holds the first render (and therefore
 * `pagereveal` and the new-state snapshot) until the sentinel right after the grid -- and so
 * every card -- has been parsed. It must
 * be inserted while `<head>` is still being parsed (the document only accepts new render-blocking
 * elements before `<body>` exists), which is exactly where this synchronous inline script runs.
 * Every other entry into the list page (first visit, reload, link from another list page) renders
 * progressively as before.
 */
export function pageRevealScript(base: string): string {
  const b = JSON.stringify(base.endsWith("/") ? base : `${base}/`);
  return (
    `(function(){` +
    `if(!("onpageswap" in window))return;` +
    `function slug(u){` +
    `try{` +
    `var p=new URL(u,location.href).pathname;` +
    `if(p.slice(0,${b}.length)!==${b})return null;` +
    `var s=p.slice(${b}.length).split("/").filter(Boolean);` +
    `return s.length===4&&s[2]==="pokemon"?s[3]:null` +
    `}catch(err){return null}` +
    `}` +
    `try{` +
    `var n0=window.navigation,f0=n0&&n0.activation&&n0.activation.from&&n0.activation.from.url;` +
    `if(f0&&slug(f0)&&window.matchMedia&&matchMedia("(prefers-reduced-motion: no-preference)").matches){` +
    `var l=document.createElement("link");` +
    `l.setAttribute("rel","expect");` +
    `l.setAttribute("href","#${GRID_END_ID}");` +
    `l.setAttribute("blocking","render");` +
    `document.head.appendChild(l)` +
    `}` +
    `}catch(err){}` +
    `addEventListener("pagereveal",function(e){` +
    `try{` +
    `if(!e.viewTransition)return;` +
    `var nav=window.navigation,from=nav&&nav.activation&&nav.activation.from&&nav.activation.from.url;` +
    `if(!from)return;` +
    `var target=slug(from);` +
    `if(!target)return;` +
    `var cards=document.querySelectorAll("#${GRID_ID} .card");` +
    `for(var i=0;i<cards.length;i++){` +
    `var c=cards[i];` +
    `if(slug(c.href)!==target)continue;` +
    `var id=c.dataset.id,spr=c.querySelector(".spr"),nm=c.querySelector(".nm"),ty=c.querySelector(".types");` +
    `if(spr)spr.style.viewTransitionName="sprite-"+id;` +
    `if(nm)nm.style.viewTransitionName="name-"+id;` +
    `if(ty)ty.style.viewTransitionName="types-"+id;` +
    `var clear=function(){` +
    `if(spr)spr.style.viewTransitionName="";` +
    `if(nm)nm.style.viewTransitionName="";` +
    `if(ty)ty.style.viewTransitionName=""` +
    `};` +
    `var vt=e.viewTransition;` +
    `Promise.resolve(vt.ready).catch(function(){});` +
    `Promise.resolve(vt.updateCallbackDone).catch(function(){});` +
    `Promise.resolve(vt.finished).then(clear,clear);` +
    `return}` +
    `}catch(err){}` +
    `},{once:true})` +
    `})()`
  );
}
