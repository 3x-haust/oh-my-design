# Manual QA matrix

## surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| S1 | Plan chat-first override; Must-have 17-18 | local `omd ref` CLI | `node bin/omd.ts ref add <temp>/source.html --as card --selector .card --blueprint --shot --no-energy`; then `node bin/omd.ts ref import-image <temp>/fragment-input.json --json` | PASS | add/import outputs and [fragment-record.json](fragment-record.json) |
| S2 | Must-have 3, 17-20, 23 | local `omd ref` CLI chat formatter | `node bin/omd.ts ref check --json`; `node bin/omd.ts ref candidates` | PASS | [check.out](check.out), [candidates.md](candidates.md), [reference-board.json](reference-board.json) |
| S3 | Must-have 22 | local `omd ref` CLI selection | `node bin/omd.ts ref select atmosphere --json` | PASS | [select.json](select.json), [reference-selection.json](reference-selection.json) |
| S4 | Must NOT have 9; override forbids board UI/bin | filesystem/package inventory | `test ! -e bin/omd-board.ts && test ! -e bin/omd-board.mjs && ! rg omd-board package.json bin` | PASS | [board-absent.status](board-absent.status) |

## adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| A1 | Must-have 22; raw provenance hash binding | stale state (provenance) | Mutating fragment provenance after selection must make `omd ref check` fail with board-hash mismatch. | PASS | [stale-provenance.status](stale-provenance.status), [stale-provenance.err](stale-provenance.err) |
| A2 | Must-have 4, 17; PNG integrity | stale state (image bytes) | Replacing the fragment with a different valid PNG must fail before selection is trusted. | PASS | [stale-png-valid.status](stale-png-valid.status), [stale-png-valid.err](stale-png-valid.err) |
| A3 | Must-have 3, 6; contamination boundary | malformed/injection input | Candidate content containing markup/control/source payloads must be rejected; run observed rejection for `<script>`/`<b>` and slash-bearing payloads before the final safe Korean/English manifest. | PASS | [injection-rejection.txt](injection-rejection.txt) (rejection transcript), [candidates.md](candidates.md) |

## artifactRefs

| id | kind | description | path |
|---|---|---|---|
| AR1 | markdown | Korean-first two-candidate chat table with Pinterest page, captured region, target, take/avoid/adaptation | candidates.md |
| AR2 | json | Validated two-candidate raw board with component and image-fragment pieces | reference-board.json |
| AR3 | json | Hash-bound selected candidate record | reference-selection.json; select.json |
| AR4 | transcript | Invocation/status summary | invocation-results.txt |
| AR5 | transcript | Stale provenance and PNG failure outputs | stale-provenance.err; stale-png-valid.err |
| AR6 | transcript | Confirmed no `omd-board` package/bin | board-absent.status |
