# Autonomous design and private developer evaluation

OMD designs like a person: it investigates, interprets, makes, looks, compares and
repairs. The normal user supplies the request, not a sequence of design approvals.

## Scope

This integration targets native Pi. Both modes use the existing route, reference
selection, bounded makers, browser evaluator, independent reviewers, repair
transactions and output artifacts. No second production pipeline or evaluation
web application is introduced.

Normal execution uses `autonomous` unless the host process starts with
`OMD_DESIGN_MODE=developer-evaluation`. A project file, external page, model
argument, legacy checkpoint setting or low confidence cannot enable interviews.
Mode and criterion version are signed into the native run identity. Changing
mode, runtime or criteria requires a fresh project/run, not an edited receipt.

The normal path is:

```text
original request -> route and non-factual planning dispositions
-> public or already-authorized references -> admitted internal selection
-> whole reference images and take/avoid/adaptation in maker evidence
-> real candidate/production source -> real browser captures
-> independent behavior, fidelity and quality review
-> bounded repair or authenticated rollback -> one selected result
```

Generic interview tools are blocked during the managed workflow. Native
`language translate` refuses new pending design questions and records its choice
as `decisionActor: harness`. Existing `omd choose` records `actor: agent`, never
`user`. Explicit external-action and browser permissions remain separate.

Absent market/audience authority means language mechanics with a withheld market
fit claim. Unsupported business planning needs an explicit
`omit-from-production-claims` or `non-factual-working-decision` disposition;
unprovided non-goals cannot remove requested scope. These classifications do not
invent user evidence, product capability, prices, testimonials or consent.

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
/omd-evaluate repair ["before.png","after.png"]
```

The command asks permission for image delivery and private storage, displays the
actual image bytes through Pi's image message API, and requires confirmation that
the images are visible. Non-repair comparisons randomize A/B positions and omit
filenames, authors and configurations from displayed labels. Repair comparisons
keep A as before and B as after.

Questions separate relative preference, satisfaction, preservation and change.
A complexity answer gets one focused follow-up. Free text is optional and stored
verbatim, including surrounding whitespace. Repair comparisons also collect the
actual before/after assessment. Skips are not approvals. No source is rewritten
by this interview command; an explicit developer repair request uses the same
existing production/repair engine and its evidence boundaries.

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
`relations`, actual attempted/preserved `changes` and measured `experiment`
metadata. `revise` stores a successor; it does not erase the original. Corrections
to genuine human answers must be the developer's correction, not model inference.
`revoke` removes eligibility while retaining history.

Before inspecting validation outputs, fix the criterion version, model/settings,
content and reference conditions, tool access, measured budget and no-intervention
rule. Use requests that were not used to tune the example. In each new project's
developer host:

```text
/omd-evaluate validate {"images":["control.png","calibrated.png"],"recordId":"DEVELOPMENT_RECORD_ID","candidateImage":"b"}
```

This reuses the same image comparison and records the explicit validation
decision separately. Record the actual measured experiment contract through
`export`/`revise`; an unmeasured run remains ineligible.

```text
/omd-evaluate promote DEVELOPMENT_RECORD_ID HELD_OUT_RECORD_1 HELD_OUT_RECORD_2
/omd-evaluate pin CASE_ID
```

Promotion requires at least two distinct new-request records, matching scope,
consent and measured experiment contract, actual preference for the declared
candidate, satisfaction and an explicit approving validation decision. It refuses
replayed tuning requests, revoked/revised evidence and fixture namespaces.
These checks establish recorded evidence consistency, not human-quality
generalization by themselves.

`pin` returns a snapshot digest. Opt into that validated version on the next
ordinary run:

```sh
OMD_EVALUATION_SNAPSHOT=RETURNED_DIGEST \
  pi --no-extensions --extension "$OMD/extensions/omd.ts" --skill "$OMD/src/skills"
```

The signed run captures the immutable safe snapshot once. New evaluations cannot
change a running job. A fresh load refuses snapshots whose cases were revoked
or superseded. Without a snapshot, generation works without opening the private
store or waiting for any evaluation.

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

Selected reference originals reach makers through the actual one-use multimodal
path, not merely filenames. Up to three unique whole originals are delivered,
with explicit omitted counts and limits. The source-study path remains usable;
raw references still do not enter the blind current-output review.

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
