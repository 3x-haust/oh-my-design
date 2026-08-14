# Trusted lifecycle manual QA

Date: 2026-08-14

Verdict: **PASS — 13/13 scenarios**

- `node bin/omd.mjs lifecycle --help` exited 0 and exposed run/evaluate, repair, and finalize.
- A malformed manifest exited 1 with `MALFORMED_TRUSTED_LIFECYCLE_MANIFEST`.
- A caller-authored authority exited 1 with `LIFECYCLE_MANIFEST_AUTHORITY_FORBIDDEN`.
- The real browser failure path exited 1, failed the behavior floor, and produced captures at
  1280x900 and 390x844.
- The real browser success path exited 0 with every outcome and hard floor passing.
- A local non-routed success printed `EVALUATION: PASS` without
  `READY_FOR_FINALIZATION`.
- The routed plan path rejected missing exact product-probe authority, accepted the authorized
  plan, and returned `readyForFinalization: true`.
- A transient dependency swap followed by exact-byte restore was detected as
  `TRUSTED_BROWSER_PRODUCTION_REVISION_CHANGED`.
- Staged repair invalidated the old observation, committed the scoped production change,
  re-observed it, preserved predecessor linkage, and passed the trusted final gate.
- A fabricated durable browser receipt was rejected; exact host-authorized receipt bytes passed.
- `lifecycle finalize` and direct `evidence v2 finalize` reached the same guarded finalizer and
  returned the same invalid-activation error.
- The generated marketplace command preserved the executable owner identifier `omd-hand`.
- The delegated owner ran in a separate authenticated Codex session with project/task/PID/process
  binding, no model override, and a read-only host receipt.

The QA lane made no source changes and did not launch a duplicate full repository test.
