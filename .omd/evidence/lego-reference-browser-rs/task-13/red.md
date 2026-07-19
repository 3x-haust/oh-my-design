# Task 13 snapshot-hardening RED evidence

Command: `node --test test/reference-usage.test.ts test/reference-report.test.ts`

Before the initial snapshot and report hardening, the focused run had 5 pass and 3 fail:

- an upstream `used` row with an empty `nonBorrowedProperties` array was accepted;
- a generation-B `checkLineage` reader result was accepted while sampled lineage bytes remained generation A;
- report cells preserved active Markdown, autolinks, control bytes, and bidi carriers.

Those failures were the intentional red seams for the remediation. The subsequent green run also adds the direct generation-B artifact-plus-lineage carrier and atomic-rename stress cases.

Before the final transaction re-sample, the focused run had 8 pass and 3 fail:

- a board A→B atomic replacement from the sixth (last initial) evidence read could still return validation of generation A;
- the same late replacement could still return a prepared generation-A usage record for publication;
- report cells retained ALM, LRM, and RLM directional marks.

The final green run exercises real atomic replacement for board, selection, lineage, attribution, usage, and evidence, plus the deterministic post-evidence seam.
