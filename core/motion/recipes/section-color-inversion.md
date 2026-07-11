# Section colour inversion

A section colour inversion swaps the page's colour scheme — dark background to light,
or light to dark — at a specific scroll threshold, marking a conceptual pivot in the
content. The background and text colours switch together so the palette inverts as a
unit rather than changing element by element.

## When it earns its place / When it does not

Condition: the scroll narrative has a turn — a moment where the register shifts to mark
a conceptual pivot. The inversion must correspond to a narrative event: a before/after
split, a transition from problem to solution, a shift from the user's world to the
product's. The colour change makes the pivot felt as well as read. `expressive.md`:
"The inversion makes the change visible and felt, not just read. One inversion per page
is usually correct; more than one is a rhythm, not a pivot."

Condition against: arbitrary decoration. Using two inversions because the page has three
sections reads as a pattern, not a moment — the technique has been applied to a grid
rather than a concept. Also: inversion without a corresponding narrative event is visual
noise. If you cannot complete the sentence "This is where the page pivots from __ to __",
the inversion does not belong.

The cost: users who have accessibility settings that invert colours or use high-contrast
modes will double-invert. Test in Windows High Contrast and macOS Invert Colours modes.

## Parameters

```css
:root {
  /* The two poles of the inversion. Board-sourced tokens — never raw hex here. */
  --color-bg-light: var(--surface-primary);    /* light section background */
  --color-text-light: var(--text-primary);     /* light section text */
  --color-bg-dark: var(--surface-inverse);     /* dark section background */
  --color-text-dark: var(--text-inverse);      /* dark section text */

  /* Duration of the transition when the inversion fires.
     Faster than a typical content transition — the switch should read as a cut,
     not a dissolve. 200–280ms. */
  --duration-invert: 240ms;
  --ease-invert: var(--ease-out-quint);
}
```

## Implementation

The cleanest approach: a `data-theme` attribute on the section toggles between two
CSS variable sets. One IntersectionObserver or scroll-driven animation flips the
attribute. The body or a persistent header that spans sections must respond to the
active section's theme.

```html
<section class="section" data-theme="light">
  <!-- ... light section content ... -->
</section>

<section class="section" data-theme="dark">
  <!-- ... pivot section — the narrative turn ... -->
</section>

<section class="section" data-theme="light">
  <!-- ... resolution section ... -->
</section>

<!-- A persistent header tracks the active section's theme -->
<header class="site-header" data-theme="light"></header>
```

```css
/* Define both poles as CSS variable sets. */
[data-theme="light"] {
  --bg: var(--color-bg-light);
  --text: var(--color-text-light);
  --border: var(--color-border-light, rgba(0,0,0,0.08));
}

[data-theme="dark"] {
  --bg: var(--color-bg-dark);
  --text: var(--color-text-dark);
  --border: var(--color-border-dark, rgba(255,255,255,0.12));
}

.section {
  background-color: var(--bg);
  color: var(--text);
  /* Instant switch — no transition on section background itself. The transition
     is on the header and any sticky element that spans sections. */
}

/* Optional: a very short opacity dip on direct section children softens the
   colour inversion by briefly fading content as the palette switches. This is
   a compositor-only property (opacity) — no layout cost. */
.section > * {
  transition: opacity var(--duration-invert) var(--ease-invert);
}

[data-theme] .section > * {
  opacity: 1;
}

/* The sticky header transitions between themes smoothly. */
.site-header {
  position: sticky;
  top: 0;
  background-color: var(--bg);
  color: var(--text);
  transition:
    background-color var(--duration-invert) var(--ease-invert),
    color var(--duration-invert) var(--ease-invert);
}
```

```js
// Track which section is currently dominant in the viewport and update the header.
function trackSectionThemes() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const sections = document.querySelectorAll('.section[data-theme]');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          const theme = entry.target.getAttribute('data-theme');
          if (theme) header.setAttribute('data-theme', theme);
        }
      });
    },
    { threshold: 0.5 }
  );

  sections.forEach((s) => observer.observe(s));
}

document.addEventListener('DOMContentLoaded', trackSectionThemes);
```

## React

```tsx
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Theme = 'light' | 'dark';

function useActiveTheme(sections: React.RefObject<HTMLElement>[]) {
  const [activeTheme, setActiveTheme] = useState<Theme>('light');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const theme = (entry.target as HTMLElement).dataset.theme as Theme;
            if (theme) setActiveTheme(theme);
          }
        });
      },
      { threshold: 0.5 }
    );

    sections.forEach((ref) => {
      if (ref.current) observer.observe(ref.current);
    });

    return () => observer.disconnect();
  }, [sections]);

  return activeTheme;
}

function SiteHeader({ theme }: { theme: Theme }) {
  return (
    <motion.header
      animate={{
        backgroundColor: theme === 'dark' ? 'var(--color-bg-dark)' : 'var(--color-bg-light)',
        color: theme === 'dark' ? 'var(--color-text-dark)' : 'var(--color-text-light)',
      }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: 'sticky', top: 0 }}
    >
      {/* header content */}
    </motion.header>
  );
}
```

## Reduced-motion variant

The sections retain their different background colours — the inversion is a layout
choice, not purely a motion effect. The transition on the header is removed so the
switch is instant rather than animated.

```css
@media (prefers-reduced-motion: reduce) {
  .site-header {
    transition: none;
  }
}
```

The IntersectionObserver continues to run and update the `data-theme` attribute (correct
behaviour — the sections genuinely have different themes). Only the animated transition
is removed.

## Performance note

Background colour transitions on a sticky header trigger the paint step but not the
layout step — the dimensions of the header do not change. On modern browsers this is
GPU-composited for elements with `will-change: transform` already applied (a sticky
element implicitly gets this in most implementations). The transition is not on
`transform` or `opacity`, so it is not off-thread, but the paint cost for a single
header background colour change is negligible.

Do not animate `color` on large blocks of text — at scale this triggers text-specific
paint operations on every frame. The inversion pattern here transitions only the header's
colour; section backgrounds switch instantly (no transition on `.section` itself).
