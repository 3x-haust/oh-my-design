# Reference assembly protocol

This protocol is the sole authority for selected reference-work ownership and dependency boundaries.
It is a chat-first workflow, not a board application. The adaptive route may select discovery alone,
or add brick analysis, candidate assembly, selection, and production usage when the task outcome
needs them. It records a reason for each omitted optional method; there is no universal stage count,
order beyond actual data dependencies, reference quota, or candidate quota.

Each selected artifact has exactly one owner. A dependent selected stage consumes its validated
predecessor rather than reconstructing it from a source page, screenshot, or earlier conversation.
The **finalizer** is the coordinator performing finalization; it is a responsibility, not a new agent,
service, provider, or runtime.

## Stage contract

| Stage | Sole owner | Validated input | Durable/cache output | Machine check, function, or command | Explicit fallback or stop |
|---|---|---|---|---|---|
| brief blocks | `omd-framer` | Current user brief, cited user/evidence records, explicit-user taste profile, and applicable task constraints | Durable `.omd/frame.md`, including the task coverage matrix only where the surface requires it | `omd frame set …`; `omd frame show` must read the completed record | Missing cited evidence or required frame fields stops reference work at the brief; do not invent taste, task, or a reference target. |
| fragment inventory | `omd-scout` | Valid brief blocks, user URLs first, component inventory, and user-directed capture permission | Durable measured component records and local captures under `.omd/refs/`; provenance-bound image fragments under `.omd/refs/fragments/`; raw captures remain scout-local | `omd ref add … --selector … --blueprint --shot` for a measured component; `omd ref import-image <input.json>` for a local user-directed image-region capture | Initialize/capability-check `browser-rs` first for interactive research and capture. Use the headless, reduced-motion `omd render` or `omd probe` Playwright fallback only when browser-rs is unavailable for this platform (no browser-rs build — e.g. an arm Linux host) or the user declines to install/use browser-rs. Record which applies in the stage handback; if no lawful local capture can be made, omit the fragment and report the coverage gap. Never scrape, hotlink, or ship source pixels. |
| brick analysis | `omd-scout` | The validated fragment inventory, measured invariants/blueprints, rights/provenance, task blocks, and coverage gaps | Durable sanitized brick principles in the retained `.omd/refs/*.json` records plus `.omd/scout.md`; source identities and raw pixels remain only in the fragment inventory | `omd ref principles …` refuses an unmeasured source; candidate `omd ref check` rejects an empty or contaminated transferable brick | A contaminated, duplicate, rights-unclear-for-use, or unmeasurable fragment is a rejected or anti-reference brick. If no lawful sanitized brick can answer a required decision, stop candidate assembly for that decision and report the gap. |
| candidate assemblies | `omd-scout` | Validated fragment inventory, sanitized brick analysis, and frame/task targets | Durable `.omd/reference-board.json` as internal raw evidence; canonical capture, sanitized assembly, and typed projection remain behind the reference commands | Run `omd schema reference-board`, copy its exact skeleton and grid constraints, then `omd ref board --input <candidate-assemblies.json>` derives identities/frame binding and persists the validated board; then `omd ref check`; then `omd ref candidates` | A failed check, missing required zone in either candidate, stale PNG/provenance, contaminated selector/text, or no viable candidate stops before chat presentation. Do not infer or extend the printed schema, open/emit/ask the user to inspect an HTML, PNG, or board UI, or run `omd-board`. |
| locale-reference binding (market-grounded reference work only) | `omd-scout` | Current market-grounded board plus its current cultural profile, projection, and captured-source receipts | Source-free `.omd/reference-locale-binding.json` and private `.omd/reference-locale-binding-evidence.json` | Run `omd schema reference-locale-binding`, then `omd ref locale-bind --input <bindings.json>`, then `omd ref locale-bind-check`; `omd ref check` also requires it for a market-bound v3 board | A source URL not present in the profile, an unavailable source, a positive use outside `native-category`/same-task `global-equivalent`, transfer from `contested`/`unknown`, a silent unbound matching source, or a candidate with no native first-party component stops selection. |
| selected assembly | `coordinator` | Passing candidate table, current canonical capture/assembly/projection, current locale-reference binding when market-grounded, and the coordinator's own selection of the strongest candidate — or a candidate the user explicitly named, when volunteered | Durable hash-bound `.omd/reference-selection-v2.json` and art-direction handoff receipt, plus the disclosed selection entry in `.omd/decisions.md` | `omd ref select <candidate-id>` followed by `omd ref check` | An unknown, stale, incomplete, or unbound market-grounded slot disposition stops downstream use. The coordinator selects and records the choice itself with a disclosed reason; it never pauses to ask the user to pick a candidate. |
| selected visual packet (optional experiment) | `coordinator` | Current selected assembly and only its lawful `used` component blueprints; raw pixels remain Scout-owned | Source-free `.omd/reference-visual-packet.json`, content-addressed no-ship SVG geometry studies, and private `.omd/reference-visual-packet-evidence.json` provenance | `omd ref visual-packet --slot <slot-id[,slot-id]>`, then `omd ref visual-packet-check`; pass named production files to `--production` before final use | Authoring before selection, an unselected/rejected/non-lawful slot, stale source/assembly/selection/asset bytes, source identity/copy/pixels, or production reuse stops the packet route. If neutralization destroys the promised relation, reject the entry and continue structured-only. |
| production usage ledger | `omd-hand` | Passing v2 selection, current motion-resolution projection, decision-bound composer and hand receipts, actual production source/render/probe evidence, and attribution | Durable `.omd/reference-usage-v2.json` with exactly one `used`, `rejected`, or `anti-reference` row for every selected slot | `recordReferenceUsage(root, { rows }, writer)` then `validateReferenceUsage(root)` | Missing, unselected, duplicate, or unsupported rows, stale selection/motion/receipt bindings, or absent production evidence stop finalization. Do not replace real evidence with a claimed influence. |
| final provenance report | `finalizer` | A passing v2 usage ledger, current v2 selection, decision-bound handoffs, and `.omd/attribution.md` | Durable `.omd/reference-report.md` and the exact deterministic bilingual Markdown pasted into the final chat | `generateReferenceReport(root)` validates usage and atomically persists the returned Markdown | Any validation failure stops the final report. Do not hand-write, paraphrase, or claim a replacement report; repair the owning earlier stage and regenerate. |

