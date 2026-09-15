# Imagegen — image-first art direction (decision material)

Adapted for OMD from the image-direction discipline in lazycodex's `frontend` skill
(`imagegen-frontend-web`, `image-to-code`; Apache-2.0, github.com/code-yeongyu/lazycodex). This is
an OMD-native synthesis bound to OMD's evidence and anti-fabrication rules — not a copy.

**A generated image is a design reference, never a shipped asset.** It plays the exact role a Figma
export or a hand mockup plays: a visual contract the build implements against. You transfer its layout
grammar, token relationships, and
composition decisions, not pixels. A generated mockup never ships as a page `<img>`. Shipped imagery
still obeys `asset-sourcing`: a factual carrier (team photo, product screenshot, real person, logo)
is NEVER AI-generated; only an abstract or atmospheric zone may ship generated imagery, and only with
committed provenance recorded via `omd decision`.

## Draft seeding and the shipped surface

The raw reference board is scout-only evidence. An image-first draft may be seeded from the selected
`reference-assembly-v1`, sanitized evidence from selected external references, a project rough built on the committed design system,
and project-owned concept material (the brief, real product content, committed palette/type/material,
and local design decisions). Use only the candidate bound by the current hash-bound selection. The
assembly supplies measured evidence; it does not choose the concept or outrank explicit first-party
direction. Drafts live under `.omd/.cache/imagegen/` and are design references only.

Do not confuse an external reference with a **current-user-selected, project-owned concept target**.
External competitive and gallery material keeps the scout-only, sanitized handoff above. When the
current user explicitly says that their own concept image is the target to carry forward, that image is
first-party design direction: concept-making and production owners may receive the exact target, and
the reference assembly cannot neutralize or outvote it. Merely attaching an image does not make it a target; the user's explicit
selection does. Before typography or structure freezes, record the target's few load-bearing visible
invariants in the existing decision/composition record: dominant mass and spatial topology, relative
type scale, colour/material roles, reading path, signature relationship, and responsive transformation
only where each is actually present. Record what visible loss would falsify each invariant. Blind
selectors and reviewers receive those bound invariants and falsifiers, not target pixels or authorship. This is not a new
artifact, a style checklist, or permission to copy external source material.

Images supplied only to communicate ambition calibrate experimentation, surprise, and finish; they are
not a style recipe. Keep content-grounded spatial, media, interaction, typographic, or metaphorical
ideas available until visible experiments show what serves the brief. These are possibilities, not a
taxonomy or technique quota, and a new concept may depart from every example.

## Native capability and default choice

On Codex, inspect the current native tool inventory for image generation before choosing or skipping
visual experiments. Codex is a reason to check first, not proof that a particular deployment exposes
the tool. On any host with a callable image tool, unsettled confident/showpiece marketing defaults to
image-first concept exploration. A one-sentence landing request does not need to ask for images.
Use the built-in tool without requesting an API key or changing the user's model. Do not invent an
image CLI, use a separately billed API, or choose a different image model as an automatic fallback.

Native image generation is not an external design harness. An OMD-only run still uses its host's
image tool, renderer and browser. Not shipping bitmaps, choosing HTML/CSS/SVG production, or lacking
approved composition does not establish tool unavailability. Record the actual callable capability
or exact tool absence/failure in the existing decision record. A current settled target or a bounded
edit may need implementation rather than new concepts; otherwise an available image lane precedes
HTML exploration. Use a small HTML study later to test the chosen image's risky type, geometry or
interaction at actual viewports. Do not replace the visual direction with an easier coded study.

## Provisional image studies

When first-party facts are sufficient but reference acquisition or copy approval is still running,
the coordinator may generate provisional images in parallel with those owners. Before generation,
record the hypothesis count and evidence-based reason, actual content units, content-to-form
relationship, predicted visible consequence, primary action and intended viewports. Keep full prompts
in coordinator-owned task files and record their paths and SHA-256 identities through `omd decision`.
Label facts, provisional copy, provisional visual choices and any current user target distinctly.
Use exact real target-language copy in the prompt; an image's text remains unapproved until the
copy and typography owners verify it. For independent concepts, use independent prompts and calls.

These early drafts use only supplied or verified first-party material. They do not consume raw
Scout-owned gallery pixels, invent an approved assembly, or select a reference winner. Generate
section-sized horizontal images with readable text, not an unreadable tall webpage board. Compare
the governing relationship first, then carry feasible candidates through the relevant middle and
ending sections before a whole-page direction is settled. No fixed image or section quota applies.

