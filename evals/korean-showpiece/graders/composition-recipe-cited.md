# Grader: Composition Recipe Cited for Page Structure

Check that the page structure was committed using at least one named recipe from the composition cookbook (`core/composition/`), rather than applied as a default grid layout.

## Pass criteria

- `.omd/decisions.md` contains at least one entry that names a composition recipe by file name — for example, `typographic-hero.md`, `section-inversion.md`, `asymmetric-diagonal-grid.md`, `bento-grid.md`, or another recipe from `core/composition/`.
- The named recipe's conditions are met: if `typographic-hero.md` is cited, actual short
  concept-bearing copy, face, and weight pass the typography proof at desktop and mobile;
  secondary hierarchy and CTA remain usable. Size follows the specimen and container.
- The page-level structure (hero zone, feature zone, CTA zone) maps to one or more recognisable composition recipes — the layout has a committed structure, not a default stack of equal sections.
- If `section-inversion.md` was used, it appears at most once — the recipe's own constraint.

## Fail criteria

- No composition recipe is named in `.omd/decisions.md` — the structure was applied without reference to the cookbook.
- A recipe is named but its conditions are not met: `typographic-hero.md` is cited without a
  clean actual-copy proof, or fallback, tofu, faux weight, wrapping, clipping, or lost
  secondary hierarchy contradicts the recipe. A moderate heading does not fail by size alone.
- All sections have equal visual weight and equal span — `SLOP-TRIPLE-CARD` at page scale, with no recorded decision to use a recipe that permits equal treatment.
- The layout is a standard landing page stack (hero → three-column cards → footer) with no committed composition decision.

## Why this matters

The composition cookbook exists because structure is a decision, not a default. A showpiece page that uses the default landing page structure — regardless of how expressive the typography or motion is — has not committed to a concept at the layout level. The recipe citation is what makes the structure traceable: it names the condition that was met, and the condition being met is what separates a recipe application from a coincidence.

## Severity

FAIL if no composition recipe is cited. WARN if cited but conditions are not clearly met.
