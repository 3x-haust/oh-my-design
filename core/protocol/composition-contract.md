# Composition contract protocol

`.omd/composition.md` is the durable bridge between research and isolated structural
sketches. `omd-composer` owns it. The artifact records composition decisions; it does not
copy a reference page or prescribe one visual answer.

The composer receives a sanitized frame/concept, clean copy deck, sanitized approved type
contract, and the scout's distilled transferable principles/invariants with source trust.
It composes section by section: each section is assigned the single best-fit reference part for that
section's job, and different sections may draw from different references, so the page is a deliberate
composition of parts — not one reference reproduced whole. The hand builds each section against its
assigned reference part with image-to-code fidelity; tracing one reference's entire page layout and
section order wholesale is a derivative failure, not fidelity. It still writes the product's own copy
and uses its own real assets rather than lifting the source's literal text or photographs. Read `theory/layout.md` and
`theory/ux.md` exactly before writing.

Use these H2 sections exactly and keep each non-empty. When the project has user-provided
references (`omd ref add --from-user`), the additional `## Reference synthesis` section is
required as well; `omd composition --check` enforces it.

Before writing any section, read the frame's `uxSurface` classification. It selects the
grammar (see `theory/ux.md` §Surface types): a `marketing` surface composes as a message
ladder; a `product` work surface composes as a task loop over screen regions; `editorial`
composes as a reading sequence; `mixed` names which screens follow which grammar. The
section names below stay the same across grammars — what changes is what a "section" is:
on a product surface it is a screen region or reachable state with a job in the task
loop, not a scroll chapter.

## Input fingerprint

Record exactly one line for each input:

```text
- Frame SHA-256: <64 lowercase hex>
- Copy deck SHA-256: <64 lowercase hex>
- Type proof SHA-256: <64 lowercase hex>
- Scout SHA-256: <64 lowercase hex>
```

Hashes cover `.omd/frame.md`, `.omd/copy-deck.md`, `.omd/type-proof.md`, and
`.omd/scout.md`. When `.omd/scout.md` does not exist, the scout line is instead
`- Scout SHA-256: N/A — <specific reason>`. Never invent a scout hash. Any frame, copy,
type-proof, or scout-summary change invalidates the contract; rerun composer and the check.

## Experience spine

For a `marketing` or `editorial` surface: for every section, record the entering user
question, exactly what new answer/evidence this section adds, its primary action, and why
the next section depends on it. This is a message ladder, not a list of fashionable
section names.

For a `product` surface: write the spine as the task loop — orient → locate → act →
feedback → next/recover. For every screen region (shell/navigation, work object, supporting
panels, state surfaces), record which loop step it serves, the frequent action it carries,
and why the region's position follows task order. Include the reachable states (loading,
empty first-run, filtered-to-zero, error/recovery, success) as spine entries with their
copy source; a work surface without designed states has an incomplete spine. Do not write
a persuasion ladder for a tool: a hero section above a queue is a grammar defect, not a
style choice.

## Section dependency

Run the reorder/removal test. If adjacent sections can swap or disappear without weakening
meaning, revise their dependency or record the evidence-backed reason independence is useful.

## Grid and alignment

Define the shared alignment/grid skeleton and the limited, intentional breaks that express
meaning. Do not choose a break because a reference used it.

## Density and visual mass

Describe how density, visual mass, and negative space progress across the whole experience.
Relate every change to attention, evidence, action, or recovery.

## Focal hierarchy

Define one dominant anchor in the first viewport and its visual-mass budget relative to the
value statement, proof, and visible primary CTA. On a `product` surface the dominant anchor
is the work object itself — the table, queue, canvas, form, or data view the task loop
operates on, at representative data density — and the "value statement" is at most one line
of orientation; a display-scale headline or decorative hero claiming the first viewport of
a work surface is a rejection condition, not an anchor. The CTA plus a predictable completion path
satisfies task reach; the terminal form or control surface does not have to appear in the
first viewport and earns no credit merely for being visible there. State a visible rejection
condition for a candidate whose anchor loses dominance, crowds the task cue, or becomes
detached from the concept.

The anchor may be lawful product/evidence media, an explanatory graphic, real interaction or
data, or concept-bearing typography. A photo is never mandatory. Do not invent product facts,
assets, or evidence to manufacture an anchor.

## Domain form grammar

Derive recurring relational properties from the product's mechanism, material, or workflow.
Assign them to functional UI roles and state their limits. A metaphor that becomes decorative
shape instead of useful relationship fails this section.

## Media roles

For each section, assign media one job: evidence, explanation, orientation, or action. When
the domain mechanism, material, or workflow is central, assign a lawful carrier for it or
name an explicit alternate non-media mental-model carrier and its limitation. `none because
no approved photo` is insufficient: a photo is not required, and absent assets do not excuse
an absent mental model. Do not invent product facts or assets.

## Responsive recomposition

