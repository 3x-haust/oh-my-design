# Three-layer enforcement

Applies to the current user-authorized OMD route, not unrelated repository work. A selected
stage is mandatory; an explicit route skip remains a skip. Repetition alone is not enforcement.

## Layer 1 — declaration

| Rule | Required outcome | Executable boundary |
| --- | --- | --- |
| Selected stages | Preserve the approved scope and dependency groups; never relabel product UX to evade an error. | `omd brief <stage> --check --json`; `omd guard production --json` |
| Separate research | When selected, domain task/feature evidence and design craft evidence remain distinct, with current per-screen application decisions. A failed search is a gap, not a fabricated reference. | `omd ref research-check --json`; `omd ref apply-check --json`; production/completion gates |
| Current copy and design inputs | Selected copy, current copy review, type proof, composition and candidate selection must exist and satisfy their applicable checks before source work. A PRD or stub is not their replacement. | Production readiness and its current-artifact validators |
| Source ownership | Only the authorized owner and paths may change. A recipe is a source write too. | Pi write/edit boundary; routed `recipe add` inside the CLI |
| Review closure | Inspect rendered findings, repair confirmed issues or record supported exclusions, and recheck the same scope. A new unreviewed scan cannot clear an old issue. | Slop review closure and final evidence preflight |
| Truthful completion | Report only the verified delivery mode. A design handoff is not an implemented app; same-session review is not independent review. | `omd guard completion --json`; Pi final-message boundary |

## Layer 2 — procedure

The coordinator reads this contract once at OMD intake. At each selected stage:

1. Read `omd brief <stage> --json` for inspection. This default command may return blockers
   with exit 0; it is not permission to start.
2. Deliver the named current contracts and repair applicable upstream inputs. Run the brief's
   `entryGate.command` (`omd brief <stage> --check --json`). A nonzero result stops that stage.
   Production entry also runs the full production readiness validator; a file-presence brief
   cannot substitute for it.
3. Supply only the owner's permitted inputs and the applicable entry/check outcome. Never send
   a raw coordinator brief, source references or gate diagnostics to an isolated blind reviewer.
4. Execute the owned work, then its applicable `judgedBy` checks. Checks outside an owner's
   authority go back to the coordinator; they do not expand the owner's write/browser grant.
5. After source repairs and current final evidence, run `omd guard completion --json` before
   a completion report. Repair/recheck within the existing task, or report the exact blocker.

Entry success proves current prerequisites only, not output quality or final completion. Never
write a success receipt, weaken the route, erase findings or manufacture review independence
to turn a check green. Missing user facts or authority require a truthful stop. Read-only
inspection and research repair remain available while production is blocked.

## Layer 3 — automatic refusal

- `brief --check` exits nonzero for a missing route, an unselected stage or entry blockers.
  Its production mode uses the same readiness validator as `guard production`.
- Routed `recipe add` checks readiness and every materialized target **before the first source
  write**, even when invoked directly without the Pi extension. Standalone recipe use without
  an OMD route remains standalone; `recipe show/list` are inspection, not implementation.
- Pi checks native write/edit and non-allowlisted shell calls at the source boundary and checks
  final messages after OMD mutations. CLI-owned evidence cannot be directly authored. Failed
  completion may trigger at most two repair turns for an actual source-writing task; aborts,
  missing authority and research-only turns do not authorize automatic implementation.
- CI tests refusal, zero source writes on refusal, stale-input invalidation and legitimate
  success. A prompt-only rule must not be described as a hard gate.

These checks do not attest taste, observation honesty or operating-system isolation. A host
without Pi hooks has explicit CLI gates only; arbitrary external file-writing processes remain
outside that boundary. Final reviewer authorization is retained, never simulated.
