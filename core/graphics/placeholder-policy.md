# Placeholder policy

A grey box is a design defect: it defers a decision the build must make before shipping,
and it ships as an admission that nobody decided what belongs here. A placeholder that
reaches production — as a grey rectangle, a "Coming soon" block, or a `background: #ccc`
div — is not a placeholder anymore. It is content that says the design is unfinished.

This recipe defines what to do instead. For every situation where a grey box would appear,
there is a deliberate alternative: a typographic block, a pattern fill, or a generated
gradient. Each carries more information about the intended content than a grey rectangle
and requires the designer to make a decision — which is the point.

## When it earns its place / When it does not

Condition: any section where final imagery is not available at build time. Team photos
not yet shot. Product screenshots not yet captured. User-generated content zones in an
empty state. Hero sections awaiting final photography. The placeholder policy applies
to all of these: each one must ship as a deliberate, designed alternative to the missing
image, not as a grey box.

The placeholder policy is a forcing function. Deciding what to use instead of the grey
box requires answering: "What does this space communicate when the real content is
absent?" A typographic block communicates the category and scale of the expected content.
A pattern fill communicates that the space is structural, not content-bearing. A gradient
communicates the colour register of the expected content.

Condition against: this policy does not apply to actual content loading states (skeleton
screens during data fetch are correct — see `core/theory/layout.md` on loading states).
The policy targets design-time decisions, not runtime states.

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

**Option 1: Typographic block** — for content zones that will hold a heading, a body
paragraph, or a feature statement. The typographic placeholder communicates scale and
category without pretending to be real content.

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

**Option 2: Pattern fill** — for content zones that are structural (a card image slot,
a sidebar graphic zone) where the space needs visual weight but no textual label.

```html
<div class="placeholder placeholder--pattern" role="img" aria-label="[describe intended content]"></div>
```

```css
.placeholder--pattern {
  /* Dimensions match the intended content zone. */
  min-height: 200px;
  background-color: var(--surface-subtle, #f5f5f3);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='1' fill='rgba(0%2C0%2C0%2C0.12)'/%3E%3C/svg%3E");
  background-size: 24px 24px;
  border-radius: var(--radius-card, 8px);
}
```

**Option 3: Generated gradient** — for hero and full-bleed sections where the missing
image is photographic and the gradient conveys the intended colour register.

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

**Decision rule:** choose by content type and visibility:
- The expected content is a heading or copy block → **typographic block**.
- The expected content is an image in a card, thumbnail, or secondary zone → **pattern fill**.
- The expected content is a full-bleed hero or section background photo → **generated gradient**.
- When in doubt between pattern and gradient: gradient, because it communicates the
  colour register of the eventual photography.

## Linter notes

- A `background: #ccc`, `background: #d9d9d9`, `background: grey`, or any near-neutral
  background on a container that has explicit height but no content is the signal the
  `omd check` system identifies as a potential placeholder. The check looks for elements
  with fixed-height, no semantic content, and a near-neutral background. If a legitimate
  design element fires this check, record the reason with `omd decision`.

- Generated gradient placeholders that land in the SLOP-GRADIENT hue bands (indigo–violet,
  purple–pink) should use the brand's actual hue variable (`var(--hue-brand)`) rather than
  a hardcoded hue. The placeholder inherits the brand palette, so if the brand changes,
  the placeholders update automatically.

- Every placeholder element must have a meaningful `aria-label` that describes the
  intended content. A placeholder without an accessible description is both a design
  defect and an accessibility failure — screen readers announce it as an unlabelled image.

## Do not combine with

**Actual content** — when the real image or content is available, use it. The placeholder
policy does not mean "use a gradient everywhere instead of photography." Photography,
illustration, or purposeful imagery always supersedes a placeholder when it exists.

**Lorem ipsum text** — text placeholders are governed by the same principle: `hand.agent.yaml`
states "Placeholder copy is a defect. 'Lorem ipsum' and 'Your content here' never ship."
A typographic block that serves as an image placeholder is acceptable; a paragraph of
lorem ipsum text is not. If body copy is absent, use structural whitespace or a typographic
label indicating the content category, never placeholder prose.

**More than one placeholder type in the same layout zone** — choosing between typographic,
pattern, and gradient means choosing one. Stacking a pattern fill and a gradient on the
same placeholder element produces a background system, not a placeholder decision.