Use the built-in tool's actual returned file. Copy the decision images non-destructively into
`.omd/.cache/imagegen/` and retain their prompts before production ownership begins. Do not assume
a temporary output path or fabricate image bytes, paths or tool receipts. Inspect every retained
image; a file's existence is not a visual judgment. Record what visibly works, what fails and what
must survive code translation, without converting a provisional choice into stage approval.

Once the selected measured reference assembly, approved copy and type proof exist, reconcile the
chosen provisional images against them. Regenerate a conflicting section or revise the owning
contract from evidence; do not preserve invented facts or silently discard the image's strongest
relationship. Composer receives the retained first-party images and their status through the existing
handoff. Hand implements accessible HTML/CSS/JS from the approved composition. The mockup itself
never becomes a page-sized image, and final blind Eyes receive only anonymous production renders.
Apply only the route's selected contracts; lawful skips use their declared evidence without invented
replacement artifacts. Final reviewers also receive their permitted source-free task and constraint packet.

Before presenting a provisional image as an improvement or accepting a reference-backed direction,
complete `protocol/reference-assembly.md` §Acquisition, transfer and similarity verification. A draft
generated while research was pending is not evidence that those references influenced it. Compare
the actual visible source relationships with the draft, name what transferred and what did not,
and resolve missing proof in the runnable type/geometry study. Repeated visual rejection pauses
further speculative generation until the implicated acquisition and transfer gaps are inspected.

`omd ref distance` measures the SHIPPED build against every saved reference as an advisory fidelity
signal — it reports closeness and never blocks shipping. The shipped surface obeys the committed design
system, not the raw draft, and a factual carrier is never AI-generated.

## Reopen a rejected visual direction

**[visual-feedback:route]** Record the user's actual feedback and its scope before another generation.
A bounded correction to an accepted direction preserves its unaffected target relationships and may
edit that image. A broad rejection of decoration, typography or the overall look, or a local revision
that leaves the same complaint unresolved, reopens the direction. It is not an instruction to become
quiet, use thinner type, remove all imagery, or retain the current palette and layout.

Separate verified product facts and explicit brand/user invariants from provisional visual choices.
An observed example page's tokens are not immutable brand law. Keep supported facts, useful task
references and explicit invariants; release unaccepted type, motif, palette and composition choices.
Do not invent approval for any of them merely because the previous prompt said to preserve them.

Generate fresh independent concepts, not image edits anchored to the rejected draft. Omit rejected
images from positive reference-image inputs and recent-image inclusion. Keep them as negative
comparison evidence only, outside generation conditioning. Retain an image seed only for an explicitly
accepted target or a genuinely bounded edit. Preserve reference isolation; this does not authorize
feeding raw gallery pixels to a generator or production owner.

Revisit only the evidence gaps implicated by the rejection. If existing references establish task
anatomy but not the desired visual craft, Scout inspects current live typography and composition,
including actual target-language display/body relationships, spacing, detail roles and relevant motion.
A directory page, search result, or unsupported principle is not a craft study. Keep useful captures;
do not restart unrelated acquisition or require the user to supply references.
Before generating again after repeated rejection, complete the acquisition and transfer inspection
in `protocol/reference-assembly.md` §Acquisition, transfer and similarity verification. Pending
research cannot yet influence a draft. Keep the failed drafts as evidence and resolve that gap first.

Before generation, state the material-specific type and composition hypothesis from that evidence:
what the real copy makes prominent, how letterform/weight/line breaks and secondary text relate, and
what each visual detail does. "Human-made", "premium", an oversized headline, or a product-labelled
diagram does not establish those choices. Do not manufacture handwriting, distress or irregularity as
proof of authorship. Real-font proof remains necessary; generated lettering cannot settle it.

Compare the actual new images with the recorded complaint and current brief. A relative favourite
among unresolved candidates is not an accepted direction. Render a repair that changes the governing
visual relationship before freezing it; a promise to fix generic type or arbitrary geometry later is
not visible evidence that the complaint has been resolved. No universal style ban, candidate quota,
new score, or claim of human provenance follows from this procedure.

## Provisional source studies

The native Codex host can delegate one HTML/CSS hypothesis to `omd-study` before approved Frame,
copy, type or composition artifacts exist. This helper makes material for a selected `art-direction`
stage; it does not perform or publish that stage. Select the helper explicitly with art direction
and composition, give it an execution wave before Composer and Hand, and otherwise retain the route's
existing stage dependencies. It can run alongside Framer/Scout/Writer. Do not run it merely because
the capability exists: a settled current target may need implementation rather than fresh exploration.
Check the image lane above first. Use this source helper for an observed image-capability fallback
or a concrete implementation-risk test, not as the default concept generator when images are available.

