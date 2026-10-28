# Split-text entrance (character / word stagger)

Split-text is the technique of decomposing a heading into individual `<span>` elements —
one per character or one per word — then staggering their entrance via a CSS animation
delay cascade. Each fragment arrives fractionally after the last, so the text assembles
itself in front of the viewer rather than appearing complete.

## When it earns its place / When it does not

Condition: the hero type is the primary visual event and the words are part of the concept
— something is being said, not just displayed. A heading that reads "The infrastructure
that disappears" reveals meaning word by word; each word lands with intent. The reveal
enacts the concept.

Condition against: body copy, UI labels, secondary headings, navigation items, any text
the user needs to skim or operate. Split-text on body copy converts reading into waiting
— the user must watch the paragraph assemble itself before they can begin. It is the most
common technique deployed too broadly. The `expressive.md` technique catalogue states
this directly: "Split-text on body copy turns reading into waiting." The stagger budget
is consumed by the entrance; there is nothing left for the content. One hero element per
page is a useful house-style starting point, not a universal effect quota.

Character-level stagger is more dramatic than word-level. It is often clearer at large
display sizes where characters read as distinct forms; word-level stagger is usually
less noisy at smaller sizes. Choose from the actual typeface, phrase, and reading task
rather than a fixed pixel threshold.

## Parameters

```css
:root {
  /* Duration for each character/word span's fade-translate entrance. */
  --duration-split: 480ms;

  /* Easing for each span. ease-out-expo reads as authoritative; ease-out-quint
     slightly softer. Both from core/motion/easing.md. */
  --ease-split: var(--ease-out-expo);

  /* Example delay between successive spans. 40–80ms is a commonly useful
     exploration range, not a perception threshold; test the actual type and phrase. */
  --stagger-split: 55ms;

  /* Vertical offset the span travels from on entrance. Keep small — 16–24px.
     Larger values read as falling rather than arriving. */
  --translate-split: 20px;
}
```

## Implementation

```html
<!-- The heading must have complete text content in the HTML. The JS adds spans;
     if it fails or is disabled, the text reads normally. -->
<h1 class="split-hero" aria-label="The infrastructure that disappears">
  The infrastructure that disappears
</h1>
```

```css
.split-hero .split-char,
.split-hero .split-word {
  display: inline-block; /* required: transform does not apply to inline */
  opacity: 0;
  transform: translateY(var(--translate-split));
  animation: split-enter var(--duration-split) var(--ease-split) forwards;
  animation-play-state: paused; /* JS un-pauses after splitting */
}

@keyframes split-enter {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Space characters must be preserved as visible spans or words gap wrong */
.split-hero .split-space {
  display: inline-block;
  white-space: pre;
}
```

```js
// Split at word level (swap 'word' for 'char' for character-level stagger).
// Run once on DOMContentLoaded — not on scroll, not on re-render.
function splitTextEntrance(el, mode = 'word') {
  const text = el.textContent ?? '';
  const units = mode === 'char'
    ? [...text].map(ch => ({ text: ch, isSpace: ch === ' ' }))
    : text.split(' ').map((w, i, arr) => ({ text: w, isSpace: false, addSpace: i < arr.length - 1 }));

  el.textContent = '';
  units.forEach(({ text, isSpace, addSpace }, i) => {
    if (isSpace) {
      const sp = document.createElement('span');
      sp.className = 'split-space';
      sp.textContent = ' ';
      el.appendChild(sp);
      return;
    }
    const span = document.createElement('span');
    span.className = mode === 'char' ? 'split-char' : 'split-word';
    span.textContent = text;
    // Each span's delay is its index × the stagger custom property value.
    // Read the value from the root so the hand's token wiring is respected.
    const stagger = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--stagger-split')) || 55;
    span.style.animationDelay = `${i * stagger}ms`;
    span.style.animationPlayState = 'running';
    el.appendChild(span);
    if (addSpace) {
      const sp = document.createElement('span');
      sp.className = 'split-space';
      sp.textContent = ' ';
      el.appendChild(sp);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.split-hero').forEach(el => splitTextEntrance(el, 'word'));
});
```

## React

```tsx
import { motion } from 'framer-motion';

// Framer Motion handles the span decomposition via staggerChildren.
// variants.container drives the orchestration; variants.item drives each word.
const container = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.055, // --stagger-split equivalent
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.48, // --duration-split equivalent
      ease: [0.16, 1, 0.3, 1], // --ease-out-expo
    },
  },
};

function SplitHero({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <motion.h1
      aria-label={text}
      variants={container}
      initial="hidden"
      animate="visible"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25em' }}
    >
      {words.map((word, i) => (
        <motion.span key={i} variants={item} style={{ display: 'inline-block' }}>
          {word}
        </motion.span>
      ))}
    </motion.h1>
  );
}
```

Framer Motion respects `prefers-reduced-motion` automatically when you pass
`reducedMotion="user"` to `<MotionConfig>` at the app root. Add this once:

```tsx
import { MotionConfig } from 'framer-motion';
// In your root layout:
<MotionConfig reducedMotion="user">{children}</MotionConfig>
```

## Reduced-motion variant

When `prefers-reduced-motion: reduce` is set, the text must be complete and legible —
not an empty space, not a deferred render. The split spans are not created; the heading
renders as normal text without the staggered motion.

```css
@media (prefers-reduced-motion: reduce) {
  .split-hero .split-char,
  .split-hero .split-word {
    /* Collapse all spans to visible immediately — no transform, no stagger. */
    opacity: 1;
    transform: none;
    animation: none;
  }
}
```

In the JS split function, check before splitting:

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced) {
  document.querySelectorAll('.split-hero').forEach(el => splitTextEntrance(el, 'word'));
}
```

## Performance note

Each span animates `opacity` and `transform: translateY()`, which usually avoids layout
changes. It does not guarantee GPU execution or zero main-thread, paint, or memory cost;
profile the real span count, font, and effects.

`will-change: transform` on every span would promote each to its own compositor layer,
consuming memory if the browser creates separate layers. Do not apply `will-change` to
every span by default; add it only if profiling the actual heading shows a benefit.

The JS runs once on `DOMContentLoaded`. It does not run on scroll, on re-render, or
on visibility change. The spans are DOM elements for the lifetime of the page; there is
no teardown cost.
