# Bento grid

A bento grid divides a section into cells of intentionally different sizes, arranged as a
mosaic. The cell size hierarchy communicates content hierarchy: the largest cell holds
the most important content, and the eye reads that before anything else. The grid earns
its distinctiveness from non-uniformity — if all cells are the same size, it is a card
grid, not a bento grid, regardless of what it is called.

## When it earns its place / When it does not

Condition: the section contains varied content types that benefit from non-uniform visual
weight — a primary feature with more depth, supporting features with less, and perhaps a
decorative or data element at a different proportion. The arrangement must be a statement
of hierarchy: the user can tell at a glance which cell matters most because it is largest.
A homepage overview where one product capability is the anchor and three or four support
it, a feature highlight section where capabilities are genuinely asymmetric — these earn
the grid.

`core/theory/layout.md` on card hierarchy: "Every card must have an internal hierarchy:
one primary piece of information that the eye finds first, and secondary information that
serves it." The bento grid applies this principle at the section level: one cell is the
primary; all others serve it.

**Anti-slop clause.** A bento grid that fills all cells with equal-weight cards is
SLOP-TRIPLE-CARD rendered at scale. The grid earns its place only when the cell-size
hierarchy is non-recoverable: the arrangement itself tells the reader what matters most.
If you can swap cells without loss of meaning, the bento grid is the wrong layout.
The `SLOP-TRIPLE-CARD` slop rule fires on three or more identically-treated cards
regardless of whether they are arranged in a standard grid or a bento mosaic — the
violation is in the equal treatment, not in the grid structure.

Condition against: content where all items are genuinely equal in importance — a pricing
table, a team member grid, a portfolio gallery. Forced hierarchy on equal content
misinforms the user. Also: narrow viewports where the bento mosaic must collapse to a
single column, losing the hierarchical arrangement that justified it. If the layout reads
as a simple stacked list on mobile, the bento grid is carrying the hierarchy only on
desktop — which means the hierarchy is not in the content, it is in the layout trick.

## Parameters

```css
:root {
  /* Grid gap between cells. Consistent gap size is important — uneven gaps
     read as different object weights. Use a single token. */
  --bento-gap: clamp(8px, 1.5vw, 16px);

  /* Base grid unit. All cell spans are multiples of this.
     A 4-column base allows: 1 (quarter), 2 (half), 3 (three-quarter), 4 (full).
     A 6-column base allows more granular spans. */
  --bento-columns: 4;

  /* Minimum row height. Cells taller than this are defined by row-span.
     This sets the rhythm of the grid. */
  --bento-row-height: clamp(160px, 22vw, 280px);

  /* Cell radius: consistent across all cells.
     Bento grids on award-winning sites use a consistent radius to read as one object.
     Inconsistent radii break the mosaic reading. */
  --bento-radius: var(--radius-card, 12px);
}
```

## Implementation

```html
<!-- The grid container defines the column structure.
     Each cell declares its own span — no JavaScript layout library needed.
     The hierarchy is declared in the HTML: the primary cell comes first
     and spans the largest area. -->
<div class="bento-grid">
  <!-- Primary cell: largest, most important content. Spans 2 columns, 2 rows. -->
  <div class="bento-cell bento-cell--primary">
    <h2>The primary capability.</h2>
    <p>The claim with the most depth, given the most space.</p>
  </div>

  <!-- Supporting cells: smaller, each with a distinct capability. -->
  <div class="bento-cell bento-cell--secondary">
    <h3>Supporting capability one.</h3>
  </div>

  <div class="bento-cell bento-cell--secondary">
    <h3>Supporting capability two.</h3>
  </div>

  <!-- Accent cell: a data point, a decorative element, or a CTA at smaller scale. -->
  <div class="bento-cell bento-cell--accent">
    <span class="bento-stat">48ms</span>
    <span class="bento-stat-label">median response time</span>
  </div>

  <!-- Wide secondary: spans the full width below the primary cluster. -->
  <div class="bento-cell bento-cell--wide">
    <h3>The wider supporting context.</h3>
    <p>Content that benefits from a wider canvas than the narrow supporting cells.</p>
  </div>
</div>
```

