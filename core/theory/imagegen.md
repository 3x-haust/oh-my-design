# Imagegen — image-first art direction (decision material)

Adapted for OMD from the image-direction discipline in lazycodex's `frontend` skill
(`imagegen-frontend-web`, `image-to-code`; Apache-2.0, github.com/code-yeongyu/lazycodex). This is
an OMD-native synthesis bound to OMD's evidence and anti-fabrication rules — not a copy.

Use `art-direction.md` to define the communication job, shot/crop system, rights status, and final-asset plan before choosing generation.

**A generated image is a design reference, never a shipped asset.** It plays the exact role a Figma
export or a hand mockup plays: a visual contract the build implements against. You transfer its layout
grammar, token relationships, and
composition decisions, not pixels. A generated mockup never ships as a page `<img>`. Shipped imagery
still obeys `asset-sourcing`: a factual carrier (team photo, product screenshot, real person, logo)
is NEVER AI-generated. An abstract or atmospheric zone (a background photo or texture, a mood
field) may ship generated imagery when its provenance is committed and named in the report. Graphics
that explain the product — illustrations, UI scenes, objects — are built in code and rendered to
images; generated images only explore their ideas (see
[Graphics](#graphics)).

## Draft seeding and the shipped surface

Raw gallery pixels are reference evidence, not generator input. An image-first draft may be seeded
from what the kept references show (`omd ref context`), described rather than pasted, a project rough
built on the committed design system, and project-owned concept material (the brief, real product
content, committed palette/type/material, and local design decisions). The references supply measured
evidence; they do not choose the concept or outrank explicit first-party direction. Drafts live under
`.omd/.cache/imagegen/` and are design references only.

Do not confuse an external reference with a **current-user-selected, project-owned concept target**.
External competitive and gallery material stays described, as above. When the current user
explicitly says that their own concept image is the target to carry forward, that image is first-party
design direction: work from the exact target, and the kept references cannot neutralize or outvote it.
Merely attaching an image does not make it a target; the user's explicit selection does. Before
typography or structure freezes, write the target's few load-bearing visible invariants into the
brief: dominant mass and spatial topology, relative type scale, colour/material roles, reading path,
signature relationship, and responsive transformation only where each is actually present. Name what
visible loss would falsify each invariant and check the render against it. This is not a new
document, a style checklist, or permission to copy external source material.

Images supplied only to communicate ambition calibrate experimentation, surprise, and finish; they are
not a style recipe. Keep content-grounded spatial, media, interaction, typographic, or metaphorical
ideas available until visible experiments show what serves the brief. These are possibilities, not a
taxonomy or technique quota, and a new concept may depart from every example.

## Native capability and default choice

On Codex, inspect the current native tool inventory before an image study that the task actually
needs. Codex is a reason to check capability, not proof that a deployment exposes the tool. Use
image-first exploration only when imagery or spatial art direction is the real unresolved decision.
A new landing page qualifies: its composition is open until something is drawn, so its hero and any
section whose layout is not obvious are drafted as page ideas before the page's source is written
(`omd imagegen --kind page`, see §When image-first applies). A settled direction, a bounded edit, or
uncertainty only about copy, behavior, or information architecture does not default to image generation. When image-first applies, use the built-in tool
without requesting an API key or changing the user's model. Do not invent an image CLI, use a
separately billed API, or choose a different image model as an automatic fallback.

Native image generation is not an external design harness. An OMD-only run still uses its host's
image tool, renderer and browser. Not shipping bitmaps, choosing HTML/CSS/SVG production, or lacking
a settled layout does not establish tool unavailability. Say in the report which image tool was
callable, or the exact tool absence/failure. A current settled target or a bounded
edit may need implementation rather than new concepts; otherwise an available image lane precedes
HTML exploration. Use a small HTML study later to test the chosen image's risky type, geometry or
interaction at actual viewports. Do not replace the visual direction with an easier coded study.

## Graphics

Ideate from references; ship rendered code.

Generated images are ideation for graphics, never the shipped graphic; only an abstract or
atmospheric background may ship generated pixels (see above). A graphic that ships is built in code
(HTML/CSS/SVG, WebGL for an occasional accent) and rendered to an image that the page places.

- **A graphic explains.** It is there because the idea is hard to say in words: it shows what the
  product does so the visitor understands before reading. Work out from this brief what the product
  does to what, and act that change out with objects; the shape of the scene comes from that
  mechanism, not from a stock pattern. A symbol for
  a word of the headline (a magnifier over "developer", a rocket for "launch") illustrates the word,
  not what the product does. Words inside
  the art are only the few labels its objects carry (a state chip, a button, a file name). Hide the
  section text and say what the picture shows; if that is not the section's claim, or the art holds
  more words than its section copy, it explains nothing and gets redrawn.
- **References first, per graphic job.** When the user names sites whose graphics they admire,
  open those first and keep their graphics (`omd ref browse goto <url>`, then `shot --selector
  <the graphic's img>` and `keep`): they are the bar, not a style to repeat. Then search wide, the
  way only a tireless researcher can: write many queries in this brief's own words, one graphic job at
  a time (what the section must show, the material and mood it calls for), run them across several
  galleries, look past the first results, and gather far more candidates than you will keep. Lay them
  side by side (`contact-sheet`), compare them against the brief and the bar, and keep the few that
  solve this job best, each with the reason: which element is the protagonist, how the context is
  pushed back, where the light comes from, how the frame is cropped. Keep only work you would be glad
  to lose to; flat outline icons scattered on a shape are stock filler. Kept graphics are never traced
  or copied.
- **Real services in the same category first.** Before illustrating a feature, look at the feature
  sections of real services in the product's category. Their art is usually the product's own
  interface or output — a real log, response, screen or result with specific content — cropped
  large under one light. Prefer this product's real material the same way; an invented example
  site, filler words or placeholder shapes are not a graphic.
- **Ideate.** Generate several quick idea images per section graphic from the section's claim and the
  kept references to explore protagonist, composition and light: `omd imagegen --name <section>
  --prompt "<claim, protagonist object, material, light, framing>" --reference <kept image path>`
  (Codex image generation; the host's own image tool works too). Vary the protagonist and framing
  between ideas, then choose the strongest. They are ideation only and stay in `.omd/ideas`; without
  Codex, sketch the idea directly in code. Either way the idea is a starting point, not an asset.
- **Build and render.** Make each graphic one page or element in code using the product's real
  vocabulary, then render it: `omd render graphics/review.html --graphic --selector .art
  --transparent --out public/graphics/review.png`. Place the image with alt text that states what it
  shows. Words the visitor must read, copy or translate stay in HTML beside the image. Treat each
  render warning about an enlarged raster as a defect: rebuild that part in code or use a source at
  least twice its drawn size.
- **Objects in 3D — the default for a landing's section graphics.** Build each section's protagonist
  as a lit object in three.js (MIT) on the graphic page, not as flat HTML cards, sheets and labels:
  those make a diagram, and `omd taste graphic` refuses a landing graphic with no WebGL in it. The
  objects act out the section's mechanism rather than decorate it: model the thing the product works
  on or turns out (a page being lifted out of its template, a parcel mid-route, a ledger splitting a
  payment) from rounded geometry, caught mid-change. The brand mark standing alone is identity, not a
  claim: extruding it (`SVGLoader`, `ExtrudeGeometry`) suits a small accent beside that object, not the
  section's protagonist. Use `MeshPhysicalMaterial` with clearcoat (transmission for glass), image-based
  light from `RoomEnvironment`, one key light and a soft contact shadow, and `NeutralToneMapping` so
  brand colours stay saturated. Set `window.__ready = true` after the first frame and render with
  `omd render --graphic`. A few objects that belong to this product, one leading, read as designed; a
  scatter of generic icons does not.
- **Show one moment, large.** Real material is cropped to the single moment that proves the claim —
  one log line, one review comment, one before/after pair — at a size where its text reads. A whole
  page or screen shrunk into a browser or phone frame is a thumbnail: its text dies, it repeats what
  the page already says, and a frame inside a frame reads as generated. Give the protagonist scale
  contrast against its context, light that models it (a glow with a source, a gradient that behaves
  like light), and a crop that commits; push the context back with blur, tone or scale instead of
  more boxes, labels or arrows. The protagonist is a thing with form: one real interface element, an
  object, or the brand's own material (its mark, its colour as light) at large scale. Real output
  appears inside it as one line or one value set as live type, never a screenshot scaled until its
  letters blur. The section's heading, labels and explanatory sentence stay in the page beside the
  art: a panel holding a heading, a pasted screen and a caption is a document, and a dark card of
  type alone is a document too.
- **Judge it blind, then iterate it alone.** Run `omd taste graphic public/graphics/review.png
  --against <image.path of a kept graphic>` (up to three `--against`). A separate reviewer sees the two
  fitted to one canvas without knowing which is yours and names the tells of the one it judges
  AI-made. When yours is told apart, rework those tells — protagonist, light, crop, scale — not by
  copying the reference, render again and compare again, at most three rounds. Keep references worth
  losing to: a stock icon collage sets no bar. Then check each against the marketing graphic judgments
  (`omd pack judgments --surface marketing`); the first-render reviewer judges it in the page.

## Provisional image studies

When first-party facts are sufficient but reference research or the copy is still being settled,
you may generate provisional images alongside that work. Before generation, name the hypothesis
count and evidence-based reason, actual content units, content-to-form relationship, predicted
visible consequence, primary action and intended viewports. Keep full prompts beside the drafts
under `.omd/.cache/imagegen/`. Label facts, provisional copy, provisional visual choices and any
current user target distinctly. Use exact real target-language copy in the prompt; an image's text
stays provisional until the page's copy and a real-font specimen settle it. For independent
concepts, use independent prompts and calls.

These early drafts use only supplied or verified first-party material. They do not consume raw
gallery pixels, invent references, or select a reference winner. Generate section-sized horizontal
images with readable text, not an unreadable tall webpage image. Compare
the governing relationship first, then carry feasible candidates through the relevant middle and
ending sections before a whole-page direction is settled. No fixed image or section quota applies.

Use the built-in tool's actual returned file. Copy the decision images non-destructively into
`.omd/.cache/imagegen/` and retain their prompts before building begins. Do not assume a temporary
output path or fabricate image bytes, paths or tool receipts. Inspect every retained image; a file's
existence is not a visual judgment. Note what visibly works, what fails and what must survive code
translation, without treating a provisional choice as approved.

Once the kept references, the page's copy and a type specimen exist, reconcile the chosen
provisional images against them. Regenerate a conflicting section or revise the brief from evidence;
do not preserve invented facts or silently discard the image's strongest relationship. Build
accessible HTML/CSS/JS against the chosen images. The mockup itself never becomes a page-sized
image, and the isolated first-render reviewer sees only the production renders.

Before presenting a provisional image as an improvement or accepting a reference-backed direction,
complete the comparison in `protocol/reference-assembly.md` §Applying a reference. A draft
generated while research was pending is not evidence that those references influenced it. Compare
the actual visible source relationships with the draft, name what transferred and what did not,
and resolve missing proof in the runnable type/geometry study. Repeated visual rejection pauses
further speculative generation until the implicated acquisition and transfer gaps are inspected.

The shipped surface obeys the committed design system, not the raw draft, and a factual carrier is
never AI-generated.

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
feeding raw gallery pixels to a generator.

Revisit only the evidence gaps implicated by the rejection. If existing references establish task
anatomy but not the desired visual craft, inspect current live typography and composition with
`omd ref browse`, including actual target-language display/body relationships, spacing, detail roles
and relevant motion.
A directory page, search result, or unsupported principle is not a craft study. Keep useful captures;
do not restart unrelated acquisition or require the user to supply references.
Before generating again after repeated rejection, redo the reference comparison in
`protocol/reference-assembly.md` §Applying a reference. Pending
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

## Carry a selected image into source

When the user requests an image-to-code workflow and the visual direction is unresolved, generate and
select the image through the available image lane before implementing it. An existing settled target
can proceed directly to implementation; do not regenerate it merely to repeat the method.

**[image-source:fidelity]** When an image is selected as an implementation target, build from its
actual project-owned file at its intended viewport. Open and inspect the image itself; a prose summary
of its layout is not a substitute. If the file cannot be viewed, say so rather than silently
implementing an approximation.
An exploratory image that has not been selected remains decision material, not an implementation target.

Preserve the selected image's component proportions, alignment, spacing rhythm, type relationships
and control anatomy as well as its macro composition. Reconcile generated text and artifacts with
the authoritative content, real-font proof, interaction and accessibility requirements. Name the
necessary adaptations in the report; do not quietly replace the visual treatment with
default controls or an easier layout. Exact generated lettering or unsupported UI is never authoritative.

After building, capture the actual source at the target viewport and compare target and render
side by side at readable scale, including the controls or regions implicated
by feedback. A squint render cannot establish detail fidelity. For a select, for example, inspect the
rendered text, caret and both edge insets rather than only the outer box; retain keyboard and native
selection semantics when adjusting its appearance. Use DOM geometry to resolve a visible discrepancy,
not as a substitute for inspecting it. No universal inset, pixel-match percentage or styling rule follows.
Zooms or crops for this comparison derive from the unchanged target and current render; retain their
source bindings. Regenerating a detail creates new decision material, not a closer view of existing evidence.

In the report, name the target and current render, the observed deviations and what you did about
each. Unexplained loss of selected craft requires a repair and a fresh comparison before claiming
faithful implementation. Source completion, working interactions and possession of the target PNG do
not establish that match. This adds no approval stage; the first-render review remains isolated.

## When image-first applies

Image-first applies when imagery, crop, subject treatment, or spatial visual direction is the real
unresolved decision and a visible study can settle it. Typical cases include a campaign built around
photography, illustration-system exploration, image-to-code work, or a redesign whose open question is
composition rather than content structure, and a new landing page, whose composition nothing has
settled yet. It does not follow from `confident` or `showpiece` alone. Skip it when the direction is
settled or the uncertainty is copy, behavior,
information architecture, product density, or another non-image decision. A user-requested
image-to-code target and unresolved visual craft still qualify.

When the host provides an image-generation capability and image-first applies, the order is
**mandatory**:

1. **Generate** — before settling the layout, derive the generation directions and independent
   prompts from what the kept references show (described, not their raw pixels), any project rough,
   and the permitted project-owned inputs. Before generation, decide the candidate count and its
   evidence-based reason. Unresolved competing concepts need
   comparison; one candidate is appropriate only when the brief or current evidence already settles
   the direction. Do not lower the count after seeing results to excuse a cheap implementation.
   Keep genuinely different conceptual hypotheses alive through the smallest useful visible experiments;
   prose labels, scores, and metadata cannot select a winner before the ideas are rendered. Generate
   the selected independent drafts concurrently, store them under `.omd/.cache/imagegen/`, and choose
   one from visible evidence only when it clears the applicable task, concept, craft, and ambition
   floors. One horizontal image per section for a multi-section page — never one tall
   image with unreadable text. To explore a new section design, generate that section fresh with the
   selected palette/type/radius/treatment. This does not prohibit a crop or zoom for fidelity inspection.
   A project-owned rough — a quick pass built on the committed design system — is a permitted seed:
   feed it plus the committed palette/type/material so the draft fleshes out ("구체화") that rough. The
   build then redesigns the draft back onto the design system's tokens, spacing, and component rules;
   the draft is a reference, never shipped, and the shipped surface obeys the system, not the raw draft.
2. **Analyze** — after choosing the draft, translate it into build decisions: extract tokens, layout
   geometry, spacing rhythm, type-scale relationships, component anatomy, interaction affordances, and
   each section's job.
3. **Build** against the chosen draft as the reference-fidelity direction. If the host has no image
   capability, follow the evidence-based CSS/SVG composition path using the kept references,
   `theory/expressive.md`, and the graphics recipes.

On a new landing, the drafts are page ideas: `omd imagegen --kind page --name <section> --prompt
"<the section's exact copy, what sits where and how large, the type, the graphic or product proof and
its place, the palette>"`. Each draft is one section seen flat at desktop width, never a tall whole
page or a device mockup. For the hero, try genuinely different compositions, one per idea image — a
different arrangement of copy, proof and action, not a colour variant — and choose from the images, saying what must survive
into the HTML. Describe the kept references in the prompt (their hierarchy, spacing, type contrast);
their pixels are not attached, so the draft does not become a copy of someone else's layout. The page's
source waits for at least one page idea, or a recorded unavailability where no image tool works. The
first-render reviewer sees the latest drafts to catch what the build lost; the build may still depart
from them and improve on them.

Not shipping a generated image is not a reason to skip image-first thinking. The draft is decision
material by definition. Select or skip the method for the actual visual uncertainty, current supplied
direction, and host capability; keep that decision separate from whether any generated asset ships.

## Choose a concept that survives implementation

Before rendering an unselected concept study, fix the actual content units, their proposed spatial
relationship, and the predicted observable consequence in the generation prompt. Check the
represented task's visible identity, state, ownership where relevant, and action labels before
freezing shared units; use real or authorized demo values, never invented facts. Repair unclear
presentation without deleting useful information. Incomplete content goes back to the brief and
invalidates dependent studies, not the requested task.
The consequence is a visible spatial/content relationship or an observed
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

Name the selected draft's few load-bearing relationships: mass and negative space, type/content
relationships, action priority, and mobile changes. State what must survive and what visible change
would count as loss. These are build decisions, not new UI copy or a separate document. Compare those
relationships in the actual render before adding more sections or polish; fidelity checks remain
distinct from independent beauty review. Once named, an invariant remains in force until visible
evidence or the current user changes direction; implementation convenience does not relax it.

Reasoning the layout in the abstract is exactly what produces the symmetric, boxed, template output
`expressive.md` § "Slop-free is not the same as distinctive" warns about. A generated draft forces a
concrete art direction to react to instead of a reasonable-sounding description.

## Anti-literal generation contract

This section applies when the typed art-direction contract is in use; it does not invent a
metaphor method or fields outside that contract.

Before selection, each non-authoritative visual study consumes its own art-direction alternative's
exact non-empty `metaphorQualities` and `literalPropsToReject`. It does not settle the layout or
approve production. After selection, every refinement and the build use the selected decision's
exact fields. In both phases, preserve the qualities through
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
