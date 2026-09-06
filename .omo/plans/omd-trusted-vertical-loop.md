# OMD Trusted Vertical Loop

## Goal

Implement and prove the smallest executable OMD path:

```text
persisted adaptive route
  -> host-owned browser evaluation
  -> trusted browser receipt
  -> outcome/claim/decision/build/revision-linked observation-v2
  -> branch-neutral non-compensable outcome gate
  -> route-derived staged one-file repair
  -> atomic apply and observation-pointer invalidation
  -> fresh browser evaluation and successor observation
  -> final-v2 publication
```

P0 is evidence-backed repair. P1 is a directly tested vertical slice, not a claim that the full
human-design harness is already effective.

## Constraints

- Source of truth: `src/`, `core/`, `adapters/`, `bin/`, `test/`.
- Never edit generated root `agents/`, `skills/`, or `dist/` directly.
- Never revert/stash/reset/clean unrelated shared-worktree changes.
- Every behavior change gets a correct RED before production edit.
- New modules target under 250 LOC; oversized broker/final files receive thin joins only.
- Existing invocation, persisted route, observation-v2, and final-v2 remain authoritative.
- No caller-injected server command, environment, output path, success bit, receipt, or patch.
- No reviewer-supplied path may expand route authority.
- No perceptual/reviewer score may offset behavior, accessibility, or safety failure.

## Architecture decisions

### Trusted evaluation identity

Add `core/runtime/trusted-evaluation-contract.ts`.

Caller supplies only semantic evaluation intent. Host derives current route/source/build/decision
graph/production revision, complete required-outcome refs, confirmed claim refs, fixed viewports,
and private output location. References are source-contract-bound without changing existing brief
schemas.

### Browser receipt and trusted observation

Add:

- `core/runtime/trusted-browser-receipt.ts`
- `adapters/trusted-browser-runner.ts`
- `core/runtime/trusted-evaluation-observation.ts`
- thin host dispatch/runtime modules

The host launches Playwright, records issued receipt digests, and authorizes only receipts generated
inside that invocation. The adapter verifies receipt/captures/current route/production/decisions,
then writes through existing observation-v2. Generic observations cannot satisfy the outcome gate.

### Branch-neutral outcome veto

Add `core/evidence/final-v2-outcome-gate.ts`.

Carry one authorized `final-outcome-evaluation-v1` receipt through existing
`ObservationV2.evidence`. Validate at the common graph boundary for routed publications only.
Legacy art-selected publications without adaptive route remain compatible.

The exact route/source/build/artifact/production revision/browser observations/outcomes/confirmed
claims/decisions must match. Behavior, accessibility, and safety each appear once and must PASS with
no findings. Any failure vetoes publication.

### Transactional one-file repair

Add:

- `core/route/staged-repair-contract.ts`
- `core/runtime/production-repair.ts`
- thin repair host/runtime dispatch

Codex writes only to a mode-0700 host-private mirror. Host computes a one-file binary-safe delta,
derives authority from persisted route `allowedPaths` intersected with current production-slice
paths, rejects `.omd`, symlinks, special/mode-only/duplicate/unsafe/out-of-scope changes, and
revalidates under the project mutation lock.

Current live bytes are the baseline; no Git rollback. Before/after blobs and immutable transaction
record precede mutation. A current journal supports idempotent rollback/roll-forward. A committed
source repair invalidates only current observation pointers and preserves immutable history.

## Work waves

### Wave 0 — Executable baseline

1. Save external shared-worktree baseline.
2. Capture `npm test`, `npx tsc --noEmit`, `npm run build` RED logs before production edits.
3. Fix only pre-existing blockers required for this slice, beginning with the invalid
   `assert.throws(..., undefined, ...)` signature if reproduced.
4. Build generated outputs through `npm run build`, never direct edits.
5. Pass typecheck and focused host/owner tests before P1 implementation.

### Wave 1 — Route-derived evaluation identity

RED in `test/trusted-evaluation-contract.test.ts`:

- missing/extra required outcomes rejected;
- invented outcomes/confirmed claims rejected;
- source byte change changes refs;
- non-confirmed claims excluded;
- entry path outside route scope rejected.

GREEN: strict parsed/frozen `trusted-evaluation-request-v1` and stable derived refs.

### Wave 2 — Host-issued browser receipt

