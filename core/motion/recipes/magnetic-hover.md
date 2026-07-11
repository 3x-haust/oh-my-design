# Magnetic hover

A magnetic hover element attracts the pointer toward its centre as the cursor approaches
within a defined radius, then snaps back when the cursor exits. The element appears to
pull the cursor toward it; the cursor appears to pull the element. The effect reads as
weight and responsiveness in the same gesture.

## When it earns its place / When it does not

Condition: a primary interactive element on a showpiece page — a CTA button, a large
navigation target, a signature link — where the interaction itself is part of the
experience. The magnet makes the element feel alive and responsive in a way that goes
beyond hover states. Portfolio sites, agency landing pages, campaign microsites where
the cursor is a live instrument.

Condition against: any context with more than two or three magnetic elements on screen
simultaneously — multiple magnets competing for the cursor's attention cancel each other
out and the effect reads as chaotic rather than deliberate. Also: buttons in utility UI
where click precision matters (the magnet shifts the perceived centre of the target and
can cause misclicks). Also: mobile devices — there is no pointer to attract.

The technique requires JavaScript because CSS cannot read pointer coordinates. It must
be scoped with `@media (pointer: fine)` so it never activates on touch devices.

## Parameters

```css
:root {
  /* How far (in px) from the element's edge the magnetic field begins. */
  --magnetic-radius: 80px;

  /* Maximum displacement of the element's centre, as a fraction of the element's
     half-width/half-height. 0.3 = moves up to 30% of its own size. */
  --magnetic-strength: 0.4;

  /* Duration of the snap-back when the cursor exits the field. */
  --magnetic-return-duration: 600ms;
  --magnetic-return-ease: var(--ease-out-expo);

  /* Duration of the active tracking (while cursor is in field). Near-instant
     so it reads as direct response, not as lag. */
  --magnetic-follow-duration: 120ms;
  --magnetic-follow-ease: var(--ease-out-circ);
}
```

## Implementation

```html
<div class="magnetic-zone" data-magnetic>
  <button class="cta-button">Get started</button>
</div>
```

```css
.cta-button {
  transition:
    transform var(--magnetic-follow-duration, 120ms) var(--magnetic-follow-ease, ease-out);
  /* will-change is appropriate here: this element is tracked every pointermove
     while the cursor is in the field. Limit to one or two elements. */
  will-change: transform;
}

.cta-button.is-returning {
  transition:
    transform var(--magnetic-return-duration, 600ms) var(--magnetic-return-ease, cubic-bezier(0.16, 1, 0.3, 1));
}

/* Magnetic is desktop-only. On touch, this is a standard button. */
@media (pointer: coarse) {
  .cta-button {
    transition: none;
    will-change: auto;
  }
}
```

```js
// Only run on pointer-fine devices.
if (window.matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll('[data-magnetic]').forEach(attachMagnet);
}

function attachMagnet(zone) {
  const el = zone.querySelector('button, a, [data-magnetic-target]') ?? zone;

  // Read strength from CSS custom property.
  const strength = parseFloat(
    getComputedStyle(document.documentElement)
      .getPropertyValue('--magnetic-strength')
  ) || 0.4;

  const radius = parseFloat(
    getComputedStyle(document.documentElement)
      .getPropertyValue('--magnetic-radius')
  ) || 80;

  function onMove(e) {
    const rect = zone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const fieldRadius = Math.max(rect.width, rect.height) / 2 + radius;

    if (dist < fieldRadius) {
      el.classList.remove('is-returning');
      const pull = (1 - dist / fieldRadius) * strength;
      const x = dx * pull;
      const y = dy * pull;
      el.style.transform = `translate(${x}px, ${y}px)`;
    } else {
      release();
    }
  }

  function release() {
    el.classList.add('is-returning');
    el.style.transform = '';
    // Remove is-returning after transition completes.
    el.addEventListener('transitionend', () => el.classList.remove('is-returning'), { once: true });
  }

  zone.addEventListener('pointermove', onMove, { passive: true });
  zone.addEventListener('pointerleave', release, { passive: true });
}
```

## React

```tsx
import { useRef, useCallback, useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

function MagneticButton({
  children,
  strength = 0.4,
  radius = 80,
}: {
  children: React.ReactNode;
  strength?: number;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Spring physics give the magnet a more physical feel than a CSS transition.
  const springConfig = { stiffness: 300, damping: 20, mass: 0.5 };
  const x = useSpring(0, springConfig);
  const y = useSpring(0, springConfig);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const fieldRadius = Math.max(rect.width, rect.height) / 2 + radius;
    const pull = Math.max(0, (1 - dist / fieldRadius) * strength);
    x.set(dx * pull);
    y.set(dy * pull);
  }, [strength, radius, x, y]);

  const onLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ display: 'inline-block' }}
    >
      <motion.div style={{ x, y }}>
        {children}
      </motion.div>
    </div>
  );
}
```

## Reduced-motion variant

In reduced-motion context, the magnetic behaviour is disabled entirely. The element
is a standard button with a straightforward hover state. No transform tracking,
no pointer-move listener.

```css
@media (prefers-reduced-motion: reduce) {
  .cta-button {
    transition: none !important;
    transform: none !important;
    will-change: auto;
  }
}
```

In JS, guard the setup:

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointerFine = window.matchMedia('(pointer: fine)').matches;

if (pointerFine && !prefersReduced) {
  document.querySelectorAll('[data-magnetic]').forEach(attachMagnet);
}
```

## Performance note

The pointer-move handler updates `transform: translate()` — a compositor-only property.
The `will-change: transform` on the magnetic element is justified here: the element
is actively animating on every pointer-move event while the cursor is within the field.
This is not speculative `will-change`; it is applied to an element that is known to
animate continuously during a user interaction.

Limit magnetic elements to one or two per page. Each active magnetic element with
`will-change: transform` occupies a compositor layer; more than three simultaneous
layers on this pattern consumes measurable GPU memory on mobile hardware — even though
the magnet never activates on mobile, the CSS `will-change` still promotes the layer
on all breakpoints unless scoped with `@media (pointer: fine)`.

The `{ passive: true }` flag on `pointermove` is critical — without it, the browser
cannot optimise scroll performance because it must wait for the handler to confirm it
will not call `preventDefault()`.
