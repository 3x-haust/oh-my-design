# Three-layer enforcement

Applies to the current user-authorized OMD route, not unrelated repository work. A selected
stage is mandatory; an explicit route skip remains a skip. Repetition alone is not enforcement.

## Layer 1 — declaration

| Rule | Required outcome | Executable boundary |
| --- | --- | --- |
| Route setup | Use the task-appropriate starter; preserve user facts, risk, scope and selected work while repairing input errors. Input validity is not publication or task completion. | `omd route validate --input <json> --json`; `route classify`; Pi setup recovery |
| Selected stages | Preserve the approved scope and dependency groups; never relabel product UX to evade an error. | `omd brief <stage> --check --json`; `omd guard production --json` |
| Separate research | When selected, domain task/feature evidence and design craft evidence remain distinct, with current per-screen application decisions. New domain research inspects at least three independent operator families after redirects; pages or subdomains under one operator count once. A failed search is a gap, not a fabricated reference. | `omd ref research-check --json`; `omd ref apply-check --json`; production/completion gates |
| Executed discovery | Query prose is not acquisition evidence. Retained non-user entries trace to actual observed links and separately captured visits. | `omd ref search --input <json>` or `omd ref navigate`; current v7 research publication/currentness checks |
| Rendered reference use | Every screen criterion has current desktop/mobile capture judgments; unresolved or stale results cannot complete. | Source seal binds the application; `omd ref apply-review-check --json`; terminal preflight |
| Current copy and design inputs | Selected copy, current copy review, type proof, composition and candidate selection must exist and satisfy their applicable checks before source work. A PRD or stub is not their replacement. | Production readiness and its current-artifact validators |
| Source ownership | Only the authorized owner and paths may change. A recipe is a source write too. | Pi write/edit boundary; routed `recipe add` inside the CLI |
| Review closure | Inspect rendered findings, repair confirmed issues or record supported exclusions, and recheck the same scope. A new unreviewed scan cannot clear an old issue. | Slop review closure and final evidence preflight |
| Truthful completion | Report only the verified delivery mode. A design handoff is not an implemented app; same-session review is not independent review. | `omd guard completion --json`; Pi final-message boundary |

## Layer 2 — procedure

The coordinator reads this contract once at OMD intake. Before stage entry, inspect `stack` and use
`schema product-route-input` for a new product implementation, `schema design-route-input` for a
pre-implementation handoff, or `schema route-input` for existing/bounded work. Replace example facts,
axes, scope and optional decisions with the actual request. Wave mode is always `concurrent`; array
order sequences dependency groups. A sequential host fallback does not change that data contract.
Run `route validate --input <json> --json`, repair its grouped diagnostics together, then classify the
same input with the same locale context and run `stage resume`. Do not use completion to diagnose
unclassified input. Classification never substitutes for the selected research, copy or design outputs.
Run `stage next --json` immediately and after owned output changes. It identifies missing/malformed
authored work, undelivered entry contracts and early planning provenance gaps; it never marks the route complete. A structural
domain check can pass with unconfirmed planning. Check the original user brief before asking for
missing facts; do not invent confirmation or silently reduce implementation scope to a prototype.
Use `schema frame` and `frame set --input` for atomic framing, then `frame check`. Functional
requirements use their own `complete set` publisher and cannot substitute for the task matrix.
The domain brief's request must preserve the current route request verbatim. A shortened or
different request stays with the domain owner and earns no validated-stage progress.
Use `copy review-input --json` to send exact copy content and digest together to the reviewer.
Preserve its returned report in a separate input file and use `copy review-publish`; never guess
the hash or repair only the hash on an old verdict. Every writer edit requires a fresh review.
For other evidence and composition fingerprints, `omd hash <.omd/artifact-path> --json` supplies
the exact current file digest without invoking a shell. It neither creates nor approves evidence;
use the digest only for the actual bytes inspected. Authority files and escaping paths are refused.

Within `reference-board`, `stage next` first preserves structural/entry repairs, then directs Scout
to `author-research` while either published lane is missing or stale. After research passes, it
directs `apply-references` to `ref apply-plan --json` for current per-surface decisions. Recompute
the pointer after native publication. Do not repeatedly run a passing board entry check or author
application decisions before their research exists. These actions do not add route stages or
validated-progress credits; stale research takes precedence over a missing application file.

When `stage next` returns `reference-interpretation`, the coordinator owns that prerequisite work;
it is not a new adaptive stage and must not be added to route input. Read `judgment input --json`
and `schema design-judgment`, interpret the inspected observations, then publish with `judgment publish`.
The input command supplies the resolved board's canonical evidence digest, which is different from
the storage-manifest digest used by research. Run `judgment check --json` and recompute `stage next`.
Scout does not impersonate the interpreter; Composer consumes the result. A changed board needs a
new interpretation, not a new hash attached to an old verdict.
For selected candidates, enter the Sketch stage and dispatch the isolated candidate work. Sketch
owns its assigned directory, not the selection pointer. The coordinator records the actual rendered
selection, reads `schema candidate-selection`, and publishes it through `candidate select`. A legacy
folder name, missing pointer or changed candidate bytes never completes this selected stage.

At each selected stage:

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
  It invokes the selected dependency graph and validates upstream domain/frame/copy structure;
  same-wave independent Scout/Writer work remains available. It never checks for the output that
  the entering owner is about to create. Plain brief and frame show remain inspection only.
  Its production mode uses the same readiness validator as `guard production`.
