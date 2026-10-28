# Autonomous design and private developer evaluation

OMD designs like a person: it investigates, interprets, makes, looks, compares and
repairs. The normal user supplies the request, not a sequence of design approvals.

## Scope

This integration targets native Pi. Both modes use the existing route, reference
selection, browser evaluator, independent reviewers, repair
transactions and output artifacts. No second production pipeline or evaluation
web application is introduced.

Normal execution uses `autonomous` unless the host process starts with
`OMD_DESIGN_MODE=developer-evaluation`. A project file, external page, model
argument, legacy checkpoint setting or low confidence cannot enable interviews.
Mode and criterion version are signed into the native run identity. Changing
mode, runtime or criteria requires a fresh project/run, not an edited receipt.

The normal path is:

```text
original request -> understand outcome and scope
-> useful research/references and model-chosen methods
-> direct scoped implementation or model-chosen delegation
-> first usable build: isolated desktop/mobile quality read and concrete repair
-> lifecycle finish: package checks, real browser captures,
   independent behavior, fidelity (when selected) and quality review
-> concrete repair -> verified result with honest limitations
```

The host defaults to `model-led-design-v1`: unselected methods do not need written skips,
candidate competitions, role handoffs or intermediate documents. The harness records execution
facts automatically and rejects unchanged automatic retries. Real changed repairs are not capped
at three attempts. Explicit `OMD_DESIGN_WORKFLOW=structured`, design-only and benchmark/release
retain the structured method and maker contracts. Selected reference work still requires genuine
admission; omission never becomes a reference-fidelity claim.

Before inventing a new visual direction, the model inspects aesthetically strong
finished-product screens. This is design practice, not a new intermediate-document,
candidate-count or approval gate. Present the actual consulted whole originals and
source URLs beside generated desktop/mobile screens, with concrete transferred
structure and limits. Model-led completion requires one request-scoped primary except
for typed copy-only work or a structurally supplied Figma file/design target. Named
hover, focus, pressed, and open originals require corresponding real product state
captures at desktop and mobile; missing correspondence refuses instead of becoming a
generic static comparison. Research images
remain comparison evidence, never shipped product assets or retrospective proof.

Resolve a coherent primary visual system before styling. Additional originals may support
specific missing states, but their incompatible palettes, density or component anatomy
must not be averaged into a generic composite. Domain-function evidence remains separate
from aesthetic direction. Compare the real first render with the primary original for
macro composition, typography, density and control anatomy; list/detail semantics alone
do not establish correspondence. Inspect small controls as integrated surfaces, including
native resizing, focus/disabled states, overflow and adjacent actions. Refinement preserves
multiline usability, keyboard operation, content and recovery. These are model-led design
decisions, not a new reference-count quota, document or approval relay.

The ordinary first-render check binds its native measurements to the authenticated route
and task contract rather than manufacturing the structured route's composition hypothesis.
It requires no browser scenario manifest or intermediate design document. Structured routes
still require their real owner-authored hypothesis. Early findings inspect the whole system,
including icon optical scale, weight and silhouette beside type, density and controls.
`lifecycle finish` performs this early read before full behavior execution as well.
An early retain is a model proxy, not completion, human satisfaction or a source-fidelity
claim; the full behavioral and independent terminal checks remain separate.
For model-led reframe, the current coordinator repairs scoped source directly and obtains
a fresh independent review with all unresolved findings and their original baselines.
It does not re-enter the structured candidate/maker relay. Production repair stays
available, while behavior evaluation and terminal publication refuse unresolved reframe.

Voluntary feedback remains available before the first completed measurement.
Preserve its exact authenticated user bytes and rejected rendered pixels. The
model judges its meaning; code does not classify aesthetic language by keywords.
A broad rejection is not satisfied by repairing only the singled-out control.
Measure the real current state before bounded repair and compare the next output
against the rejected baseline without inventing human satisfaction.

Generic interview tools are blocked during the managed workflow. Native
`language translate` refuses new pending design questions and records its choice
as `decisionActor: harness`. Existing `omd choose` records `actor: agent`, never
`user`. Explicit external-action and browser permissions remain separate.

Absent market/audience authority means language mechanics with a withheld market
fit claim. Unsupported business planning needs an explicit
`omit-from-production-claims` or `non-factual-working-decision` disposition;
unprovided non-goals cannot remove requested scope. These classifications do not
invent user evidence, product capability, prices, testimonials or consent.

