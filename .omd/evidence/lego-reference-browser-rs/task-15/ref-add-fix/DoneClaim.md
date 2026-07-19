# DoneClaim — installed `ref add` serialization

## Root cause

The packaged `.mjs` launcher loads TypeScript through `tsx`. Its esbuild transform adds a module-scoped `__name` helper around local callbacks in `extractInPage`; `Function.toString()` preserves the helper call but not the helper binding. The browser realm therefore raised `ReferenceError: __name is not defined` during installed `omd ref add`. Native source execution did not emit that helper and was unaffected.

## Delivered change

- `core/render/index.ts`: adds `browserEvaluationExpression()`, which injects only one local identity `__name` binding. It does not pre-scan, parse, or shim other helper-shaped source text; an unknown identifier therefore remains unbound and naturally fails in the isolated browser realm.
- The wrapper is applied to all three stringified browser callbacks: DOM extraction, motion snapshot, and reduced-motion checking. Selector arguments remain JSON-encoded at the extraction call site.
- `test/render-serialization.test.ts`: 3 deterministic isolated-realm behavioral tests cover supported `__name`, natural `__1` `ReferenceError`, and safe evaluation of helper-shaped strings, comments, and object properties.
- `test/packed-bin-runtime.test.ts`: 1 new offline packed-install CLI regression creates a fresh local HTML fixture, uses real Chromium when available, runs installed `omd ref add --selector`, and verifies the stored component record's source, component, kind, `.card` selector, radius, and padding measurement.

## Evidence

- RED: [red.md](./red.md) records the fresh offline installed reproduction: exit `1`, `ReferenceError: __name is not defined`.
- GREEN: [green.md](./green.md) records the same packed command after the fix: exit `0`, persisted `fixture.card.json`.
- The source control command with the same local fixture and selector also exited `0`.

## Verification counts

- 3 serialized page callback sources covered by the shared wrapper.
- 3 new behavioral serialization tests passed.
- 1 new real packed/offline installed CLI regression passed with Chromium available.
- 5 focused capture/reference/motion/packed suites passed with 0 failures.
- Full `npm test` completed with exit 0 after the build.
- `npx tsc --noEmit --pretty false` and `git diff --check` completed clean.
- `npm run build` completed once after the source fix (`codex: 11 files, 6 skills`; `claude: 11 files, 6 skills`; root plugin: 6 skills, 9 agents); the subsequent full suite covered generated-output parity.

## Cleanup

The three task-owned temporary packed/source repro directories and the temporary debug journal were removed. Only this sanitized fixture and RED/GREEN/DoneClaim evidence remain; no environment, home-directory, credential, or history data was captured.
