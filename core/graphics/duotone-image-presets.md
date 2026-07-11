# Duotone / treated image presets

A duotone treatment replaces an image's tonal range with two colours — one for the
shadows, one for the highlights — using a CSS `filter` chain. The result reads as
intentional art direction rather than stock photography: the same face or landscape
in two hues aligned to the brand palette becomes a designed asset, not a found one.
The technique unifies images from different sources under a single visual language.

The CSS implementation uses `filter: grayscale(1) contrast() brightness() sepia() hue-rotate()` chained in a specific order to achieve the duotone effect without SVG
feColorMatrix or Canvas manipulation. A secondary blend-mode approach using
`mix-blend-mode: multiply` or `color` can achieve richer duotones when browser support
allows for the stacking context requirements.

## When it earns its place / When it does not

Condition: when real images exist but come from varied sources — team photography at
different times, stock imagery from multiple libraries, user-generated content — and
visual unification is needed without re-photographing everything. A duotone treatment
makes diverse source material read as a designed set. Also: when the brand palette is
strong and the concept benefits from photographs that are unmistakably on-brand; the
treatment removes the image's original colour story and replaces it with the brand's.

`core/theory/layout.md` on similarity: "elements that look the same are read as
belonging to the same category." A grid of duotone-treated images reads as a unified
collection; the same grid with untreated photographs reads as a collection of separate
images that happen to share space.

Condition against: product photography where accurate colour matters — food, fashion,
product hardware. Medical or scientific imagery where colour carries meaning. Any context
where the user needs to see the actual colours of the subject. Documentation images where
clarity outweighs aesthetic treatment.

## Parameters

```css
:root {
  /* The CSS filter duotone uses a grayscale base plus hue rotation and saturation.
     Exact values depend on the target shadow and highlight colours.
     The values below produce a warm amber shadow / cool blue highlight duotone.
     Calibrate these against the brand palette — these are starting points. */

  /* Step 1: desaturate completely. */
  --dt-grayscale: grayscale(1);

  /* Step 2: boost contrast so shadows and highlights are distinct zones. */
  --dt-contrast: contrast(1.2);

  /* Step 3: add the shadow tone via sepia (shifts greys to warm amber). */
  --dt-sepia: sepia(0.8);

  /* Step 4: rotate hue to place the image in the brand palette zone.
     0deg: warm amber (sepia base).
     60deg: warm yellow-green.
     180deg: cyan-teal.
     240deg: blue.
     300deg: purple-pink.
     Combine with saturation adjustment for exact colour targeting. */
  --dt-hue: hue-rotate(200deg);

  /* Step 5: saturation of the resulting toned image.
     0.6–0.8: subtle colour wash — reads as toned, not fully coloured.
     1.0–1.4: strong colour — reads as deliberately duotoned. */
  --dt-saturate: saturate(1.2);

  /* Final brightness correction: duotone often darkens; compensate here. */
  --dt-brightness: brightness(1.05);
}
```

## Implementation

**CSS filter chain (single-colour tint approach)**

```css
/* The filter chain order matters. Changing the order changes the output. */
.duotone {
  filter:
    var(--dt-grayscale)
    var(--dt-contrast)
    var(--dt-sepia)
    var(--dt-hue)
    var(--dt-saturate)
    var(--dt-brightness);
}

/* Preset: brand blue duotone */
.duotone--blue {
  filter: grayscale(1) contrast(1.2) sepia(0.9) hue-rotate(180deg) saturate(1.3) brightness(1.0);
}

/* Preset: brand amber duotone */
.duotone--amber {
  filter: grayscale(1) contrast(1.15) sepia(1) hue-rotate(20deg) saturate(1.1) brightness(1.08);
}

/* Preset: monochrome (single tone, minimal saturation) */
.duotone--mono {
  filter: grayscale(1) contrast(1.1) brightness(1.05);
}
```

**Mix-blend-mode approach (richer control, requires stacking context)**

```html
<!-- The image sits in a container. A pseudo-element with the brand colour overlays
     it via mix-blend-mode: color, which replaces the image's hue while preserving
     luminosity. This produces a true two-stop duotone. -->
<div class="duotone-blend">
  <img src="image.jpg" alt="[description]" class="duotone-blend__image">
</div>
```

```css
.duotone-blend {
  position: relative;
  isolation: isolate; /* required for mix-blend-mode to work correctly */
  overflow: hidden;
}

.duotone-blend__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(1) contrast(1.1); /* desaturate first */
}

/* The colour overlay uses mix-blend-mode: color to apply the brand hue
   to the greyscale image below. */
.duotone-blend::after {
  content: '';
  position: absolute;
  inset: 0;
  background-color: var(--color-brand-primary, #1a4d8f);
  opacity: 0.6; /* lower = more greyscale visible; higher = more brand colour */
  mix-blend-mode: color;
  pointer-events: none;
}
```

## Linter notes

- Duotone treatments applied in the flagged SLOP-GRADIENT hue bands (hue-rotate values
  that produce indigo/violet or purple/pink tones) carry the same `SLOP-GRADIENT` risk as
  mesh gradients in those bands. The treatment is applied to an image rather than a
  background, so the `SLOP-GRADIENT` rule does not fire directly — but the aesthetic
  outcome (a purple-tinted image on a purple gradient background) reads as the same AI-
  default visual language. Record the colour choice if it lands in those bands.

- The `mix-blend-mode: color` approach requires the parent to have `isolation: isolate` set.
  Without the stacking context, the blend mode may affect elements outside the intended
  container. Always verify the containment before shipping.

- Duotone treatments reduce effective contrast for users with colour vision deficiencies.
  After applying a treatment, run `omd check` to verify that any text overlaid on the
  duotone image still meets 4.5:1 contrast. The treatment changes the image's luminance
  distribution; a dark duotone image may produce lower contrast than the untreated version.

## Do not combine with

**noise-grain-texture.md at opacity above 8%** — grain over a duotone image creates
triple-layered processing (image → duotone filter → grain overlay) that produces an
image that reads as heavily processed rather than treated. Light grain (3–5%) over a
duotone can add material quality; heavy grain obscures the treatment.

**css-illustration-primitives.md on the same visual zone** — a duotone image and a CSS
blob in the same section compete for the decorative register. The treated image is itself
the art-directed visual; a blob behind or over it dilutes its effect.

**Accurate-colour product contexts** — if the image is a product photograph and the
user needs to see the actual colour of the product, do not apply a duotone treatment.
The treatment overrides the image's colour story with the brand's, which is correct
for editorial and brand contexts and incorrect for product accuracy contexts.
