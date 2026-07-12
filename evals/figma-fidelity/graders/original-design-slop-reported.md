# Grader: Original-Design Slop Reported, Not Silently Fixed

Check that when the slop linter fires on findings that trace back to the original
Figma design, those findings are reported to the user as information — not silently
corrected in the build.

## Pass criteria

- The slop check was run: `omd check <page> --category slop` appears in the
  transcript.
- If slop findings fire:
  - The skill identifies whether each finding traces back to the Figma design
    (e.g. a gradient that was present in the Figma file) or to the build
    (e.g. a gradient the skill added that is not in the Figma file).
  - Findings that trace back to the Figma design are **reported to the user** with
    a sentence naming the finding, the location, and the fact that it came from
    the original design.
  - Findings that trace back to the build are **fixed** (they are implementation
    errors, not design choices).
- `.omd/decisions.md` contains entries for any slop findings, recording their
  source (Figma design vs. build) and disposition (reported vs. fixed).

## Fail criteria

- The slop check was not run.
- A slop finding that traces back to the Figma design was silently "fixed" in the
  build (e.g. the gradient was replaced with a solid color) without telling the
  user.
- A slop finding that traces back to the build was left unfixed without a written
  reason.
- All slop findings were ignored regardless of source.

## Why this matters

The user provided a Figma file. The file is their design. `omd:figma` does not have
a mandate to improve it — it has a mandate to implement it faithfully. Silently
fixing slop findings in the original design is the skill overriding the user's
decisions, which is the exact behaviour that `.omd/decisions.md` and the written-
reason requirement are designed to prevent. Report honestly; let the user decide.
