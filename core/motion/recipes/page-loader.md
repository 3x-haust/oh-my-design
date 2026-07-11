# Page loader

A page loader covers the initial render while assets load, then exits — revealing the
page underneath as an entrance rather than a progressive paint. It is the opening
sentence of the experience: the palette commits, the type register declares itself, the
motion vocabulary introduces itself. Done well, the loader adds nothing to the perceived
wait time; done badly, it is the first thing the user resents.

## When it earns its place / When it does not

Condition: a showpiece page where the entrance is part of the experience — a campaign
microsite, an agency portfolio, a product launch with a single CTA. The loader must do
something with its time: commit the palette, reveal the type register, establish that
this is not a default page. `expressive.md`: "What the entrance must do in those
seconds: commit the palette, declare the type register, establish the motion vocabulary.
A loader that is only a spinner followed by a page reveal has wasted the three seconds
it consumed."

Condition against: product UI, tools, documentation, any page the user came to operate
rather than experience. A dashboard that holds the user behind a loader for 300ms on
every visit is spending attention budget the user did not agree to spend. Also: any page
where asset load time is variable and potentially fast — a loader on a sub-100ms page
load adds the only delay the user experiences.

The hard rule: the loader must exit no later than 300ms after the `load` event fires.
`expressive.md` and `core/theory/motion.md` both state the outer bound: three seconds
total, under one second as the performance target. A loader that runs independent of
asset load time — a fixed-duration animation that plays regardless — is spending the
user's attention against an arbitrary clock. Tie the exit to the `load` event with a
minimum hold of 300ms (so the entrance reads as intentional, not as a flash) and a
maximum of 3000ms (absolute outer bound).

## Parameters

```css
:root {
  /* Minimum time the loader holds even if the page loads faster.
     Below this, the loader reads as a flash rather than an entrance. */
  --loader-hold-min: 300ms;

  /* Maximum time before the loader forces exit regardless of load state. */
  --loader-hold-max: 2400ms;

  /* Duration of the loader's exit animation. */
  --loader-exit-duration: 480ms;

  /* Easing for the exit. ease-in reads as deliberate departure. */
  --loader-exit-ease: var(--ease-in-expo);

  /* Duration for the page's entrance after the loader exits. */
  --loader-page-enter-duration: 360ms;
  --loader-page-enter-ease: var(--ease-out-quint);
}
```

## Implementation

```html
<!-- Loader sits above the page content. -->
<div class="page-loader" id="loader" aria-live="polite" aria-label="Loading">
  <div class="loader-inner">
    <!-- Commit the brand: a logotype, a single word, a colour field.
         Not a spinner — a statement. -->
    <span class="loader-wordmark">Studio</span>
  </div>
</div>

<main class="page-content" id="page" style="opacity: 0;">
  <!-- page content -->
</main>
```

```css
.page-loader {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-dark, #0a0a0a);
  color: var(--color-text-dark, #fff);
}

.page-loader.is-exiting {
  animation: loader-exit var(--loader-exit-duration) var(--loader-exit-ease) forwards;
}

@keyframes loader-exit {
  to {
    opacity: 0;
    /* Slide up or clip — choose one and wire it to the concept. */
    transform: translateY(-100%);
  }
}

.page-content {
  transition: opacity var(--loader-page-enter-duration) var(--loader-page-enter-ease);
}

.page-content.is-visible {
  opacity: 1;
}
```

```js
(function () {
  const loader = document.getElementById('loader');
  const page = document.getElementById('page');
  if (!loader || !page) return;

  // Read token values from :root.
  const root = document.documentElement;
  const minHold = parseFloat(getComputedStyle(root).getPropertyValue('--loader-hold-min')) || 300;
  const maxHold = parseFloat(getComputedStyle(root).getPropertyValue('--loader-hold-max')) || 2400;
  const exitDuration = parseFloat(getComputedStyle(root).getPropertyValue('--loader-exit-duration')) || 480;

  let loadFired = false;
  let startTime = Date.now();

  function exit() {
    loader.classList.add('is-exiting');
    loader.setAttribute('aria-hidden', 'true');
    page.classList.add('is-visible');
    setTimeout(() => loader.remove(), exitDuration);
  }

  function maybeExit() {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, minHold - elapsed);
    setTimeout(exit, remaining);
  }

  // Absolute outer bound — never hold longer than --loader-hold-max.
  const maxTimer = setTimeout(exit, maxHold);

  window.addEventListener('load', () => {
    clearTimeout(maxTimer);
    maybeExit();
  });
})();
```

## React

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

function PageLoader({ minHold = 300 }: { minHold?: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const start = Date.now();

    function handleLoad() {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, minHold - elapsed);
      setTimeout(() => setVisible(false), delay);
    }

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad, { once: true });
    }

    // Absolute maximum — never hold beyond 2.4s
    const timeout = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(timeout);
  }, [minHold]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="loader"
          style={{ position: 'fixed', inset: 0, zIndex: 1000,
                   display: 'flex', alignItems: 'center', justifyContent: 'center',
                   backgroundColor: 'var(--color-bg-dark)' }}
          exit={{
            opacity: 0,
            y: '-100%',
            transition: { duration: 0.48, ease: [0.7, 0, 0.84, 0] }, // ease-in-expo
          }}
          aria-label="Loading"
          role="status"
        >
          <span style={{ color: 'var(--color-text-dark)' }}>Studio</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

## Reduced-motion variant

In reduced-motion context, the loader exits immediately without an animated transition.
The page is visible from the start — no hold, no entrance animation.

```css
@media (prefers-reduced-motion: reduce) {
  .page-loader {
    display: none;
  }

  .page-content {
    opacity: 1;
    transition: none;
  }
}
```

In the JS, check before adding any classes:

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (prefersReduced) {
  loader.remove();
  page.style.opacity = '1';
  return; // skip the entire loader
}
```

## Performance note

The loader is `position: fixed`, covering the entire viewport. While it is visible, the
content beneath it does not need to paint — the browser can defer content paint until
the loader exits. In practice this is a performance advantage: the actual page content
renders in parallel with the loader's animation and is ready when the loader clears.

The exit animation uses `transform: translateY(-100%)` and `opacity` — both compositor
properties. The loader exits smoothly even if the main thread is busy parsing content
beneath it.

Remove the loader element from the DOM (`loader.remove()`) after the exit transition
completes. A `position: fixed; z-index: 1000` element left in the DOM blocks pointer
events on the content below it even when visually transparent, which produces
interactions that appear broken without any visible explanation.
