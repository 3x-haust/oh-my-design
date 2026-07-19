# Reference assembly protocol

This protocol is the sole authority for reference-work ownership and the eight-stage
LEGO assembly order. It is a chat-first workflow, not a board application. The exact
order is:

`brief blocks -> fragment inventory -> brick analysis -> candidate assemblies -> selected assembly -> clean-room composite -> production usage ledger -> final provenance report`

Each stage has exactly one owner. A later stage must consume its validated predecessor,
not reconstruct it from a source page, a screenshot, or an earlier conversation. The
**finalizer** is the coordinator performing finalization; it is a responsibility, not a
new agent, service, provider, or runtime.

## Stage contract

| Stage | Sole owner | Validated input | Durable/cache output | Machine check, function, or command | Explicit fallback or stop |
|---|---|---|---|---|---|
| brief blocks | `omd-framer` | Current user brief, cited user/evidence records, explicit-user taste profile, and applicable task constraints | Durable `.omd/frame.md`, including the task coverage matrix only where the surface requires it | `omd frame set …`; `omd frame show` must read the completed record | Missing cited evidence or required frame fields stops reference work at the brief; do not invent taste, task, or a reference target. |
| fragment inventory | `omd-scout` | Valid brief blocks, user URLs first, component inventory, and user-directed capture permission | Durable measured component records and local captures under `.omd/refs/`; provenance-bound image fragments under `.omd/refs/fragments/`; raw captures remain scout-local | `omd ref add … --selector … --blueprint --shot` for a measured component; `omd ref import-image <input.json>` for a local user-directed image-region capture | Initialize/capability-check `browser-rs` first for interactive research and capture. Only after that provider fails may the scout use headless, reduced-motion `omd render` or `omd probe` as the deterministic Playwright fallback. Record the provider failure in the stage handback; if no lawful local capture can be made, omit the fragment and report the coverage gap. Never scrape, hotlink, or ship source pixels. |
| brick analysis | `omd-scout` | The validated fragment inventory, measured invariants/blueprints, rights/provenance, task blocks, and coverage gaps | Durable sanitized brick principles in the retained `.omd/refs/*.json` records plus `.omd/scout.md`; source identities and raw pixels remain only in the fragment inventory | `omd ref principles …` refuses an unmeasured source; candidate `omd ref check` rejects an empty or contaminated transferable brick | A contaminated, duplicate, rights-unclear-for-use, or unmeasurable fragment is a rejected or anti-reference brick. If no lawful sanitized brick can answer a required decision, stop candidate assembly for that decision and report the gap. |
| candidate assemblies | `omd-scout` | Validated fragment inventory, sanitized brick analysis, and frame/task targets | Durable `.omd/reference-board.json` as internal raw evidence; deterministic raw evidence and sanitized `reference-assembly-v1` exist only behind the reference commands; the exact candidate Markdown table is pasted in chat | `omd ref check`; then `omd ref candidates` | A failed check, stale PNG/provenance, contaminated selector/text, or no viable candidate stops before chat presentation. Do not open, emit, or ask the user to inspect an HTML, PNG, or board UI; never run `omd-board`. |
| selected assembly | `coordinator` | Passing candidate table, current `.omd/reference-board.json`, and the user's exact candidate id; when interaction is unavailable, an explicit disclosed agent choice and reason | Durable hash-bound `.omd/reference-selection.json` plus the user-choice or disclosed-agent-choice entry in `.omd/decisions.md` | `omd ref select <candidate-id>` followed by `omd ref check` | An unknown, stale, or unconfirmed id stops downstream use. When no interaction is available, the coordinator may choose one candidate only after disclosing that it is an agent selection; it must not imply user approval. |
| clean-room composite | `coordinator` | Passing hash-bound selected assembly; its sanitized principles and skin-abstracted blueprints; and permitted project-owned material already available without composer output: sanitized brief/frame/concept, clean copy deck, approved type proof, committed palette/type/material, and local design decisions | Durable `.omd/reference-composite-lineage.json`; two-to-three generated draft/prompt cache entries only under `.omd/.cache/imagegen/`; coordinator decision naming the chosen draft, or an explicit unavailable lineage record | The coordinator/host derives prompts directly from these permitted inputs, generates 2–3 independent drafts concurrently, selects one, records `recordReferenceCompositeLineage(root, input)`, then requires `checkReferenceCompositeLineage(root)` before invoking composer | With no declared image-generation capability, record and check `unavailable` before invoking composer, which follows the selected assembly plus CSS/SVG evidence recipes. No `.omd/composition.md`, composer prompt, or composer art-direction output may enter this stage. A stale selection, forbidden source carrier, unchosen draft, or bad lineage stops every downstream consumer. |
| production usage ledger | `omd-hand` | Passing selected assembly; a checked generated lineage plus its coordinator-chosen clean-room draft, or a checked unavailable lineage; actual production source/render/probe evidence; and attribution | Durable `.omd/reference-usage.json` with exactly one `used`, `rejected`, or `anti-reference` row for every selected slot | `recordReferenceUsage(root, { rows })` then `validateReferenceUsage(root)` | Missing, unselected, duplicate, or unsupported rows, absent production evidence, or stale bindings stop finalization. Do not replace real evidence with a claimed influence. |
| final provenance report | `finalizer` | A passing usage ledger, current selected assembly, checked lineage, and `.omd/attribution.md` | Durable `.omd/reference-report.md` and the exact deterministic bilingual Markdown pasted into the final chat | `generateReferenceReport(root)` validates usage and atomically persists the returned Markdown | Any validation failure stops the final report. Do not hand-write, paraphrase, or claim a replacement report; repair the owning earlier stage and regenerate. |

