# Placeholder policy

A grey box is a design defect because it defers a decision the build must make before
shipping. Design-time placeholders never ship: not a grey rectangle, labelled mock image,
stock stand-in, fake screenshot, pattern fill, or generic gradient. Missing final material
has three outcomes: acquire the approved asset, recompose around available real material,
or remove the zone.

The typographic block, pattern fill, and generated gradient below are temporary design-time
probes. They help test geometry while acquisition is unresolved. Remove them before production.
Beige, cream, sepia, and warm-paper styling is not an unearned premium default; temporary
probes start from true white or a true neutral unless evidence supports another ground.

## When it earns its place / When it does not

Condition: use a temporary probe only during design when a known final asset is being
acquired and its dimensions must be tested. Record the intended subject, crop, source status,
and removal condition. Before release, replace the probe or recompose the surface.

Condition against: do not use a placeholder when no image-specific communication job exists;
remove the zone. This policy does not apply to runtime loading states. A skeleton may represent
expected structure while real data loads, but it is a reachable state with its own behavior,
not missing design content.

## Parameters

```css
:root {
  /* Typography placeholder: the font size should approximate the heading or body
     size of the expected content, so the layout holds its rhythm even without
     the real content. */
  --placeholder-type-size: var(--text-xl, 1.25rem);
  --placeholder-type-color: var(--text-secondary, rgba(0,0,0,0.35));

  /* Pattern placeholder: same parameters as svg-geometric-patterns.md.
     Use the same pattern token so the placeholder and a deliberate pattern
     application are visually consistent. */
  --placeholder-pattern-opacity: 0.06;

  /* Gradient placeholder: a single-hue gradient using the brand palette.
     Not a generic grey → white; the brand colour in a light wash is more
     informative and more finished than any grey value. */
  --placeholder-gradient-start: hsl(var(--hue-brand, 220deg) 20% 95%);
  --placeholder-gradient-end: hsl(var(--hue-brand, 220deg) 10% 88%);
}
```

## Implementation

**Option 1: Typographic block (design-time only)** — use to test the geometry of a known
copy or image zone. It is an annotation for the design team, not surface content.

```html
<!-- Instead of: <div class="hero-image" style="background:#ccc; height:400px;"></div> -->

<!-- Use: a typographic placeholder that holds the layout and signals intent. -->
<div class="placeholder placeholder--type" role="img" aria-label="Hero image: [brief description of intended content]">
  <span class="placeholder__label">Hero image</span>
  <span class="placeholder__detail">Photography: [subject or concept]</span>
</div>
```

```css
.placeholder--type {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* Match the dimensions of the expected content exactly.
     If the hero image is 100vw × 60vh, this placeholder is too. */
  min-height: 60vh;
  background-color: var(--placeholder-gradient-start);
  background-image: linear-gradient(
    135deg,
    var(--placeholder-gradient-start),
    var(--placeholder-gradient-end)
  );
  border-radius: var(--radius-section, 0);
  gap: var(--space-2, 0.5rem);
}

.placeholder__label {
  font-size: var(--placeholder-type-size);
  font-weight: var(--weight-medium, 500);
  color: var(--placeholder-type-color);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.placeholder__detail {
  font-size: var(--text-sm, 0.875rem);
  color: var(--placeholder-type-color);
  opacity: 0.7;
}
```

**Option 2: Pattern fill (design-time only)** — use to expose crop and contrast boundaries
while the approved asset is pending. It must never become fallback artwork.

```html
<div class="placeholder placeholder--pattern" role="img" aria-label="[describe intended content]"></div>
```

```css
.placeholder--pattern {
  /* Dimensions match the intended content zone. */
  min-height: 200px;
  background-color: var(--surface-subtle, #F4F5F7);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='1' fill='rgba(0%2C0%2C0%2C0.12)'/%3E%3C/svg%3E");
  background-size: 24px 24px;
  border-radius: var(--radius-card, 8px);
}
```

**Option 3: Generated gradient (design-time only)** — use only to test text placement and
contrast for a known photographic zone. A gradient cannot stand in for absent art direction.

```html
<section class="placeholder placeholder--gradient placeholder--hero" role="img" aria-label="[describe intended imagery]">
  <div class="section-content">
    <!-- Section content sits above the gradient placeholder background. -->
  </div>
</section>
```

```css
.placeholder--gradient {
  background-image: linear-gradient(
    160deg,
    var(--placeholder-gradient-start) 0%,
    var(--placeholder-gradient-end) 100%
  );
}

.placeholder--hero {
  min-height: 100svh;
}
```

**Decision rule:** first ask whether the zone has a specific communication job. If not,
remove it. If it does and acquisition is active, use the cheapest temporary probe that tests
the needed geometry. The release decision is never which placeholder to ship; it is approved
asset, recomposed real material, or no zone.

## Linter notes

- A `background: #ccc`, `background: #d9d9d9`, `background: grey`, or any near-neutral
  background on a container that has explicit height but no content is the signal the
  `omd check` system identifies as a potential placeholder. The check looks for elements
  with fixed-height, no semantic content, and a near-neutral background. If a legitimate
  design element fires this check, record the reason with `omd decision`.

- A placeholder role never waives `SLOP-GRADIENT` or licenses repeated atmosphere. Keep
  design-time probes out of shipped source and verify the production files contain no probe
  label, class, path, or synthetic asset.

- Design-time previews need a visible annotation for reviewers. Production accessibility is
  resolved against the final material: useful images get contextual alt text, decorative
  images get empty alt text, and removed zones leave no phantom image semantics.

## Do not combine with

**Production source** — no placeholder type belongs in a release. Use approved photography,
illustration, product captures, or other real material when it serves the communication job;
otherwise recompose or remove the zone.

**Lorem ipsum or invented content** — placeholder copy, fake metrics, fake product screens,
and labels such as "Hero image" never ship. Use verified content or omit the unsupported role.

**Runtime loading state** — do not reuse design-time probe classes or artwork as a skeleton.
Runtime loading follows the final component geometry and disappears when real content arrives.
