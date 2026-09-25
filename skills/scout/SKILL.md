---
name: scout
description: >-
  Build a measured LEGO reference inventory without designing anything: whole pages for feel,
  tight selectors for component anatomy, typography studies, motion studies, image refs
  for the unrenderable. Use when the user asks for references, inspiration, benchmarks,
  or "how do good sites do X" — standalone, before or without a build — and also when the
  request is to fix or improve the UX of an existing surface: research how strong products
  solve that same UX problem before proposing changes, instead of applying generic rules from
  memory.
  Triggers: 레퍼런스 찾아줘, 레퍼런스 수집, 참고 사이트, 벤치마킹, UX 고쳐줘, UX 개선,
  이 페이지 UX 개선해줘, find references, inspiration board, how do other sites do, fix/improve the UX.
---

# OMD-scout

A LEGO reference assembly, measured instead of pinned. Read
`protocol/reference-assembly.md` under `omd pack dir`; it owns the selected stages,
their single owners, and their artifact/stop boundaries. This skill collects evidence and
names transferable principles; it does not design or implement the result.

## Pipeline-role bootstrap

When this skill is loaded inside an already spawned `oh-my-design:scout` child that has injected role
instructions, the injected role is authoritative for acquisition order, read bounds, fallbacks,
and owned artifacts. This read only satisfies the host's skill bootstrap. Do not spawn another
scout, do not broaden the standalone workflow, and immediately execute the injected role's first
operational pass.

When the host exposes an isolated role boundary, spawn `oh-my-design:scout` with the concept (ask one short
question only when neither the request nor `.omd/frame.md` supplies one), the component inventory,
working directory, and user URLs. On a Pi-compatible host without such a boundary, execute this
bounded standalone scout role in the current session and do not claim independent-process isolation.
User URLs are captured first and marked `--from-user`.

The scout owns only `fragment inventory`, `brick analysis`, and `candidate assemblies`.
It uses `browser-rs` first for interactive visual research and user-directed image-region
capture. Use the headless, reduced-motion `omd render` or `omd probe` Playwright fallback only when
browser-rs is unavailable for this platform (no browser-rs build — e.g. an arm Linux host) or the user
declines to install/use browser-rs; report which applies rather than silently swapping providers on a
transient failure. Preserve the existing measured-transfer, motion, reduced-motion,
and WebGL/3D gates. Do not scrape, hotlink, or ship source pixels.

## Coverage contract

Build for decision coverage, not capture counts. Before searching, list the decisions the
later design must make and the components it must support. The inventory is complete only when
it contains useful, non-duplicate evidence for every applicable category:

- **visual direction** — several captures whose feel is right, kept before narrowing. This is the
  first category, not a showpiece reward: a design with no gathered direction can only reproduce the
  category average;
- first-party or user/community language;
- typography and voice;
- motion when the concept or interaction actually needs it;
- every required component or state whose anatomy is uncertain;
- how similar services actually solve the task — the STRUCTURAL lane, opened only when the work needs
  structural transfer. It answers "how does this task work", never "how should this look".

### Collecting a visual direction

When a selected reference board is missing, run `omd ref work-next --json` for the current
evidence-derived action. Use `omd ref advance --json` for a named native search, public gallery
entry or observed-link visit, then recompute work-next. Each call advances only one source attempt;
a signed unavailable attempt redirects to the next public lead, not to another copy of the plan.
Treat search navigation, help and settings links as page chrome, not candidate services or visual
references; a search with no task-related lead should advance to the next public source.
When the pointer names `retain-reference`, inspect the actual visited page or UI image, capture a
useful scoped source with `ref add`, and recompute. If the inspected item is unsuitable, record a
specific quality or relevance reason with `omd ref exclude <observed-item-url> --lane design|domain
--reason "<observed reason>"`; this decision is bound to the current native visit and permits a
different lead. An exclusion is not evidence that a provider is unavailable. When it names `publish-board`, use
`omd schema reference-board`, author the assembly from retained evidence, and publish with
`omd ref board --input`. A receipt-backed exhausted state is a precise external gap, not permission
to substitute a gallery category, domain-service screenshot or empty board. Do not loop on
`discover-plan`, `brief --check` or `stage next` while the same owned action is outstanding.

