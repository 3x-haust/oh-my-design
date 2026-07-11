# Grader: MOTION-* Findings Clean (or Overruled)

Check that the deterministic motion rules in `omd check --category motion` pass, or that any firing rule has a recorded decision overrule.

## Pass criteria

- `omd check <page> --category motion` exits 0 (no findings), OR
- Every finding that fires has a corresponding `omd decision` entry in `.omd/decisions.md` that names the rule ID and gives a reason (not "it looked fine").

Rules checked:
- `MOTION-NO-REDUCED` — animations without prefers-reduced-motion (see reduced-motion grader)
- `MOTION-LAYOUT-THRASH` — transitioning width/height/top/left instead of transform
- `MOTION-UNIFORM` — 3+ animated nodes sharing one duration with only CSS default easings

If `.omd/motion-spec.md` exists, also check:
- `MOTION-SPEC-DRIFT` — spec scenes with no measured motion, or measured motion with no spec scene
- `MOTION-NO-ENTRANCE` — showpiece register + entrance spec scene + no measured entrance

## Fail criteria

- Any of the above rules fires and there is no decision entry overruling it.
- `MOTION-UNIFORM` fires — uniform 500ms ease-in-out is the generated-work signature and is never acceptable for a showpiece page without an explicit overrule.
- `MOTION-SPEC-DRIFT` fires — a broken contract between spec and build.

## Severity

FAIL for `MOTION-UNIFORM` (the signature of an unexamined build) and `MOTION-SPEC-DRIFT` (spec-build contract broken). WARN for others without an overrule.
