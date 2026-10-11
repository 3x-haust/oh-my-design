# Contributing to Oh My Design

Thanks for helping improve Oh My Design. Keep changes focused, evidence-backed, and easy to review.

## Setup

Requirements: Node.js 22.19 or newer, npm, and Chromium for browser tests.

```bash
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
```

## Repository layout

`src/` is the source of truth for agents and skills. `npm run build` generates `agents/`, `skills/`, and `dist/`; never edit those directories directly. Runtime code lives in `core/`, `bin/`, `adapters/`, and `extensions/`. Tests live in `test/`. Repository scripts live in `scripts/`.

## Test tiers

Every top-level `test/*.test.ts` file must appear exactly once in `test/test-manifest.json`.

- `unit`: pure tests without filesystem, process, network, browser, or build behavior.
- `integration`: filesystem, CLI, local network, or child-process behavior without a browser.
- `browser`: Playwright/Chromium rendering or observation.
- `native`: browser-rs, Darwin-native publication, and strict real-time lifecycle tests. This tier runs serially.
- `packaging`: generated `dist/`, `npm pack`, or installed-tarball behavior. The runner builds first.

```bash
npm run test:unit
npm run test:integration
npm run test:browser
npm run test:native
npm run test:packaging
npm run test:changed -- origin/main
npm run test:coverage
```

To add a test, run `node scripts/test/classify.ts --write`, review the proposed tier by reading the test, and run `node --test test/test-manifest.test.ts`. The classifier is a proposal, not a substitute for judgment.

The runner supports `--tier unit,integration`, balanced `--shard 1/3`, `--concurrency 2`, repeated `--reporter` options, and `--changed [base]`. Per-file estimates are in `test/.timings.json`.

Coverage intentionally uses unit and integration tests only: browser/native coverage is slow and introduces platform/compositor variance unrelated to source coverage. The current-worktree Node 24.11.0 measurement was 63.64% lines, 74.67% branches, and 68.76% functions. CI floors remain a few points lower at 59%, 72%, and 65% respectively. The runner applies those thresholds to Node's coverage command and independently verifies the generated LCOV totals.

## Enforcement and lint rules

Mandatory workflow rules follow `core/protocol/three-layer-enforcement.md`: declaration, stage/owner procedure, and executable refusal. A regression needs both a refused violation with no source mutation and an authorized success.

New lint rules must be narrow, warning-only, and covered by one positive and one negative test. If a pattern cannot be made safe, keep it in the prompt layer and record why.

## Pull requests

1. Create a focused feature branch.
2. Use conventional commit prefixes such as `feat:`, `fix:`, `docs:`, or `chore:`.
3. Open a pull request and complete its checklist.
4. Keep generated output current with `npm run build`.
5. Squash-merge after review and green CI.

Before requesting review, run the relevant tier plus:

```bash
npm run typecheck
npm run build
git diff --exit-code -- agents skills dist
```

Do not create a release, tag, or version bump unless the owner explicitly requests it. Features merge continuously to `main`; releases are separate owner-directed work.