## Reference roles

Every reference serves one of two roles, and the domain brief's `referenceQueries` seed both:

- **① component design** — a detailed section, component, or button whose *structure* is the value.
  It is captured as a scoped measured record (`omd ref add … --selector … --blueprint --shot`): the
  captured part's own values, never a whole-page average. This is a static structure a build can copy.
- **② craft** — the motion, scroll animation, and sculptural moment that top-tier galleries
  (Awwwards, theFWA) are known for. This role cannot be copied by looking: seeing the effect does not
  give the build the skill to make it, so a reproduction tends to degrade into a static ghost. It is
  therefore MEASURED, not asserted, as a `reference-craft-v1` motion signature — peak pixel-energy
  (`core/motion/energy.ts`), whether it is scroll-linked, and whether it keeps a reduced-motion
  baseline — and its reproduction is GATED by `verifyCraftReproduction` (`omd craft-fidelity check`):
  the built part must actually move (energy above the floor and within the reference's fidelity
  ratio), preserve a scroll-linked reference's scroll response, and be reduced-motion safe. A static,
  faint, or scroll-dropping reproduction fails — the craft reference does not pass just because a
  generation was attempted. This is how the "seeing is not building" gap is closed with evidence.

## Capture granularity

A board is assembled from parts. Every measured reference is captured at the specific component it
studies (`omd ref add <url> --as <component> --selector "<css>" --blueprint --shot`); a capture
scoped to a page root — `main`, `body`, `html`, `:root` — measures the whole document and yields a
page average with no component anatomy, so section-granular composition has nothing to take from it.
Two captures of the same source at the same selector are one piece of evidence under two names and
make the board read larger than it is.

Granularity alone is not coverage. Five captures that collapse onto two slots — three navs and two
install blocks — are two parts studied repeatedly while every other zone carries no evidence, and
those zones then compose from whatever the build invents. Domain-brief `surfaces` are pages/screens;
they do not enumerate a landing page's hero, process, proof, install, CTA, or a product screen's
regions and states. The framer therefore writes `.omd/acquisition-plan.json`. Legacy
`reference-acquisition-plan-v1` remains readable; new work uses
`reference-acquisition-plan-v2`, which binds the current locale-design-context hash or an explicit
no-market null and names every required section/region/state, its job, decision question, requested
axes, exact state, target viewports, and observable falsifier before the scout starts. Each capture
binds to one of those zones (`omd ref add … --slot <zone>`), and a board is finished only when every
required zone has at least one bound capture.

`omd ref granularity` audits granularity and zone coverage and reports `REF-WHOLE-PAGE`,
`REF-DUPLICATE-CAPTURE`, `REF-NO-PARTS`, `REF-PART-CONCENTRATION`, `REF-ZONE-UNCOVERED`, and
`REF-NAME-MISMATCH`. A capture is named for what it holds: a reference called `*-hero-*` captured at
`header` tells downstream readers that the hero is covered when what exists is another nav. Any
finding means the board must be recaptured at component scope across the zones that still have
nothing; a board of whole-page captures can only be traced, and tracing a whole page is the
derivative failure the transfer boundary forbids.

