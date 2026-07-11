# Grader: Reduced-Motion Block Present

Check that the build includes a `@media (prefers-reduced-motion)` block wrapping the motion layer.

## Pass criteria

- `omd check <page> --category motion` returns no `MOTION-NO-REDUCED` finding.
- OR: the page source (HTML/CSS) contains at least one `prefers-reduced-motion` media query that suppresses or substantially reduces the animations.

## Fail criteria

- `MOTION-NO-REDUCED` fires and no `omd decision` overrule of that finding exists in `.omd/decisions.md`.
- The page has live animations but no `prefers-reduced-motion` handling at all.

## Severity

FAIL — a showpiece page with striking animation that ignores the user's accessibility preference is a correctness defect, not a style choice.