## Chat-first presentation and selection

The scout runs `omd ref check` and then `omd ref candidates`. It pastes the command's
Markdown table directly into the Codex or Claude conversation. That table is the only
candidate presentation surface and names the source site/page, exact captured UI or image
region, proposed target, take, avoid, and adaptation. The coordinator records the selected
candidate with the existing `omd ref select` command behind the conversation.

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

## Executable, acyclic composite handoff

The capable-host route is a strict topological order, not a dialogue loop:

`selected assembly -> coordinator derives permitted-input prompts -> 2–3 concurrent clean-room drafts -> coordinator chooses one -> record/check generated lineage -> composer -> sketches/eye -> hand`

The coordinator derives the prompt directions directly from the selected sanitized assembly and
the permitted project-owned inputs in the stage table. It must not solicit or read
`.omd/composition.md`, a composer prompt, or composer art-direction directions to create a draft
that composer must later receive. The chosen draft is only a clean-room design-reference input;
the coordinator records its choice and checks lineage before composer starts.

The unavailable route is likewise closed before composition:

`selected assembly -> coordinator records/checks unavailable lineage -> composer CSS/SVG path -> sketches/eye -> hand`

Composer has no outgoing edge to either composite route. It starts only after the coordinator has
checked a generated lineage and hands it the chosen draft, or has checked the explicit unavailable
lineage and hands it the CSS/SVG fallback. This permits real brief, copy, register, palette, type,
and other project-owned material in coordinator prompts without granting composer an upstream role.

## Browser and clean-room boundary

For interactive visual research and user-directed region capture, use `browser-rs` first.
Use the deterministic Playwright paths `omd render` and `omd probe` only after an observed
browser-rs initialization or capability failure, never as a convenience second provider.
The fallback remains headless and reduced-motion. Preserve measured motion only when it is
relevant, honor the existing motion and WebGL/3D gates, and do not add a provider, API-key
flow, or runtime.

The internal raw evidence record is scout-only. Composer starts only after a successful checked
lineage: on the capable route it receives the current hash-bound sanitized selected assembly and
the coordinator-chosen clean-room draft; on the unavailable route it receives the selected
assembly and CSS/SVG fallback. Eye and hand are downstream of that checked state. None receives
the raw record, source URL/hostname, screenshot, pixel, capture path, provenance, source-page
prose, or visual likeness. They preserve real copy, task traceability, responsive proofs,
attribution, measured transfer, reduced motion, and the distance gate. A clean-room composite is
design-reference material only and never a shipped source asset.