## Capturing an open disclosure

When a required source state is an open menu or disclosure, print `omd schema reference-capture-preparation`.
Pass its closed JSON object through `omd ref add … --preparation <json> --no-energy`, or embed it as
`preparation` with explicit `energy:false` in each `ref add-batch` entry. Both use the same page for
preparation, DOM measurements, blueprint, and scoped PNG. The preparation lists only caller-authored
clicks on `button[type=button]` controls with `aria-expanded` and `aria-controls`; every controlled
element must have an explicit `visible` or `hidden` assertion. Arbitrary scripts, form submission,
typing, navigation, and inferred actions are unsupported. Use this only for a known local disclosure
interaction, never a purchase, message, or remote mutation disguised as a control.

Visibility is checked after preparation and again around capture. A failed assertion publishes no
new screenshot or reference record. `capturePreparation` preserves executed actions, observed visibility,
timestamp, actual viewport, and `notMeasured`. It supports inspection of those exact observations;
it does not prove the full semantic meaning of an acquisition `requiredState`. Clipboard behavior,
session import, and failure injection are outside this capture path.

Prepared captures skip automatic hover/tab and load-window motion probes so measurement does not
change the prepared state. Their raw IR probe metadata is null. Existing invariant fallback zeros,
false values, and empty lists are compatibility defaults, not observed absence: consult the receipt's
`notMeasured` list before making interaction or motion claims. Its closed source-free projection,
`invariants.measurementCoverage`, survives assembly transfer and copying; downstream readers use this
coverage without reading source receipts. Signal reports unknown interaction separately from missing
interaction without awarding it a point. Distance/kinship outputs identify `unmeasuredComponents`:
the existing comparison concerns measured axes only, not full evidence coverage or demonstrated
agreement on unknown behavior. Static duplicate detection remains applicable. Energy must be disabled because its
separate navigation would measure the initial state. Captures without preparation keep existing probes.

## Subject anchor

When the brief names a real, existing subject — a product, project, company, repository, or brand, or supplies its link — the scout's fragment-inventory stage first establishes what that subject actually is (a web search plus the linked repository/README and any wordmark or brand the source already ships) and fixes the subject's own identity anchor: its real palette and motif. This anchor is not one measured reference among many; it governs the colour and motif every other lane serves, and is never outvoted by category evidence. A palette or motif taken from the product category's default instead of the subject's own identity is a rejected, not a shippable, synthesis.

## Chat-first presentation and selection

The scout runs `omd ref check` and then `omd ref candidates`. It pastes the command's
Markdown table directly into the Codex or Claude conversation. That table is the only
candidate presentation surface and names, per component slot, the source site/page, exact
captured UI or image region, the local part-image capture path, proposed target, take, avoid,
and adaptation. The local capture column lets the human inspect the exact per-component part image
while selecting. Raw captures remain Scout provenance and do not become Composer or Hand inputs by
mere filesystem presence. Component-level and whole-surface fidelity are both allowed;
bare `omd ref distance <page>` remains advisory. After current usage and build observation exist,
`omd ref distance <page> --selected --gate --json` measures each used component-capture slot at its
assigned destination selector. Every comparison must score at least `0.6`; a failed, missing,
malformed, unmeasurable, or stale receipt blocks new final-v2 publication. A typed reference-work
omission creates no receipt obligation. Every used reference is recorded with attribution. Eye
reviews against the composition contract and task/visual evidence, not source pixels.
For `reference-assembly-v2`, `omd ref influence-proof --input <proof.json>` additionally binds every
used influence and every declared target viewport to its exact destination selector, promised axis,
falsifier, current assembly/selection/build hashes, an axis-compatible evidence kind, and an actual
project-contained evidence file whose bytes are re-hashed. A missing feature fails; similarity on
another axis cannot compensate for it.
The coordinator selects the strongest candidate itself and records the canonical v2 selection with `omd ref select`; it produces `.omd/reference-selection-v2.json` and the art-direction receipt, then `omd ref check` verifies currentness. Before composition and production, resolve every pending lawful positive-motion slot into the hash-addressed `.omd/motion-resolutions/sha256-<digest>.json` projection. The art-direction decision writes the composer and hand receipts under `.omd/reference-handoffs/`; both must bind that same decision, capture, assembly, projection, selection, and positive-motion dispositions. Disclose the selection and reason in `.omd/decisions.md`; do not pause to ask the user to pick a candidate. A candidate the user explicitly named still wins.

