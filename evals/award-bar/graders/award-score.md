# Grader: Developer-Rubric Score Clears the Honourable-Mention Floor

Score the finished page against the published Awwwards Developer Award weights and check the result.

## Pass criteria

- `omd award score <page> --json` runs and reports `coverage` of at least 0.8 — most of the rubric's weight had evidence, so the score is not a sliver of the page.
- `verdict` is `honourable-mention` or `developer-award`.
- `floorFailures` is empty. This is the conjunctive part: an axis below its floor cannot be averaged away by the others, so a page with clean markup and no motion does not pass here.

## Fail criteria

- `verdict` is `below-hm`.
- `floorFailures` names any axis — most often `animation`, which is what a statically-shipped landing scores.
- `coverage` below 0.8: too much of the rubric went unmeasured for the number to mean anything. Collect the missing evidence rather than reporting the partial score as a result.

## Severity

FAIL — the rubric is the industry's own bar. A run that cannot clear the Honourable-Mention floor on the measurable axes has not produced award-tier work, whatever the internal checks say.