Settle the selected route/method decisions before committing a candidate plan. An unselected
optional stage is not a missing selected prerequisite. Record incidental explanation in the
existing decision log; do not republish the route merely to explain that an optional stage was
not selected. A real scope or framing repair still belongs to its route owner and invalidates
affected downstream authority.

For a visual repair under the same current plan, keep the candidate identity and use its existing
repair history. For a genuinely replanned set, commit its new plan before writing fresh candidate
directories; preserve the prior content-addressed plan/source/review history. Old captures and
approvals are not current approval for that new plan. Do not weaken the pre-generation guard or
keep retrying a changed plan against directories that already contain generated source.

Evidence-budget exhaustion can carry genuinely absent evidence as a limitation, not a
present malformed or stale selected output. The stage pointer must return that output to
its owner for repair before downstream work. After a candidate replan, Sketch recreates
the current set and independent selection before Art Director or Composer consumes it;
Composer cannot repair an upstream stale selection by rewriting its fingerprint.

If only current reference evidence changed, the candidate capture/packet publisher
may preserve the same validated source and captures while republishing its blind
packet. It must still validate anonymous mapping, task and all capture receipts;
invalid current references refuse before publication. The previous review and
choice remain historical, and a new isolated review must bind the new packet.
Unchanged source and reference context remain an idempotent publication.

## Run the local source

After `npm run build`, start a **fresh project** with the canonical local extension
and skills. `pi` is the installed Pi-compatible host executable.

```sh
OMD=/absolute/path/to/OhMyDesign
pi --no-extensions --extension "$OMD/extensions/omd.ts" --skill "$OMD/src/skills"
```

Then submit `/skill:omd-ultradesign` followed by the request once. The host's
selected model and thinking configuration are retained; OMD does not select a
different model for this feature.

Developer evaluation is explicitly enabled at startup:

```sh
OMD_DESIGN_MODE=developer-evaluation \
  pi --no-extensions --extension "$OMD/extensions/omd.ts" --skill "$OMD/src/skills"
```

Complete the ordinary generation first. In the same developer host, compare
existing PNG captures:

```text
/omd-evaluate compare ["first.png","second.png"]
/omd-evaluate compare {"images":["first.png","second.png"],"references":["reference-one.png","reference-two.png"]}
/omd-evaluate repair ["before.png","after.png"]
```

The command asks permission for image delivery and private storage, displays the
actual image bytes through Pi's image message API, and requires confirmation that
the images are visible. Non-repair comparisons randomize A/B positions and omit
filenames, authors and configurations from displayed labels. Repair comparisons
keep A as before and B as after.
When reference images are supplied, their separately labelled A/B pixels and
private copies remain bound to the reference-preference answer. The interview
also asks whether the source's qualities fit the actual application. Preferring
reference A, preferring result B and disliking that result are distinct answers;
none becomes an inferred approval.

Questions separate relative preference, satisfaction, preservation and change.
A complexity answer gets one focused follow-up. Free text is optional and stored
verbatim, including surrounding whitespace. Repair comparisons also collect the
actual before/after assessment. Skips are not approvals. No source is rewritten
by this interview command; an explicit developer repair request uses the same
existing production/repair engine and its evidence boundaries.
After publication, the current developer session receives the exact recorded
answers, scope and displayed image hashes without private storage paths. This
supports separately attributed model interpretation on the next turn; it does
not silently start a new generation or count interpretation as a human answer.
Held-out validation always asks satisfaction about the named experimental
candidate, even when the developer preferred the control.

## Storage, corrections and validation

Records live outside the project in
`~/.config/oh-my-design/developer-evaluation`, or the absolute host setting
`OMD_EVALUATION_HOME`. Directories are private and records are immutable,
content-addressed files. An overlapping project path is refused before writes.
Do not commit this store, copy it into `.omd`, or include its images as product
assets. Image display/model delivery, private advisory reuse and public sharing
are distinct permissions; these commands grant no public sharing or asset reuse.

The first comparison records raw answers, exact image hashes, current request
binding when available and observed host configuration. It intentionally leaves
model interpretation empty and generation-budget metadata `unmeasured`.
This raw record **cannot be promoted**. It is not a fabricated quality judgment.

```text
/omd-evaluate export RECORD_ID
/omd-evaluate revise /absolute/private/path/to/revised-input.json
/omd-evaluate revoke RECORD_ID
```

`export` shows the current editable input, without immutable storage metadata.
Save that input privately, preserve its request/task/role identity and exact
human responses, and fill separately attributed `modelInterpretation`, actual
`relations` and actual attempted/preserved `changes`. Keep unknown generation
conditions unmeasured; do not invent metadata to make a case eligible.
`revise` stores a successor; it does not erase the original. Corrections
to genuine human answers must be the developer's correction, not model inference.
`revoke` removes eligibility while retaining history.

