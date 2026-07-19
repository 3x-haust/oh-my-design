# LEGO reference browser-rs final manual QA

Verdict: **PASS with one bounded fixture limitation; confidence HIGH (0.90)**.

Scope: chat-only LEGO reference workflow, Pinterest-like local fragment provenance, bilingual source-part → target report, browser-rs with Playwright fallback, and explicit Codex/Claude installs. No source edits, reinstall, host-config mutation, or foreign browser/profile changes were made.

## surfaceEvidence

| id | criterion | surface / exact invocation | verdict | artifactRefs |
|---|---|---|---|---|
| P0-S01 | installed versions | `$HOME/.local/bin/omd --version`; `$HOME/.local/bin/oh-my-design --version` | PASS; both 0.16.1 | A1,A2 |
| P0-S02 | browser provider doctor | `$HOME/.local/bin/oh-my-design browser doctor --json` | PASS; healthy path provider | A1 |
| P0-S03 | host doctor | `$HOME/.local/bin/oh-my-design doctor` | PASS; Codex and Claude all checks [ok] | A1,A2 |
| P0-S04 | project doctor | `$HOME/.local/bin/omd doctor --json` | PASS; runtime, Chromium, writable `.omd`, theory pack | A1 |
| P0-S05 | board prohibition | `command -v omd-board` absence check | PASS; absent | A1,A2 |
| P0-S06 | fresh-shell binary resolution | fresh `zsh -lc` and `zsh -lic` for bare `oh-my-design` and `omd` | PASS; both resolve to `$HOME/.local/bin`, both 0.16.1 | A1,A7 |
| P0-S07 | foreign collision preservation | inspect task-15 collision disclosure, foreign hashes, and fresh-shell resolution | PASS; foreign package remains installed/preserved but no longer wins bare-command PATH resolution | A2,A7 |
| P0-S08 | chat-first integration | installed audit fields `candidateTableInChat`, `bilingualFinalReportInChat`, `boardPayloadEmbeddedInPrompt` | PASS; true, true, false | A2 |
| P0-S09 | valid image provenance import | isolated `omd ref import-image valid.json --json` | PASS; image-fragment-v1, local PNG hash, Pinterest page/image, crop/license/rights/time | A1 |
| P0-S10 | invalid image rejection | isolated `omd ref import-image invalid.json --json` | PASS; non-zero and missing/non-PNG evidence rejected | A1 |
| P0-S11 | selector-scoped capture | isolated `omd ref add fixture.html --as scoped-card --selector .card --blueprint --shot --no-energy` | PASS; exit 0, 3 blueprint nodes, shot | A1 |
| P0-S12 | off-selector decoy exclusion | inspect capture output and task-15 decoy fields | PASS; decoys absent from captured evidence and assembly transfer | A1,A2 |
| P0-S13 | browser-rs loopback smoke | `oh-my-design browser smoke --fixture test/fixtures/probe.html --out <owned-temp>.png --json` | PASS; exit 0, typed `OMD Smoke User`, `Ready: OMD Smoke User`, non-empty 1280x713 PNG | A1 |
| P0-S14 | smoke cleanup boundary | inspect smoke-reported temp profile and task-15 cleanup record | PASS; task-owned profile/package cleanup complete; foreign profile untouched | A1,A2 |
| P1-S01 | candidate evidence gate | task-3 retained `check.out` and task-15 audit | PASS; candidates only after checked evidence | A3,A2 |
| P1-S02 | candidates chat Markdown | task-3 retained `candidates.md` | PASS; Korean-first candidate table, no board UI | A3 |
| P1-S03 | selection binding | task-3 retained `select.json` and `reference-selection.json` | PASS; selection hash-bound | A3 |
| P1-S04 | stale PNG rejection | task-3 `stale-png-valid.status` / `stale-png-valid.err` | PASS; stale evidence rejected non-zero | A3 |
| P1-S05 | stale provenance rejection | task-3 `stale-provenance.status` / `.err` | PASS; stale provenance rejected non-zero | A3 |
| P1-S06 | invalid/stale selection rejection | task-3 `injection-rejection.txt` and selection artifacts | PASS; invalid candidate/selection does not proceed | A3 |
| P1-S07 | usage ledger statuses | installed audit `usageStatuses` | PASS; exactly observed `used` and `rejected` rows | A2 |
| P1-S08 | bilingual report | task-13 `reference-report.md`; installed audit | PASS; Korean/English source-part → target report generated | A2,A4 |
| P1-S09 | missing production evidence failure | task-15 retained command/audit plus usage contract tests | PASS; missing evidence is a finalization failure, not a claimed influence | A2,A5 |
| P2-S01 | MCP parity | `.mcp.json` structural inspection (server keys only) | PASS; only `browser-rs`, isolated launcher | A2 |
| P2-S02 | installed runtime parity | final reinstall audit confirms installed health, install, stdio, and README parity | PASS | A8 |
| P2-S03 | browser fallback readiness | project doctor Chromium pass plus README contract | PASS; Playwright Chromium available | A1,A5 |
| P2-S04 | no credential leakage in evidence | current bounded repository scan | PASS; credential, bearer-format, and private-history findings are zero; two Hyphen AI credentials still require external rotation (no values) | A2 |