Before generation, use the existing decision record to state the number of hypotheses and why, their
actual content units, proposed spatial relationship, observable consequence, primary action and
desktop/mobile viewports. Each task identifies its first-party source and provisional/approved status.
Keep full hypotheses in the coordinator-owned task files; record their paths and SHA-256 identities
with a concise one-line `omd decision <what> --why <why>` before launch. The count and reason belong
in that record; the linked files carry the content units and hypotheses. Do not inline a long
multiline brief into command arguments or use a post-render rewrite as the pre-generation record.
Supply only the relevant original content or explicitly authorized demo facts and one hypothesis;
do not forward raw external references, other studies, winner claims or process instructions as UI
copy. An unknown capability cannot be turned into study content. If selected external reference work
is unfinished, these are first-party-only provisional studies, not settled reference-based art direction.
Later reference, copy, type and composition obligations remain unchanged.

A bounded repair of a selected native study may receive that one study as a read-only source baseline,
identified by its completed native role result, exact entry path and SHA-256, with explicitly named
local assets. This is a repair input, not a seed for independent alternatives. The helper verifies the
supplied identities and writes only its new host-granted leaf; the coordinator does not seed or patch
that output directory. A missing baseline returns to the coordinator as an input problem. A successful
child process without a nonempty regular `index.html` is not a completed source artifact.

Run `omd-codex role run --agent omd-study --input <one-task.md> --json`. The host alone chooses a fresh
`.omd/.cache/studies/study-<id>/` leaf and returns `studyDirectory` in the signed role result.
The helper writes `index.html` and local study assets only there. It gets no delegated publication,
browser or other-role authority. Do not substitute a caller-chosen directory or all of `.omd` as its
write grant. Hosts without this explicit native directory grant do not support this lane; use their
existing supported visual method or record the capability limitation. HTML study support is not an
image-generation capability claim.

After the role's actual completion, the coordinator runs
`omd render <studyDirectory>/index.html --proofs -o <studyDirectory>/proof` for real desktop/mobile
fixed and full-page captures. Inspect the actual images without concept names or author rationales:
first check that the hypothesized content relationship is visible, then judge task fit, ambition,
craft and responsive behavior. No applicable winner means repair or reconsider, not closest-wins.
Record a provisional choice only after this inspection, with source/render paths and the few visible
relationships worth preserving. This is local design decision material, never `omd candidate select`,
a review verdict, production completion, or evidence of human equivalence.

Composer may receive the chosen first-party study and its provisional status as a visual seed, like
the project-owned rough below. It reconciles the visible relationships with current approved facts,
copy, typography and reference evidence in the normal composition contract. The study cannot approve
itself or force an unsupported claim downstream. Hand remains the sole production author. Final
blind Eyes receive no study, author identity or selection rationale.

## Carry a selected image into source

When the user requests an image-to-code workflow and the visual direction is unresolved, generate and
select the image through the available image lane before implementing it. An existing settled target
can proceed directly to implementation; do not regenerate it merely to repeat the method.

**[image-source:fidelity]** When an image is selected as an implementation target, pass its actual
project-owned file, SHA-256 identity and intended viewport to the source owner. The owner must inspect
the image; a prose summary of its layout is not a substitute. If it cannot view the file, return that
missing input rather than silently implementing an approximation. This also applies to `omd-study`.
An exploratory image that has not been selected remains decision material, not an implementation target.

Preserve the selected image's component proportions, alignment, spacing rhythm, type relationships
and control anatomy as well as its macro composition. Reconcile generated text and artifacts with
the authoritative content, real-font proof, interaction and accessibility requirements. Record the
necessary adaptations in the existing owner handoff; do not quietly replace the visual treatment with
default controls or an easier layout. Exact generated lettering or unsupported UI is never authoritative.

After the owner finishes, capture the actual source at the target viewport. The authorized observer
compares target and render side by side at readable scale, including the controls or regions implicated
by feedback. A squint render cannot establish detail fidelity. For a select, for example, inspect the
rendered text, caret and both edge insets rather than only the outer box; retain keyboard and native
selection semantics when adjusting its appearance. Use DOM geometry to resolve a visible discrepancy,
not as a substitute for inspecting it. No universal inset, pixel-match percentage or styling rule follows.
Zooms or crops for this comparison derive from the unchanged target and current render; retain their
source bindings. Regenerating a detail creates new decision material, not a closer view of existing evidence.