`omd ref discover-plan --json` remains the full catalogue and free-access policy. For apps and
product interfaces start with free public Pinterest pins, Dribbble shots, Behance case studies or UI Bowl
entries; for website/marketing direction start with website galleries such as Siteinspire and
Pinterest. These are replaceable discovery channels, not mandatory winners or guarantees of free
API/catalogue access. Verify the specific entry is freely viewable now. If login, a paywall, or
blocking prevents inspection, record it in scout.md and try another public gallery/original source;
never purchase, start trials, install an MCP, or bypass access controls just for research.

Choose actual search or direct-public browsing from the plan. `designSourcePolicy.searchQueries`
include Pinterest pins and a surface-appropriate gallery. Record the actual method, results and
blocked capabilities in scout.md. Do not replace an unperformed search with an invented query list.
Read `marketReferencePolicy` before searching. When its mode is `target-market-first`, execute its
domain search input and the market-qualified design searches first. Keep the lanes independent:
domain sources must actually serve the named task/audience in the target market; design sources must
provide high-quality local visual direction through inspected gallery/product evidence, not reuse the
domain services or accept a weak screen merely because it is local. Use unqualified global equivalents
only after recording the local coverage gap. `unscoped` means no country may be inferred from the
conversation language or surface locale.
For target-market-first work, publish research v7 with `marketCoverage`. Each lane must classify every
source id exactly once with `sourceId`, the retained image's exact `evidenceSha256`, a lane-valid `scope`,
`basis`, and `provenanceReceiptSha256`. `market-search-result` must bind the exact signed market-search
receipt whose visible result text for the retained source or design-discovery link normally names the market and
relevant scope. A generic Korean domain-service label such as `바로가기` qualifies only with a current
signed direct-public entry for that exact service whose visible text proves Korean service context,
plus its current retained Korean-language capture; it never qualifies design or foreign services.
`market-direct-result` must bind the exact signed direct-public root receipt whose visible
label for the retained source or design-discovery link names the market and relevant scope. URL tokens,
localized queries, country-code hostnames, page-wide headings, and freeform reasons prove neither.
Search and direct bases may coexist in a lane. Every declared search and direct attempt must be current. A fallback records
`provenance=[{sourceId,provenanceReceiptSha256}]` so each chosen global source binds a current signed visible link, then records the exact market, an
availability/access/coverage kind, and every attempted query and root used by that lane. Every chosen retained capture must also be current. Freeform prose
cannot prove local provenance or a fallback attempt. `research-check` rejects missing coverage, market drift, global-only lanes, and
unqualified search order; repair the evidence instead of removing the policy.
For native search use the plan's `designSourcePolicy.nativeSearchInputs` with `ref search`.
They bind real free-gallery queries for Pinterest, Dribbble and Siteinspire. Refine only unscoped
task/pattern queries and URLs together; keep explicit-market native inputs exact. Then open an item actually returned in observed links; never
guess pin/shot IDs. Login walls, challenges and empty results remain failures, not design references.
The next public gallery is the fallback, not domain-service documentation or a paid MCP.
For direct discovery use `designSourcePolicy.nativeEntryInputs` with
`omd ref navigate <public-gallery-list-url> --lane design --entry free-gallery --json`.
For comparable-service discovery use `--lane domain --entry public-directory`. In v6/v7 put the
returned `method`, `entry`, `url`, `evidence` and `capture` plus your `reason` in that lane's
`discoveryRoots`. Keep `queries` and `searches` as arrays: both may be empty only when valid roots
exist, and every declared query still needs execution. Native roots bind the actual visible list
and its outbound links; never promote old navigation or call the list a selected reference.
Follow its observed links, inspect the actual item, then capture retained evidence separately.
Native reference captures use `omd ref add <url> --as <unique-name> --lane domain|design`;
each add-batch entry has `lane: domain|design`. Captures and metadata go to `.omd/refs/domain/`
or `.omd/refs/design/`. New CLI captures default to design, never infer domain from a hostname.
Use distinct component names across lanes. Imported app/pin images go to `refs/design/fragments/`.
Search receipts/screenshots and intermediate `ref navigate` captures go to `.omd/discovery/<lane>/`,
outside retained references. Before reusing an existing inventory, inspect `ref tidy --json`; with
no other active research owner, `ref tidy --apply --json` archives recognized legacy diagnostics and
ineligible design records with exact-byte recovery manifests. Reacquire missing sources and rebuild
dependent judgments; no domain relabeling, deletion without an archive, or rewriting review hashes.

