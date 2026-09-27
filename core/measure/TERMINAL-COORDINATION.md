# Phase 5 terminal migration coordination (st_01a0e083)

Implementation in progress. Lead/unowned integration requirements (updated after the purpose steering):

- Route purpose fields are now consumed as actual typed source-contract fields.
  `loadReviewPolicy` revalidates `review-purpose-origin-v1` via verifyReviewPurposeAuthority;
  missing purpose preserves 2+2+2. Source-seal continuation now rechecks origin authority.
- Trusted capture now writes a sealed native measurement packet from the same retained capture/IR
  transaction through the existing artifact sink. Browser receipt v2 binds immutable packet receipt,
  view ID, zoom, state recipe, layout dimensions and actual PNG dimensions. No caller ABI addition.
- Atomic caller wiring required three additional native-final files, so I took the previously
  unmodified native-final-manifest.ts, native-final-publication.ts, and native-final-review-state.ts.
  They now use optional policy-selected lanes and a native-pi-final-review-v2 pointer. The publisher
  derives deterministic protocol facts from a reviewer-independent measured draft, then revalidates
  the complete measured terminal graph before advancing its pointer. No empty legacy lanes exist.
  APIs now available:
  - measured graph is an additive exclusive `measuredTerminal: {schema:'measured-terminal-graph-v1',
    measurements: Receipt[], reviewPolicy: loadReviewPolicy(...), slop:{checkpoint,review},
    deterministicProtocol: Receipt, lanes:{blindLane:Receipt,fidelityLane?:Receipt,protocolLane?:Receipt}}`.
    Do NOT also include legacy top-level blindLane/fidelityLane/protocolLane.
  - `publishDeterministicProtocol(root, draftGraph, writer, invocation)` in
    core/evidence/final-v2-measured-terminal.ts accepts the same graph before its protocol receipt
    and reviewer lanes are present, validates native production facts and slop, and returns receipt.
    Protocol facts exclude reviewer lanes and the protocol itself; no dependency cycle.
  - `validateFinalProductionEvidence` is exported by final-v2-graph.ts (CI's missing-export report
    was an in-progress state; export is present now).
  - finalRenderReviewerPacket returns measured-blind-review-v1 for current process;
    nativeFinalLanePacket returns measured fidelity/protocol lane schemas. buildFinalReviewerPublication
    dispatches these schemas, validates signed isolated packet consumption, and uses exact policy counts.
  - runPiReviewerLane returns policy-sized PiRoleResult[]; callers must not launch policy-zero lanes.
  - slop checkpoint accepts `{schema:'slop-measured-scope-v2',measurements:[immutableReceipts]}` and
    adopts exact measured captures, never recaptures them. review-set accepts returned slop-review-v2.
    Both `captureSlopCheckpoint(root,scope,writer,invocation)` and
    `publishSlopReview(root,input,writer,invocation)` now need the existing invocation as fourth
    argument for v2, so they can validate and atomically move the pointer under its mutation lock.
    I updated only the cmdSlop block in bin/omd.ts to derive one invocation and pass it with its
    writer, avoiding an unusable v2 CLI. Other bin edits remain owned by their authors.
  - Added one assertion to test/native-final-manifest.test.ts proving that its historical fixture
    retains a mandatory legacy blind lane before reading the lane; this fixes the migration's
    legitimate union-type error without weakening that legacy test.
  - core/runtime/rendered-refinement.ts is outside my assigned ownership and still requires exactly
    two reviewer votes plus exactly desktop/mobile outcome-only captures (lines 332-337, 563-592).
    Its v2 migration must retain native packet receipts for each variant and use the bound review
    policy's blind count; new v2 trusted receipts also contain initial/narrow/zoom captures. Until
    that runtime packet and parser migrate together, the refinement publisher must not emit a
    policy-sized artifact that its runtime cannot validate. Final measured review remains required
    independently; a legacy refinement verdict cannot itself authorize measured completion.
- Prompt/source owner: apply the declaration text in INTEGRATION.md to Hand/Eye/Typesetter/Composer
  and input skeletons; do not claim legacy final-v1 quality is measured acceptance.

Legacy graph parsing/validation will remain strict and readable; current process terminal
publication must use a separate measured wrapper, never relax a historical lane quorum.

Verification update: full `npx tsc --noEmit` now passes. An isolated-copy `npm run build`
passes without touching generated files in the worktree. The earlier canonicalJson startup
cycle is no longer blocking the latest integration run (the measured graph parser was split
from runtime validation). Both signed-purpose/quorum/source-seal tests pass. The native tests
now reach actual route validation; their current-process copy fixture needed the newly required
concept-exploration skip and has been corrected. Native capture/reviewer tests are still in progress.
