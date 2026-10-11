# Recorded whole-screen reference browsing

The model chooses actions; a project-bound native driver keeps one live Chromium page and records what actually happened. A successful browser command is not a reference-quality judgment, research completion, or permission to ship source pixels.

## CLI

All commands accept `--json` and `--activation <path>`. Session commands after start accept `--session <32-hex-id>` and `--expect-head <sha256>`. Omission selects the current project session. Unknown flags, repeated scalar flags and ambiguous arguments are refused.

```text
omd ref browse start --lane domain|design
  [--mode headless|profile|cdp] [--user-opt-in] [--headed]
  [--cdp-url <loopback-Chrome-http-or-browser-ws-url>]
  [--allow-auth-origin <https-origin>]... [--allow-pricing]
  [--budget-actions <1..240>] [--budget-minutes <0.5..30>]
  [--viewport <width>x<height>]
omd ref browse goto <https-url> --reason <root-choice>
  [--scope target-market|global|unscoped] [--ready-selector <css>]
  [--source-id <id> --flow-id <id>]
omd ref browse search <provider-or-url> <query>
  [--query-param <name>] [--query-selector <css> --submit-selector <css>]
  [--scope target-market|global|unscoped] [--ready-selector <css>]
omd ref browse scroll [--direction down|up|left|right]
  [--amount <pixels>] [--selector <container-css>] [--ready-selector <css>]
omd ref browse click (--selector <css>|--text <exact-label>) [--ready-selector <css>]
omd ref browse similar (--selector <css>|--text <exact-label>) [--ready-selector <css>]
omd ref browse back [--ready-selector <css>]
omd ref browse shot [--selector <whole-item-img>]
  [--screen-id <id> --state <label>]
  [--assert-visible <css>]... [--assert-hidden <css>]...
omd ref browse keep [--capture <shot-event-hash>] [--source-app <name>]
  [--lane domain|design] --reason <one-line-20..500-characters>
  [--role visual-direction|component-support|task-flow] [--direction <id>]
  [--rights allowed|restricted|unknown] [--rights-notes <text>]
omd ref browse crop --selector <css> [--reference <whole-screen-keep-id>]
  [--as <detail-name>] [--slot <zone-id>]
omd ref browse drop [<keep-id>] --reason <one-line-20..500-characters>
omd ref browse contact-sheet [--page <positive-integer>] [--columns 2|3|4]
omd ref browse status
omd ref browse end [--reason complete|budget|saturated|interrupted]

omd schema reference-analysis
omd ref browse analysis-set --input <reference-analysis.json>
omd ref browse analysis-check
omd ref browse handoff --for composer|hand|concept|eye|glance|fidelity [--blind]
```

Defaults: headless, 60 acquisition actions, 10 minutes, 1280x900. Viewport dimensions are 240..2560. The cycle's deadline and consumption survive lane changes/restarts. A restart cannot increase an active allowance. Metadata mutations have a separate 128-event cap; status adds no event. Action refusals/failures count when attempted; pre-action rate/authority refusals do not execute browser work.

Aliases: google, bing, duckduckgo, daum, pinterest, dribbble, siteinspire. They build URLs, not admission rules. Custom URLs support one `{query}` substitution or one replaced query parameter. JS search is limited to an observed search input and same-origin GET search form.

`shot` saves a whole viewport. `shot --selector <img>` retains the complete already-loaded image at natural pixel dimensions in a network-disabled renderer, not its gallery thumbnail or wrapper. It does not infer the pictured app's CSS viewport/DPR. Results expose `capture.id`, `capture.image`, and `capture.scope` so the model can inspect the actual pixels before keeping them.

`keep` never takes a new screenshot. Its reference unit is a whole screen and its source app/URL remain bound. `crop` only attaches an exact pixel region to an existing whole-screen keep; it cannot be retained independently. A changed viewport requires another whole-screen shot/keep. Gallery DOM cannot stand in for a region of an original item image. `drop` is a tombstone, not deletion of evidence.

Contact sheets contain 12 whole screens per page, retain selection order and contained aspect ratios, and return both `contactSheet.image` and `contactSheet.metadata` receipts. They are study surfaces, not candidate boards or production assets.

