# Sticky sidebar + scrolling content

A sticky sidebar remains anchored in view while the main content column scrolls past it.
The sidebar holds content that gains from staying visible — navigation, a table of contents,
a reference panel, a summary of options while the user reads detail. The main column holds
the content that changes as the user scrolls. The spatial relationship between fixed and
moving creates a reading contract: one side is the reference, the other is the subject.

## When it earns its place / When it does not

Condition: the sidebar content is actively useful while the main content is being read —
not just available, but genuinely better visible than hidden. A table of contents that
tracks the user's position, a filter panel that contextualises the results column, a
product summary that stays visible while the user reads the long-form description, a
step indicator during a multi-section form. The user benefits from the concurrent
visibility; removing the sticky behaviour would require scrolling back to reorient.

`core/theory/layout.md` on scan patterns: "primary navigation and key actions belong
on the left or in the top bar" — the F-pattern's left-edge scan aligns with a left
sidebar that provides structural context. A sticky sidebar on the right works only
when the content scan pattern is already bidirectional (documentation-style reference
pages where the user moves between code and explanation).

Condition against: mobile viewports where the sidebar consumes horizontal real estate
the main column cannot afford. Any sidebar whose content is not actively consulted while
the main column is being read — if the user reads the main column without ever glancing
at the sidebar, the sticky position is costing a column of space for no return. Short
pages where the sidebar reaches the end of the page before the scroll distance is
meaningful — `position: sticky` achieves nothing useful on a page under 200vh. And any
sidebar whose content duplicates rather than contextualises the main column.

## Parameters

```css
:root {
  /* Sidebar width.
     Fixed sidebar: typically 240–320px.
     Proportional sidebar: 22–28% of the container — use when the content column
     should reflow proportionally with viewport width. */
  --sidebar-width: clamp(200px, 22%, 300px);

  /* The top offset at which the sidebar sticks.
     Match this to the height of any fixed top navigation bar.
     If there is no fixed nav, a small offset (16–24px) prevents the sidebar
     from jamming against the viewport top. */
  --sidebar-sticky-top: var(--nav-height, 80px);

  /* Gap between sidebar and main content column. */
  --sidebar-gap: clamp(24px, 4vw, 48px);

  /* The sidebar's maximum height before it becomes independently scrollable.
     Set this to (100vh - var(--sidebar-sticky-top)) to allow the sidebar to
     scroll internally if its content exceeds the viewport height. */
  --sidebar-max-height: calc(100vh - var(--sidebar-sticky-top) - 2rem);
}
```

## Implementation

```html
<!-- The wrapper defines the two-column layout.
     The sidebar column holds the sticky element.
     The main column scrolls normally. -->
<div class="sticky-layout">
  <aside class="sticky-layout__sidebar" aria-label="Table of contents">
    <nav class="toc">
      <p class="toc__heading">Contents</p>
      <ol class="toc__list">
        <li><a href="#section-1" class="toc__link">Discovery</a></li>
        <li><a href="#section-2" class="toc__link">Definition</a></li>
        <li><a href="#section-3" class="toc__link">Design</a></li>
        <li><a href="#section-4" class="toc__link">Delivery</a></li>
      </ol>
    </nav>
  </aside>

  <main class="sticky-layout__main">
    <section id="section-1">
      <h2>Discovery</h2>
      <!-- Long-form content that scrolls -->
    </section>

    <section id="section-2">
      <h2>Definition</h2>
      <!-- Long-form content that scrolls -->
    </section>
    <!-- ... more sections ... -->
  </main>
</div>
```

