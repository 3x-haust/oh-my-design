---
name: omd-ultradesign
description: The single OMD entry. Builds new products from scratch, extends or redesigns existing projects, or implements a Figma link, using inspected references and verified real renders.
---

# Ultradesign

Preserve the original request and user-selected model. Keep scope and allowed paths/dependencies.
The model chooses useful methods and delegation. Sequential passes are not independent review.
Pi uses omd_cli; /ultradesign aliases /skill:omd-ultradesign, not quoted/inline mentions.

Inspect the stack and request. Use `route-input` for existing/bounded work or `product-route-input`
for a new product; validate, classify, then run `omd stage next --json` for the current model-led action.

## One entry: read the situation first

Inspect the actual project and full request before choosing the work; never ask which mode to use.

- **No product source yet (files to read are material):** greenfield. Build the complete requested product from
  scratch (route `projectMode: greenfield`): React + Vite + strict TypeScript from the official
  Vite template, structured per `guides/code.md`. Inspect strong references before inventing a direction.
- **Existing project:** read its stack, routes, components, tokens and current renders first, then do
  what the request actually asks. A new feature or surface extends the existing system. A redesign
  follows the redesign track below. A fix stays local. Do not
  restyle untouched areas, replace the stack or drop behavior unless the request says so.
- **Figma link in the request:** the frames are the target. Follow `omd pack guides/figma.md`.
  After implementation, repeat `omd figma diff <frame-id> <page> --json` then
  `omd figma review <frame-id> --json`, apply the isolated reviewer's concrete region fixes exactly,
  and stop only at `match`. Do not chase the similarity percentage; report a fix id unresolved after three reviews.
- **Images or URLs supplied by the user:** preserve the role assigned by the actual request:
  delivery target, inspiration, domain evidence or rejected result. A requested target governs
  fidelity; inspiration informs the new design; a rejected result is a comparison baseline, never
  a direction to reproduce. Never swap a usable user target for discovery, nor make every attachment a target.

Internal guides, read only when they apply (`omd pack <path>`): `guides/references.md`, `guides/assets.md`,
`guides/figma.md`, `guides/copy.md`, `guides/code.md`, `guides/landing-basics.md`, `guides/critique.md`, `guides/audit.md`, `guides/coach.md`.

## New work: one method, three tracks

New work (taskNeed `new-product`, `new-marketing`) and redesigns follow this section and "Words, type, and flow";
the rest of this file is for other existing work. Make, look, compare with captured originals, choose yourself.
Truth first, always: read the project, README first, and write `.omd/studio/brief.md`: what it really does, for whom,
its personality (logo, README voice), the one message in concrete words, the user's exact asks, every
capability with its demo. Keep the README's logo. An empty project: choose a memorable name,
not the category's stock word.

Before screens, every track owes (`omd pack guides/assets.md`; `omd stage next` names the due stage; source,
first render and finish are refused until done):
- **Reference board**: image-level references per screen and element, one job each (`omd ref browse search
  dribbble|behance|pinterest`, `keep`), listed in `.omd/studio/board.json`, composed by `omd studio board`.
  Say back what you kept and what each is for; no count is required.
- **Direction**: three or more concept boards (`omd imagegen --kind board`), sheeted (`omd studio sheet`), one
  chosen by you in `.omd/studio/direction.json`.
- **Owned assets**: several candidate sets per asset (`omd imagegen --kind asset`), sheeted, compared in pairs,
  recorded in `.omd/studio/assets.json`; the winner ships only through `omd studio asset <png> --out <path> --cut`,
  which writes `.omd/studio/images.json`. No working image tool, or a code-built object won: `.omd/studio/skips.json`
  `{"assets": {"instead": "rig", "because"}}` and `omd studio rig`.
- **Key screens around the asset**: it changes their structure, not decoration; sheet several structurally
  different variants (`omd studio sheet`), pick one.

**Marketing page** (`omd pack guides/marketing.md`): idea first (`.omd/studio/concept.json`, one object only this
project could own, kept from six or more rough ideas); sites by job (`omd studio refs`, `blueprint`); board; direction; `.omd/studio/system.md` and `system.json` (colours sampled from real images or the
chosen board); first-screen ideas (`omd imagegen --kind page`); assets; the key asset alone in `data-product`;
the page around it; detail, then subtraction (`omd studio look`, `omd studio check`, `"deviations"`).

