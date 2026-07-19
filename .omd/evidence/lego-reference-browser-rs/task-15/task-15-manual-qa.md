# Todo15 final independent manual QA

Verdict: **APPROVE**

### surfaceEvidence

| scenario | criterion | surface / invocation | verdict | artifactRefs |
|---|---|---|---|---|
| S1 | install/version | fresh `zsh -lc` and `zsh -lic` for bare `omd` and `oh-my-design` | PASS; both resolve to `$HOME/.local/bin`, both `0.16.1` | A1, A7 |
| S2 | browser/host/project doctors | explicit browser JSON doctor; Codex and Claude host doctors; project `omd doctor` | PASS, all exit 0 | A1 |
| S3 | preservation/collision | inspect fresh PATH resolution, foreign manifest/browser hashes, receipt state | PASS; foreign package is preserved but no longer PATH-winning; browser receipt absent | A1, A2, A7 |
| S4 | fresh selector workflow | installed `omd ref add <temp>/fixture.html --as scoped-card --selector .card --blueprint --shot --no-energy` | PASS, exit 0; 3 blueprint nodes; no `__name` error | A3 |
| S5 | selector exclusion | search captured `.omd` evidence for distinct off-selector values `777`, `149`, `263`, and decoy marker | PASS; decoy absent | A3 |
| S6 | chat-first/report duties | inspect installed audit and retained fixture outputs for candidates, selection, used/rejected usage, bilingual report | PASS | A2, A4 |
| S7 | smoke/cleanup | retained installed loopback smoke (`Ready: OMD Smoke User`, PNG) and cleanup record; foreign profile process left untouched | PASS | A5, A6 |
| S8 | board prohibition | `command -v omd-board`; installed-prefix search | PASS; no executable/UI | A1, A2 |

### adversarialCases

| scenario | criterion | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| ADV1 | preservation | foreign global collision | Do not overwrite unrelated global package | PASS | A1, A2 |
| ADV2 | preservation | unreceipted browser | Do not adopt/delete/claim ownership of foreign target | PASS | A1, A2 |
| ADV3 | selector scope | off-selector decoy geometry | Capture only `.card`; decoy values absent from evidence/transfer | PASS | A3, A2 |
| ADV4 | smoke safety | stale foreign process/profile | Leave the unrelated Threads-automation profile process untouched | PASS | A6 |
| ADV5 | protocol | board/UI leakage | Candidate table/report stay chat-first; no `omd-board` payload | PASS | A2, A4 |
| ADV6 | cleanup | task-owned temp/profile/process | Remove owned temp package/profile/server; do not retain independent QA log | PASS | A2, A6 |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | command-log | Sanitized final QA command record | [commands-qa.log](./commands-qa.log) |
| A2 | audit | Installed hashes, collision disclosure, MCP/chat/report duties, cleanup flags | [installed-audit.json](./installed-audit.json) |
| A3 | command-observation | Fresh installed selector capture with decoy absence and clean temporary fixture handling | [final-selector-run.log](./final-selector-run.log) |
| A4 | report | Bilingual validated usage report | [../task-13/reference-report.md](../task-13/reference-report.md) |
| A5 | screenshot | Retained loopback browser smoke PNG | [smoke/browser-rs.png](./smoke/browser-rs.png) |
| A6 | cleanup-log | Owned smoke/temp cleanup and foreign-process preservation | [cleanup.txt](./cleanup.txt) |
| A7 | path-resolution | Sanitized backup-first local-bin precedence, fresh-shell resolution, foreign preservation, and recoverable fixture cleanup | [path-resolution-fix.md](./path-resolution-fix.md) |

No source edit, build, commit, release, reinstall, or host-config mutation occurred during this QA cycle.
