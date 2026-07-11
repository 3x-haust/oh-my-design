# Section inversion (dark ↔ light narrative turn)

A section inversion switches the page from a light surface to a dark one — or the
reverse — at a specific point in the scroll narrative. The colour change is not
decoration; it marks a conceptual pivot, a moment where what was light becomes weighty,
or where accumulated tension releases. One inversion per page is usually correct. Two
inversions become a rhythm. Three become a pattern with no meaning.

`expressive.md`: "The inversion makes the change visible and felt, not just read. One
inversion per page is usually correct; more than one is a rhythm, not a pivot."

## When it earns its place / When it does not

Condition: the scroll narrative has a genuine turn — a moment where the conceptual
register shifts. Before the inversion, the user is in the exposition; after it, they are
in the consequence. A product page that moves from benefit to proof, a case study that
moves from problem to resolution, a campaign page that moves from question to answer.
The inversion is structural punctuation.

`core/theory/layout.md` — von Restorff isolation effect: a single element that breaks the
pattern is remembered. A section with a different background is the layout equivalent of
that differentiated element. Used once, it is the most remembered section on the page.

Condition against: arbitrary visual variety — swapping colours because the page "needed
something different" halfway down. `expressive.md`: "When the colour switches back
without a corresponding conceptual return, the technique has been used as decoration and
should be removed." Also: pages without a genuine narrative arc (tool UIs, dashboards,
documentation) where sections are parallel containers, not sequential scenes.

## Parameters

```css
:root {
  /* Light surface tokens */
  --surface-light: #ffffff;
  --on-surface-light: #0f0f0f;
  --surface-light-subtle: #f5f5f3;

  /* Dark surface tokens — the inverted register */
  --surface-dark: #0f0f0f;
  --on-surface-dark: #f5f5f3;
  --surface-dark-subtle: #1a1a1a;

  /* Transition between sections.
     Instant cut reads as deliberate and editorial.
     A 40–80px overlap blend reads as atmospheric.
     Most showpiece executions use the instant cut. */
  --inversion-transition: none; /* or: use a gradient bleed on the section edge */
}
```

## Implementation

```html
<!-- The narrative sections before the turn -->
<section class="narrative-section narrative-section--light">
  <div class="narrative-section__inner">
    <h2>The problem was not the product.</h2>
    <p>Four teams. Four definitions of done. Zero shared vocabulary.</p>
  </div>
</section>

<!-- The inversion: this section marks the turn -->
<section class="narrative-section narrative-section--dark">
  <div class="narrative-section__inner">
    <h2>The turn.</h2>
    <p>One shared language changed what could ship.</p>
  </div>
</section>

<!-- After the turn, the dark surface continues or returns to light intentionally -->
<section class="narrative-section narrative-section--dark">
  <div class="narrative-section__inner">
    <h2>What changed.</h2>
    <p>Velocity doubled. Not from more people — from fewer conversations.</p>
  </div>
</section>
```

```css
/* ── Base section structure ─────────────────────────────────────────────────── */
.narrative-section {
  padding-block: var(--space-section, 8rem);
  padding-inline: var(--space-page-margin, 5vw);
}

.narrative-section__inner {
  max-width: var(--content-measure, 72ch);
  margin-inline: auto;
}

/* ── Light surface ──────────────────────────────────────────────────────────── */
.narrative-section--light {
  background-color: var(--surface-light);
  color: var(--on-surface-light);
}

/* ── Dark surface (the inversion) ──────────────────────────────────────────── */
.narrative-section--dark {
  background-color: var(--surface-dark);
  color: var(--on-surface-dark);
}

/* ── Token inheritance: nested components must read their tokens from context ── */
/* Buttons, links, cards inside inverted sections inherit from the surface token.
   Do not hardcode light or dark values inside components — they will break here. */
.narrative-section--dark .card {
  background-color: var(--surface-dark-subtle);
  border-color: rgba(255, 255, 255, 0.08);
}

/* ── Optional: gradient bleed at section boundary for atmospheric transitions ── */
/* Use only when the concept benefits from ambiguity at the turn rather than clarity. */
.narrative-section--dark.narrative-section--bleed-top {
  border-top: none;
  /* A subtle gradient overlay creates the bleed effect without JavaScript */
  position: relative;
}

.narrative-section--dark.narrative-section--bleed-top::before {
  content: '';
  position: absolute;
  inset: 0;
  top: 0;
  height: 80px;
  background: linear-gradient(to bottom, var(--surface-light), transparent);
  pointer-events: none;
}

/* ── Reduced-motion: no effect needed here — section inversion is a static
   colour change, not an animation. The technique is inherently motion-free. ── */
```

## Responsive behavior

**375px (mobile):** Section inversion works at all viewports — it is a colour property, not
a spatial one. The primary concern at narrow widths is that the transition edge is clean.
Verify that no component's border or shadow bleeds across the section boundary creating a
visible seam; use `overflow: hidden` on the section if needed.

Padding reduction on mobile: the vertical rhythm of the narrative may be compressed.
Reduce `--space-section` to 4rem on mobile to maintain narrative pace without excessive
scrolling between conceptual turns.

```css
@media (max-width: 600px) {
  .narrative-section {
    padding-block: var(--space-section-mobile, 4rem);
  }
}
```

**768px (tablet):** No structural change. Verify the inversion boundary falls at a clean
scroll position — if a section begins mid-viewport on most tablet scroll positions, the
turn may never land with impact. `min-height: 60vh` on the inverted section ensures the
user arrives at the dark surface with the full viewport, not a sliver.

**1280px (desktop):** At wide viewports, the full-width colour change reads as a hard
architectural break. This is the register the technique is designed for — the inversion
commands the full screen width, which is why it works as punctuation. No additional
responsive changes needed; verify that imagery or tokens designed for the light surface
are replaced with dark-surface equivalents inside inverted sections.

## Do not combine with

**bento-grid.md** inside an inverted section — the bento grid's cell backgrounds create
a tertiary surface tier (light section → dark section → bento cell background). Three
surface levels in sequence confuse the inversion signal; the turn is no longer readable
as a conceptual pivot because it is preceded by background-switching at smaller scale.

**section-inversion applied per-section to every section** — this is the most common
misuse. If every section has a different background, no single inversion marks a turn.
The technique requires contrast between the norm and the exception; if all sections are
exceptions, there is no norm to deviate from.

**gradient-mesh.md on the inverted surface** — a mesh gradient on the dark section
introduces colour variation that competes with the starkness the inversion depends on.
The dark surface's power is its flatness against the light sections; texture undermines
the contrast signal.
