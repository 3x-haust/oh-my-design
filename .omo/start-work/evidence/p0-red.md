# P0 RED evidence

## Initial implementation boundary

Before the trusted lifecycle production edits, the active-thread baseline recorded:

- `npm test` was not a valid release candidate because the trusted evaluation, repair, and
  vertical-loop regression targets did not yet exist.
- `npx tsc --noEmit` and `npm run build` were captured before production edits as the type/build
  baseline in the active task transcript.
- Focused RED tests were added first for caller-authored evidence, browser receipt publication,
  common final floors, staged repair, and the end-to-end vertical loop.

## Final-review RED, 2026-08-14

The repository-wide `npm test` run reached these deterministic failures before being stopped:

1. `test/trusted-evaluation-lifecycle.test.ts`
   - `lifecycle finalize dispatches to the guarded v2 finalizer`
   - The test expected an operation label, while both lifecycle and direct v2 finalization
     correctly returned `project run invocation requires a current run identity`.
2. `test/version-sync.test.ts`
   - A shared-tree release-baseline edit expected package version `1.0.0`.
   - The active lifecycle increment and repository manifest remain at `0.19.0`; the release
     workflow and its new version assertion are explicitly outside this increment.

The finalize dispatch regression was corrected to compare lifecycle dispatch with the direct
guarded v2 finalizer. The release-baseline conflict is excluded from the lifecycle commit and is
verified in a clean worktree based on the resulting commit.
