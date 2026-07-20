# Horizontal scroll gallery

> Candidate hypothesis only. Revalidate its condition, values, and responsive transition
> against the current composition contract; do not transfer this page recipe unchanged.

A horizontal scroll gallery lays a set of peer panels in a single row and moves the reading
axis sideways: the user scrolls (or drags, or arrows) through items along the x-axis instead
of the y-axis. It is a showpiece/marketing move — a portfolio index, a campaign lookbook, a
product-shot sequence — where the sideways travel is itself the concept (a filmstrip, a shelf,
a runway). Use it with the register conditions in `core/theory/expressive.md`; it is never a
default container for a list.

## When it earns its place / When it does not

Use it when the items are genuine peers with no priority order, the sideways motion carries a
concept (a reel, a shelf, a horizon), and the surface is a `marketing` or showpiece register
where experiencing the sequence is part of the point. The affordance must be unmistakable — a
visible scrollbar, a progress rail, paired prev/next controls, or a partially-clipped next
panel that signals "there is more this way." Keyboard and native scroll must reach every panel.

Do not use it on a `product` or quiet surface, or for content the user needs to scan, compare,
or find fast: horizontal rows hide items off-screen behind a gesture many users never discover,
defeat Ctrl/Cmd+F, and break the vertical scan the eye defaults to. Do not hijack vertical
scroll into horizontal translation (`translateX` driven by `scrollY`) as the primary mechanism
on a required-task path — it steals the scroll gesture, strands keyboard and screen-reader
users, and is disorienting on trackpads and wheels. A gallery whose next panel gives no visual
signal that it exists has failed even if it animates beautifully once found.

## Parameters

The passing specimen must supply these required custom properties:

```text
--hscroll-panel-size
--hscroll-gap
--hscroll-peek
--hscroll-padding-inline
--hscroll-rail-size
```

There are no recipe defaults. `--hscroll-peek` is the amount of the next panel left visible at
the trailing edge (the "there is more" signal); `--hscroll-panel-size` is the per-item inline
size. `.omd/design.md` records the values chosen for the real item count and media aspect.
`clamp()`, container queries, and discrete steps are all valid when the rendered targets justify
them.

## Implementation

Use native overflow with scroll-snap, not scroll-hijacked transforms. Real content order is the
DOM order, so keyboard, `Home`/`End`, `find-in-page`, and screen readers all work. The panels
are focusable/reachable; the container announces itself as a scrollable region.

```css
.hscroll {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: var(--hscroll-panel-size);
  gap: var(--hscroll-gap);
  padding-inline: var(--hscroll-padding-inline);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: thin; /* keep the affordance visible; never hide the scrollbar */
}

.hscroll__panel {
  scroll-snap-align: start;
  /* --hscroll-peek keeps the next panel's leading edge visible as a "more this way" cue */
  margin-inline-end: 0;
}

@media (prefers-reduced-motion: reduce) {
  .hscroll { scroll-behavior: auto; }
}
```

Provide real prev/next controls that call `element.scrollBy({ left: panelWidth })`; the buttons
are progressive enhancement over a natively scrollable region, never the only way to advance.

## Responsive behavior

The required evidence is the rendered gallery at 375, 768, and 1280, not a fixed formula. At
375 (mobile) the row is a native swipe with one panel snapped and the next peeking; the affordance
is the peek plus the scrollbar. At 768 two or more panels are visible with the rail/controls. At
1280 the panels sit at their intended size with generous `--hscroll-padding-inline`. If, at any
width, no next-panel cue is visible and no control is present, the gallery has failed the
affordance test — reflow to a vertical stack rather than ship a hidden row.

## Do not combine with

**marquee.md (motion recipe)** — an auto-scrolling marquee and a user-driven horizontal
gallery are two horizontal-motion systems in one view; the auto-motion fights the user's own
scroll and destroys the snap.

**parallax.md / sticky-scene-transition.md** — a scroll-hijacked vertical→horizontal pin plus a
native horizontal gallery double-encode the x-axis; the user cannot tell which gesture drives
which motion.

**bento-grid.md** — a bento mosaic imposes a priority hierarchy on cells; a horizontal gallery
asserts the items are equal peers in a sequence. Choose the one that matches the content's real
structure.

## Linter notes

- A horizontal gallery with a hidden scrollbar, no peek, and no controls is an accessibility
  and discoverability defect: content exists that the user has no signal to reach. `omd check`
  cannot see the missing affordance directly; a visual/probe review must confirm the next-panel
  cue or a control is present and keyboard-reachable at 375/768/1280.
- Scroll-hijack (`translateX` bound to `scrollY`) on a required-task path is a UX defect, not a
  style choice; it removes the native scroll gesture and keyboard reach. Permitted only on a
  pure showpiece scene that also passes the Usability obligations in `theory/expressive.md`.
- A single horizontal row used as the container for scannable or comparable data (prices, specs,
  search results) is the wrong grammar; the axis mismatch costs the user the vertical scan.
