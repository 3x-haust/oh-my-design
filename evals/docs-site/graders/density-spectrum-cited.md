# Grader: Information Density Decision Cited from layout.md

Check that the layout density decisions for the documentation site were made with explicit reference to the density spectrum in `core/theory/layout.md`, rather than applied as defaults.

## Pass criteria

- `.omd/decisions.md` contains at least one entry that cites `layout.md` (or `core/theory/layout.md`) in the context of density, information hierarchy, or line length.
- The transcript or decisions file shows the agent consulted the density spectrum and made an explicit choice: dense (more content per viewport) vs. airy (reading comfort over information density) — with a reason tied to the documentation use case.
- The committed line length for body text falls within the readable range (60–80 characters, `45ch`–`75ch`). Documentation is read in long sessions; line length is a fatigue variable.
- The vertical rhythm and spacing between sections serves information scanning — headings are visually distinguishable from body, code blocks are clearly separated, the reading flow is unambiguous.

## Fail criteria

- No `layout.md` citation in any decision entry related to density or line length.
- Body text line length is unconstrained (full-width on 1280px viewport) — a long line of prose documentation is a reading fatigue defect.
- The spacing between sections is uniform: every section has the same gap regardless of the conceptual relationship between them (a navigation heading and a body paragraph have the same spacing as two unrelated sections).
- `.omd/decisions.md` does not exist or contains no citation of the theory pack for layout decisions.

## Why this matters

`core/theory/layout.md` exists precisely because density is a decision, not a default. A documentation site with unconstrained line width and uniform spacing was not designed — it was generated. The density spectrum gives the builder a condition → choice → reason table to work from; citing it in decisions.md is how the choice becomes traceable.

## Severity

FAIL if line length is unconstrained at 1280px. WARN if layout.md was not cited in any decision.