```css
/* ── Two-column grid ─────────────────────────────────────────────────────── */
.sticky-layout {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  gap: var(--sidebar-gap);
  padding-inline: var(--space-page-margin, 5vw);
  align-items: start; /* critical: both columns align to the top; sticky works from there */
}

/* ── Sidebar: sticky within its column ───────────────────────────────────── */
.sticky-layout__sidebar {
  position: sticky;
  top: var(--sidebar-sticky-top);
  max-height: var(--sidebar-max-height);
  overflow-y: auto; /* if sidebar content exceeds viewport height, it scrolls internally */
  /* Subtle scrollbar styling for the sidebar when it overflows */
  scrollbar-width: thin;
  scrollbar-color: var(--border-subtle) transparent;
}

/* ── Main content: normal block flow ─────────────────────────────────────── */
.sticky-layout__main {
  min-width: 0; /* prevent grid blowout from long words or wide content */
}

.sticky-layout__main section {
  padding-block: var(--space-section, 4rem);
  /* A border or padding between sections helps the user perceive the scroll
     narrative without the sidebar tracking — a visual chapter break. */
  border-top: 1px solid var(--border-subtle, rgba(0,0,0,0.08));
}

.sticky-layout__main section:first-child {
  border-top: none;
  padding-top: 0;
}

/* ── Table of contents: simple, functional ─────────────────────────────── */
.toc__heading {
  font-size: var(--text-xs, 0.75rem);
  font-weight: var(--weight-medium, 500);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: var(--space-3, 0.75rem);
}

.toc__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 0.5rem);
}

.toc__link {
  font-size: var(--text-sm, 0.875rem);
  color: var(--text-secondary);
  text-decoration: none;
  line-height: 1.4;
  /* Active state for the current section — wired via IntersectionObserver in JS */
}

.toc__link[aria-current="true"],
.toc__link.is-active {
  color: var(--color-accent);
  font-weight: var(--weight-medium, 500);
}
```

## Responsive behavior

**375px (mobile):** The sidebar cannot coexist with the main column at this width. Move
sidebar content above the main content, or collapse it into a sticky summary bar at the
top. Do not simply hide the sidebar — if it provides navigation, it must remain accessible.

```css
@media (max-width: 900px) {
  .sticky-layout {
    grid-template-columns: 1fr; /* single column */
  }

  .sticky-layout__sidebar {
    position: static; /* remove sticky: stacks above main content */
    max-height: none;
    overflow-y: visible;
    padding-bottom: var(--space-6, 1.5rem);
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: var(--space-6, 1.5rem);
  }

  /* Alternative: collapse to a sticky top bar on mobile.
     Requires JavaScript to build a compact navigation from the sidebar content.
     This pattern is documented in sticky-scene-transition.md. */
}
```

**768px (tablet):** At 768px, `--sidebar-width: clamp(200px, 22%, 300px)` yields ~169px
— below the 200px floor, so the floor takes effect. A 200px sidebar at 768px leaves ~520px
for the main column, which is sufficient for body text at 50–65ch. Verify the sidebar
content does not overflow its column at this width.

**1280px (desktop):** The sidebar at `clamp(200px, 22%, 300px)` yields ~282px at 1280px.
The main column receives ~950px minus gap and page margin. At this width consider whether
the main column benefits from a `max-width: 72ch` constraint — a full-width main column
at 950px produces a 120ch+ measure, which is over the research-validated readable range.
`core/theory/layout.md` on form and text layout: 50–75ch is the validated range.

## Do not combine with

**editorial-index-labels.md** in the same section — both create secondary reading tracks.
The index number (decorative, left-background) and the sidebar navigation (functional,
left-column) compete for the same spatial zone, producing ambiguity about what the left
side of the page means.

**asymmetric-diagonal-grid.md** — the diagonal layout breaks the column contract that
the sticky sidebar depends on. The sidebar's spatial promise (I stay while you scroll) is
undermined when the main column is itself off-axis or overlapping the sidebar zone.

**sticky-sidebar on pages under 200vh** — the sticky behaviour has no effect when the
page is too short for meaningful scroll distance. Use a static two-column layout instead
and reserve `position: sticky` for pages where the sidebar travels a meaningful distance
alongside the user.
