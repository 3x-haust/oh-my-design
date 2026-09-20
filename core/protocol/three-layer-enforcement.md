# Three-layer enforcement

Applies to the current user-authorized OMD route, not unrelated repository work. A selected
stage is mandatory; an explicit route skip remains a skip. Repetition alone is not enforcement.

## Layer 1 — declaration

| Rule | Required outcome | Executable boundary |
| --- | --- | --- |
| Selected stages | Preserve the approved scope and dependency groups; never relabel product UX to evade an error. | `omd brief <stage> --check --json`; `omd guard production --json` |
| Separate research | When selected, domain task/feature evidence and design craft evidence remain distinct, with current per-screen application decisions. A failed search is a gap, not a fabricated reference. | `omd ref research-check --json`; `omd ref apply-check --json`; production/completion gates |
| Executed discovery | Query prose is not a search receipt. Retained non-user entries trace to actual observed links and separately captured visits. | `omd ref search --input <json>`; v5 research publication/currentness checks |
| Rendered reference use | Every screen criterion has current desktop/mobile capture judgments; unresolved or stale results cannot complete. | Source seal binds the application; `omd ref apply-review-check --json`; terminal preflight |
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
5. For selected dual research, after source repairs and authenticated final evidence, run
   `omd ref apply-review-plan --json`, inspect its exact current captures against every criterion,
   and publish `omd ref apply-review-set --input <review.json>`. A `revise` judgment can be saved
   but must be repaired, recaptured and reviewed again before `apply-review-check` passes.
   A justified departure requires its concrete observed reason; it is not user approval.
6. After source repairs and current final evidence, run `omd guard completion --json` before
   a completion report. Repair/recheck within the existing task, or report the exact blocker.

Entry success proves current prerequisites only, not output quality or final completion. Never
write a success receipt, weaken the route, erase findings or manufacture review independence
to turn a check green. Missing user facts or authority require a truthful stop. Read-only
inspection and research repair remain available while production is blocked.

## Layer 3 — automatic refusal

- `brief --check` exits nonzero for a missing route, an unselected stage or entry blockers.
  Its production mode uses the same readiness validator as `guard production`.
- Research v5 refuses missing/mismatched search receipts or retained links unreachable from observed
  search pages and separately validated native navigation captures. Each optional lane `navigation`
  item binds its URL, PNG evidence and JSON capture; only observed outbound links extend reachability.
  A blocked provider can be replaced with another free public source, never a paid
  MCP or invented receipt. Native GET capture is not an automatic search-quality judgment.
- Application review refuses missing criteria/viewports, changed application/build/seal, unrelated
  observations/captures/states, and unresolved revisions. It consumes the existing authenticated
  final graph, not a caller-selected substitute graph. Review history remains content-addressed.
  Application v2 fixes each screen's destination-relative route and state before production; a home
  capture cannot satisfy a different screen just because its pixel hash is current.
- First-render checking captures a local build natively and binds the retained report to the
  hypothesis, source, build, capture and exact interpreted projection. Terminal validation recomputes
  the report and input identities. Advisory findings stay advisory; comparison applies only when the
  hypothesis explicitly requires it. The projection remains agent-authored, not human approval.
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

The v2 task-flow benchmark's prose and artifact hashes alone still do **not** attest multi-screen
actions. `benchmark record` executes declared public link/disclosure chains and signs step/capture
receipts. Selected product benchmarks require those receipts for every declared completed flow;
blocked/excluded controls remain explicit gaps. `liveFlowVerified` applies only to those completed
flows, never every control in the service or authenticated transactions.

Stateful slop scope records `name/startRoute/route/actions/assertions` per view. Capture preserves
the opened state; final linked states need matching route/state/viewport and exact viewport pixels
from the authenticated final capture. Replay deterministic fixtures and settled states; a label alone
never proves an open modal. Native signatures reject rehashed checkpoint/inventory substitutions.
Runtime design
inventory uses the same isolated local-state executor and records computed styles/custom properties
by component, with exact input-to-component and build coverage. Source/build/capture changes invalidate reuse.
All local views, including the default entry, refuse external
networking and non-read-only requests; use bundled fixtures, not live APIs.
Local inspection has a 30-second per-view deadline; public reference flows have a 120-second
whole-flow deadline, covering local serving/context setup, work and context/server teardown.
A timeout permits at most two additional seconds for best-effort cleanup; late resources are closed,
not reused. The shared browser provider separately bounds launch at 30 seconds and close at two.
A stalled page cannot publish a completed observation. These cooperative async bounds are not
an operating-system watchdog or a guarantee against a blocked filesystem/kernel.
