# Grader: Clean Captures Only (No Slop-Contaminated References)

Check that the reference board contains no captures that would be barred by the contamination-defense rules: slop-flagged pages may not sit on the board as positive references.

## Pass criteria

- No capture in `.omd/refs/` has a slop score indicating ≥ 2 SLOP rule violations (SLOP-GRADIENT, TRIPLE-CARD, EVERYTHING-CENTERED, or equivalent).
- Any page that triggered ≥ 2 slop rules was either:
  - Excluded from the board entirely, OR
  - Explicitly downgraded to `anti-reference` status with a note in `.omd/board.md` explaining what failure it demonstrates.
- The transcript shows the scout ran slop detection on captures (look for `omd check`, `slop`, or contamination-defense language) — not just signal scoring.

## Fail criteria

- A capture with ≥ 2 slop violations sits on the board as a positive reference without an `anti-reference` label.
- The scout ran no slop check at all — signal score was the only filter.
- More than 3 captures in the board share a pairwise similarity ≥ 0.85 (kinship cluster — indicates AI-generated or template pages slipped through in bulk).

## Why this matters

Slop-contaminated references are the primary vector for AI-average aesthetics re-entering the pipeline. The contamination-defense rules (Plan item #12) require the scout to gate captures at the point of collection, not after. A board that passes this grader cannot easily have trained the pipeline on its own output.