In the existing decision/craft record, identify the target and current source/render, the observed
deviations and their dispositions. Unexplained loss of selected craft requires an owner-authored repair
and a fresh comparison before claiming faithful implementation. Source completion, working interactions
and possession of the target PNG do not establish that match. This adds no approval stage, new publisher
or production authority; `omd-study` stays source-only and final blind review remains isolated.

## When image-first applies

Image-first is for confident/showpiece register work where the visual composition is a first-class
deliverable — landing pages, marketing sites, portfolios, brand/editorial pages, redesigns where the
look is the point. For a settled tool or document surface whose current uncertainty is behavioral,
it may add nothing; skip it with that reason. A quiet register is not an exemption when the user requests
image-to-code implementation or when unresolved visual craft is the task. Use the available image lane
for that uncertainty, then apply the selected-image comparison above.

When the host provides an image-generation capability and image-first applies, the order is
**mandatory**:

1. **Generate** — before composer starts, the coordinator/host derives the generation directions and
   independent prompts from the hash-bound selected assembly, sanitized selected-reference evidence, any project
   rough, and the permitted project-owned inputs. Before generation, record the candidate count and
   its evidence-based reason in the existing decision record. Unresolved competing concepts need
   comparison; one candidate is appropriate only when the brief or current evidence already settles
   the direction. Do not lower the count after seeing results to excuse a cheap implementation.
   Keep genuinely different conceptual hypotheses alive through the smallest useful visible experiments;
   prose labels, scores, and metadata cannot select a winner before the ideas are rendered. It generates
   the selected independent drafts concurrently and chooses one from visible evidence only when it
   clears the applicable task, concept, craft, and ambition floors,
   and stores them under `.omd/.cache/imagegen/`. The composer never contributes an upstream prompt or
   art-direction decision. One horizontal image per section for a multi-section page — never one tall
   board with unreadable text. To explore a new section design, generate that section fresh with the
   selected palette/type/radius/treatment. This does not prohibit a crop or zoom for fidelity inspection.
   A project-owned rough — a quick pass built on the committed design system — is a permitted seed:
   feed it plus the committed palette/type/material so the draft fleshes out ("구체화") that rough. The
   build then redesigns the draft back onto the design system's tokens, spacing, and component rules;
   the draft is a reference, never shipped, and the shipped surface obeys the system, not the raw draft.
2. **Analyze** — after the coordinator has chosen the draft, composer analyzes and translates it into
   the composition contract: extract tokens, layout geometry, spacing rhythm, type-scale relationships,
   component anatomy, interaction affordances, and each section's job.
3. **Feed** the chosen draft into `.omd/composition.md` as the reference-fidelity direction, then build
   against it and run `omd ref distance` as an advisory signal. If the host has no image capability,
   composer follows the evidence-based CSS/SVG composition path using the selected sanitized assembly,
   `theory/expressive.md`, and the graphics recipes.

Not shipping a generated image is not a reason to skip image-first thinking. The draft is decision
material by definition. Select or skip the method for the actual visual uncertainty, current supplied
direction, and host capability; keep that decision separate from whether any generated asset ships.

## Choose a concept that survives implementation

Before rendering an unselected concept study, the coordinator binds the actual content units, their
proposed spatial relationship, and the predicted observable consequence in the existing decision record
and generation prompt. The consequence is a visible spatial/content relationship or an observed
interaction state, not an inferred comprehension or conversion gain. For a whole-page request, carry
that relationship through the beginning, middle, and end, including the relevant transition between
them. Keep one horizontal image per section: a landscape-format study render of each section, not an
image embedded in the designed section.
After rendering, hide concept names and rationales and check whether the predicted relationship and
consequence are actually visible. If they are missing, the output does not validly test that hypothesis;
it is not evidence that the concept is infeasible. This checks the experiment's execution, not its beauty.

For each alternative, identify what in the real content generates its form, its dominant visual
relationship, reading path, primary action, and mobile transformation. Multiple alternatives must
change the content-to-form relationship and macro composition; different colours or fonts alone
do not constitute different concepts. Alternatives may retain the same supplied brand colours.
One governing anchor can organize an entire page. Repetition can carry meaning and rhythm; do not
add extra anchors, backgrounds, or sections to meet a variety quota.

