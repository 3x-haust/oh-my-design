# Composition contract protocol

`.omd/composition.md` is the durable bridge between research and isolated structural
sketches. `omd-composer` owns it. The artifact records composition decisions; it does not
copy a reference page or prescribe one visual answer.

The composer receives a sanitized frame/concept, clean copy deck, sanitized approved type
contract, and the scout's distilled transferable principles/invariants with source trust.
It does not receive or reproduce screenshots, assets, pixels, literal tokens, copied text,
full-page descriptions, or a source page's complete sequence. Read `theory/layout.md` and
`theory/ux.md` exactly before writing.

Use these H2 sections exactly and keep each non-empty.

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

For every section, record the entering user question, exactly what new answer/evidence this
section adds, its primary action, and why the next section depends on it. This is a message
ladder, not a list of fashionable section names.

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
value statement, proof, and visible primary CTA. The CTA plus a predictable completion path
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
an absent mental model. Do not invent product facts/assets or weaken the clean-room transfer
boundary.

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

Permitted transfer: attributed relationships, measured invariants, and principles abstracted
from trusted evidence. Forbidden transfer: source identity in shipped UI, copy, assets,
literal tokens, full section order, pixels, recognizable silhouette, or unique interaction
and motion. An exact transplant is allowed only when the user explicitly requested that
specific transplant; record the request and attribution.

`omd composition --check` validates only section structure, fingerprint format, and freshness.
It does not score taste, aesthetics, or whether a composition is good. Completion means the
artifact exists and the validator succeeds; a status report alone is not completion.
