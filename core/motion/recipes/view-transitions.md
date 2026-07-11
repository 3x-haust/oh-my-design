# View transitions

The View Transitions API (`document.startViewTransition()`) enables animated transitions
between page states or between full pages — fading, sliding, morphing — with the browser
capturing before and after snapshots and interpolating between them. Named transitions
allow specific elements to be tracked: a card thumbnail that expands into a detail page,
a heading that persists across a route change.

## When it earns its place / When it does not

Condition: a multi-page site or SPA where navigating between pages currently produces
an abrupt content swap. View transitions convert the abrupt swap into a continuous
spatial move — the user always understands where they came from and where they went.
Particularly effective for: image-detail expansions (thumbnail → full page), list-to-
detail navigations (article index → article), and route changes where a persistent
element (the site header, a product image) should appear to carry across.

Condition against: pages where navigation is rare and the content replacement is self-
explanatory — a settings page, a dashboard tab switch that is already instant. Also:
applications with complex, frequent state changes (a real-time data feed, a drag-and-
drop interface) where capturing before/after snapshots introduces visible latency. The
API captures a screenshot of the leaving state; on content-heavy pages this screenshot
capture is measurable and should be profiled before committing.

The technique is progressive enhancement: browsers without View Transitions API support
navigate normally without any animation. Never block navigation on this feature.

## Parameters

```css
/* View transition durations are set as ::view-transition-* pseudo-element rules,
   not as custom properties on :root. But document the values here for the hand
   to wire from the board's motion invariants. */

:root {
  /* Duration for the default cross-fade (root view transition). */
  --vt-duration: 280ms;

  /* Duration for named element transitions (e.g., card → detail morph). */
  --vt-named-duration: 380ms;

  /* Easing for entering elements. */
  --vt-enter-ease: var(--ease-out-expo);

  /* Easing for exiting elements. */
  --vt-exit-ease: var(--ease-in-quint);
}
```

## Implementation

```css
/* ── Default cross-fade (applies to the entire page swap) ─────────────────── */

/* The browser's built-in view-transition cross-fade animates opacity from 1→0
   (old) and 0→1 (new). Override duration and easing; the opacity animation is
   provided by the UA stylesheet and runs as a compositor-only operation. */
::view-transition-old(root) {
  animation-duration: var(--vt-duration);
  animation-timing-function: var(--vt-exit-ease);
  /* Explicit declaration for clarity — matches the UA default: */
  animation-name: -ua-view-transition-fade-out;
}

::view-transition-new(root) {
  animation-duration: var(--vt-duration);
  animation-timing-function: var(--vt-enter-ease);
  animation-name: -ua-view-transition-fade-in;
}

/* Custom fade-out / fade-in keyframes for full control over opacity. */
@keyframes vt-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes vt-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Apply custom keyframes instead of UA defaults when you need explicit control: */
/* ::view-transition-old(root) { animation-name: vt-fade-out; } */
/* ::view-transition-new(root) { animation-name: vt-fade-in;  } */

/* ── Named transition: card thumbnail → detail hero ───────────────────────── */

/* On the list page: mark the card image as a named participant. */
.card-image[data-vt-id] {
  view-transition-name: attr(data-vt-id); /* set dynamically per item */
}

/* On the detail page: the hero image carries the same view-transition-name. */
.detail-hero-image {
  view-transition-name: card-detail-hero; /* set via JS to match the source */
}

/* Customise the named element's transition independently from the page fade. */
::view-transition-old(card-detail-hero),
::view-transition-new(card-detail-hero) {
  animation-duration: var(--vt-named-duration);
  animation-timing-function: var(--vt-enter-ease);
}

::view-transition-group(card-detail-hero) {
  /* The group animation is the morph between source and target positions/sizes.
     Browser handles the interpolation; we set the duration and easing. */
  animation-duration: var(--vt-named-duration);
  animation-timing-function: var(--vt-enter-ease);
}
```

```js
// Multi-page (MPA) view transitions — triggered on link click.
// The `@view-transition { navigation: auto; }` CSS rule handles this in supporting
// browsers automatically. Add the rule and the browser does the rest.

// For programmatic control or SPA route changes:
async function navigateWithTransition(url) {
  if (!document.startViewTransition) {
    // Fallback: navigate normally.
    window.location.href = url;
    return;
  }

  // Set the named view-transition-name on the element that will morph.
  // (Example: clicked card sets its image's view-transition-name before the transition.)
  const transition = document.startViewTransition(async () => {
    // Swap the DOM content (fetch new page, update router, etc.)
    await fetch(url).then(/* ... update DOM ... */);
  });

  // Handle transition completion for cleanup.
  await transition.finished;
}

// For MPA with CSS-only activation:
// Add this to your CSS and the browser handles it without JavaScript:
```

```css
/* MPA automatic view transitions (Chrome 126+, no JS required): */
@view-transition {
  navigation: auto;
}
```

## React

```tsx
// React Router 6.28+ has built-in View Transitions support via unstable_viewTransition.
// For earlier versions or custom implementations:

import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';

function useViewTransitionNavigate() {
  const navigate = useNavigate();

  return useCallback((to: string, options?: Parameters<typeof navigate>[1]) => {
    if (!document.startViewTransition) {
      navigate(to, options);
      return;
    }

    document.startViewTransition(() => {
      navigate(to, options);
    });
  }, [navigate]);
}

// Usage: assign view-transition-name on the element that should morph.
function CardItem({ id, image, title }: { id: string; image: string; title: string }) {
  const navigate = useViewTransitionNavigate();

  return (
    <article
      onClick={() => navigate(`/work/${id}`)}
      style={{ cursor: 'pointer' }}
    >
      <img
        src={image}
        alt={title}
        // The name links this element to its counterpart on the detail page.
        style={{ viewTransitionName: `card-image-${id}` }}
      />
    </article>
  );
}

// On the detail page:
function WorkDetail({ id }: { id: string }) {
  return (
    <img
      src={`/images/${id}-hero.jpg`}
      alt=""
      style={{ viewTransitionName: `card-image-${id}` }}
    />
  );
}
```

## Reduced-motion variant

When `prefers-reduced-motion: reduce` is active, the view transition should use an
instant switch or a very short cross-fade — not the full animated morph.

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
  }
}
```

This preserves the API's before/after snapshot mechanism (which prevents content flash
during SPA navigation) while removing the perceptible animation. Users get a fast,
clean swap without motion.

## Performance note

`document.startViewTransition()` captures a screenshot of the current page state before
making changes. On content-heavy pages, this screenshot capture is measurable — profile
it before committing. The transition itself (the CSS animation between old and new
states) runs off the main thread for elements with composited properties.

Named transitions (`view-transition-name`) promote an element to its own compositor
layer during the transition. This is correct behaviour — the element needs to animate
independently from the page content around it. Remove or clear `view-transition-name`
on elements that are not currently transitioning; permanently promoted layers consume
GPU memory without benefit.

Unique `view-transition-name` values are required across all simultaneously visible
named elements. Two elements with the same `view-transition-name` produce undefined
behaviour. When setting names dynamically (e.g., per-card IDs), ensure the ID is stable
and unique across the page.