Open each retained entry beyond its search thumbnail. Follow the original source when available.
Released-app screenshots may establish visual anatomy, not working interactions. For screenshot-only
app/pin references use `omd ref import-image` with the actual source-page provenance and image-only
limitations; never measure the gallery chrome as the pictured app or invent live DOM/motion proof.
Keep the discovery entry URL, free access observation, and a concrete quality reason for the task's
viewport, hierarchy, typography, and density in each design source's `discovery` field. A polished
gallery name or a popular pin does not establish quality. Label concepts versus shipped screens.
Free viewing is not a reuse license: reference pixels remain study material, never shipped assets.

### Keep visual direction independent of domain research

Classify by the decision answered, before capturing. Comparable-service tasks, eligibility,
terminology and flows belong to domain. A service's documentation or accessibility is not a reason
to promote it into visual direction. Use independently sourced visual screens from free public
Pinterest pins, Dribbble shots, Behance case studies or website galleries. UI Bowl's paid MCP is
optional, never a prerequisite. If a gallery blocks access, try another; if none can be inspected,
return incomplete research rather than substituting government/service documentation.

Read each actual saved image. In `reference-research-v7`, distinguish `visual-direction` from
`component-support` and record `visualAssessment`: composition, typography, density, imagery,
what to transfer and what to avoid. Component-support alone cannot complete design research.
Domain/design source hosts, redirects and image evidence must not overlap. Each board candidate
must use an inspected visual-direction source. Native captures are drafts, not proof of selection.
Every visual piece, including reused legacy material, must bind a qualified design source and
its exact image; `ref list` exposes admission status. Import only the actual native gallery/original
capture or a declared exact pixel crop, never search or domain imagery with a new source label.
Show the user `.omd/refs/design/README.md` with the retained previews and reasons; keep rejected
candidates and coverage gaps in scout.md. Structural checks do not certify beauty or user approval.

### Turn collected references into screen decisions

After `research-check`, run `omd ref apply-plan --json`. Its `input` is a deliberately incomplete
draft for every current domain-brief surface; `evidence` is your source-bearing inventory, not a
payload for Composer or Hand. Inspect the saved images, then fill only the draft input and publish
with `omd ref apply-set --input <application.json>`; require `omd ref apply-check --json`.
The v2 input also binds each destination's `target: {route, state}` before production. Use the
actual planned app-relative route (including query/hash) and observable state; do not assign every
surface to the home screen. Distinct surfaces need distinct route/state pairs. These bindings are
source-sealed and later matched to authenticated final captures; old v1 plans need reviewed republication.
The publisher produces `.omd/reference-application.md` for the user and a separate source-free
projection for downstream roles. Keep source URLs and capture paths in research, not decision prose.

For each surface, keep domain and design referenceIds separate. Explain what to apply, what not to
transfer and why, and what the resulting render must demonstrate. Use direct/partial/brief-derived
coverage honestly: partial needs a precise gap; brief-derived has no referenceIds and needs a gap
plus a brief-based reason. Do not fill unobserved flows or states from a static app image. Screen
checks are future acceptance criteria, never a claimed pass. Reuse a visual reference across relevant
screens with screen-specific interpretation, not an identical generic instruction for every page.
Compare patterns and exceptions across the retained images in scout.md. Show the application document
alongside the actual reference previews. Existing v4 captures need no fabricated migration or recapture;
add the missing decisions from inspection. Changed research or domain scope requires reviewed republication.

Search the PART, in English, across many sites — the way a designer builds a board by hand:

- Start visual discovery with task/pattern/component keywords (`task management`, `side panel`,
  `contextual sidebar`). App-specific search is useful when comparing a known app's relevant screen
  family; it does not replace cross-source visual exploration or domain-flow inspection.
- Collect several candidates first and narrow later. Pre-filtering to the correct category is how a
  board becomes a single competitor's screenshot set.
- Explore by similarity rather than by rewriting the query: the next good capture usually comes from
  looking at one you kept, not from a better phrase.
  Use `omd ref navigate <url> --lane domain|design --json` for intermediate directory/category pages;
  these captures live in the lane's `navigation/` folder and have no board component identity.
  Keep its returned native receipts in that lane's optional `navigation` array, each with
  `url`, PNG `evidence`, and JSON `capture` receipts. The checker follows observed outbound links from
  successful search results or direct-entry links through those captures. Direct v6/v7 chains require
  new strict navigation-v2 captures, never all-DOM links from retained component captures. A disconnected chain, prose link, stale image,
  blocked visit or user-supplied screenshot cannot manufacture a browser navigation edge.