Exit codes: 0 completed/sealed (including partial acquisition), 1 observed failure/refusal, 2 usage/authority/integrity error, 3 acquisition budget stop. JSON is newline-terminated and drained before CLI exit.

## Consent and safety

Profile/CDP require both `--user-opt-in` and an explicit matching start-command line in the authenticated route request. This conservative request binding is used until the hosts provide a separate typed consent event. CDP consent binds the endpoint digest as well as mode/origins; endpoint/capability bytes remain private. `--headed` is profile-only. All render verification and contact-sheet rendering stay headless.

The profile is OMD-owned (`~/.omd/browser-profile`). CDP creates a separate proxied OMD context, imports only cookies applicable to approved origins in memory, and leaves the user's original tabs/browser intact. No unrelated tab enumeration, local/session-storage export, credentials, request bodies or input values enter the trace.

Every owned reference context uses the DNS-pinned public HTTPS proxy, blocks service workers, WebSockets and unproxied realtime transports, and accepts only read-only requests. Purchases, checkout, trials, destructive controls, downloads and arbitrary form submission are excluded. A narrowly guarded GET search is the only automated fill/submit exception. Pricing requires additional consent. Stateful actions are serialized and paced; server Retry-After and transition-rate limits cause a refusal, never an internal retry loop.

Cookie/consent overlays are recorded, not visually removed. Sensitive entry controls are masked, and obstructed/authentication/error/search-wrapper observations are not retained. Ambiguous text contrast is conservatively excluded from market claims without freezing, recolouring or suppressing the live page.

Authenticated pixels are private, study-only material. No automatic commit, export or asset shipping occurs. `rights=allowed` is an accountable supplied rights judgment, not native license attestation.

## Storage and integrity

```text
.omd/.cache/ref-browse/<session>/state.json  # 0600, directory 0700
.omd/.cache/ref-browse/current.json
.omd/.cache/ref-browse/budget-<contract>.json
.omd/discovery/browse/<session>/
  trace.jsonl
  events/<event-hash>.json
  assets/<sha256>.png
  observations/<sha256>.json
  checkpoints/<sha256>.json
  sheets/<sha256>.{png,json}
  seals/<sha256>.json
  summary.json
.omd/refs/<lane>/<native-reference>.{png,json}
.omd/refs/<lane>/details/<sha256>.png
.omd/refs/domain/flows/{captures,steps,executions}/...
.omd/reference-analysis.json
.omd/analysis.md
```

The daemon owns no project writer or opaque invocation. Every public command obtains its ordinary guarded writer and signs a short-lived `browse-command-v1` ticket bound to root, contract, build, request id, daemon challenge and exact argument digest. The driver holds an action reply until durable publication is acknowledged; retries cannot click twice. Network/browser awaits happen outside the project mutation lock. All publication uses guarded project writers.

Each `reference-browse-event-v1` binds session/lane, contiguous seq, previous hash, request id, actor, time/elapsed time, typed action, before/final URLs, document loader id, predecessor observation, native target, outcome, screenshot/observation receipts and a named error. Its hash is SHA-256 of canonical JSON without `hash`. JSONL adds exactly one newline per event. Storage-byte digests cover exact persisted bytes.

Observations bind HTTP/document identity, actual viewport/DPR/scroll, a bounded render fingerprint, readable task/link text, native controls, masks/obstructions, parent screenshot and optional crop or original-image identity. Scoped DOM measurements are explicit; image-only observations have no fabricated app blueprint or vector. Unrun dynamic axes remain null. No shared axes means incomparable, never distance zero.

A signed checkpoint authenticates each completed prefix. The final `reference-browse-session-v1` seal binds the trace digest/count/head, assets, final keep/drop replay, contract/build/consent, budget, stop reason and debt. Retained metadata is a deterministic projection of the seal, avoiding a hash cycle. Dead same-host drivers can be ended with `--reason interrupted` from their last authenticated prefix; recovery does not resume DOM/history or certify an unknown action.

`verifyBrowseSession` checks canonical encoding, native signature, exact paths/digests, chain order, targets/observations, PNG validity/dimensions, exact crop pixels, keep/drop replay and freshness. `verifyBrowseRetention` compares native metadata and pixels to the sealed projection. Research checks use these readers, never authored summaries.

