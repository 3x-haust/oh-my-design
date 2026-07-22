# Reference assembly protocol

This protocol is the sole authority for reference-work ownership and the eight-stage
LEGO assembly order. It is a chat-first workflow, not a board application. The exact
order is:

`brief blocks -> fragment inventory -> brick analysis -> candidate assemblies -> selected assembly -> production usage ledger -> final provenance report`

Each stage has exactly one owner. A later stage must consume its validated predecessor,
not reconstruct it from a source page, a screenshot, or an earlier conversation. The
**finalizer** is the coordinator performing finalization; it is a responsibility, not a
new agent, service, provider, or runtime.

## Stage contract

| Stage | Sole owner | Validated input | Durable/cache output | Machine check, function, or command | Explicit fallback or stop |
|---|---|---|---|---|---|
| brief blocks | `omd-framer` | Current user brief, cited user/evidence records, explicit-user taste profile, and applicable task constraints | Durable `.omd/frame.md`, including the task coverage matrix only where the surface requires it | `omd frame set …`; `omd frame show` must read the completed record | Missing cited evidence or required frame fields stops reference work at the brief; do not invent taste, task, or a reference target. |
| fragment inventory | `omd-scout` | Valid brief blocks, user URLs first, component inventory, and user-directed capture permission | Durable measured component records and local captures under `.omd/refs/`; provenance-bound image fragments under `.omd/refs/fragments/`; raw captures remain scout-local | `omd ref add … --selector … --blueprint --shot` for a measured component; `omd ref import-image <input.json>` for a local user-directed image-region capture | Initialize/capability-check `browser-rs` first for interactive research and capture. Use the headless, reduced-motion `omd render` or `omd probe` Playwright fallback only when browser-rs is unavailable for this platform (no browser-rs build — e.g. an arm Linux host) or the user declines to install/use browser-rs. Record which applies in the stage handback; if no lawful local capture can be made, omit the fragment and report the coverage gap. Never scrape, hotlink, or ship source pixels. |
| brick analysis | `omd-scout` | The validated fragment inventory, measured invariants/blueprints, rights/provenance, task blocks, and coverage gaps | Durable sanitized brick principles in the retained `.omd/refs/*.json` records plus `.omd/scout.md`; source identities and raw pixels remain only in the fragment inventory | `omd ref principles …` refuses an unmeasured source; candidate `omd ref check` rejects an empty or contaminated transferable brick | A contaminated, duplicate, rights-unclear-for-use, or unmeasurable fragment is a rejected or anti-reference brick. If no lawful sanitized brick can answer a required decision, stop candidate assembly for that decision and report the gap. |
| candidate assemblies | `omd-scout` | Validated fragment inventory, sanitized brick analysis, and frame/task targets | Durable `.omd/reference-board.json` as internal raw evidence; canonical capture, sanitized assembly, and typed projection remain behind the reference commands | `omd ref check`; then `omd ref candidates` | A failed check, stale PNG/provenance, contaminated selector/text, or no viable candidate stops before chat presentation. Do not open, emit, or ask the user to inspect an HTML, PNG, or board UI; never run `omd-board`. |
| selected assembly | `coordinator` | Passing candidate table, current canonical capture/assembly/projection, and the coordinator's own selection of the strongest candidate — or a candidate the user explicitly named, when the user volunteered one | Durable hash-bound `.omd/reference-selection-v2.json` and art-direction handoff receipt, plus the disclosed selection entry in `.omd/decisions.md` | `omd ref select <candidate-id>` followed by `omd ref check` | An unknown, stale, or incomplete slot disposition stops downstream use. The coordinator selects and records the choice itself with a disclosed reason; it never pauses to ask the user to pick a candidate. |
| production usage ledger | `omd-hand` | Passing v2 selection, current motion-resolution projection, decision-bound composer and hand receipts, actual production source/render/probe evidence, and attribution | Durable `.omd/reference-usage-v2.json` with exactly one `used`, `rejected`, or `anti-reference` row for every selected slot | `recordReferenceUsage(root, { rows }, writer)` then `validateReferenceUsage(root)` | Missing, unselected, duplicate, or unsupported rows, stale selection/motion/receipt bindings, or absent production evidence stop finalization. Do not replace real evidence with a claimed influence. |
| final provenance report | `finalizer` | A passing v2 usage ledger, current v2 selection, decision-bound handoffs, and `.omd/attribution.md` | Durable `.omd/reference-report.md` and the exact deterministic bilingual Markdown pasted into the final chat | `generateReferenceReport(root)` validates usage and atomically persists the returned Markdown | Any validation failure stops the final report. Do not hand-write, paraphrase, or claim a replacement report; repair the owning earlier stage and regenerate. |