## adversarialCases

| id | criterion | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| ADV-P0-01 | preservation | foreign global collision | Preserve unrelated package while the OMD launcher wins fresh login-shell PATH resolution | PASS | A2,A7 |
| ADV-P0-02 | preservation | unreceipted foreign browser | Do not adopt/delete/claim ownership | PASS | A2 |
| ADV-P0-03 | selector scope | off-selector decoy geometry/text | Capture only user selector | PASS | A1,A2 |
| ADV-P0-04 | provenance | missing/non-PNG image | Reject before persistence/transfer | PASS | A1,A3 |
| ADV-P0-05 | evidence freshness | stale PNG/provenance | Reject check and downstream candidates | PASS | A3 |
| ADV-P0-06 | selection | unknown candidate id | Reject; no unconfirmed selection | PASS | A3 |
| ADV-P0-07 | protocol | board/UI leakage | Keep candidate/report in chat; no `omd-board` | PASS | A1,A2,A3 |
| ADV-P1-01 | usage ledger | missing/unsupported production evidence | Final report fails closed | PASS | A2,A5 |
| ADV-P1-02 | smoke safety | stale foreign process/profile | Leave the unrelated Threads-automation profile process untouched | PASS | A2,A6 |
| ADV-P1-03 | report integrity | rejected/anti rows claim influence | Permit only valid status/property combinations | PASS | A2,A4 |
| ADV-P2-01 | cleanup | owned temp profile/package | Remove owned resources only | PASS | A2,A6 |
| ADV-P2-02 | secret safety | authorization/token/history paths | Sanitize artifacts; no token/bearer values | PASS | A1,A2 |

## artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | command-log | Sanitized final hands-on versions/doctors/import/selector/smoke observations | `.omd/evidence/lego-reference-browser-rs-final-qa-commands.log` |
| A2 | audit | Current installed audit: doctor parity, collision/path resolution, chat/MCP parity, usage/report, cleanup, and zero-count bounded evidence-safety scan | `.omd/evidence/lego-reference-browser-rs/task-15/installed-audit.json` |
| A3 | retained-fixture | Existing checked candidate, stale, invalid-selection, and injection-rejection artifacts | `.omd/evidence/lego-reference-browser-rs/task-3-manual-qa/` |
| A4 | report | Existing bilingual report and usage evidence | `.omd/evidence/lego-reference-browser-rs/task-13/reference-report.md` |
| A5 | protocol/test evidence | Existing usage/report validation and browser fallback test logs | `.omd/evidence/lego-reference-browser-rs/task-13/review.md` and task-15 logs |
| A6 | cleanup-log | Existing owned-resource cleanup and foreign-process preservation record | `.omd/evidence/lego-reference-browser-rs/task-15/cleanup.txt` |
| A7 | path-resolution | Sanitized backup-first post-mise local-bin precedence, fresh-shell resolution, foreign preservation, and recoverable fixture cleanup | `.omd/evidence/lego-reference-browser-rs/task-15/path-resolution-fix.md` |
| A8 | reinstall-audit | Installed health, install, stdio, and README parity after final reinstall | `.omd/evidence/lego-reference-browser-rs/task-15/final-reinstall-audit.json` |
| A9 | final-gate | Final unchanged-input test, typecheck, build, generated-output counts, and source-test summary | `.omd/evidence/lego-reference-browser-rs/final-gate/final-gate-summary.md` |

## blockers

The fresh isolated selector fixture was intentionally exercised, but its minimal browser screenshot was not reused as a final board candidate because the validator correctly rejected the low-signal/invalid fixture evidence during custom assembly construction. This is a bounded fixture limitation, not a product failure: retained task-3 checked fixtures plus task-15 sanitized command/audit evidence provide the passing candidate/selection/stale/report evidence. No external prerequisite remains.