Use a desktop/mobile table. Preserve semantic DOM and focus order, the anchor's morphology
and relationship to value/proof/CTA, and an uninterrupted primary-task cue and completion
path while explaining how each relationship reframes. Do not write only `stack` or `hide`.
The full form need not occupy the first viewport. Account for reflow at 320 CSS px, while
production evidence still renders 1280x900 and 390x844.

## Candidate axes

Define at least two genuinely different structural axes that can satisfy the same spine,
copy, type, and acceptance criteria. Axes vary spatial relationships, not content truth.

## Transfer boundary

The boundary is drawn around the source's identity, not its structure. Permitted transfer:
attributed relationships, measured invariants, principles abstracted from trusted evidence, and —
at section granularity — an assigned reference part's layout, composition, and treatment, rebuilt
faithfully with the destination's own copy, assets, and tokens. This per-section fidelity is the
point (see `reference-assembly.md`): reproducing the assigned section's layout is expected, and
`omd ref distance`'s high per-part closeness is the intended outcome, not a warning. Forbidden
transfer is the source's identity and its whole-page gestalt: its brand/wordmark, copy, photographs
and assets, literal token values, unique interaction and motion, and — across the entire page — its
full section order and overall silhouette. Faithfully rebuilding one assigned section is lawful;
tracing a whole reference page section-by-section into your whole page is the derivative failure.
An exact whole-page or identity transplant is allowed only when the user explicitly requested that
specific transplant; record the request and attribution.

## Reference synthesis

Required when user-origin references exist, and structurally validated whenever it is non-empty.
`omd composition --check` parses this section as a closed Markdown ABI: prose, headings,
fields, or axis rows outside the forms below are rejected.

An adopted transfer is one `### Feature: <specific feature>` record:

```md
### Feature: Inbox triage workspace
- Origin: explicit
- Assumption: N/A
- Primitive: Triage and inspect a queue item
- Source ref: ref-<first 16 lowercase hex of SHA-256(source + NUL + component)>
- Trust: Directly observed stable reference
- Uncertainty: Content changes may alter exact density.
- Structural rule: Queue and detail panels remain visible together.
- Adaptation: Fit that relationship to the current task flow.
- Token variation: Use destination tokens, not source values.
- Conflict resolution: Task, accessibility, mobile, then one destination system win.
- Destination route: /inbox
- Destination selector: [data-region="inbox"]
- Mobile behavior: Recompose into a focused drill-in flow.
#### Axes
- Information architecture/navigation | adapt | Queue navigation exposes current work. | Fit it to destination routes.
- Macro layout and panel/region geometry | adapt | Queue and detail remain paired. | Preserve the relationship at the work surface.
- Content density | N/A | N/A | The source has no usable density evidence.
- Typography/hierarchy | N/A | N/A | The source has no usable type evidence.
- Spacing/rhythm | N/A | N/A | The source has no usable rhythm evidence.
- Component anatomy | N/A | N/A | The source has no reusable anatomy evidence.
- Interaction/state/feedback | adapt | Selecting an item updates detail. | Use destination state vocabulary.
- Responsive/mobile recomposition | adapt | Detail becomes focused on narrow screens. | Preserve return to the queue.
- Motion/transition | N/A | N/A | The source has no transferable motion evidence.
```

Use every axis exactly once: information architecture/navigation; macro layout and panel/region
geometry; content density; typography/hierarchy; spacing/rhythm; component anatomy;
interaction/state/feedback; responsive/mobile recomposition; motion/transition. Disposition is
exactly `accept`, `adapt`, `decline`, or `N/A`. Applicable axes require a substantive observed
rule and adaptation or decline rationale. `N/A` uses `N/A` as its observed rule and a substantive
reason. An adopted record must accept or adapt at least one structural or visual-system axis
(the first six); interaction-only or token-only transfer is invalid.

`Source ref` is the exact stable reference identity, not a hostname or prose mention. For a stored
user reference it is `ref-` plus the first 16 lowercase hexadecimal characters of
`SHA-256(source + NUL + component)`. This preserves two user references from the same host as
separate obligations. The checker compares normalized `Source ref` field values only; text
elsewhere in the section never satisfies reference coverage. A scout-origin reference instead
uses an uppercase hyphenated key matching `[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+`; hostnames and
free-form prose are invalid identities. Feature labels may be short when
specific; explanatory fields need substantive content. Destination routes must be non-placeholder
local routes beginning with `/` (including `/` itself). Destination selectors must be unique after
whitespace normalization and use only a stable `[data-*="…"]` selector or an accessible semantic
element/role selector.

A whole explicit feature may instead be declined without pretending it is an adopted transfer:

```md
### Decline: Document density
- Origin: explicit
- Source ref: ref-<first 16 lowercase hex of SHA-256(source + NUL + component)>
- Trust: User supplied reference
- Uncertainty: Scope is limited to the supplied page.
- Reason: Document density conflicts with rapid queue scanning.
```

`omd composition --check` validates this ABI, section structure, fingerprint format, freshness,
and every user-reference mention. It does not score taste or aesthetics.