**Multi-screen product** (`omd pack guides/product.md`): objects and flows; populated task screens; board;
direction at phone size; one system file; key screen ideas (`--viewport mobile`); assets; screens rebuilt around
them with every state on realistic data; `omd studio check --mode product <screen>...`.

**Redesign** (`omd pack guides/redesign.md`): `omd studio baseline <url>...`; `.omd/studio/ledger.json` (kept,
changed, why); board; direction; assets; rebuild; `omd studio check --mode
redesign`. Not a redesign: `.omd/studio/skips.json` `{"redesign": {"because"}}`.

## Words, type, and flow ship with the pixels

- Labels state the immediate next step and true commitment; never call a preview a booking,
  or soften a real payment, send, publish, or delete.
- Errors say what happened and how to recover beside the affected field; preserve entered data.
- Design applicable loading, empty, error, success, and disabled states as distinct conditions.
- Use one term per concept and one intentional speech level per product speaker; do not copy
  another service's branded vocabulary or use 해요체 to pretend the service is human.
- Remove filler and automatic title-plus-subtitle pairs; supporting copy must add a constraint,
  consequence, evidence, or recovery cue.
- Instructions are for making, not the page: no qualifier restating a rule ("real demo", "original
  logo", "example data"), no caption explaining a choice; alt text names the thing. Read every string,
  alt and aria label once as the visitor (leaks → `theory/web-copy.md`).
- Build semantic type roles from body text first with a compact scale and role-specific leading.
- For Korean labels/headings prefer word-preserving wraps; judge prose measure in rendered pixels,
  do not apply Latin caps tracking to Hangul, and use tabular numerals where numbers compare.
- Give a step one dominant action when the task has one; equal choices and independent regions
  may legitimately have peers.
- Keep keyboard focus visible, pointer targets at least 24px or within a WCAG exception, and
  every form control persistently labelled rather than relying on a placeholder.
- Open the exact pack when needed: forms/errors → `omd pack theory/forms.md`; flow/states →
  `omd pack theory/ux.md`; copy/voice → `omd pack theory/microcopy.md` and
  `omd pack theory/voice.md`; type → `omd pack theory/typography.md`, and before choosing families
  `omd pack theory/font-pairing.md` (bundle-ready fonts, pairings, local files). Use only fonts and images free of
  licence restrictions (fonts OFL-1.1 shipped with their licence; images the project's own, generated for it,
  drawn in code or CC0); never extra clauses, personal-use-only terms, an unconfirmed licence or a stock site's
  own licence. `.omd/studio/images.json` is written only by `omd studio asset` (generated) and `omd studio image
  <path> --source <url|own> --licence <id>` (anything else); any Korean text →
  `omd pack theory/typography-korean.md`; accessibility → `omd pack theory/accessibility.md`;
  marketing copy → `omd pack theory/web-copy.md`.
  Motion that materially affects the task or identity → `omd pack theory/motion.md`;
  inspect only the matching `motion/recipes/<name>.md` mechanism, not an effects checklist.
- A marketing or launch page needs a graphic language of its own, decided from evidence before
  sections are styled. Search graphic references per graphic job (`omd ref browse search
  cosmos|dribbble|behance|notefolio "<graphic job>"`) and keep the best few with the reason. A graphic
  ships as a chosen generated asset (`omd studio asset`) or a live three.js scene (look at one alone with
  `omd render <graphic> --graphic`); a generated page or concept board never ships, CSS cards are a diagram,
  a page shrunk into a frame is a thumbnail. Real people and product screenshots are never generated. Each graphic argues one claim with one protagonist made from
  this product's real material. No placeholder sites or shapes, captions or disclaimers on the art, never
  this page inside itself: a tool that makes pages shows one it made for another brief, built fully. When the product runs, show it working with real footage (`omd record`) or the real UI, never a
  redrawn mock. Generic icons are unfinished, not minimal.

## Default native Pi workflow

When the local install has private designer-source cases, the native route response supplies
their catalog; an empty `omd pack cases` means none are installed, so proceed without them. Before
choosing a visual composition or attempting a structural repair, open applicable cases with
`omd pack cases/<id>`. The ordinary Pi tool delivers the actual whole source frames alongside the
original timecoded caption cues. In other hosts, read the case's frame paths under
`$OMD_DESIGNER_CASES_DIR` (or `cases/` under `omd pack dir`) with the host image reader.
Look at the original problem, the designer's words, the actual changes and rejected alternatives
together, and say briefly which relationship applies here; do not turn an example into a blanket
no-card, giant-type, photo, palette or motion rule. Cases are worked decisions, not visual
references, permissions or approval.

Every install also ships designer judgments: questions professional designers ask of a rendered
screen, written as situation, question, move, reason and exceptions. Read
`omd pack judgments --surface marketing|product` (no flag for all) before composing and again
before a structural repair. They diagnose content relationships, not style rules; a judgment
whose "Not when" applies does not apply. The
early reviewer answers every judgment, whatever the surface, against the current captures, and a violated
judgment must cite a localized finding, so a retain is impossible while one is violated. In hosts
without the native reviewer, `omd first-render check --json` returns the same `designerJudgments`;
give them to the independent eye with both captures and require one not-applicable, holds or
violated answer per judgment, with each violation repaired as a finding.

Existing work states its task
contract: audience/expertise, task frequency, input modes, density need, locale, representative content. When structure is uncertain, explore
alternatives that differ in information structure or interaction model, not recolors.
Build with realistic fixtures first: long names and strings, empty/error/loading states,
and localized text. For meaningful motion, inspect the corresponding live reference trigger
and transition when available; a still original establishes no timing or interruption claim.
Choose source→destination continuity, feedback or expression for the actual action and
frequency. Springs, tweens and immediate changes are
options, not quality badges. Keep ready content readable and input usable during transitions.
Try pointer-out, Escape, reversal and repeated input where they apply; verify focus return,
final state and recovery rather than waiting through a decorative sequence. Honor reduced
motion while preserving content, state recognition and the same task outcome; a media-query
declaration alone does not prove that alternative. Existing lifecycle `captureState` binds
the real action and settled state; supplied passive transition samples support comparison,
not a real-time smoothness, latency or reference-motion claim. For load and scroll
choreography, run `omd render <page-or-reference-url> --motion [--out .omd/motion/<name>]` on
the live reference and on the build, then look at `contact-sheet.png` and `timeline.json`: lead,
beats, stagger, easing shape, triggered vs scrubbed scroll motion, pinning, layout jumps and the
reduced-motion pass. Report unobserved behavior honestly. A new landing or launch page moves (the request
need not say so): choreograph it from the content before styling: which element carries the promise
and leads, which follow in overlapping beats, and whether one idea genuinely unfolds in steps on
scroll. Build from `motion/recipes/hero-intro-sequence.md` and `motion/recipes/scroll-scene-timeline.md` rather
than a uniform fade on every block, and compare your timeline with the observed reference.
`omd first-render check` records the same observation and the early reviewer judges it. After a regressed review, run
`omd first-render restore --json` instead of patching forward. On
`FIRST_RENDER_LOOP_STALLED`, follow its instruction: restore the best, then recompose, or report once it says the loop stops. Details: `omd pack protocol/first-render-repair-loop.md`.
After the first-render review is retained, run `omd taste compare --json`: blind A/B trials against captured human-made pages.
When its verdict is `distinguishable`, treat the recurring aiTells as repair targets for the whole visible system, not by
imitating an anchor page and never by adding annotation decorations; re-run the first-render check, then compare again. It is advisory and
never blocks completion; report the final judged-AI rate honestly at completion.

The host defaults to model-led design: understand the request and project, study strong finished
references before inventing a direction, then build with ordinary scoped tools.
Discover broadly before narrowing: use multiple queries and source families, then inspect
the complete screens behind promising leads. Compare materially different
content-to-form relationships, not recolors of one familiar SaaS layout. One category's references,
and gallery shots titled after it, share its default section sequence; take direction
from finished sites whose craft this offer must show (a design tool: studios, foundries, editorial
sites). Widen the search when
the candidates repeat the same generic composition. Narrow only after you can explain the
winner's task fit and visible character against real alternatives; use the existing discovery
records and normal working notes, not a new approval form or a universal candidate quota.
Failed URLs and challenge pages are acquisition failures, not alternatives; recover a working source family.
Match references to the requested surface: populated task screens for product UI,
finished service websites for marketing/landing work, and populated reading/browsing
surfaces for content work. A marketing shell does not prove a product workflow, and an
admin workspace does not establish a landing's composition. Judge actual complete surfaces,
not gallery thumbnails or functional similarity alone. Keep whole original images; browser captures are complete 2x
viewports, not cropped details. Transfer visible composition, hierarchy and control craft
deliberately without importing source branding, copy or product capabilities.
Resolve a coherent primary visual direction from complete, task-fit finished surfaces before
styling. Give supplemental references limited named jobs; do not average incompatible
palettes, density, shapes and control systems. Prefer complementary states within the same
system when available.
Cover the kinds of sources, not a few famous sites; a model-led route has no discovery stage, so
research runs through `omd ref browse`: the domain lane (`--lane domain`) for real services in the
same category and market (Korean services first for a Korean brief: `search naver "<category>"`); the
design lane for Korean (`notefolio`, `nook`), graphic (`cosmos`, `dribbble`, `behance`) and whole-site
(`landbook`, `awwwards`, `lapaninja`) galleries; and `omd render <reference-url> --motion` where
motion matters. One session at a time lasts 10 minutes: `end` it and start the next per lane or
kind of source, or pass `--budget-minutes` (up to 30). Record a source you could not use and why.
For each element that needs a decision (a filter, a pricing card, a hero), search the galleries
with the element itself: `omd ref browse start --lane design --json`, then
`omd ref browse search dribbble "<words from this brief>" --session <id> --json` (providers `dribbble`,
`behance`, `notefolio` (Korean queries), `cosmos` (graphics and visuals), `refero` (app screens),
`componentgallery <name>` (one component across real design systems), `21st` (coded components),
`nook` (finished sites, many Korean brands), `landbook`, `awwwards`, `onepagelove`, `lapaninja`, `landinglove` (whole sites), `fontsinuse` (type in use);
`pinterest` (public pins), `shot`, `click` into a result (where result
cards are not links, as on Cosmos, `shot --selector <the item's img>` keeps the item directly),
`keep --role component-support --reason "..."`. Search wide in this brief's own words, not example terms:
many queries across galleries, far more candidates than you use, compared side by side with
`omd ref browse contact-sheet --session <id> --json`; `end` files the keeps in `.omd/refs`.
Take what designers take: spacing rhythm, hierarchy (size steps, grouping, what leads) and control
anatomy; leave colour, branding and copy behind, and say which part came from which reference.
If a search lands on a captcha, switch provider or hand it to the person.
When you consult external originals for existing work, preserve those exact whole PNGs through
`omd ref context --input <json> --json` before the first-render check (optional for a new page):
`{schema:"consulted-references-input-v2",requestSha256:<original route request digest>,
images:[{path:<whole PNG>,sha256:<exact file digest>,sourceUrl:<actual source URL>,
role:"primary"|"supplemental",component:<the destination element it was compared for, a short name such as "hero", "install command" or "히어로" — never the reason, which belongs in browse keep>,
state?:"default"|"hover"|"focus"|"pressed"|"open"}]}`. Exactly one image is primary.
Capture reference interaction states with `omd ref add <url> --as <component> --lane domain|design --preparation <json>`
(`hover`, `focus`, `press-start` or a disclosure `click`; never submit, sign in, pay,
delete, download or navigate away), one whole capture per state. For every primary state,
author a matching `hover`/`focus`/`press-start` action with `captureState` in the
trusted lifecycle manifest so the final review compares the same component and state.
Completion refuses without a request-scoped primary original unless the page is new or the request links a
Figma target, which is proven by its own frame diffs instead. This lightweight reported comparison context is not
reference admission, candidate selection or approval; do not create a board merely to use it.
The harness delivers these exact originals privately to contextual early/fidelity review,
separately from first-party candidate targets and rejected output baselines.
Compare the first actual render directly with the primary original: inspect macro proportions,
hierarchy, density, typography and complete control anatomy, not just a generic list/detail
relationship or one motif such as offset pictures. First describe what gives the original its
visual identity, then assess the destination against the user's requested relationship to that
source. Do not define success by the few qualities you happened to implement. Keep explicit
destination constraints without inventing them to excuse arbitrary choices.
First resolve what the actual user asked the reference to do. A user-requested reproduction
or designated design target requires fidelity; a primary you discovered for a new product is
study material, not permission or an obligation to recreate that service's identity.
A faithful-reference task follows `guides/references.md` (Faithful reproduction).
For a new product, begin with its real content, task and representative imagery. In normal
working notes, explain which relationships make the original work, which apply here and which
belong to its own brand or content. Compose the destination as a whole before propagating parts:
image and type, work and supporting information, density, and the visual roles of controls must
reinforce one another. Do not substitute a copied palette, logo position or banner for this work,
and do not manufacture novelty, product claims or decoration merely to look different.
Build one complete representative composition with actual contrasting content and affected states.
Inspect its whole render before extending the system. Keep role-based type, shape, spacing and
emphasis coherent across components; rounds and squares can coexist when their roles explain it.
When a structural repair changes that grammar, update the owning components and rules together.
Do not leave the initial system underneath successive cosmetic override files and call the result
a new direction. Keep working behavior and facts while replacing the treatment that failed.
Inspect inputs as complete systems: borders, inner
spacing, focus/disabled states, resizing, overflow and adjacent actions. Native resizing
must be deliberate; an accidental grip is not finished craft. Preserve keyboard access,
visible focus, content recovery and usable multiline entry when refining controls.
Present the consulted originals and source URLs beside the desktop/mobile screens and name what
transferred; never attach references retrospectively or ship their pixels.
Preserve exact user rejection and the rejected renders as the next comparison baseline.
A broad aesthetic rejection calls for reconsidering the integrated direction and craft,
not merely hiding the one highlighted edge or changing an accent color. Do not invent a
preferred style, human rating or improved satisfaction from a model's own review.
When a render fails, diagnose the competing relationship before choosing a treatment:
what should be read, compared or acted on together, and what currently interrupts that?
Separate working parts from defects and uncertain assumptions. Keep a sound structure
when the defect is local; change the composition when token polish would preserve the cause.
For repeated content, try one complete representative unit with real contrasting values
before propagating it. For example, rebuild a plan's name, price, billing terms, differences
and action as one comparison unit, then place unlike plans beside it. Do not validate only
one short placeholder or remove terms to make it fit. Preserve distinct component roles.
If an attempted repair creates another failure, discard or recompose that treatment:
change an unreadable photo/text relationship rather than endlessly adding overlays.
Choose these working techniques as useful; they add no document, candidate quota or gate.
After propagation or adaptation, inspect the current whole desktop/mobile render, including
the actual long content and affected states. A better isolated unit is not a better whole
system, and a creator's or model's preference is not measured task or business improvement.
Choose methods, candidate count and delegation yourself. There is no mandatory role relay,
candidate competition, written skip or intermediate design document for an unselected method.
Check `omd guard production --json` before source work; selected methods keep their actual contracts.
After the first usable build, run `omd first-render check --page <built file, e.g. dist/index.html — not the preview URL> --json`.
For qualitative rejection, keep the verbatim opinion separate from your interpretation.
Use `omd feedback report --input <json> --json` with schema
`qualitative-feedback-input-v1`, the original route `requestSha256`, `origin: reported`,
`text`, advisory `interpretation`, and actually shown whole PNG `images`
(`path`, `sha256`, `viewport: desktop|mobile`, `state`). It snapshots exact pixels for
direct authoring and independent comparison. Do not invent a shown-image history;
missing images remain a stated gap. Reconsider the whole visual system rather than
turning broad rejection into a numeric target, icon swap or removal of decoration.
These reports are comparison-only, not permission, approval or validated calibration.
Authored state labels accompany the maker only. The isolated comparison receives whole
pixels and verified viewport/dimension/digest metadata, and identifies state from those pixels.
The harness captures desktop/mobile and runs an isolated early quality review without requiring
a design-judgment document on the model-led route. Repair localized findings before spending on
the full behavioral scenario set. Judge icon optical scale, weight and silhouette together with
type, density, containment and controls; exchanging an icon library alone is not a design repair.
This early model judgment is neither source-fidelity proof nor human aesthetic approval.
When a primary consulted original is present, the early reviewer must separately
return capture-bound referenceComparisons for both production viewports. A missing,
failed or insufficient comparison cannot be replaced by generic quality passes or
relative repair progress. Repair the cited mismatch and recapture.
After implementation, author one `trusted-lifecycle-manifest` from the real controls, covering
every requested outcome and desktop/mobile state. `omd lifecycle finish --json` runs package
checks, actual browser evaluation, isolated visual/outcome review and final publication together.
The host invokes it automatically when that proposal is ready and follows concrete repair findings.
Repair actual failures without reducing the request. Execution records are harness facts, not
invented design judgments; independent model review is not human aesthetic approval.
Preserve source scope, external-action consent, unknown-fact boundaries and honest evidence.