- Research v6/v7 permit actual search or explicit native direct-public roots; v5 keeps its original
  search requirements unchanged. Both refuse missing/mismatched declared search receipts or retained
  links, and current v6/v7 domain research requires at least three retained comparable services from three
  independent operator families. Multiple pages or subdomains under one operator such as GOV.UK
  count once; historical v5 remains readable but cannot be relabelled as new research. Both refuse
  links unreachable from observed discovery. Current v7 market coverage additionally requires signed
  search-v2 or direct-entry-v2 provenance tied to exact observed links and the explicit market. Search
  provenance binds visible result text to its link; a localized query alone is insufficient. A ccTLD
  or authored reason is insufficient. Direct roots require native capture-time purpose,
  correct lane, public-list admission, current PNG/JSON and actual visible links. Empty query/search
  arrays require valid nonempty roots. Old navigation cannot become a root; direct chains require
  strict navigation-v2, never hidden all-DOM retained-capture edges or the root URL itself.
  Selected discovery also refuses missing capture lanes and design intake without
  free gallery/original-link or actual user-supplied provenance before capture. The current
  reference-board work pointer requires published research and per-surface application, not just
  a board file. Publication still performs visual-role, source independence and currentness checks.
  Batch intake also compares pending entries before any browser work. `ref navigate` keeps
  discovery-only category pages outside the board inventory; its observed links still need
  search-rooted or explicit direct-entry native evidence. `ref board` resolves all evidence before replacing its record.
  Final URL checks run before PNG publication; redirected hosts and simultaneous batch captures
  cannot enter opposite lanes under different starting URLs. A gallery redirect must still be a
  qualified item, unless the reference was genuinely supplied by the user.
  Research reachability extends from
  search pages and separately validated native navigation captures. Each optional lane `navigation`
  item binds its URL, PNG evidence and JSON capture; only observed outbound links extend reachability.
  A blocked provider can be replaced with another free public source, never a paid
  MCP or invented receipt. Native GET capture is not an automatic search-quality judgment.
  New search receipts retain only rendered links in the captured viewport and require stable
  pre/post-capture observations, with at most one recapture. An empty rendered result is
  `empty-observation`, not success or an invented challenge; inspect it and use another public
  source. This does not retroactively give historical receipts a visibility guarantee.
  Direct entry and new navigation captures use isolated GET/HEAD-only contexts with no interactive
  probes, service workers or downloads. Design roots must expose actual same-gallery items and stay
  public lists after redirects, never login walls or domain documentation. Roots do not assert taste,
  official authority or asset rights. Their hosts/images remain subject to lane separation, and raw
  discovery paths/declared or redirected hosts cannot enter source-free application projections.
  Search/entry/navigation outputs live under `.omd/discovery/`, outside retained `.omd/refs/`.
  Native free-gallery query inputs support discovery without guessed item URLs. Search and navigation
  receipts cannot be promoted into retained design evidence. Selected board resolution and briefs
  re-admit old captures; research publication binds every visual piece to its qualified source.
  `ref tidy` previews legacy diagnostics/ineligible captures and `--apply` archives exact bytes
  before guarded removal; it never rewrites evidence hashes or silently approves old judgments.
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
  completion triggers a progress-driven repair/recheck loop for an actual source-writing task. It has
  no fixed total pass ceiling while owned artifacts or the current work pointer advance; the same
  verified state without successful repair activity stops after two recovery turns. Aborts,
  missing authority and research-only turns do not authorize automatic implementation.
- Pi keeps automatic work visible at meaningful phase boundaries without narrating every tool call.
  Before each queued route, stage or completion repair, the visible assistant message names the
  current state, next owner/action and following validation command. The follow-up instruction repeats
  that communication contract so a long repair turn starts with the same concise orientation.
- For a route authored and successfully classified in this user turn, after a checked stage entry,
  Pi diagnoses unfinished authored stages with `stage next` before terminal completion. It can queue
  correction turns while successful owned mutations or a genuinely new current work pointer prove
  progress. The same state can receive two recovery turns before the host stops a no-progress cycle;
  route replacement cannot manufacture progress. An existing route can also enroll when this
  user turn invokes the full omd-ultradesign skill alone, with no additional user prose, passes a
  selected entry check and successfully publishes or writes that owner's work. The skill name inside
  a longer request does not grant unrestricted automatic continuation: the prose may impose a
  narrower scope or stop. This conservative rule is not a natural-language intent classifier.
  Requested work and explicit validation remain available. A failed write or publisher help is not work.
  Existing-route inspection, research-only work, route-only classification, new user input and aborts
  do not authorize this continuation. Selected native Scout/Copy/Type/Composition writes recheck
  current entry before mutation; cache inputs and legitimate upstream repairs remain available. Unknown
  authority errors stop; unresolved planning reports the actual statements needing user evidence.
  Production planning confirmation is not imposed on design-only handoffs, which may retain
  explicit open questions; their application-write prohibition remains unchanged.
- Before initial route publication, Pi revalidates the current authored input at termination and
  reports its actual diagnostic groups rather than replacing them with `ROUTE_UNCLASSIFIED`.
  Known input errors use the same progress-driven rule. Read-only inspection, aborts, unknown errors,
  missing user facts/authority and pre-existing routes do not authorize bootstrap repair. An input-only
  repair does not authorize classification; retrying an already-attempted classification preserves
  the same user-authorized delivery mode. No extension writes or publishes a route on the model's behalf.
- `route validate` and publication share the canonical checks. Grouped diagnostics do not normalize
  the input, lower risk, invent evidence, remove gates, create authority or write project state.
  All provided route starters are regression-checked for their internal prerequisite consistency.
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
