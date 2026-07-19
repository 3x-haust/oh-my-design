# Final gate summary

The final unchanged-input command was:

```bash
npm test && npx tsc --noEmit && npm run build
```

Result: exit 0.

- `npm test`: 1,369 total; 1,368 pass; 0 fail; 0 cancelled; 1 expected platform skip.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Generated-output counts: Codex 11 emitted files and 6 skills; Claude 11 emitted files and 6 skills; each host has 9 agent files; root plugin 6 skills and 9 agents.

Pre-fix focused browser-rs failures were remediated and are not retained as final evidence. Final source coverage includes `test/browser-rs-doctor-runtime.test.ts`, `test/browser-rs-install.test.ts`, `test/browser-rs-smoke.test.ts`, `test/packed-bin-runtime.test.ts`, `test/ref-candidates-cli.test.ts`, and `test/reference-report.test.ts`.
