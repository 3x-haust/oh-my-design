# Split-screen hero

> Candidate hypothesis only. Revalidate its condition, values, and responsive transition
> against the current composition contract; do not transfer this page recipe unchanged.

A split-screen hero divides the viewport vertically into two panels. One panel holds the
primary statement — headline, copy, and CTA. The other holds a counterpart — an image,
a graphic, a live demo, or a contrasting visual element. The division is the design
decision: the two sides are in genuine tension or complementarity, and the user reads
both as a complete argument.

## When it earns its place / When it does not

Condition: the content genuinely has two distinct poles that benefit from juxtaposition.
A product with a before/after proposition, a dual-audience site, a brand with a visual
and a verbal identity that are each strong enough to carry half the viewport. The
split must express a relationship — contrast, comparison, dialogue — not simply divide
available space in half because the designer had two things to place.

`core/theory/layout.md` on scan patterns: the Z-pattern (sparse marketing pages) places
the diagonal at centre-screen, which is exactly the vertical divider of a split-screen
layout. The left panel captures the entry, the diagonal crosses to the right panel, and
the eye completes the Z on whichever side holds the CTA. This makes the split-screen
structurally aligned with the Z-pattern's natural scan — neither panel is out of the
eye's path.

Condition against: when there is one primary message. A split hero on a page with a
single value proposition divides the viewport's attention budget without a reason; one
side will always be weaker, and the weaker side dilutes the stronger. `core/theory/
layout.md` visual hierarchy rule 1: "If you have one thing that matters most, it must
be the largest." A split hero makes two things equal — choose this only when equality
is accurate. Also: mobile viewports where the split collapses to a stack, making the
panel order a design decision that the responsive logic must handle deliberately.

## Parameters

```css
:root {
  /* Column split ratio.
     50/50 reads as pure duality — equal weight.
     60/40 or 55/45 reads as a primary/supporting relationship.
     Choose based on which side carries the primary message. */
  --split-left: 55%;
  --split-right: 45%;

  /* Minimum height.
     100svh ensures both panels fill the viewport on first load.
     svh (small viewport height) accounts for mobile browser chrome. */
  --split-min-height: 100svh;

  /* The divider between panels.
     Invisible divider: panels differentiated by background only.
     Visible divider: a 1px line, a gap, or a decorative element. */
  --split-gap: 0px; /* or var(--space-2) for a gap-based divider */

  /* Padding within each panel. Both panels share the same internal padding
     for visual consistency across the divider. */
  --split-panel-padding: clamp(2rem, 5vw, 6rem);
}
```

## Implementation

```html
<!-- The split hero contains exactly two panels.
     Left panel: text, CTA — the verbal side.
     Right panel: visual, image, graphic — the visual side.
     DOM order: left-then-right mirrors the visual left-to-right reading order.
     On mobile: left panel (text) appears first, right panel (visual) below. -->
<section class="split-hero">
  <div class="split-hero__panel split-hero__panel--left">
    <div class="split-hero__panel-inner">
      <p class="split-hero__eyebrow">Engineering tools</p>
      <h1 class="split-hero__heading">
        Write once.<br>
        Ship everywhere.
      </h1>
      <p class="split-hero__body">
        The deployment layer that reads your config and disappears.
      </p>
      <a href="#" class="split-hero__cta">Start building</a>
    </div>
  </div>

  <div class="split-hero__panel split-hero__panel--right">
    <!-- Visual panel: image, illustration, live code demo, gradient mesh, etc.
         This panel is allowed to be full-bleed — no inner padding required
         if the visual extends to all four edges of the panel. -->
    <div class="split-hero__visual" role="img" aria-label="[describe the visual]">
      <!-- Visual content goes here -->
    </div>
  </div>
</section>
```

```css
.split-hero {
  display: grid;
  grid-template-columns: var(--split-left) var(--split-right);
  gap: var(--split-gap);
  min-height: var(--split-min-height);
}

.split-hero__panel {
  display: flex;
  align-items: center; /* vertical centering within the viewport */
  overflow: hidden;
}

.split-hero__panel--left {
  background-color: var(--surface-primary, #ffffff);
  padding: var(--split-panel-padding);
}

.split-hero__panel--right {
  background-color: var(--surface-accent, #0f0f0f);
  /* Right panel may be full-bleed visual — no padding applied here;
     the visual content manages its own edges. */
}

.split-hero__panel-inner {
  max-width: 40ch; /* constrains the text column within the left panel */
}

.split-hero__eyebrow {
  font-size: var(--text-xs, 0.75rem);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: var(--space-4, 1rem);
}

.split-hero__heading {
  font-size: clamp(2rem, 4vw, 3.5rem);
  font-weight: var(--weight-display, 700);
  line-height: 1.05;
  letter-spacing: -0.03em;
  margin-bottom: var(--space-5, 1.25rem);
}

.split-hero__body {
  font-size: var(--text-base, 1rem);
  line-height: var(--leading-body, 1.6);
  color: var(--text-secondary);
  max-width: 38ch;
  margin-bottom: var(--space-8, 2rem);
}

.split-hero__cta {
  display: inline-block;
  padding: var(--space-3, 0.75rem) var(--space-6, 1.5rem);
  background-color: var(--color-accent);
  color: var(--on-accent);
  font-size: var(--text-sm, 0.875rem);
  font-weight: var(--weight-medium, 500);
  border-radius: var(--radius-button, 6px);
  text-decoration: none;
  /* 44×44px minimum touch target — verify the padding achieves this */
  min-height: 44px;
}

.split-hero__visual {
  width: 100%;
  height: 100%;
  object-fit: cover; /* for image content */
}
```

## Responsive behavior

**375px (mobile):** The two-column split collapses to a single column. The visual panel
stacks below the text panel — the text remains first in the reading order and the
visual follows. If the visual panel has a fixed height, reduce it to a reasonable
proportion (40–50vh) rather than the full viewport height it occupied on desktop.

```css
@media (max-width: 768px) {
  .split-hero {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .split-hero__panel--left {
    padding: var(--split-panel-padding);
    min-height: auto;
  }

  .split-hero__panel--right {
    min-height: 45vw; /* generous proportion on mobile, not half the viewport */
    max-height: 60vw;
  }

  .split-hero__heading {
    /* At narrow width, the heading may grow via clamp without needing adjustment.
       Verify it does not overflow at 375px before removing this. */
    font-size: clamp(1.75rem, 8vw, 2.5rem);
  }
}
```

**768px (tablet):** The split works at tablet width. At 768px, `var(--split-left): 55%`
gives the text panel ~422px — sufficient for the content column at `max-width: 40ch`.
The visual panel receives ~346px. If the visual requires minimum width to read clearly,
swap to a 50/50 split at this breakpoint.

**1280px (desktop):** Full split. At 1280px the left panel at 55% is ~704px; the `max-
width: 40ch` constraint means the text column occupies ~640px (at 16px base). Generous
whitespace within the left panel; the text does not stretch to fill the panel width.

## Do not combine with

**bento-grid.md** inside either panel — a split hero establishes a two-panel spatial
contract; a bento grid inside one panel introduces a third spatial system within a zone
that already has compositional meaning.

**typographic-hero.md** — both recipes make the hero the visual anchor. Using both in
sequence (typographic hero, then split-screen) redundantly establishes the hero register
twice; the page does not know which one is the primary statement.

**A right panel with text-heavy content** — when the right panel carries comparable text
volume to the left panel, the split reads as two columns of equal density, which is
`core/theory/layout.md`'s multi-column form warning applied to a hero: the eye must
decide where to start, and the Z-pattern scan that makes the split-screen structurally
sound collapses.