Before dismissing a visually strong direction as impractical, test its riskiest anchor and primary
action with real text, actual fonts, and a small renderable study at the required viewports. Record
the observed constraint. A clipping study tests lawful wrapping, container geometry, and responsive
recomposition before shrinking concept-bearing type; one implementation's failure does not silently
become the concept's type scale. Among feasible alternatives, choose for rendered concept, task fit, and
craft. Cost disqualifies only against an explicit budget or breaks a tie between equivalent options;
the easiest structure is not automatically the best design. A familiar layout family is eligible
when its rendered relationships fit the content exceptionally well.

When a current-user concept target exists, alternatives explore implementation of that target rather
than replacing its governing relationships with a safer unrelated composition. Reject every draft
that loses a target invariant. A no-winner decision names the concrete visible deficiency against the
target or brief; “familiar” alone is not a failure. Never promote the closest adequate draft. Task
correctness, accessibility, and factual fidelity remain conjunctive requirements, but they do not
convert a target-breaking or visibly under-ambitious render into an accepted one.

When examples carry ambition rather than a target, judge the visible experiments against that ambition
and the actual brief, not against the examples' common traits. A familiar layout remains eligible when
its rendered relationships meet the bar. An entire user-supplied concept study cannot be placed in
`literalPropsToReject`; that field excludes literal props, not ambition evidence.

The selected draft's few load-bearing relationships belong in the existing composition sections:
mass and negative space in `Density and visual mass`, type/content relationships in `Domain form
grammar`, action priority in `Focal hierarchy`, and mobile changes in `Responsive recomposition`.
State what must survive and what visible change would count as loss. These are production decisions,
not new UI copy or a second composition artifact. Compare those relationships in the actual render
before adding more sections or polish; fidelity checks remain distinct from independent beauty review.
Once bound, an invariant remains in force until its owning design stage revises the contract from
visible evidence or the current user changes direction. Hand cannot relax it during implementation.

Reasoning the layout in the abstract is exactly what produces the symmetric, boxed, template output
`expressive.md` § "Slop-free is not the same as distinctive" warns about. A generated draft forces a
concrete art direction to react to instead of a reasonable-sounding description.

## Anti-literal generation contract

This section applies when the route selects the typed art-direction contract; it does not invent a
metaphor method or fields outside that contract.

Before selection, each non-authoritative visual study consumes its own art-direction alternative's
exact non-empty `metaphorQualities` and `literalPropsToReject`. It does not publish composition,
Sketch-candidate selection, or production approval. After selection, every refinement and downstream
consumer uses the selected decision's exact fields. In both phases, preserve the qualities through
hierarchy, rhythm, typography, imagery, and motion cues. Supply rejected props only as private visual
exclusions: drafts must not depict, spell, iconize, pattern, silhouette, or substitute a close visual
synonym for them. Neither field is image text, UI copy, a caption, or a negative sentence to render.
Reject a study that literalizes its metaphor even when its palette and polish otherwise fit. This phase
split does not relax the art-direction schema, final selection validation, privacy, or exclusions.

## Break the AI defaults (aggressively)

Treat these as diagnostic risks, not layout-family bans. Name the visible weakness and its effect on
this content before rejecting a draft:

- centered dark hero with a purple/blue glow; floating meaningless blobs
- **left-text / right-image hero** used without a content relationship between the two halves;
  a split composition with a strong relationship remains eligible
- generic dashboard/card spam; cards inside cards inside cards; giant rounded containers everywhere
- weak typography hierarchy; boring default web-type energy
- "luxury" that is only beige serif text; "creative" that is actually messy and unreadable
- text-heavy layouts with too little imagery; over-packed sections with no breathing room
- tiny pills, tags, and fake interface jargon used as decoration

## Find the visual idea before the technique

Begin with the subject rather than a menu of page patterns. Investigate what actually changes,
repeats, collides, accumulates, reveals itself, or asks for reader participation in this material.
Follow whichever observation is generative; these are prompts for inquiry, not required categories.

Express a hypothesis as a causal chain: the real operation, material, relationship, or action that
generates a visual or interaction rule, and the experience consequence that rule creates. It is a new
concept only when that chain produces a meaningfully different visible structure or behavior. Theme,
hero, section, background, and effect choices follow the idea instead of supplying it. A familiar
solution remains lawful when the rendered relationship fits exceptionally well. Register governs
restraint, and one coherent rule is stronger than a catalogue of techniques.

## The bar

Not clean-and-correct — work a senior designer at Linear, Stripe, or Supabase would ship. Correct-but-flat
is a failure, not a finish.