## Subject anchor

When the brief names a real, existing subject — a product, project, company, repository, or brand, or supplies its link — the scout's fragment-inventory stage first establishes what that subject actually is (a web search plus the linked repository/README and any wordmark or brand the source already ships) and fixes the subject's own identity anchor: its real palette and motif. This anchor is not one measured reference among many; it governs the colour and motif every other lane serves, and is never outvoted by category evidence. A palette or motif taken from the product category's default instead of the subject's own identity is a rejected, not a shippable, synthesis.

## Chat-first presentation and selection

The scout runs `omd ref check` and then `omd ref candidates`. It pastes the command's
Markdown table directly into the Codex or Claude conversation. That table is the only
candidate presentation surface and names, per component slot, the source site/page, exact
captured UI or image region, the local part-image capture path, proposed target, take, avoid,
and adaptation. The local capture column lets the human open and attach the exact per-component
part-image — the referenced button, card, or region — while selecting and building. For a
user-directed selected reference, the hand opens its local part-image under `.omd/refs/` and builds
against it with image-to-code fidelity. Component-level and whole-surface fidelity are both allowed;
`omd ref distance` is advisory — it reports how close the shipped build is to each reference and never
blocks shipping — and every used reference is recorded with attribution. Eye reviews against the
composition contract and task/visual evidence, not source pixels.
The coordinator selects the strongest candidate itself and records the canonical v2 selection with `omd ref select`; it produces `.omd/reference-selection-v2.json` and the art-direction receipt, then `omd ref check` verifies currentness. Before composition and production, resolve every pending lawful positive-motion slot into the hash-addressed `.omd/motion-resolutions/sha256-<digest>.json` projection. The art-direction decision writes the composer and hand receipts under `.omd/reference-handoffs/`; both must bind that same decision, capture, assembly, projection, selection, and positive-motion dispositions. Disclose the selection and reason in `.omd/decisions.md`; do not pause to ask the user to pick a candidate. A candidate the user explicitly named still wins.

Never direct a user to open a board UI, standalone HTML, PNG, showcase, or `omd-board`.
Local screenshots may help a scout and may be attached to a conversation when useful, but
they never become composition, composite, implementation, or shipped inputs. Pinterest-like
and other gallery regions are user-directed browser captures with source-page provenance,
rights status/notes, and a local imported PNG only; OMD neither fetches a remote source image
for import nor hotlinks or ships its bytes.

The finalizer calls `generateReferenceReport(root)` and pastes its returned Korean-first,
bilingual Markdown unchanged. Its rows answer, for every selected piece: source site/page and
exact UI/image part; shipped route/component/selector; borrowed and explicitly non-borrowed
properties; transformation; status; and production evidence. `used`, `rejected`, and
`anti-reference` are all reportable outcomes; only a validated `used` row may claim influence.

## Executable, acyclic composition handoff

The capable-host route is a strict topological order, not a dialogue loop:

`selected assembly -> coordinator derives prompts -> 2–3 concurrent drafts -> coordinator chooses one -> composer -> sketches/eye -> hand`

The coordinator derives the prompt directions directly from the selected sanitized assembly and
the permitted project-owned inputs in the stage table. It must not solicit or read
`.omd/composition.md`, a composer prompt, or composer art-direction directions to create a draft
that composer must later receive. The chosen draft is only a design-reference input; the coordinator
records its choice before composer starts.

The unavailable route is likewise closed before composition:

`selected assembly -> composer CSS/SVG path -> sketches/eye -> hand`

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

The scout's internal raw evidence record stays scout-side only to keep the board tidy, not to hide
references from the build. Composer starts after the coordinator has chosen its image-first draft: on
the capable route it receives the canonical v2 selection, current motion-resolution projection,
decision-bound composer receipt, selected assembly, and coordinator-chosen draft; on the unavailable
route it receives those same bound artifacts plus the CSS/SVG fallback. Copying is allowed and
encouraged: the hand opens the selected reference's local part-image(s) under `.omd/refs/` and builds
against them with image-to-code fidelity — reproducing a reference's layout, composition, and
treatment is the point, not a violation. `omd ref distance` measures how close the build is to each
chosen reference; high closeness is the intended outcome, not a warning. Every used reference is
recorded with attribution in `.omd/attribution.md`, and the product's own copy is written rather than
lifting the source's words. The eye and selector still score renders against the composition contract
without seeing authorship — that blindness is about unbiased scoring, not about hiding the reference
from the build.
