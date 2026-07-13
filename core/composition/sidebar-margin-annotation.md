# Sidebar / margin annotation layout

> Candidate hypothesis only. Revalidate its condition, values, and responsive transition
> against the current composition contract; do not transfer this page recipe unchanged.

A Tufte-style margin layout places supplementary detail — a footnote, a source citation, a
clarifying aside, an illustrative data point — in the margin column beside the text that
references it. The main column reads without interruption; the margin column deepens for
readers who want it. The vertical alignment between the annotation and its anchor in the
body text is the structural contract: the annotation appears beside the sentence it
qualifies, not at the bottom of the section.

## When it earns its place / When it does not

Condition: the content is prose-heavy and carries genuinely supplementary material that
enriches the main argument without being essential to it. Long-form editorial content,
research-style pages, case studies that cite sources, documentation that benefits from
contextual notes without disrupting the reading flow. The technique embodies
`core/theory/layout.md`'s closure principle: the spatial proximity between body text and
annotation communicates the relationship without requiring visual connectors.

Edward Tufte argues in *Visual Display of Quantitative Information* (1983) that placing
supporting material beside the text that refers to it reduces the need for citations that
interrupt reading — the footnote does not require a journey to the bottom of the page.
The margin annotation is the print typographer's solution to this problem, applied to screen.

Condition against: narrow viewports (the margin column disappears below 900px and the
annotations must be inlined or dropped). Marketing pages where every word must hold
attention — supplementary text in the margin costs reading focus even when it is not
read; the eye registers its presence. Tool UIs and dashboards where sidebar content
should be navigation or action, not annotation. And any layout where the body column is
already narrow — if the reading measure drops below 50ch to accommodate a margin column
at 768px, the main text has been sacrificed for the annotation, which inverts the hierarchy.

`core/theory/layout.md` on information density: "Whitespace here is not wasted; it is
the product." The margin annotation layout requires generous right-margin whitespace at
medium densities; it is incompatible with high-density layouts where every column is
earning its keep.

## Parameters

```css
:root {
  /* Main content column width.
     Tufte's canonical measure: 55–65% of the text area.
     Readable body text: 50–75ch is the research-validated range. */
  --main-col-width: 60%;

  /* Margin annotation column width.
     Typically 25–30% of the text area; the remainder is gutter. */
  --margin-col-width: 28%;

  /* Gutter between main and margin columns. */
  --margin-gutter: clamp(16px, 2vw, 32px);

  /* Annotation font size.
     Smaller than body to signal supplementary status. 80–85% of body size.
     At 1rem body: 0.8rem annotation is legible and clearly secondary. */
  --annotation-font-size: 0.8rem;
  --annotation-line-height: 1.5;
  --annotation-color: var(--text-secondary, rgba(0,0,0,0.55));
}
```

## Implementation

```html
<!-- The layout uses a named CSS grid area: main + margin.
     Each .margin-ref creates a vertical alignment anchor.
     The annotation must be a sibling of the annotated paragraph, not a child — 
     this keeps the DOM order correct for reading without CSS. -->
<article class="margined-prose">
  <div class="margined-prose__row">
    <p class="margined-prose__body">
      The spacing scale is not arbitrary.
      <span class="margined-prose__anchor" id="note-1" aria-describedby="ann-1">¹</span>
      Each step in the scale must have a reason that could not be the adjacent step.
    </p>
    <aside class="margined-prose__annotation" id="ann-1" aria-label="Note 1">
      Müller-Brockmann, <em>Grid Systems in Graphic Design</em> (1981): shared
      spacing units make disparate elements read as one system.
    </aside>
  </div>

  <div class="margined-prose__row">
    <p class="margined-prose__body">
      The 8pt grid is a mechanical constraint with a perceptual benefit: values on the
      grid land at whole pixel boundaries on most screen densities.
    </p>
    <!-- Row with no annotation: the margin column is empty whitespace here.
         The empty right column is not a failure — it is the breathing room
         that makes the annotated rows legible. -->
  </div>
</article>
```

```css
/* ── Grid layout ──────────────────────────────────────────────────────────── */
.margined-prose {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 1rem);
  padding-inline: var(--space-page-margin, 5vw);
  max-width: 100%;
}

.margined-prose__row {
  display: grid;
  grid-template-columns: var(--main-col-width) var(--margin-gutter) var(--margin-col-width);
  align-items: start; /* top-align: annotation begins beside its anchor sentence */
}

.margined-prose__body {
  grid-column: 1 / 2;
  font-size: var(--text-base, 1rem);
  line-height: var(--leading-body, 1.65);
  max-width: 65ch; /* readable measure cap within the column */
}

.margined-prose__annotation {
  grid-column: 3 / 4; /* skip the gutter column */
  font-size: var(--annotation-font-size);
  line-height: var(--annotation-line-height);
  color: var(--annotation-color);
  /* Vertical alignment: the annotation top-aligns with the row.
     For precise alignment with a specific sentence, margin-top may be added
     equal to the number of leading lines above the anchor word. */
  padding-top: 0.15em; /* optically align with cap-height of body text */
}

/* Annotation number in body: superscript, same color as annotation. */
.margined-prose__anchor {
  font-size: 0.7em;
  vertical-align: super;
  color: var(--annotation-color);
  text-decoration: none;
}
```

## Responsive behavior

**375px (mobile):** The margin column is not viable at this width — the body column would
fall below readable measure to accommodate it. Stack the annotation below its paragraph,
visually differentiated by font size and a left border.

```css
@media (max-width: 900px) {
  .margined-prose__row {
    display: block; /* collapse grid to single column */
  }

  .margined-prose__annotation {
    display: block;
    margin-top: var(--space-2, 0.5rem);
    padding-left: var(--space-3, 0.75rem);
    border-left: 2px solid var(--border-subtle, rgba(0,0,0,0.12));
    /* Annotation is now inline, below the body paragraph, clearly secondary. */
  }
}
```

**768px (tablet):** The 900px breakpoint covers tablet portrait. At landscape tablet
(1024px), the grid layout works; test that `--main-col-width: 60%` at 1024px produces a
body column of at least 50ch. If not, widen the main column to 65% and narrow the margin
column correspondingly.

**1280px (desktop):** The full three-column grid. The empty margin column in un-annotated
rows is intentional negative space — do not fill it with anything. The whitespace signals
"more is available if you look" without demanding attention.

## Do not combine with

**asymmetric-diagonal-grid.md** — the diagonal layout breaks the column contract that the
margin annotation depends on. The annotation cannot be vertically anchored to its body
text if the body column is itself off-axis.

**editorial-index-labels.md** in the same section — both add secondary visual elements
in the peripheral field. The index number in the left background and the annotation in the
right margin create a four-zone reading field (left-decoration, body, gutter, annotation)
that costs more attention than it returns.

**High-density layouts** where the body column is already maximised — the margin annotation
technique is structural whitespace. It cannot be added to a dense layout without sacrificing
reading measure.
