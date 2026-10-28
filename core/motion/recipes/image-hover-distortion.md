# Image hover distortion

An image hover distortion applies a CSS filter shift, clip-path animation, or both when
the user hovers an image — desaturating it toward monochrome, applying a blur that
clears on hover, or using a clip-path polygon that contracts to reveal the image at full
quality. No WebGL or canvas is required. CSS keeps the implementation progressively
enhanceable, but `filter` and `clip-path` still need profiling on the target browsers and
devices.

## When it earns its place / When it does not

Condition: a gallery or portfolio grid where the hover state deepens engagement before
the user clicks. The distortion frames the hover moment as a discovery — the image
reveals itself to the pointer. Effective on showpiece pages where the image is a subject,
not a container. `expressive.md`: "A gallery or portfolio grid where the hover state
deepens engagement with a piece before the user clicks."

Condition against: product images where accuracy matters — e-commerce, documentation,
any context where the image is evidence rather than atmosphere. Distorting a product
photo misleads the user about what they are buying or reading. Also: navigation
thumbnails where the user needs to read text overlaid on the image — the distortion
degrades the legibility of the label. Also inspect small rendered images directly;
clip-path animation can expose aliasing depending on size, scale, and browser.

The values below use a quick filter response and a slightly longer clip reveal as an
illustrative pairing. They are not perception thresholds: tune the transition to the
visual distance and preserve immediate feedback that the hover or focus state changed.

## Parameters

```css
:root {
  /* Filter applied in the resting state (before hover).
     Greyscale + slight desaturation is a common pre-hover treatment. */
  --distort-filter-rest:  grayscale(0.6) brightness(0.9);

  /* Filter in the hover state. Identity = no filter effect. */
  --distort-filter-hover: grayscale(0) brightness(1);

  /* Example duration for a quick filter response. */
  --distort-filter-duration: 120ms;
  --distort-filter-ease: var(--ease-out-circ);

  /* Clip-path inset values: resting (slightly cropped) vs. hover (full reveal). */
  --distort-clip-rest:  inset(8% round 4px);
  --distort-clip-hover: inset(0%  round 0px);

  /* Example clip-path duration; it may be slightly longer than the filter. */
  --distort-clip-duration: 200ms;
  --distort-clip-ease: var(--ease-out-expo);
}
```

## Implementation

```html
<figure class="gallery-item">
  <div class="image-distort">
    <img src="work-1.jpg" alt="Case study: Meridian brand identity" loading="lazy">
  </div>
  <figcaption>Meridian</figcaption>
</figure>
```

```css
.image-distort {
  overflow: hidden;
  /* Contain the clip-path change. */
  border-radius: 4px;
}

.image-distort img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;

  /* Apply both filter and clip-path in resting state. */
  filter: var(--distort-filter-rest);
  clip-path: var(--distort-clip-rest);

  transition:
    filter   var(--distort-filter-duration) var(--distort-filter-ease),
    clip-path var(--distort-clip-duration)  var(--distort-clip-ease);

}

/* Hover state: full reveal. */
.image-distort:hover img,
.image-distort:focus-within img {
  filter: var(--distort-filter-hover);
  clip-path: var(--distort-clip-hover);
}

/* Scale variant: subtle zoom instead of clip-path. Use one or the other. */
.image-distort--scale img {
  transform: scale(1.04);
  clip-path: none;
  transition:
    filter    var(--distort-filter-duration) var(--distort-filter-ease),
    transform var(--distort-clip-duration)   var(--distort-clip-ease);
}

.image-distort--scale:hover img,
.image-distort--scale:focus-within img {
  filter: var(--distort-filter-hover);
  transform: scale(1);
}
```

## React

```tsx
import { motion } from 'framer-motion';

const imageVariants = {
  rest: {
    filter: 'grayscale(0.6) brightness(0.9)',
    clipPath: 'inset(8% round 4px)',
    transition: { duration: 0.12, ease: [0, 0.55, 0.45, 1] }, // ease-out-circ
  },
  hover: {
    filter: 'grayscale(0) brightness(1)',
    clipPath: 'inset(0% round 0px)',
    transition: {
      filter:   { duration: 0.12, ease: [0, 0.55, 0.45, 1] },
      clipPath: { duration: 0.20, ease: [0.16, 1, 0.3, 1] }, // ease-out-expo
    },
  },
};

function GalleryItem({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <motion.figure initial="rest" whileHover="hover" style={{ margin: 0 }}>
      <div style={{ overflow: 'hidden', borderRadius: 4 }}>
        <motion.img
          src={src}
          alt={alt}
          variants={imageVariants}
          style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover' }}
          loading="lazy"
        />
      </div>
      <figcaption>{caption}</figcaption>
    </motion.figure>
  );
}
```

## Reduced-motion variant

In reduced-motion context, the hover state is still distinct — but achieved with an
instant opacity or border change rather than an animated filter or clip-path transition.
The image is always fully visible; no distortion is applied.

```css
@media (prefers-reduced-motion: reduce) {
  .image-distort img {
    filter: none;
    clip-path: none;
    transition: none;
    will-change: auto;
  }

  /* Provide a non-motion hover signal: a simple opacity change. */
  .image-distort:hover img,
  .image-distort:focus-within img {
    opacity: 0.85;
  }
}
```

## Performance note

`filter` and `clip-path` do not change document geometry, but they can still require
painting, rasterization, memory, or compositor work. A transform or `will-change` hint
does not guarantee GPU execution or smooth frame delivery. Profile the real image size
and effect; add `will-change` only when a measured problem improves, and remove it when
the interaction ends.

Do not animate `border-radius` on the image itself — this causes the browser to
recalculate the clip geometry on every frame. `clip-path: inset(... round ...)` can
express the same visual shape without changing layout, but its paint/compositing path is
browser-dependent. Wrap the image in `overflow: hidden` on the parent to handle the
visual boundary.

`clip-path` animation between two `inset()` values is broadly supported and interpolable.
Verify smoothness on the target content and browsers. Avoid
animating between two `polygon()` clip-paths unless the polygon point count is identical
in both states. Mismatched vertex counts do not meet polygon interpolation requirements;
do not promise an automatic cross-fade fallback.
