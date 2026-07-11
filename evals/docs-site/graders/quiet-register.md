# Grader: Quiet Register Committed

Check that the design explicitly committed to the quiet register before building — and that the committed register is visible in the output.

## Pass criteria

- `.omd/frame.md` or the run transcript shows the agent explicitly named the register as "quiet", "functional", "tool-oriented", or an equivalent phrase before writing code.
- The rendered pages do not contain entrance animations on page load — no `@keyframes`, no `animation:` triggered on first paint.
- Typography is utilitarian: a body type scale with no display-scale headings (font-size ≤ 48px on all headings).
- Color usage encodes information: status indicators, syntax highlighting, navigation state. No decorative gradients, no hero overlays, no color for atmosphere.
- If `.omd/motion-spec.md` exists, it explicitly states that the register is quiet and that entrance animations were rejected.
- `omd check --category slop` returns no SLOP-GRADIENT or SLOP-EVERYTHING-CENTERED findings on a documentation page.

## Fail criteria

- A hero or billboard section with oversized headline (> 48px) occupies the first viewport of the home page.
- CSS contains `@keyframes` that animate elements on initial page load.
- More than 3 non-neutral hues appear as decoration (not as syntax highlighting or status encoding).
- The transcript shows the agent consulting `expressive.md` or motion recipes for the documentation brief — the wrong register was applied.
- `MOTION-UNIFORM` or `MOTION-EVERYTHING-MOVES` fires on a documentation page.

## Why this matters

Documentation is read for information, not for experience. A documentation site that applies showpiece technique to the home page signals that the register detection failed — the pipeline defaulted to the mean output rather than reading the brief. The separation between quiet and showpiece registers is a correctness property, not a preference.

## Severity

FAIL if a hero with oversized type occupies the first viewport. FAIL if entrance animations fire on a documentation page. WARN for decorative colour use.
