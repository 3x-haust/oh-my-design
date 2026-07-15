# Asymmetric / diagonal grid

> Candidate hypothesis only. Revalidate its condition, values, and responsive transition
> against the current composition contract; do not transfer this page recipe unchanged.

A grid where one or more elements break from the column structure — rotated, offset, or
overlapping — to create tension and signal editorial intent. The effect reads as deliberate
when the deviation is singular; a page full of diagonal elements is not tension, it is noise.

`expressive.md` on this technique: "One diagonal or off-grid element is a decision; a page
full of diagonal elements is entropy."

## When it earns its place / When it does not

Condition: the concept requires editorial tension — a sense that the content is not
contained, that something is pressing against its frame. Agency portfolios, magazine-format
editorial pages, brand campaign layouts with a provocative position. The asymmetry must
follow from the concept's governing metaphor; a diagonal that does not correspond to a
conceptual gesture is decoration at the scale of the layout.

`core/theory/layout.md` — grid section: "Breaking the grid is only meaningful when the
deviation is singular and intentional — a full-bleed image in an otherwise columned
editorial layout announces itself as a break precisely because everything else held the
column."

Condition against: data-heavy layouts where scanability is the primary requirement.
Tables, forms, pricing structures, documentation — any content the user reads in order or
scans for a specific item. The asymmetric element interrupts the scan path without
contributing information. `core/theory/layout.md` confirms: the F-pattern (text-heavy
pages) depends on a stable left edge; an off-grid element that cuts across that edge
disrupts the pattern.

Also: avoid when the headline is already carrying heavy typographic weight. A typographic
hero at 9rem and a diagonal element compete for the same attention budget.

## Parameters

```css
:root {
  /* The column structure underlying the layout.
     An asymmetric grid is still a grid — the off-grid element breaks one rule
     in a system where all others hold. Typical: 12 columns, 24px gutters. */
  --grid-columns: 12;
  --grid-gutter: clamp(16px, 2vw, 24px);
  --grid-margin: clamp(16px, 5vw, 80px);

  /* Rotation of the off-grid element.
     Small angles (3–7°) read as intentional tilt.
     Larger angles (15°+) read as a different object category.
     Keep this value from the board's reference study — do not pick it arbitrarily. */
  --diagonal-rotate: 4deg;

  /* The off-grid element's column span and offset.
     Extending beyond the grid margin by a fixed amount produces the overlap signal. */
  --diagonal-bleed: 5vw;
}
```

## Implementation

```html
<!-- The grid provides the structure. The .diagonal element breaks it deliberately.
     All other content holds the column. -->
<section class="asym-grid">
  <div class="asym-grid__main">
    <h2>Primary content holds the column.</h2>
    <p>Body copy stays on the grid. The eye has a stable return point.</p>
  </div>
  <!-- This element is the single off-grid decision. -->
  <div class="asym-grid__diagonal" aria-hidden="true">
    <!-- Decorative content: a large number, a rotated label, a partial image. -->
    <span class="diagonal-label">Editorial</span>
  </div>
</section>
```

```css
.asym-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), 1fr);
  gap: var(--grid-gutter);
  padding-inline: var(--grid-margin);
  position: relative;
  overflow: hidden; /* prevent bleed from creating horizontal scroll */
}

.asym-grid__main {
  /* Main content occupies the left 7 columns. */
  grid-column: 1 / 8;
  /* Standard vertical rhythm — no transform applied to readable text. */
}

.asym-grid__diagonal {
  /* Diagonal element: right side, overlapping main content zone. */
  grid-column: 6 / 13;
  /* Extend beyond the right margin */
  margin-right: calc(-1 * var(--diagonal-bleed));
  transform: rotate(var(--diagonal-rotate));
  transform-origin: center left;
  /* Decorative — sits behind or at same level as content depending on concept */
  z-index: 0;
  /* pointer-events off: the rotated element must not obstruct interactive elements */
  pointer-events: none;
  user-select: none;
}

.diagonal-label {
  display: block;
  font-size: clamp(4rem, 10vw, 8rem);
  font-weight: var(--weight-display, 700);
  opacity: 0.08; /* background element: presence without competition */
  letter-spacing: -0.04em;
  white-space: nowrap;
}
```

## Responsive behavior

**375px (mobile):** The 12-column grid collapses to a single column; the diagonal element
moves out of the content flow. On narrow viewports the off-grid element is not the concept
— it is a distraction from the content that must fit in a reduced space. Hide it entirely
below 600px unless it carries essential meaning.

```css
@media (max-width: 600px) {
  .asym-grid {
    grid-template-columns: 1fr;
    overflow: hidden;
  }

  .asym-grid__diagonal {
    display: none; /* decorative element suppressed; content must stand without it */
  }

  .asym-grid__main {
    grid-column: 1 / -1;
  }
}
```

**768px (tablet):** Reduce from 12 to 8 columns. The diagonal element may occupy the right
4 columns; the main content the left 5. The rotation value stays constant — the angle
should not change with viewport width, as it reads as a different decision at each size.

```css
@media (min-width: 601px) and (max-width: 1024px) {
  .asym-grid {
    grid-template-columns: repeat(8, 1fr);
  }

  .asym-grid__main {
    grid-column: 1 / 6;
  }

  .asym-grid__diagonal {
    grid-column: 4 / 9;
    margin-right: calc(-1 * var(--diagonal-bleed));
  }
}
```

**1280px (desktop):** Full 12-column grid. The diagonal element's bleed beyond the margin
is now reading as a deliberate overextension — the composition's tension point. Ensure the
right edge of the diagonal element does not create horizontal scroll on the body; use
`overflow: hidden` on the section.

## Do not combine with

**bento-grid.md** — both recipes alter grid structure at the layout level; two competing
spatial systems in one section produce incoherence rather than tension.

**editorial-index-labels.md** in the same section — both add large, low-opacity display
elements in the peripheral field. Combined, they produce visual noise at the edges while
the readable content fights for attention in the centre.

**sticky-sidebar-scroll.md** — the sidebar annotation system depends on a stable spatial
contract (main column + margin column); a diagonal element breaking that contract makes
the annotation impossible to anchor correctly.