RED in `test/trusted-browser-evaluation.test.ts` with real broken/fixed HTML:

- caller-authored/forged receipt rejected;
- broken action produces trusted FAIL;
- fixed action produces trusted PASS at `1280x900` and `390x844`;
- keyboard focus, overflow, console/page-error checks.

No fixed sleeps. Subscribe before action and use bounded Playwright locators/events.

GREEN: host-generated `trusted-browser-receipt-v1`, private artifacts, issued digest authorization.

### Wave 3 — Trusted observation-v2

RED in `test/trusted-evaluation-observation.test.ts`:

- forged receipt, swapped capture, stale route, unknown decision, altered production rejected before
  current pointer mutation;
- valid receipt binds route/source/build/revision/outcomes/claims/decisions/PNGs;
- second trusted evaluation is the exact predecessor successor.

GREEN: trusted adapter plus `omd evaluate run` thin CLI.

### Wave 4 — Common final gate

RED in `test/final-outcome-gate.test.ts`:

- polished screenshots plus GREEN reviews cannot offset behavior/accessibility/safety FAIL;
- missing/duplicate/dangling/stale coverage rejected;
- both routed art-selected and adaptive omission variants use the identical validator;
- all-PASS exact coverage succeeds;
- true legacy art-selected path remains compatible.

GREEN: common gate validator and thin branch bindings.

### Wave 5 — Staged repair

RED in `test/staged-repair.test.ts` and updated owner regression assertions:

- owner cannot touch production during staging;
- out-of-route/reviewer-expanded/stale-before patch leaves production byte-identical;
- unrelated dirty files survive rejection/rollback byte- and mode-identical;
- injected failure recovers old or new, never mixed;
- current observation pointers invalidate on commit and restore on rollback;
- stale observation cannot authorize repaired production.

GREEN: private mirror, one-file receipt, mutation lock, journal, immutable blobs/outcome, recovery.

### Wave 6 — CLI vertical use

Add `omd lifecycle run` as a thin orchestration surface over route, evaluation, repair, and final
contracts. Add help plus happy/forged/malformed fixture commands.

Real scenario:

1. Temporary project begins with broken “Submit order.”
2. Trusted browser evaluation fails and records observation N.
3. Route-scoped staged repair changes one HTML file.
4. Fresh evaluation passes both viewports and records N+1 with predecessor N.
5. Common outcome gate allows both routed final branches.
6. Observation N is rejected as stale.

Capture CLI transcript, Playwright action log, screenshots, receipts, before/after tree hashes, and
cleanup receipt.

## Exact validation

Focused:

```bash
node --test test/trusted-evaluation-contract.test.ts
node --test test/trusted-browser-evaluation.test.ts
node --test test/trusted-evaluation-observation.test.ts
node --test test/final-outcome-gate.test.ts
node --test test/staged-repair.test.ts
node --test test/trusted-vertical-loop.test.ts
```

Regression:

```bash
node --test \
  test/adaptive-flow-routing.test.ts \
  test/adaptive-route-persistence.test.ts \
  test/browser-observation-decision-links.test.ts \
  test/adaptive-final-v2.test.ts \
  test/final-evidence-v2.test.ts \
  test/codex-host-launcher.test.ts \
  test/production-owner-runtime.test.ts
```

Final once:

```bash
npm test
npx tsc --noEmit
npm run build
node bin/omd.mjs lifecycle --help
node bin/omd.mjs lifecycle run --project test/fixtures/trusted-lifecycle-project \
  --manifest test/fixtures/trusted-lifecycle-manifest.json
```

Forged and malformed invocations must exit nonzero with typed errors and unchanged production tree
hash.

## Review and cleanup

- Run `review-work` five-lane post-implementation review because the user required direct
  verification.
- Resolve every criterion-cited blocker; re-run only affected scenarios.
- Run LSP diagnostics on every changed TypeScript file before build.
- Close Playwright, child tasks, host processes, private mirrors, temp fixture dirs, monitors, and
  bash sessions; record receipt.
- Commit only this session's verified files, atomically per increment, after inspecting history.

## Stop condition

Stop immediately when P0 full gates are green, trusted evaluation/observation and common final veto
pass, staged repair proves pre-mutation authority and recovery, real CLI/browser happy and forged
paths pass with artifacts, review blockers are zero, todo is empty, and all runtime/child resources
are terminated.
