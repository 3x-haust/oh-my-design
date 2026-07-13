# Grader: Showpiece Register Committed

Check that the design explicitly committed to the showpiece register before building — not just incidentally produced something expressive.

## Pass criteria

- `.omd/frame.md` or the run transcript shows the agent explicitly named the register: "showpiece", "expressive", or an equivalent Korean term ("쇼피스", "표현적") before writing code.
- The rendered page uses at least one of the canonical showpiece techniques: display-scale typography (font-size ≥ 72px on a heading), deliberate negative space (padding or margin ≥ 80px on a section), or a scroll-triggered entrance animation.
- If `.omd/motion-spec.md` exists, it references the register decision with a cited reference or theory file.

## Fail criteria

- The page looks like a standard landing page template (equal-width cards, centered hero with medium-size text, generic gradient).
- No evidence in the transcript or `.omd/` that the showpiece register was a deliberate choice versus the default output.
- The agent described the tone as "modern" or "clean" without committing to the expressive vocabulary of the showpiece register.

## Severity

FAIL if the output is indistinguishable from a default `oh-my-design:ultradesign` quiet run.