- Keep the whole page when the felt direction is the point, and a scoped part when anatomy is. A
  moodboard is whole-page and visual-only by construction (`protocol/moodboard.md`).
- A capture carries its own evidence: palette, type, spacing, and the page it came from. A pin that is
  only a crop loses all of it, which is why this step captures the live page rather than a thumbnail.

Existing products are for how a task is solved, not for how a page feels; a run that gathers only
those produces a product survey instead of a direction.

### Exploring a domain reference

Execute discovery, do not merely write query strings. Choose a native public-directory entry as
described above, or use `omd ref search --input <json>` with
`{lane: "domain"|"design", query, url, queryParam}`: the public HTTPS search URL must submit that
exact query in the named parameter. Inspect the saved screenshot and actual links, then visit and
capture retained sources/entries with the existing native reference commands. Use public Google/Bing
`/search` or DuckDuckGo root/HTML/lite URLs with `queryParam: "q"`; combine task/pattern terms with
`site:pinterest.com/pin/` or another relevant public gallery, not a made-up service query parameter.
Put each returned
search receipt in the lane's `searches` array. A 200 page may still be a login wall or poor results:
inspect it, record the limitation, and use another free public source. A failure receipt is not
success and query prose cannot replace one. Do not hand-author or edit execution metadata.

The domain-reference lane and the design-reference lane are independent deliverables. Keep a
competitor's task-flow evidence in domain and use a different service's visual evidence for design;
separate observations of the same service do not satisfy the independent-host lane contract.
New domain research retains at least three comparable services from three independent operator
families. GOV.UK pages and subdomains count as one family, as do pages/subdomains under any other
single operator. Follow multiple observed directory/search results; do not pad coverage with routes
from the first service that happens to be reachable.

For a selected product task-flow benchmark, use `omd schema reference-flow-input` and
`omd benchmark record --input <flow.json> --json`. One fresh context executes the declared public
navigation/disclosure chain. Copy the execution receipt and exact per-step labels, URLs, states and
evidence into the matching benchmark source/flow/screens. Research rejects completed flows backed
only by prose or unbound screenshots. Record login/payment/destructive or unsupported controls as
bounded exclusions, not successful tests. This proves only declared visited states, never every
control in an entire service. Free public references remain the only requirement.

Inspect each public feature area and its safe controls before claiming coverage. Record a separate
native flow for each branch from an entry screen, capture each reachable route/tab/disclosure state,
and bind every feature screen to its actual signed step screenshot. A homepage or whole-page image
does not stand in for unopened features. Keep the feature-to-screen-to-flow mapping and explicit
unreachable exclusions in the benchmark. Before accepting any retained image, inspect its pixels:
informational notices should be visually suppressed in the same browser context before capture, while consent,
login, unknown or unclosable modals and orphaned dim backdrops must be recorded as access gaps
rather than saved as evidence. A prepared feature state is not exempt from unrelated obstructions.
For a fixed full-viewport app container, select a specific visible feature or assert it in the
native flow. Navigation or recovery controls alone do not prove the app is available; if the
feature cannot be inspected, record a bounded gap instead of keeping a possible error screen.
Informational notices are visually suppressed by a browser-owned stylesheet without clicking the
site's control, executing its handler, or removing DOM nodes. The receipt says `visual-only`; do
not claim that the site's real dismissal or
service-side transition was tested.
The bounded style change must not cause an outgoing request or cookie/storage change; treat either
as an obstruction gap, not as successful clean evidence.
After visual-only suppression, scripts stay suspended on that document. Do not report motion or
JavaScript interaction measurements for it; a safe full-document link may reload the next page,
while an inaccessible same-document state is a bounded gap.
If a late notice contaminated a capture, reacquire that state and use only its clean current receipt.
Put the feature-specific visible assertion last for each native step so its control/content is
framed in the screenshot. If several visible assertions cannot fit in one viewport, split the
feature states into separate steps; an off-screen DOM assertion is not screenshot evidence.

For an applicable product task-flow benchmark, do not stop at the landing page or first useful
screen. Declare the safe inspection scope, open at least three independent same-domain service
families at their real entry points, and
traverse every reachable screen in that scope. Click the actual non-destructive controls needed to
observe the sequence. Organize the result three ways:

- screen inventory — every inspected screen/state, how it was reached, and current local evidence;
- feature inventory — observed behavior bound to the screens where it exists;
- flow inventory — ordered action → result steps grouped by user intent.

Every discovered target is either inspected or explicitly excluded with a bounded reason such as
authentication, payment, destructive action, rate limit, blocking, unavailability, or being outside
the declared task scope. A nav label, sitemap entry, article, or screenshot is a lead, not proof of a
screen or flow. Run `omd schema task-flow-benchmark --json`, publish with `omd benchmark set`, and
require `omd benchmark check --json` to re-hash every screen and flow-step evidence file. A missing,
stale, reused, unreachable, or unorganized observation blocks completion. The v2 checker verifies
file currentness only: read its `evidenceStrength`, which explicitly marks live flow as unverified.
Never call artifact-only action/result prose a completed live interaction test.

After the domain and design lanes both have current evidence, print `omd schema reference-research
--json`, publish the exact record with `omd ref research-set`, and run `omd ref research-check
--json`. The record binds the domain lane to the current benchmark when applicable and the design
lane to the current reference board. The publisher saves `.omd/refs/domain/research.json` and
`.omd/refs/design/research.json` alongside their own captures, with `.omd/reference-research.json` as the
consistency receipt. All three must agree. Existing v5 remains readable with its search requirements;
v6/v7 direct roots require new native entry captures, never a filename move or synthesized provenance.
Both source and discovery observations bind PNG and native
capture-JSON hashes. A gallery homepage alone is rejected. If the original source differs from the
gallery entry, its exact URL must occur in that entry's captured outbound links; otherwise retain
the gallery screenshot itself as visual-only, not a substitute design-system component. Never edit
native acquisition metadata or relabel a source to satisfy the validator. Neither the same path nor identical capture bytes
renamed into another file can satisfy both lanes. Do not hand-write a completion claim when this
gate is missing or stale.

Every board candidate must actually use retained design-lane image evidence, matched by path and
hash. Current v7 research retains at least two visual-direction sources from independent original
service families and distinct inspected gallery items, with different PNG bytes, and both directions
participate in the board. Repeated pages, crops, aliases or capture names from one product count once.
A separate folder of unused gallery screenshots does not demonstrate visual transfer. Every
research batch entry needs `shot: true`; a metadata-only capture cannot satisfy the research gate.

### What is not a reference

The captures `omd brief domain` produced live under `.omd/captures/` and exist to prove that a screen
or object is real. **They are not design references.** Citing one as a section's visual basis is the
specific failure this rule guards: a run did exactly that and delivered a survey of existing welfare
portals, whose own primary subject the user had already called badly designed. Observing a screen is
not endorsing it — if anything, the opposite.

When an observation makes the direction clear by being wrong, record it:

```bash
omd ref principles <url> --as <name> --add "anti-reference: <what not to do, and why>"
```

A named anti-reference is inherited as a constraint. A dislike that stays in prose is lost.

There is no minimum query count, capture quota, famous-site quota, or mandatory award
gallery. A small inventory with complete, independent evidence is better than a large gallery of
near-duplicates. If a category is irrelevant, record why. If evidence remains weak or
contradictory, report the gap and uncertainty instead of filling a slot with decoration.
Never choose, target, estimate, or announce a number or range of references (never "18–25 references",
never an "N of M" progress count) — there is no target count, and a made-up count is exactly the
fabricated specificity this tool exists to remove. Capture strictly per decision: for each decision the
design must make, capture until you have enough independent evidence to settle that one decision, then
move to the next. Stop when another capture would not change any remaining decision. In chat, report only
which decision you are gathering evidence for, never a count, quota, or gallery size.

Use the narrowest useful capture:

```bash
omd ref add <user-url> --as <name> --lane design --from-user
omd ref add <domain-service-url> --as <name> --lane domain
omd ref add <design-item-url> --as <name> --lane design
omd ref add <design-item-or-observed-original-url> --as <name> --lane design --selector ".component" --blueprint
omd ref import-image <local-capture-input.json>
omd ref principles <url> --as <name> --add "..."
omd ref list
omd ref check
omd ref candidates
```

