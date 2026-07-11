# Grader: No Pink-Elephant Copy

Check that the Korean copy does not contain AI-prose clichés that `omd:humanize` and the SLOP-COPY-KO rules are designed to eliminate.

## Pass criteria

- The rendered HTML (or the copy written in the transcript) contains none of the following patterns:
  - Connective-comma openers: "그러나, " / "하지만, " / "또한, " / "따라서, " at the start of a sentence
  - Structural openers: "첫째," / "둘째," / "셋째," used as enumeration scaffold without narrative need
  - Abstract value nouns stacked without a concrete subject: "혁신", "신뢰", "편리함", "간편한" appearing in the hero headline without a specific claim attached
  - The double-postposition pattern "에서의" / "에로의" (retain only if the sentence genuinely requires it and no simpler form exists)
- The copy reads like a Korean product — not a translated marketing brief.

## Fail criteria

- Any connective-comma opener appears in the body copy.
- The hero or subheadline stacks ≥ 2 abstract value nouns (e.g., "편리하고 혁신적인 금융 서비스") without a concrete grounding clause.
- The transcript shows the agent wrote copy then ran humanize and then reverted the humanize output.

## Note

These are the S1-level patterns from SLOP-COPY-KO. A single occurrence that slipped through is a FAIL — the point of the grader is to catch the regression before it becomes the baseline.
