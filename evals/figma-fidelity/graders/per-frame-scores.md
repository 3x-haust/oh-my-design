# Grader: Per-Frame Fidelity Scores Recorded

Check that the pixel-diff loop ran for each frame and that the final scores are
recorded in the fidelity report.

## Pass criteria

- The skill's output includes a fidelity report table. The table has columns:
  Frame · Viewport · Score · Iterations · Notes.
- At least one frame row has a numeric score between 0 and 1 (e.g. `0.983`).
- For frames that reached the 4-iteration ceiling without hitting 0.97, the table
  records the final score and marks it as having hit the ceiling — it does not
  pretend the score is higher than it was.
- For responsive pairs (desktop + mobile variants of the same screen), both
  viewports appear as separate rows in the table with their own scores.
- For frames that fell back to the dual-viewport rule (no Figma mobile frame),
  the table records "Fallback" or "—" in the score column for the mobile row and
  includes a note that no Figma reference existed for that viewport.
- `.omd/decisions.md` contains at least one entry per frame recording the final
  score and iteration count.

## Fail criteria

- No fidelity report table is present — the diff loop did not run or its results
  were not recorded.
- Scores are absent or given as qualitative descriptions ("looks good") rather than
  numeric values from `omd figma diff --json`.
- A frame has more than 4 iterations recorded — the ceiling was not respected.
- Responsive fallback frames are reported with a fabricated diff score rather than
  marked as fallbacks.

## Why this matters

The fidelity report is the proof that the implementation is faithful. Without it,
"implemented from Figma" is a claim rather than a measurement. The iteration count
per frame is also data: a frame that converged in 1 iteration and one that hit the
ceiling at 4 tell different stories about the complexity of the implementation.
