# P0/P1 GREEN evidence

Date: 2026-08-14

Branch: `feat/trusted-lifecycle-vertical-loop`

Verified commits:

- `25ddce3edafa772cc336c4165a74cd603c2f53df` — trusted lifecycle vertical loop
- `880164f` — Claude adapter prompt-ABI compatibility
- `ff304ee` — deterministic bounded full-suite concurrency

## Exact clean-branch gates

The final gates ran from detached clean worktree `/tmp/omd-trusted-ff304ee` after `npm ci`:

- `npm run build` — exit 0
  - Codex: 11 files, 6 skills
  - Claude: 11 files, 6 skills
  - Senpi: 10 files, 6 skills
  - Root plugin: 6 skills, 9 agents
- `npm test` — exit 0
  - 2,129 tests
  - 2,127 passed
  - 0 failed
  - 2 skipped
- `npx tsc --noEmit` — exit 0
- `git status --short` after build/test/typecheck — empty

Before bounding the suite, the same clean branch produced two resource-pressure cleanup failures
(2,125 pass / 2 fail / 2 skip). Both tests then passed together in isolation (35/35). The
repository `npm test` command now uses `--test-concurrency=4`; an independent reliability review
confirmed that this bounds worker fanout without weakening, deleting, or skipping assertions.

## Focused evidence

- Host authority exploit regression: 9/9 passed.
- Trusted browser suite: 9/9 passed, including immutable snapshot, tall viewport capture,
  CSS/JS/module/CSP, and transient dependency swap/restore.
- Integrated authority/browser/repair/lifecycle matrix: 82/82 passed.
- Full recovery/durability/vertical-loop matrix: 39/39 passed.
- Packed Codex/Claude/Senpi payload validation: passed.
- Hands-on CLI/browser QA: 13/13 passed.
- Independent goal, quality, trust/durability, QA, and context verdicts: all PASS.

The shared release/version/example/history/browser/root-artifact baseline was not present in the
clean worktree and was not included in either commit.