Do not reflexively web-search the same famous benchmarks (토스/Toss, Linear, Stripe, Vercel, 당근) on
every brief — that reflex is the reference-grammar homogenization this tool removes. Search this
product's own domain, its real competitors, and its audience's language; a famous product enters only
when the brief's real problem points to it. Run independent searches and captures in parallel — batch
captures with `omd ref add-batch <manifest.json>`, never a sequential `omd ref add` per reference when
several are already known.
After capture, run `omd ref audit`; it fails when the recorded capture times show a sequential pass
(a browser launch per reference) rather than a batched one — batch the known set so it passes.

Whole-page captures establish rhythm or product feel; tight selectors establish component
anatomy; type and motion studies establish measured behavior; image references support only
what cannot be rendered. A blueprint is allowed only for an explicitly requested exact
component transplant or a structurally equivalent component problem. Structure may
transfer; skin and pixels do not.

For Pinterest-like or gallery sources, use browser-rs to capture only the user-selected local
region, then pass that PNG, its HTTP(S) source-page provenance, capture-region description,
rights status/notes, visual role, and principles to `omd ref import-image` using
`omd schema reference-image-fragment`. A remote image URL
is provenance only, never an importer input or production asset.

After analysis, write the internal candidate record, run `omd ref check`, then paste the exact
`omd ref candidates` Markdown table directly into the host chat. It is the selection
surface: do not make a board UI, HTML, PNG, showcase, or `omd-board` command. The coordinator selects
the strongest candidate itself and records it with `omd ref select`, disclosing its choice and reason;
it does not ask the user to pick a candidate, and a candidate the user explicitly named still wins.
Downstream receives only
the resulting hash-bound sanitized selected assembly.
Work at component granularity: for a specific button, card, or region, capture that exact
component with a tight `--selector` and `--shot`, and record its own take, avoid, and
adaptation per slot. The candidate table's local-capture column carries each part-image's
local path for human inspection. A raw file under `.omd/refs/` is Scout provenance, not Hand
authority. The coordinator may derive a selected, source-free, no-ship geometry packet after
selection; Scout never grants raw pixels to Hand. Without that packet Hand consumes the sanitized measured
assembly. Component-level and
whole-surface fidelity are both allowed; `omd ref distance` is advisory — it reports closeness and
never blocks shipping in bare mode. After current usage and build observation, selected measurable
production slots must each score at least `0.6` and pass `omd ref distance <page> --selected --gate --json`; a failed, missing,
malformed, unmeasurable, or stale receipt blocks new final-v2 publication. Record attribution for
every used reference and write the product's own copy. For board-v3, also run `omd ref
influence-proof --input <proof.json>` so every used influence passes at every target viewport on its
promised axis and falsifier; aggregate closeness cannot compensate for a missing feature.
The optional `omd ref visual-packet` command is coordinator-owned after selection. Its private
evidence stays with source provenance; downstream roles receive only the current source-free
manifest and named no-ship SVG.

## Evidence quality and contamination

Prefer first-party product sources and direct user/community evidence over SEO summaries.
Label source trust, uncertainty, and whether evidence is independent or derivative. Reject
a non-user source only when it is derivative or convergent — an SEO/content-farm summary, a
near-duplicate, or a page whose repeated roleless treatments erase task and subject specificity.
A premium, first-party, intentional design is not slop for using a common pattern (a gradient,
a card grid, a common sans) with a visible role; measure it. Slop review measures convergence
and consequence, never authorship or any familiar visual move in isolation. Keep a user-provided contaminated source only as
a named anti-reference. Drop kin at similarity `>= .85`; a cluster of related pages
is one evidence family, not independent corroboration. A blocked page is not retried; use an
honest image/discourse fallback or discard it.

Every retained capture records:

- the decision or coverage gap it answers;
- measured invariants and the reason they matter;
- what contradicts the concept;
- source trust and uncertainty;
- the token, component, motion, voice, or composition question it may inform.

Hand off measurements, principles, contradictions, coverage gaps, and trust. A raw file under
`.omd/refs/` is Scout provenance, not Hand authority; only the coordinator's selected neutral
geometry packet may cross downstream, never raw source pixels. Component-level and whole-surface fidelity are both intended, and `omd ref
distance <page>` is advisory in bare mode. The selected production gate is blocking and slot-scoped;
high per-part closeness is intended without authorizing whole-page cloning. Record attribution and write the
product's own copy rather than lifting source copy. Board-v3 additionally requires `omd ref
influence-proof --input <proof.json>` at every promised viewport. Composer and eye still receive only the sanitized
evidence summary required for their decision.
