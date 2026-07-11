# Grader: No Showpiece Techniques in a Documentation Site

Check that expressive or showpiece techniques did not appear in a documentation site that explicitly requested a quiet, technical register.

## Pass criteria

- No split-text or stagger entrance animations on headings.
- No sticky scroll-stage transitions between sections.
- No section colour inversion (the section-inversion composition recipe is a showpiece technique; documentation pages do not invert).
- Navigation is functional and conventionally placed — top navigation bar or left sidebar. No experimental navigation patterns.
- Code blocks and command references are given more visual weight than decorative elements — the hierarchy serves the reader's task, not the brand's expressiveness.
- If `.omd/motion-spec.md` exists, it either does not exist or explicitly states "no entrance animations".

## Fail criteria (any one fails the case)

- A section of the home page uses full-bleed colour inversion as a visual device.
- A heading uses split-text letter-by-letter entrance animation.
- The navigation uses a custom interaction pattern (magnetic hover, scroll-driven reveal) that interferes with reading flow.
- The transcript shows `omd-hand` citing `expressive.md` to justify a visual technique on a documentation page.
- `omd check` returns `MOTION-EVERYTHING-MOVES` or `MOTION-UNIFORM` — the motion rules that flag showpiece excess.

## Why this matters

The quiet register is not a diminished register — it is a different one. Documentation that performs for its own sake loses on the dimension that matters most to its users: speed to information. A pipeline that applies showpiece technique to every output has not learned to read what the brief asked for. Register containment is as important as register execution.

## Severity

FAIL on any criterion above.
