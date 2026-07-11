# Gradient mesh backgrounds

A gradient mesh layers multiple `radial-gradient()` declarations on a single element,
producing a soft, multi-source light field that reads as dimensional rather than flat.
Unlike a simple two-stop linear gradient, a mesh gradient has no visible direction — it
pools and diffuses, the way light fills a room through multiple windows. The technique
is CSS-only: no SVG, no image file, no canvas.

## When it earns its place / When it does not

Condition: the page has large flat sections that read as too digital — blank backgrounds
that feel like developer defaults rather than design decisions. A mesh gradient makes
the surface a presence without adding visual weight that competes with the content.
Showpiece and confident registers both benefit: the mesh adds depth to the hero or a
full-bleed section background without introducing imagery or illustration overhead.
`expressive.md` on grain texture (the natural companion to mesh): "Flat backgrounds or
smooth gradients that read as too digital — noise adds the tactile quality that solid
fills lack." A mesh gradient addresses the same problem at the colour level before grain
addresses it at the texture level.

Condition against: pages where the brand palette is already active and saturated — adding
a mesh to a high-saturation layout creates a chromatic argument between the mesh and the
content. Any dark section where the mesh's colour pools compete with text legibility;
verify 4.5:1 contrast between every text element and the mesh behind it at every mesh
position, not just the average. And for AI-generated-looking aesthetics: see the linter
notes below — specific hue combinations trigger `SLOP-GRADIENT` because they are the
statistical mean of AI design output, not a brand decision.

## Parameters

```css
:root {
  /* Each radial gradient defines one light source in the mesh.
     Three to five sources produce a convincing mesh; more than six
     tends toward muddiness rather than depth.
     Position each source at a different corner or edge — distribute
     them to avoid clustering. */

  /* Source 1: warm anchor — primary brand hue */
  --mesh-source-1-color: hsl(220deg 60% 70% / 0.8);
  --mesh-source-1-pos: 0% 0%;
  --mesh-source-1-size: 60% 60%;

  /* Source 2: cool contrast — secondary or complementary hue */
  --mesh-source-2-color: hsl(280deg 50% 60% / 0.6);
  --mesh-source-2-pos: 100% 0%;
  --mesh-source-2-size: 50% 50%;

  /* Source 3: neutral or analogous midground */
  --mesh-source-3-color: hsl(200deg 40% 80% / 0.5);
  --mesh-source-3-pos: 50% 100%;
  --mesh-source-3-size: 70% 50%;

  /* Base fill colour: what shows where the gradients do not reach.
     Should be the lightest or darkest value in the palette, never a mid-tone.
     Mid-tone bases with mid-tone gradients produce uniform murk. */
  --mesh-base: #f0f0ee;
}
```

## Implementation

```css
/* ── CSS-only mesh gradient ──────────────────────────────────────────────── */
.mesh-bg {
  background-color: var(--mesh-base);
  background-image:
    radial-gradient(
      ellipse var(--mesh-source-1-size) at var(--mesh-source-1-pos),
      var(--mesh-source-1-color),
      transparent
    ),
    radial-gradient(
      ellipse var(--mesh-source-2-size) at var(--mesh-source-2-pos),
      var(--mesh-source-2-color),
      transparent
    ),
    radial-gradient(
      ellipse var(--mesh-source-3-size) at var(--mesh-source-3-pos),
      var(--mesh-source-3-color),
      transparent
    );
  /* No background-blend-mode needed for basic mesh — the stacking of transparent
     gradients handles the blending. background-blend-mode: multiply or screen can
     intensify the effect but is harder to calibrate for legibility. */
}

/* ── Full-section mesh hero ──────────────────────────────────────────────── */
.mesh-hero {
  min-height: 100svh;
  display: flex;
  align-items: flex-end;
  padding: var(--space-page-margin, 5vw);
}

/* ── Mesh as a positional decorative element (not full-bleed) ─────────────── */
/* Place the mesh behind specific components without covering the entire background. */
.mesh-spot {
  position: relative;
  isolation: isolate; /* creates stacking context for the pseudo-element mesh */
}

.mesh-spot::before {
  content: '';
  position: absolute;
  inset: -20%;
  z-index: -1;
  border-radius: 50%; /* circular mesh pool reads as ambient light source */
  background-image:
    radial-gradient(
      ellipse 80% 80% at 30% 40%,
      var(--mesh-source-1-color),
      transparent
    ),
    radial-gradient(
      ellipse 60% 60% at 70% 60%,
      var(--mesh-source-2-color),
      transparent
    );
  filter: blur(40px); /* blur softens the ellipse edges for a true mesh feel */
  pointer-events: none;
}
```

```html
<!-- Full-section mesh: -->
<section class="mesh-bg mesh-hero">
  <h1>Content over the mesh.</h1>
</section>

<!-- Spot mesh behind a card or feature: -->
<div class="mesh-spot">
  <div class="card">Content gains an ambient glow.</div>
</div>
```

## Linter notes

The `SLOP-GRADIENT` rule fires on the following hue combinations because they are the
statistical signature of AI-generated design output — the default gradient every model
reaches for when asked to "make it look good":

- **Indigo → violet** (hue range 240–290deg): the single most overused gradient in AI
  design. Any `background: linear-gradient` or `radial-gradient` whose two dominant
  stops land in this band fires `SLOP-GRADIENT`. If the brand genuinely uses indigo and
  violet, the decision must be recorded in `omd decision` with the brand's hex values
  and the reference that supports the choice.

- **Purple → pink** (hue range 280–330deg): a secondary AI-default combination.
  Frequently appears in "premium" and "AI product" contexts. Same rule applies.

- **Electric blue → teal** (hue range 190–240deg): common in tech startup contexts.
  Fires `SLOP-GRADIENT` in these ranges at saturation above 70%.

The mesh gradient technique is not itself flagged — layered radial gradients at lower
saturation using the brand's actual hue values are expected and correct. The linter
fires on the specific hue bands above, not on mesh gradients per se. A mesh using
`hsl(30deg 40% 80%)` (warm sand) and `hsl(170deg 30% 75%)` (cool sage) is clean.
A mesh using `hsl(260deg 80% 60%)` and `hsl(310deg 70% 60%)` fires the rule.

**The test**: before committing a mesh gradient, read the HSL values of the dominant
stops. If both stops land in the flagged hue bands, record the brand reason or choose
a different hue combination. The mesh technique is sound; the hue selection is the risk.

## Do not combine with

**noise-grain-texture.md at opacity above 10%** — both techniques add depth signals to
the background. Grain over a mesh is appropriate at 3–6% opacity; above that, the
combined texture reads as a rendering artifact, not a design decision.

**svg-geometric-patterns.md behind the same element** — a pattern and a mesh applied
to the same background produce competing spatial readings (structured geometry and
ambient light) that cancel each other's signal.

**A mesh where text contrast cannot be verified at all mesh positions** — mesh gradients
are not uniform; the lightest point and the darkest point may differ enough that text
legible over one is illegible over the other. Always verify contrast at the gradient's
lightest zone for dark text and its darkest zone for light text.