For market-grounded work, the board alone does not prove that a “local” source came from the current
locale research. `reference-locale-binding-v1` joins an exact candidate slot to one cultural decision
and the profile source whose final URL equals the captured component source. The public projection
keeps only candidate, slot, decision, lane, and disposition; source ID and capture hash stay in the
private evidence. Every candidate needs a positive native-category component. A same-task global
equivalent may supplement it; a counterexample may only bind an anti-reference. Composer and Hand
receive the public projection only and apply each mechanism only to its named reference slot.

Never direct a user to open a board UI, standalone HTML, PNG, showcase, or `omd-board`.
Local screenshots may help a scout and may be attached to a conversation when useful, but
they never become composition, implementation, or shipped inputs unless a later contract supplies
an explicit selected, transformed, no-ship visual projection bound to the current assembly and
selection. `omd ref visual-packet` is that optional route for component captures: it deterministically
renders only the selected sanitized blueprint as anonymous rectangles, preserves box proportion,
grouping, nesting, and whitespace, and drops source colour, copy, identity, imagery, and typeface.
The role-facing packet and SVG contain no raw source path, URL, reference ID, or pixel carrier. Raw
capture hashes remain only in the private packet evidence. Composer and Hand may inspect the exact
packet manifest and named SVG only when the adaptive brief selects this route; neither may inspect its
private evidence. The SVG is reference-only and `noShip`; `omd ref visual-packet-check --production`
fails if its bytes, path, or digest appear in named production files. Pinterest-like
and other gallery regions are user-directed browser captures with source-page provenance,
rights status/notes, and a local imported PNG only; OMD neither fetches a remote source image
for import nor hotlinks or ships its bytes.

The finalizer calls `generateReferenceReport(root)` and pastes its returned Korean-first,
bilingual Markdown unchanged. Its rows answer, for every selected piece: source site/page and
exact UI/image part; shipped route/component/selector; borrowed and explicitly non-borrowed
properties; transformation; status; and production evidence. `used`, `rejected`, and
`anti-reference` are all reportable outcomes; only a validated `used` row may claim influence.

## Executable, acyclic composition handoff

When image-first drafting is selected on a capable host, its data dependencies form a closed graph,
not a dialogue loop:

`selected assembly -> coordinator derives prompts -> justified independent drafts -> coordinator chooses one -> selected dependent stages`

The coordinator derives the prompt directions directly from the selected sanitized assembly and
the permitted project-owned inputs in the stage table. It must not solicit or read
`.omd/composition.md`, a composer prompt, or composer art-direction directions to create a draft
that composer must later receive. The chosen draft is only a design-reference input; the coordinator
records its choice before composer starts.

When the CSS/SVG fallback and composition are selected, the fallback is closed before its dependent
composition work. Skipped composition or sketch methods create no phantom downstream artifact.

Composer has no outgoing edge to either route. It starts only after the coordinator has chosen a draft
and hands it over, or has taken the CSS/SVG fallback. This permits real brief, copy, register, palette,
type, and other project-owned material in coordinator prompts without granting composer an upstream role.

## Browser boundary

For interactive visual research and user-directed region capture, use `browser-rs` first.
Use the deterministic Playwright paths `omd render` and `omd probe` only when browser-rs is unavailable
for this platform (no browser-rs build — e.g. an arm Linux host) or the user declines to install/use
browser-rs; never as a convenience second provider and never on a transient failure.
The fallback remains headless and reduced-motion. Preserve measured motion only when it is
relevant, honor the existing motion and WebGL/3D gates, and do not add a provider, API-key
flow, or runtime.

The scout's internal raw evidence record stays scout-side. Composer starts after the coordinator has chosen its image-first draft: on
the capable route it receives the canonical v2 selection, current motion-resolution projection,
decision-bound composer receipt, selected assembly, and coordinator-chosen draft; on the unavailable
route it receives those same bound artifacts plus the CSS/SVG fallback. Board-v3 makes each influence
a unique slot bound to an acquisition zone, decision, primary axis, source state/viewport, target
viewports, responsive consequence, optional reconciled conflict, and falsifier. Several influences may
shape one destination zone; downstream roles resolve their commitments into one system and verify each
promised axis separately. The page is composed from parts, and different sections may draw parts from
different references; tracing one reference's whole page layout and
section order wholesale is a derivative failure, not fidelity — study the whole reference, take only the
part each section needs. `omd ref distance` measures how close each section is to its assigned part;
high per-part closeness is the intended outcome, not a warning. The selected production gate is
slot-scoped and does not authorize whole-page cloning. Every used reference is
recorded with attribution in `.omd/attribution.md`, and the product's own copy is written rather than
lifting the source's words. The eye and selector still score renders against the composition contract
without seeing authorship — that blindness is about unbiased scoring, not about hiding the reference
from the build.