Before inspecting validation outputs, fix the criterion version, model/settings,
content and reference conditions, tool access, measured budget and no-intervention
rule. Use requests that were not used to tune the example. Create a private JSON
plan with `recordId`, at least two exact `heldOutRequests` strings and
`criteriaIds`, then register it before generating those results:

```text
/omd-evaluate experiment /absolute/private/path/to/experiment.json
```

The host returns an experimental snapshot. Start a fresh developer-mode project
with `OMD_EVALUATION_SNAPSHOT=RETURNED_DIGEST` and one exact planned request.
Generate its control in a separate fresh project under the same runtime,
provider/model and thinking configuration without that experimental snapshot.
Use the same content, reference conditions and budget. In the experimental host:

```text
/omd-evaluate validate {"images":["/control/capture.png","/trial/capture.png"],"recordId":"DEVELOPMENT_RECORD_ID","candidateImage":"b","projects":["/control/project","/trial/project"]}
```

The host binds the actual signed runs, current native maker results and native
measurements to those images, then records each predeclared criterion and the
developer's validation decision separately. Caller-authored run hashes or
arbitrary screenshots cannot substitute for this evidence. Repeat with another
predeclared request, without tuning between held-out results.

```text
/omd-evaluate promote DEVELOPMENT_RECORD_ID HELD_OUT_RECORD_1 HELD_OUT_RECORD_2
/omd-evaluate pin CASE_ID
```

Promotion requires at least two distinct new-request records, matching scope,
consent and authenticated predeclared experiment, actual preference for the declared
candidate, satisfaction and an explicit approving validation decision. It refuses
replayed tuning requests, revoked/revised evidence and fixture namespaces.
These checks establish recorded evidence consistency, not human-quality
generalization by themselves.

Fresh ordinary runs automatically freeze eligible validated cases, including an
empty snapshot when none exist. They never wait for an interview. `pin` returns
an optional explicit snapshot digest to reproduce a particular validated version:

```sh
OMD_EVALUATION_SNAPSHOT=RETURNED_DIGEST \
  pi --no-extensions --extension "$OMD/extensions/omd.ts" --skill "$OMD/src/skills"
```

The signed run captures the immutable safe snapshot once. New evaluations cannot
change a running job. A fresh load refuses snapshots whose cases were revoked
or superseded. Without an explicit snapshot setting, startup selects and pins the
eligible private cases automatically. Experimental snapshots remain developer-only.

## Case consumption and limits

The first implementation matches at most three cases by exact entry path,
surface kind and the hash of the frame's named task. This is intentionally
conservative, not semantic keyword classification or a universal taste profile.
Different wording may produce no match. An absent frame or mismatch injects
no examples; there is no forced fallback to unrelated preferences.

Stage briefs, maker generation/repair context and the independent final visual
review receive the same fixed safe examples. Actual developer preference and
satisfaction remain separate from model-authored advice. Source images, paths,
raw private answers and experiment secrets stay out of ordinary role packets.
Current requests, project constraints and verified evidence have precedence.
Calibration cannot grant write authority, remove functionality/evidence gates,
replace blind review or turn budget exhaustion into a pass.

For routes using the existing reference-board selection, selected originals reach
makers through the actual one-use multimodal path, not merely filenames.
Up to three unique whole originals are delivered,
with explicit omitted counts and limits. The source-study path remains usable;
raw references still do not enter the blind current-output review.
Current recorded-browse and independently admitted whole-original analysis
also reach this actual maker image path with take/avoid/adaptation guidance.
Rights-unknown/restricted images remain withheld. Merely reading a role brief
without executing the maker is still not image-delivery evidence.

Official Mobbin MCP documentation was checked at
https://mobbin.com/mcp and https://docs.mobbin.com/mcp/clients/other.
It requires OAuth and an eligible plan. No connected provider was available in
the implementation host, so no guessed adapter, new subscription or login bypass
was added. Existing public and already-authorized acquisition remains usable.
Some read-only flow probes still block POST, WebSocket, Service Worker and popup
paths; such gaps require another permitted source, not a global relaxation.

Technical integration tests use isolated synthetic fixtures and real image/RPC/
browser/rollback paths. They do not supply real developer ratings. Better
first-output satisfaction, unseen preference agreement, speed and lower cost
remain unverified until real held-out evaluations exist. No model weights are
updated; this is versioned case-based calibration, not fine-tuning.
