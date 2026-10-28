# Page loader

A page loader covers the initial render while assets load, then exits — revealing the
page underneath as an entrance rather than a progressive paint. It is the opening
sentence of the experience: the palette commits, the type register declares itself, the
motion vocabulary introduces itself. A loader is still extra interface work and can hide
content that is already ready, so it should represent a real loading state rather than a
ceremonial delay.

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

Exit as soon as the required content is ready. Do not impose a minimum hold so the
entrance can finish its ceremony: if readiness happens before the loader meaningfully
appears, remove it. Nielsen's 0.1/1/10-second response-time guidance concerns system
feedback and attention, not fixed animation-duration boundaries. A maximum timeout may
prevent a broken loader from trapping the page, but it is a recovery path rather than a
substitute for an honest readiness signal.

## Parameters

```css
:root {
  /* Recovery timeout before the loader forces exit regardless of load state. */
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

<main class="page-content" id="page">
  <!-- page content -->
</main>
```

```css
.page-loader {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: none;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-dark, #0a0a0a);
  color: var(--color-text-dark, #fff);
}

.page-loader.is-loading {
  display: flex;
}

.page-loader.is-exiting {
  pointer-events: none;
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
  opacity: 1;
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
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (document.readyState === 'complete' || reduced.matches) {
    loader.remove();
    return;
  }
  loader.classList.add('is-loading');

  // Read token values from :root.
  const root = document.documentElement;
  const maxHold = parseFloat(getComputedStyle(root).getPropertyValue('--loader-hold-max')) || 2400;

  let exiting = false;
  let maxTimer;

  function remove() {
    clearTimeout(maxTimer);
    window.removeEventListener('load', handleReady);
    reduced.removeEventListener('change', handlePreference);
    loader.remove();
  }

  function exit() {
    if (exiting) return;
    exiting = true;
    loader.classList.add('is-exiting');
    loader.setAttribute('aria-hidden', 'true');
    page.classList.add('is-visible');
    const animations = loader.getAnimations();
    if (animations.length === 0) remove();
    else Promise.allSettled(animations.map(animation => animation.finished)).then(remove);
  }

  // Recovery bound: do not let a failed readiness signal trap the page.
  maxTimer = setTimeout(exit, maxHold);

  function handleReady() {
    clearTimeout(maxTimer);
    exit();
  }

  function handlePreference() {
    if (reduced.matches) remove();
  }
  window.addEventListener('load', handleReady, { once: true });
  reduced.addEventListener('change', handlePreference);
})();
```

## React

```tsx
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useState, useEffect } from 'react';

function PageLoader() {
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    function handleLoad() {
      setVisible(false);
    }

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      setVisible(true);
      window.addEventListener('load', handleLoad, { once: true });
    }

    // Recovery timeout if the readiness signal never arrives.
    const timeout = setTimeout(() => setVisible(false), 2400);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('load', handleLoad);
    };
  }, []);

  if (reduced) return null;

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

The loader is `position: fixed`, covering the entire viewport. It can add paint,
rasterization, memory, and accessibility cost while obscuring useful progress beneath
it. The exit uses `transform` and `opacity`, which usually avoid layout work, but smooth
delivery still depends on the page, device, and browser. Profile the real entrance
rather than treating the overlay as a performance optimization.

Remove the loader element from the DOM (`loader.remove()`) after the exit transition
completes. A `position: fixed; z-index: 1000` element left in the DOM blocks pointer
events on the content below it even when visually transparent, which produces
interactions that appear broken without any visible explanation.
