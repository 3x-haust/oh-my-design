# First-render repair loop

This protocol applies only to the ordinary model-led route.

## Declaration

Every `omd first-render check` snapshots the regular files matched by the route's
`sourceContract.allowedPaths`. `.omd`, `node_modules`, `dist`, `build`, and Git metadata are
excluded. The source snapshot is limited to 16 MiB and is content-addressed together with the
desktop/mobile capture digests. Exceeding the limit refuses the checkpoint with
`FIRST_RENDER_CHECKPOINT_REFUSED`.

The isolated reviewer receives the immediately previous iteration's fixed desktop/mobile
captures when they exist. Its current handback reports `progress` as `improved`, `same`,
`regressed`, or `different-not-better`, with both old and current capture digests and a visible
observation for each viewport. `regressed` must cite at least one localized current finding.
Historical v3, v4, and v5 review records retain their original task and handback digests.

## Procedure

The route keeps an ordered iteration history and chooses the latest retained iteration as best;
until one exists, it chooses the latest reviewed iteration that was not regressed. A regressed
review sends the maker to `omd first-render restore --json` before a materially different
approach. `--iteration <id>` restores a named checkpoint. Restore validates the entire checkpoint,
all blobs, and every allowed path before the first project mutation, then writes and removes files
only through the guarded project-write adapter.

Four consecutive comparable reviews without `improved` or `retain`, or any finding id that
persists through three consecutive non-retained reviews, produces `FIRST_RENDER_LOOP_STALLED`.
This is escalation, not approval: restore the best iteration and report the remaining findings
with the current desktop/mobile captures instead of requesting another repair.

## Evidence basis and limits

- Design2Code reports no material benefit from its GPT-4o self-revision condition:
  https://arxiv.org/abs/2403.03163
- The CHI mockup-feedback study reports more invalid suggestions after genuine issues diminish:
  https://doi.org/10.1145/3613904.3642782
- Anthropic reports that middle iterations were sometimes preferred and that added harness
  complexity can worsen results:
  https://www.anthropic.com/engineering/harness-design-long-running-apps
- The self-correction survey separates useful external feedback from unreliable generic
  self-critique:
  https://arxiv.org/abs/2406.01297

These sources justify rollback and stopping controls. They do not make a model review equivalent
to human preference, usability testing, accessibility conformance, or product acceptance.