```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(var(--bento-columns), 1fr);
  grid-auto-rows: var(--bento-row-height);
  gap: var(--bento-gap);
  padding-inline: var(--space-page-margin, 5vw);
}

/* All cells share the base styling: the radius and background.
   Differentiation comes from content hierarchy, not from different styling. */
.bento-cell {
  border-radius: var(--bento-radius);
  background-color: var(--surface-subtle, #f5f5f3);
  padding: var(--space-6, 1.5rem);
  overflow: hidden;
  /* Cells do not have individual box-shadows — the gap performs the separation. */
}

/* Primary cell: the largest. The hierarchy is in the span, not in extra decoration. */
.bento-cell--primary {
  grid-column: span 2;
  grid-row: span 2;
  /* The primary cell may have a distinct background only if it is the section's
     anchor — not as generic differentiation. */
  background-color: var(--surface-emphasis, #0f0f0f);
  color: var(--on-surface-emphasis, #f5f5f3);
}

.bento-cell--secondary {
  grid-column: span 1;
  grid-row: span 1;
}

.bento-cell--accent {
  grid-column: span 1;
  grid-row: span 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
}

.bento-cell--wide {
  grid-column: span var(--bento-columns); /* full width */
  grid-row: span 1;
}

.bento-stat {
  font-size: clamp(2rem, 6vw, 4rem);
  font-weight: var(--weight-display, 700);
  letter-spacing: -0.04em;
  line-height: 1;
}

.bento-stat-label {
  font-size: var(--text-xs, 0.75rem);
  color: var(--text-secondary);
  margin-top: var(--space-1, 0.25rem);
}
```

## Responsive behavior

**375px (mobile):** The multi-column mosaic collapses to a single column. The hierarchy
must still read — the primary cell appears first in DOM order, retaining its importance
through position even when size parity is lost.

```css
@media (max-width: 600px) {
  .bento-grid {
    grid-template-columns: 1fr;
    grid-auto-rows: auto; /* height driven by content on mobile */
  }

  .bento-cell--primary,
  .bento-cell--secondary,
  .bento-cell--accent,
  .bento-cell--wide {
    grid-column: 1 / -1;
    grid-row: auto;
    min-height: var(--bento-row-height); /* preserve breathing room */
  }
}
```

**768px (tablet):** A two-column variant works well at tablet width. Reduce
`--bento-columns` to 2 and verify that the primary cell's two-column span still reads
as dominant — at 768px with two columns, a `span 2` cell occupies the full row, which
may remove the mosaic effect. Consider a `span 1` tall primary at tablet.

```css
@media (min-width: 601px) and (max-width: 1024px) {
  .bento-grid {
    --bento-columns: 2;
  }

  .bento-cell--primary {
    grid-column: span 2;
    grid-row: span 1; /* adjust: span 2 at 2-col is full-width */
  }
}
```

**1280px (desktop):** Full 4-column mosaic. The `--bento-row-height` ceiling of 280px
keeps cells within a readable range; taller cells are appropriate only when they hold
content that genuinely requires height (an image, a chart, a demonstration). An empty
tall cell is wasted space, not visual breathing room.

## Do not combine with

**asymmetric-diagonal-grid.md** — both techniques restructure the spatial grid at the
same level. Applying both in a single section produces competing spatial logics.

**section-inversion.md** inside individual bento cells — switching background colour per
cell introduces a fourth surface level (page → section → cell → inverted cell) that
obscures the hierarchy the bento grid was designed to communicate.

**A bento grid where every cell has the same span** — this collapses back into
`SLOP-TRIPLE-CARD` territory. The anti-slop clause above applies: if the spans are
uniform, use a standard grid or card layout and state the reason.
