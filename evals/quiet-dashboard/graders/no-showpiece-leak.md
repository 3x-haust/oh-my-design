# Grader: No Showpiece Techniques in a Quiet Dashboard

Check that expressive / showpiece techniques did not leak into a functional dashboard that explicitly requested a quiet register.

## Pass criteria

- No entrance animations triggered on page load (no `@keyframes`, no `animation:`, no `transition` on opacity/transform at the root component level on first paint).
- No display-scale typography: all text sizes ≤ 48px; the dominant heading size is ≤ 32px.
- No full-bleed hero section — the layout goes directly to data.
- Color usage is utilitarian: ≤ 3 distinct hues used for data (e.g., status colors), no decorative gradients.
- If `.omd/motion-spec.md` exists, it either does not exist or explicitly states "no entrance animations — functional state transitions only."

## Fail criteria (any one fails the case)

- A hero or billboard section with oversized headline occupies the first viewport.
- CSS contains `@keyframes` that animate elements on initial load.
- More than 3 non-neutral hues appear as decoration (not as data encoding).
- The transcript shows the agent invoking showpiece reference principles (expressive.md, motion pacing for drama) for a dashboard brief.
- `omd check` output includes `MOTION-EVERYTHING-MOVES` or `MOTION-UNIFORM` warnings.

## Why this matters

Register containment is as important as register execution. The showpiece and quiet registers must be distinct — a pipeline that bleeds showpiece techniques into every output has not learned to read the brief.
