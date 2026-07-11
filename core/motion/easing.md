# Easing vocabulary — curated token set

The keyword easings shipped in CSS (`ease`, `ease-in`, `ease-out`, `ease-in-out`) are
not a vocabulary — they are placeholders. A design system that stops there has one word
for every kind of change. This file establishes the curated set this system uses, with
the semantic reasoning for each curve and the register it belongs to.

Cross-reference: `core/theory/motion.md` explains the semantics of ease-out vs. ease-in
vs. ease-in-out in detail. The tokens below are the *specific curves* — the parameterised
forms — that belong to each semantic slot. Recipes reference these tokens directly;
hardcoding cubic-bezier values in a component is the same defect as a hardcoded hex colour.

---

## The token set

### Arrivals (ease-out family)

```css
:root {
  /* Expo: fast onset, long tail. The object arrives with authority and settles precisely.
     Reads as: the system heard you immediately. Use for: hero entrances, overlay opens,
     drawer slides, any element arriving from outside the viewport.
     Register: showpiece, confident. The snappiest of the out-curves.
     Antonym of 500ms ease-in-out: where that reads generated, this reads decided. */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);

  /* Quint: softer onset than expo, same long tail. Slightly less authoritative,
     slightly more graceful. Use for: content reveals, card entrances, scroll-triggered
     elements that should arrive without demanding attention.
     Register: confident, showpiece. */
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);

  /* Back: overshoots the target, rebounds to rest. The object lands with a bounce.
     Use for: playful UI, game-adjacent contexts, elements whose concept includes
     elasticity. Not appropriate for utility UI — the overshoot reads as imprecision in
     a product the user came to operate.
     Register: showpiece only. Use sparingly — one element per page that earns a bounce. */
  --ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Circ: extremely crisp deceleration. Starts near-linear, stops hard.
     Use for: elements that need to read as controlled — mechanical precision, technical
     brand registers, UI where snap is a feature.
     Register: confident, quiet (for micro-interactions). */
  --ease-out-circ: cubic-bezier(0, 0.55, 0.45, 1);
}
```

### Departures (ease-in family)

```css
:root {
  /* Expo: slow pickup, fast exit. The object leaves with finality.
     Use for: dismissals, modals closing, elements exiting the viewport.
     Almost never correct for entrances — a slow start reads as latency.
     See core/theory/motion.md: "ease-in (gradual start, fast finish): an object leaving." */
  --ease-in-expo: cubic-bezier(0.7, 0, 0.84, 0);

  /* Quint: softer ease-in. Use for exits that should feel deliberate without being
     dramatic — a panel sliding away, a tooltip disappearing.
     Register: confident. */
  --ease-in-quint: cubic-bezier(0.64, 0, 0.78, 0);
}
```

### State transitions (ease-in-out family)

```css
:root {
  /* Quint in-out: symmetrical, both ends deeply decelerated. For elements moving
     between two significant states — a position change, a layout shift — where
     the before-state and after-state both carry meaning. Neither arrival nor
     departure dominates; the motion reads as a measured pivot.
     Register: quiet, confident. Not for fast micro-interactions. */
  --ease-in-out-quint: cubic-bezier(0.83, 0, 0.17, 1);

  /* Standard: the Material Design standard easing. Less pronounced deceleration
     than quint in-out. Use for UI state changes that need to feel native and
     predictable — tabs switching, accordion expanding, toggle switching.
     Register: quiet, confident. */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

### Spring approximation

```css
:root {
  /* Spring via linear(): a physics-approximated spring using the CSS linear()
     function. Produces an overshoot-and-settle that reads as weight and momentum
     rather than the geometric bounce of ease-out-back.
     Fallback: --ease-out-back for browsers without linear() support (check via
     @supports (animation-timing-function: linear(0, 1))).
     Use for: elements whose register is "physical" — draggable cards, shelf items,
     anything that should feel like it has mass.
     Register: showpiece. */
  --ease-spring: linear(
    0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%,
    1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%,
    1.129 33.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%,
    0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1.004 83.8%, 1
  );
}
```

### Constant-velocity (linear)

```css
:root {
  /* Linear is not a fallback — it is a semantic choice.
     Use for: opacity changes on hover states (eased opacity on hover feels
     sluggish; linear matches the perceived snap of pointer movement);
     looping animations (spinners, progress bars, marquees) where acceleration
     and deceleration would produce visible stuttering on each cycle.
     See core/theory/motion.md: "linear: no easing. Use for opacity changes on
     hover states only." */
  --ease-linear: linear;
}
```

---

## Which register uses which curve

| Curve | Register | Canonical use |
|---|---|---|
| `--ease-out-expo` | showpiece, confident | Hero entrance, overlay, drawer |
| `--ease-out-quint` | confident, showpiece | Scroll reveal, card entrance |
| `--ease-out-back` | showpiece (sparing) | Playful bounce, elastic arrival |
| `--ease-out-circ` | confident, quiet | Mechanical snap, micro-interaction |
| `--ease-in-expo` | any | Exit, dismissal, departure |
| `--ease-in-quint` | confident | Soft exit, panel away |
| `--ease-in-out-quint` | quiet, confident | State pivot, position change |
| `--ease-standard` | quiet, confident | Tab switch, toggle, accordion |
| `--ease-spring` | showpiece | Physical element, draggable, weighty |
| `--ease-linear` | any | Hover opacity, looping motion |

---

## The 500ms ease-in-out problem

`transition: all 500ms ease-in-out` is the single most common signature of generated
work. It is wrong for three independent reasons (see `core/theory/motion.md`): too slow
for micro-interactions, too fast for meaningful spatial motion, and the uniform easing
removes semantic distinction between different kinds of change. The token set above
provides the antidote: distinct curves for arrivals, departures, pivots, and physical
motion, each at the duration that earns it.

When a hand reaches for `ease-in-out`, the question is: is this an arrival, a departure,
or a pivot? Arrivals use an out-curve. Departures use an in-curve. Pivots — and only
pivots — use in-out.