## Research, analysis and handoff

`reference-research-v8` supports per-lane `browseSessions` and source provenance:

```text
provenance: {kind:"recorded-browse", session:{path,sha256}, capture:{seq,hash}, keep:{seq,hash}}
discovery:  {kind:"recorded-browse", url, access:"public"|"user-session",
             qualityReason, session:{path,sha256}, entry:{seq,hash}}
```

Native browse evidence does not pass a provider regex or endpoint whitelist. Independent families, distinct pixels, currentness, market claims, board use and strict completion remain required. Mixed legacy/browse lanes are supported. V5/v6/v7 keep their old parsing and artifact projections. Whole screenshots can enter the existing image-fragment board path without cropping; trace-backed fragments must preserve the entire parent image.

Reference analysis is authored after inspecting the images. It binds native reference ids, exact image/capture receipts, observations of screen type/task/hierarchy/density/type/components, selected ids, and patterns `{pattern,referenceIds,decision:"apply"|"do-not-apply",reason}`. Its `screens` reuse the existing `ref apply-set` v2 type and parser. Every current domain surface must have direct/partial/brief-derived coverage; non-direct coverage requires a gap and decision. Unknown or wrong-lane ids refuse publication without replacing existing analysis.

`readWholeScreenReferenceHandoff` returns selected rights-allowed whole-screen image paths/digests plus analysis for Composer, Hand and the concept step. Unknown/restricted rights withhold pixels. Eye/Glance/fidelity or `--blind` get only source-free coverage metadata, without pixels, ids, URLs or maker rationale. Legacy selected-assembly APIs remain available; hosts should prefer this new surface when reference analysis exists.

## Debt and work integration

`end` publishes an honest partial/unavailable summary independently of a board/research record. `productionEntryBlocking` is false; ending does not claim research completeness.

- `readBrowseConfidenceDebt(root, currentContract)` returns sealed detailed acquisition gaps.
- `browseDebtToConfidenceDebt(debt)` maps to Phase 1's `ConfidenceDebt`: stage `scout`, kind `budget-exhausted` or `evidence-gap`, claim `not-verified`, id from the shared `confidenceDebt` constructor.
- `readBrowseConfidenceDebtRecord(root, currentContract)` returns `confidence-debt-v1`.
- Current-contract end also calls the existing guarded `recordConfidenceDebt`; historical end cannot replace a newer contract's ledger.
- `referenceDiscoveryWork` now returns v2 start/continue/end browse work or `stopped-with-debt`. Its hash ignores sheet/status churn; the native head is separate. `ref advance` returns `needs-model-action` rather than choosing a query/link or silently navigating.
- `legacyReferenceDiscoveryWork` and `advanceLegacyReferenceDiscoveryWork` preserve explicit catalogue behavior for old consumers/tests.

Visual saturation is conservative and advisory: two inspected directions, five non-novel live keeps, no new family/direction, sufficient shared static axes and RMS novelty below 0.15 (or exact duplicate pixels). Missing measurements mean unknown. Domain walkthrough progress is not a visual-vector quantity, so domain sessions use their action/time budget or explicit end rather than automatic visual saturation.

## Deliberate current boundaries

- No model credential entry, CAPTCHA/MFA handling, or manual-auth POST phase. Existing cookie-backed opted-in viewing works; storage-only/new-login requirements remain an access/capability gap.
- Popups are excluded rather than adopted as a second page; use an explicit public root where appropriate. No arbitrary existing CDP tab takeover.
- Selector zoom details must match the kept viewport exactly. Image-coordinate zoom of original gallery media is not a separate command yet.
- A driver loss before any authenticated checkpoint cannot be invented into browser continuity. Proven-prefix recovery is supported; ambiguous ownership requires diagnosis rather than killing/reusing a process.
- The initial cycle is bounded and cannot be extended by restarting. A dedicated same-contract user budget-extension grant is not implemented.
- Analysis/maker whole-screen admission is native-browse-first. Old component crops are not silently relabelled whole screens. Existing legacy/user-image APIs remain historical/explicit paths.
- Host continuation, role allowlists, brief routing and prompt/protocol wording are outside this module's ownership. They must recognize the new work/debt outcomes and call the new maker/analysis surface; strict completion must not be weakened.
