# SVG geometric patterns

An SVG geometric pattern — dots, lines, or a grid — embedded as a data URI and applied
as a repeating `background-image`. The pattern adds visual structure to backgrounds without
imagery or illustration: it reads as a surface property rather than a content element.
Unlike grain, which produces organic randomness, a geometric pattern produces deliberate
order — it implies a system, a grid, an underlying precision.

No external file is required. The SVG is a single small tile (16–40px square) that the
browser repeats across the element. The result is a background that scales to any
viewport size with no pixelation.

## When it earns its place / When it does not

Condition: backgrounds that need visual structure without imagery — code editors, technical
product sites, engineering tools, documentation — where an organic texture would be
mismatched to the product's register. A dot grid on a developer tool reads as graph paper:
it signals precision and technical culture. A line pattern on an editorial layout can
read as a reference to print production. `core/theory/layout.md` closure principle:
a repeated grid element creates implied boundaries and structure that the eye reads as
organisational even before content is added.

Also appropriate as a hero background when the concept is systematic or ordered —
architecture, infrastructure, planning tools — where the grid pattern reinforces the
concept's governing metaphor.

Condition against: warm or organic brand concepts where a geometric pattern reads as
cold or over-engineered. Any context where the pattern's density competes with the text
density above it — a tight dot grid under dense body text creates visual noise. On dark
surfaces with low-contrast patterns, the pattern may not read at all; verify visibility.
And: a geometric pattern is not a substitute for a considered background decision —
it is a surface treatment on top of a colour choice. The colour must be chosen first.

## Parameters

```css
:root {
  /* Pattern type: set by choosing the appropriate background-image value below.
     Three canonical patterns: dot grid, line grid, isometric grid. */

  /* Pattern colour: the foreground element of the pattern.
     Should be a low-contrast step above the background — typically 8–15% opacity
     of the text colour. More contrast than this makes the pattern dominant. */
  --pattern-color: rgba(0, 0, 0, 0.08);
  --pattern-bg: #fafafa; /* the background colour beneath the pattern */

  /* Tile size: the repeat interval.
     20–32px: fine, dense pattern — reads as texture.
     40–60px: medium grid — reads as structural grid.
     80px+: coarse grid — reads as scaffolding, layout guide. */
  --pattern-tile: 24px;

  /* Element size within the tile: dot diameter, line stroke width. */
  --pattern-dot-size: 1.5px;
  --pattern-line-width: 0.5px;
}
```

## Implementation

**Dot grid pattern:**

```css
.pattern-dots {
  background-color: var(--pattern-bg);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='1' fill='rgba(0%2C0%2C0%2C0.12)'/%3E%3C/svg%3E");
  background-size: var(--pattern-tile) var(--pattern-tile);
  background-repeat: repeat;
}
```

**Line grid pattern (horizontal lines only):**

```css
.pattern-lines {
  background-color: var(--pattern-bg);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cline x1='0' y1='23.5' x2='24' y2='23.5' stroke='rgba(0%2C0%2C0%2C0.08)' stroke-width='0.5'/%3E%3C/svg%3E");
  background-size: var(--pattern-tile) var(--pattern-tile);
  background-repeat: repeat;
}
```

**Full grid pattern (horizontal + vertical lines):**

```css
.pattern-grid {
  background-color: var(--pattern-bg);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cpath d='M 32 0 L 0 0 0 32' fill='none' stroke='rgba(0%2C0%2C0%2C0.07)' stroke-width='0.5'/%3E%3C/svg%3E");
  background-size: 32px 32px;
  background-repeat: repeat;
}
```

**Dark surface variants:** Replace `rgba(0,0,0,0.08)` with `rgba(255,255,255,0.06)` in the
SVG fill/stroke value. The percent-encoding changes accordingly:
- `rgba(255%2C255%2C255%2C0.06)` in the data URI.

```html
<!-- Apply to any section or container: -->
<section class="pattern-dots">
  <div class="section-inner">
    <h2>Structured background.</h2>
  </div>
</section>

<!-- Or as a decorative panel: -->
<div class="panel pattern-grid">
  <!-- Content above the pattern grid -->
</div>
```

## Linter notes

- Geometric patterns at opacity that makes them dominant over the content above them are a
  defect. The pattern must never compete with text or UI elements for visual attention.
  Run `omd check` to verify contrast between any text and the pattern background —
  the checker uses the `background-color` value and the overlaid SVG pattern's effective
  luminance. If text contrast fails, reduce pattern opacity or increase the gap between
  background and pattern colour values.

- A dot grid in the flagged SLOP-GRADIENT hue bands is not automatically a `SLOP-GRADIENT`
  violation (the rule targets gradient fills, not patterns) — but a saturated coloured
  dot grid reads as decoration pretending to be structure. Geometric patterns work as
  neutral structure; adding hue to them converts them from structure to decoration and
  they lose the technical signal that earns their place.

- The SVG tile `width` and `height` attributes must match the `background-size` value or
  the tile will scale with display density, producing a visible seam at HiDPI. Set both
  the SVG dimensions and `background-size` to the same pixel value in `--pattern-tile`.

## Do not combine with

**gradient-mesh.md behind the same element** — a mesh gradient and a geometric pattern
applied to the same surface produce two background systems: one ambient and organic, one
ordered and geometric. They describe different things about the surface and the combination
reads as indecision rather than depth.

**noise-grain-texture.md at visible opacity** — grain and a geometric pattern both
operate on the background texture register. One is organic randomness; the other is
deliberate order. Combining them does not produce a richer surface — it obscures each
technique's signal.

**High-density body text sections** — a dot grid under dense text produces a visual
texture that competes with the letter forms. Reserve geometric patterns for sections
where content density is low and the pattern can read as structure rather than noise.
