# CSS-only decorative illustration primitives

CSS shapes — blobs via `border-radius`, layered circles, rotated rectangles, clipped
polygons — that create abstract decorative elements without photography or SVG files.
These primitives soften flat backgrounds, frame content sections, and add a spatial
quality to otherwise bare layouts. The technique produces elements that read as
decorative fields rather than illustrations: they have presence without narrative.

The primitives are pure CSS: no image files, no JavaScript, no external dependencies.
They scale perfectly at any resolution and can be themed by changing custom properties.

## When it earns its place / When it does not

Condition: sections that need visual weight without photography or purposeful illustration.
A hero background that should feel organic rather than grid-based, a feature highlight
where an abstract shape frames the text without competing with it, a footer that needs
warmth without adding content. Useful when the budget or timeline prohibits custom
illustration and stock photography would introduce a mismatched register.

The organic blob specifically earns its place when the concept's governing metaphor is
biological, human, or flowing — a health product, a creative tool, an emotional brand —
where geometric shapes would read as cold. `core/theory/layout.md` closure principle:
implied shapes created by border-radius have the same grouping effect as borders, with
less visual weight.

Condition against: when purposeful illustration exists and the CSS primitive would
compete with it. When the brand register is technical or precise — geometric CSS shapes
read as approximations of geometry; an actual SVG or canvas-drawn shape is more precise.
Also: avoid when the shapes are purely filling space with no compositional purpose. A
blob in the corner of a hero section that does not frame, separate, or accent anything
is a shape placed to fill space, and `core/theory/layout.md`'s restraint applies: space
is structural, not dead air to be decorated.

## Parameters

```css
:root {
  /* Blob colour: typically a low-saturation tint of the brand palette.
     At 20–40% opacity the blob reads as ambient colour, not a shape.
     At 60–80% opacity it reads as a distinct coloured element — use intentionally. */
  --blob-color: hsl(220deg 50% 70% / 0.25);
  --blob-secondary: hsl(280deg 40% 65% / 0.18);

  /* Blob size: relative to the container.
     60–80% produces an organic field that covers but does not dominate.
     100%+ (bleeding beyond the container) reads as a background wash. */
  --blob-size: 70%;

  /* Blur on the blob: softens edges for ambient quality.
     0: hard-edged shape — more deliberate, less ambient.
     40–80px: fully soft — reads as ambient colour field, not a shape. */
  --blob-blur: 60px;
}
```

## Implementation

**Organic blob (single, border-radius)**

```css
/* Applied to a pseudo-element so no extra HTML is needed. */
.blob-bg {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.blob-bg::before {
  content: '';
  position: absolute;
  /* Off-center placement creates visual interest without symmetry. */
  top: -20%;
  right: -10%;
  width: var(--blob-size);
  aspect-ratio: 1 / 1.1; /* slightly non-square for organic quality */
  background: var(--blob-color);
  /* The border-radius blob: a high, uneven border-radius on all corners.
     No two adjacent values identical — this produces the organic shape. */
  border-radius: 62% 38% 46% 54% / 60% 44% 56% 40%;
  filter: blur(var(--blob-blur));
  z-index: -1;
  pointer-events: none;
}

/* Second blob for depth — offset from the first. */
.blob-bg::after {
  content: '';
  position: absolute;
  bottom: -15%;
  left: -5%;
  width: calc(var(--blob-size) * 0.7);
  aspect-ratio: 1.2 / 1;
  background: var(--blob-secondary);
  border-radius: 40% 60% 70% 30% / 50% 60% 40% 50%;
  filter: blur(calc(var(--blob-blur) * 1.2));
  z-index: -1;
  pointer-events: none;
}
```

**Layered circle stack (explicit HTML elements for more control)**

```html
<!-- Decorative circles: aria-hidden, pointer-events: none. -->
<div class="circle-stack" aria-hidden="true">
  <div class="circle-stack__ring circle-stack__ring--1"></div>
  <div class="circle-stack__ring circle-stack__ring--2"></div>
  <div class="circle-stack__ring circle-stack__ring--3"></div>
</div>
```

```css
.circle-stack {
  position: relative;
  width: 400px;
  height: 400px;
  pointer-events: none;
  user-select: none;
}

.circle-stack__ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid currentColor;
  opacity: 0.12;
}

.circle-stack__ring--1 {
  inset: 0;
  /* Full size ring */
}

.circle-stack__ring--2 {
  inset: 15%;
  /* Inset ring — concentric */
}

.circle-stack__ring--3 {
  inset: 30%;
  /* Innermost ring — the system reads as depth through concentric structure */
}
```

**Clipped geometric accent (clip-path)**

```css
/* A rotated square clipped to a diamond — reads as a geometric accent mark. */
.diamond-accent {
  width: 120px;
  height: 120px;
  background: var(--color-accent);
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  opacity: 0.15;
  position: absolute;
  pointer-events: none;
}
```

## Linter notes

- CSS illustration primitives composed in the flagged SLOP-GRADIENT hue bands (indigo–violet,
  purple–pink) read as the same AI-default aesthetic as gradient meshes in those bands.
  The `SLOP-GRADIENT` rule does not fire on border-radius shapes directly, but shapes in
  these hue ranges without a brand justification carry the same compositional risk. Record
  the colour choice with a brand citation if it lands in those bands.

- Blobs with `filter: blur()` applied to large elements are paint-intensive. A blob
  covering 70% of a 1280px section requires the browser to blur a ~900px region. Set
  `will-change: transform` only if the blob animates; for static blobs, `will-change`
  adds GPU memory cost without benefit.

- CSS shapes are decorative. Every shape element must carry `pointer-events: none` and
  `aria-hidden="true"` when implemented as standalone HTML elements. Content must never
  be inside a decorative shape element; it must be a sibling above it in z-order.

## Do not combine with

**svg-geometric-patterns.md behind the same element** — organic blobs and geometric
patterns are opposite registers (organic randomness vs deliberate order). Combining both
on the same background surface produces visual incoherence.

**gradient-mesh.md at full opacity on the same surface** — a mesh gradient and a blob
both create ambient colour fields. Two ambient fields on the same surface merge into a
single muddied background rather than two distinct spatial signals. Use the blob or the
mesh, not both; or confine one to a small spot and the other to the full background.

**Purposeful photography or illustration** — CSS illustration primitives are a substitute
for imagery when none exists. When real photography or illustration is present, CSS
shapes compete with it for compositional attention.
