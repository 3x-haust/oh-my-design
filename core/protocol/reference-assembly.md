# Reference assembly protocol

This protocol is the sole authority for selected reference-work ownership and dependency boundaries.
It is a chat-first workflow, not a board application. The adaptive route may select discovery alone,
or add brick analysis, candidate assembly, selection, and production usage when the task outcome
needs them. It records a reason for each omitted optional method; there is no universal stage count,
order beyond actual data dependencies, or candidate quota. Current selected research still enforces
its evidence-diversity minimum: three independent domain operator families and two independent
visual-direction source families.

Each selected artifact has exactly one owner. A dependent selected stage consumes its validated
predecessor rather than reconstructing it from a source page, screenshot, or earlier conversation.
The **finalizer** is the coordinator performing finalization; it is a responsibility, not a new agent,
service, provider, or runtime.

## Stage contract

| Stage | Sole owner | Validated input | Durable/cache output | Machine check, function, or command | Explicit fallback or stop |
|---|---|---|---|---|---|
| brief blocks | `omd-framer` | Current user brief, cited user/evidence records, explicit-user taste profile, and applicable task constraints | Durable `.omd/frame.md`, including the task coverage matrix only where the surface requires it | `omd frame set …`; `omd frame show` must read the completed record | Missing cited evidence or required frame fields stops reference work at the brief; do not invent taste, task, or a reference target. |
| fragment inventory | `omd-scout` | Valid brief blocks, user URLs first, component inventory, and user-directed capture permission | Durable measured component records and local captures under `.omd/refs/`; provenance-bound image fragments under `.omd/refs/design/fragments/`; raw captures remain scout-local | `omd ref add … --selector … --blueprint --shot` for a measured component; `omd ref import-image <input.json>` for a local user-directed image-region capture | Capability-check `browser-rs` first through the supported browser doctor. For ordinary component inspection, use the headless, reduced-motion `omd render`, `omd ir`, or `omd probe` fallback when that provider is not callable on the current host/connection, has no platform build, or the user declines it. Record the actual limitation; a transient failure is not permission to switch. User-directed image-region capture still requires the actual supporting browser tool. If no lawful local capture can be made, omit the fragment and report the coverage gap. Never scrape, hotlink, or ship source pixels. |
| brick analysis | `omd-scout` | The validated fragment inventory, measured invariants/blueprints, rights/provenance, task blocks, and coverage gaps | Durable sanitized brick principles in the retained `.omd/refs/*.json` records plus `.omd/scout.md`; source identities and raw pixels remain only in the fragment inventory | `omd ref principles …` refuses an unmeasured source; candidate `omd ref check` rejects an empty or contaminated transferable brick | A contaminated, duplicate, rights-unclear-for-use, or unmeasurable fragment is a rejected or anti-reference brick. If no lawful sanitized brick can answer a required decision, stop candidate assembly for that decision and report the gap. |
| candidate assemblies | `omd-scout` | Validated fragment inventory, sanitized brick analysis, and frame/task targets | Durable `.omd/reference-board.json` as internal raw evidence; canonical capture, sanitized assembly, and typed projection remain behind the reference commands | Run `omd schema reference-board`, copy its exact skeleton and grid constraints, then `omd ref board --input <candidate-assemblies.json>` derives identities/frame binding and persists the validated board; then `omd ref check`; then `omd ref candidates` | A failed check, missing required zone in either candidate, stale PNG/provenance, contaminated selector/text, or no viable candidate stops before chat presentation. Do not infer or extend the printed schema, open/emit/ask the user to inspect an HTML, PNG, or board UI, or run `omd-board`. |
| locale-reference binding (market-grounded reference work only) | `omd-scout` | Current market-grounded board plus its current cultural profile, projection, and captured-source receipts | Source-free `.omd/reference-locale-binding.json` and private `.omd/reference-locale-binding-evidence.json` | Run `omd schema reference-locale-binding`, then `omd ref locale-bind --input <bindings.json>`, then `omd ref locale-bind-check`; `omd ref check` also requires it for a market-bound v3 board | A source URL not present in the profile, an unavailable source, a positive use outside `native-category`/same-task `global-equivalent`, transfer from `contested`/`unknown`, a silent unbound matching source, or a candidate with no native first-party component stops selection. |
| selected assembly | `coordinator` | Passing candidate table, current canonical capture/assembly/projection, current locale-reference binding when market-grounded, and the coordinator's own selection of the strongest candidate — or a candidate the user explicitly named, when volunteered | Durable hash-bound `.omd/reference-selection-v2.json` and art-direction handoff receipt, plus the disclosed selection entry in `.omd/decisions.md` | `omd ref select <candidate-id>` followed by `omd ref check` | An unknown, stale, incomplete, or unbound market-grounded slot disposition stops downstream use. The coordinator selects and records the choice itself with a disclosed reason; it never pauses to ask the user to pick a candidate. |
| selected visual packet (optional experiment) | `coordinator` | Current selected assembly and only its lawful `used` component blueprints; raw pixels remain Scout-owned | Source-free `.omd/reference-visual-packet.json`, content-addressed no-ship SVG geometry studies, and private `.omd/reference-visual-packet-evidence.json` provenance | `omd ref visual-packet --slot <slot-id[,slot-id]>`, then `omd ref visual-packet-check`; pass named production files to `--production` before final use | Authoring before selection, an unselected/rejected/non-lawful slot, stale source/assembly/selection/asset bytes, source identity/copy/pixels, or production reuse stops the packet route. If neutralization destroys the promised relation, reject the entry and continue structured-only. |
| production usage ledger | `omd-hand` | Passing v2 selection, current motion-resolution projection, decision-bound composer and hand receipts, actual production source/render/probe evidence, and attribution | Durable `.omd/reference-usage-v2.json` with exactly one `used`, `rejected`, or `anti-reference` row for every selected slot | `recordReferenceUsage(root, { rows }, writer)` then `validateReferenceUsage(root)` | Missing, unselected, duplicate, or unsupported rows, stale selection/motion/receipt bindings, or absent production evidence stop finalization. Do not replace real evidence with a claimed influence. |
| final provenance report | `finalizer` | A passing v2 usage ledger, current v2 selection, decision-bound handoffs, and `.omd/attribution.md` | Durable `.omd/reference-report.md` and the exact deterministic bilingual Markdown pasted into the final chat | `generateReferenceReport(root)` validates usage and atomically persists the returned Markdown | Any validation failure stops the final report. Do not hand-write, paraphrase, or claim a replacement report; repair the owning earlier stage and regenerate. |

## Reference roles

### Screen-by-screen application of the two research lanes

For routes requiring dual reference research, Scout follows validated `research-check` with
`omd ref apply-plan --json`. The draft derives exact destination surface names and input hashes
from the current domain brief and research; it deliberately contains no invented judgments.
It requires a v2 `target: {route, state}` for each screen. Bind the real planned destination path
and observable state before production; final application review rejects a different screen's capture.
Scout inspects the images, fills the draft's input, and publishes through `omd ref apply-set`.
`apply-check` verifies complete surface coverage, correct-lane reference IDs, explicit partial/
brief-derived gaps, current inputs and consistent publication. Both lanes must inform at least one
surface; a particular screen may lack direct evidence and must say why. Support-only references
cannot claim direct visual coverage. Requirements states/flows still belong to their existing
contracts; screenshots do not prove behavior. This adds no fixed reference or candidate quota.

`.omd/reference-application.md` is the human-facing application table. The source-bearing JSON
stays with Scout/coordinator; Composer and Hand receive only the derived decision projection in
briefs and selected handoffs. No source URLs, hosts or capture paths belong in decision prose.
The projection does not replace selected assembly, approved tokens, actual reference-usage evidence,
or blind final review. It records what should be applied and checked, not what has already passed.
Existing valid native captures remain usable only when current validators and schema migration permit.
Publish current work as v7 without relabelling historical bytes; historical v5 remains search-only and
historical v6 retains its original search-or-direct-root contract. Current execution binding, inspection
and application are required before downstream composition/production and design-only/terminal completion. Changed research, domain
brief or missing/edited derived outputs fails closed. Do not repair hashes to invent a review.

The application is now an approved source-seal input. After authenticated final-v2 evidence,
`omd ref apply-review-plan --json` derives deterministic surface/criterion IDs and the exact allowed
final observation/capture/viewport/state set. Inspect every criterion at desktop and mobile, then
publish `apply-review-set --input <json>` with met/revise/justified-departure and concrete reasons.
`apply-review-check` and terminal preflight reject missing, duplicate, stale, unrelated or unresolved
rows. Changed source/build/plan means new current evidence and re-review, not reusing old judgments.
This agent-authored review is not human approval, independent reviewer attestation or a beauty score.

The workflow adapts Design Flow Harness's actual-image analysis → screen reference linkage →
representative concept → expansion approach, while retaining OMD's independent research lanes,
adaptive concept/selection policy and source-free production boundary.

Every reference serves one of three roles, and the domain brief's `referenceQueries` seed all three:

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
- **③ mood** — the whole-page, visual-only lane (`omd ref mood …`, `protocol/moodboard.md`). It fixes
  a felt direction before anything is assembled and transfers declared qualities only. It is study
  material by construction: `MOOD_BYTES_IN_PRODUCTION` is a hard failure if a mood capture's bytes,
  path, or digest reach production source.

### The two axes

Roles are names; the machine-consumed contract is two axes (`core/ref/reference-scope.ts`). Scope is
whole-or-part; evidence is measured-or-visual-only. There are four combinations and no more — a new
need selects a combination rather than adding a role.

| scope | evidence | role | what it is | may transfer | structural claims |
| --- | --- | --- | --- | --- | --- |
| whole | visual-only | mood | a whole artifact, looked at | declared felt qualities | no |
| whole | measured | component | a whole page as the unit of study | measured invariants, page composition | yes |
| part | measured | component, craft | component anatomy | measured invariants, geometry | yes |
| part | visual-only | craft, mood | a crop or supplied image, looked at | declared geometry, principles | no |

**A visual-only capture may never support a structural claim.** A screenshot does not measure that a
padding is 16px; a design built from "the spacing looks 8-ish" is the derivative failure this
boundary exists to prevent. `requireStructuralClaim` refuses the claim by name, and
`omd ref granularity` reports such captures as `REF-VISUAL-ONLY` — appearance without anatomy, usable
for direction and detail but not as parts, zone coverage, or kinship.

Distances between a candidate and a slop centroid, a category mean, or an adopted direction are all
read in ONE shared space (`core/visual-vector.ts`), so the three gates are comparable readings rather
than three unrelated heuristics. `omd ref gates` reports them; `DISTINCTIVENESS_FLOOR`,
`CATEGORY_MEAN_FLOOR`, `COHERENCE_CEILING`, and `NEAR_DUPLICATE` start advisory, following the
precedent in `core/composition-contract/visual-richness.ts`.

`omd craft-capture … --json` returns its measured `reference-craft-v1` on stdout; it does not
automatically publish a file. When retention is required, the owning role preserves the actual output
at an authorized evidence path without reconstructing its values. Capture waits for document load,
the named DOM target, and fonts rather than for background network traffic to stop. These readiness
checks do not replace inspection of the actual source state. Legacy v1 pixel energy covers the
viewport, while the selector controls scrolling and the DOM-content baseline check. It is not
selector-isolated motion or complete reduced-motion visibility/accessibility proof; those claims
still require the selected scoped evidence and real rendered inspection.

## Automatic discovery without supplied URLs

Selected discovery starts with `omd ref discover-plan --json`. This read-only plan is derived from
the current route, explicit request, locale context and Framer-owned acquisition decisions. It does
not depend on the optional domain-analysis stage. Existing domain queries supplement it only while
they describe the current request. The user supplies the task, not a required reference list.

Scout turns each selected lane into current search or direct-public discovery: subject identity, task/component anatomy,
visual craft beyond the product category, and the plan's motion investigation. New marketing may
investigate a motion candidate without selecting it for production; selected `motion-one` additionally
requires positive measured evidence. Explicit preferences
for a reference region or gallery belong in those searches. A Korean-language task request selects
Korean-first reference search, including Korean-language `.com` services; it does not assert a
country style or authorize market-grounded cultural claims. Prefer freely inspectable screen/pattern galleries (for example
Mobbin, Page Flows, UI Bowl and relevant Pinterest entries) for apps/product UI, and website galleries (for example
Siteinspire and Pinterest) for website/marketing direction. The discovery plan supplies surface-aware
leads, not fixed winners or guarantees of free catalogue/API access. Verify each entry's current free
access, open it beyond the thumbnail, and follow its original where available. If access is blocked,
record the limit and try another public source; never purchase, start trials, install an MCP, or
bypass access controls. A screenshot-only reference can establish visual anatomy through the native
image import path, not live behavior or measured app DOM. Free viewing is not an asset reuse license.

Discovery always saves two separate ledgers:

- **domain reference** (`.omd/refs/domain/research.json`) asks how comparable services organize real screens, features, states, and
  task flows. When `greenfield-task-flow-benchmark` applies, its private v3 benchmark records every
  safe reachable screen in the declared scope, the actual click path, feature and flow groupings,
  current local evidence, and every explicit coverage gap. Use `omd benchmark record --input
  <reference-flow-input.json>` to execute public navigation/disclosure states in one fresh browser
  context. Attach its signed execution receipt to each completed flow and preserve the returned
  action/result/evidence bindings. `omd benchmark check` authenticates and re-hashes those transitions;
  selected product benchmarks require `liveFlowVerified: true`. Legacy artifacts without executions
  remain readable but unverified. Login, payment, destructive or unsupported actions are explicit
  exclusions, never inferred successes. Verification covers only the recorded scope, not all controls.

  Before recording, inventory the public controls in each declared feature area and name the reachable
  screen/state for each one. A branch from the entry screen needs its own native flow execution; do
  not replace several features with a single homepage screenshot. Every feature's `screenIds` must
  resolve to screenshots from signed browser-executed steps in the current v3 benchmark. If a target
  cannot be safely reached, put it in `excludedTargets` with the observed reason rather than calling
  coverage complete. A full-page image is context, not proof that its links, tabs, disclosures, or
  later states were inspected. Each native step frames its last visible assertion in the fixed
  viewport and refuses a screenshot when its asserted feature states cannot fit together; split
  those observations into separate steps instead of claiming one off-screen image covers both.
- **design reference** (`.omd/refs/design/research.json`) asks how the destination should feel and be composed. It uses the measured
  board, mood, typography, component, and craft evidence already defined by this protocol. Domain
  research is not visual direction merely because the comparable product looks polished.

Capture into the correct lane from the beginning: `omd ref add --lane domain|design`, or `lane` on
every batch entry. Selected discovery refuses omitted lanes before acquisition. Design discovery
starts with an inspected free gallery/bookmark item via `omd ref navigate --lane design`, then
retains its recorded original link via `omd ref add` or captures one actual UI image element with
`omd ref add <item-url> --lane design --selector <img-css>`, then imports that local PNG with
`omd ref import-image` for a board piece. It is visual-only; a crop is not required.
`--from-user` is only for a source the user actually supplied, never an escape from discovery.
Visit gallery entries before batching their originals, since the observed link must already
exist. A service task flow belongs in domain, not design merely because its layout is calm.
For an intermediate category/directory hop, use `omd ref navigate <url> --lane domain|design --json`.
It returns the `url`, `evidence`, and `capture` object for the lane's `navigation` array, stored
under `.omd/discovery/<lane>/navigation/`. These receipts have no board component identity and never
substitute for retained design evidence. Research validation requires a native search or direct-entry
root followed by observed links, not a URL written from memory.
A batch is checked against its own pending sources as well as already saved references before
acquisition. A rejected board is resolved before publication and cannot replace an earlier board.
Final redirected service hosts are checked before screenshot publication, including pending
captures in the same batch. A gallery item redirected to a directory belongs in navigation,
not a primary design slot; choose and capture an observed item from that directory instead.
A board remains a draft until `ref research-check` and `ref apply-check` pass; `stage next`
keeps this work with Scout rather than treating a board file as finished research.
PNGs and native JSON metadata stay together in `.omd/refs/domain/` and
`.omd/refs/design/`; app/pin imports use `.omd/refs/design/fragments/`. Unlabelled legacy records
remain inspectable but cannot satisfy selected discovery without current qualification. `ref list`
marks ineligible records; selected boards and actionable briefs reject/exclude them. Domain captures are excluded from
the default visual board inventory.

Search PNGs/receipts, direct-entry lists and gallery-item visits are diagnostics, stored only in
`.omd/discovery/<lane>/`; `.omd/refs/<lane>/` holds retained evidence. At the start of research in an
existing project run `omd ref tidy --json`. If it identifies old diagnostic clutter or ineligible
design captures, inspect the reasons and run `omd ref tidy --apply --json` before reacquisition.
The guarded operation archives exact bytes and a recovery manifest under `.omd/archive/references/`
before removing the old paths. It never relabels domain evidence or rewrites judgment hashes;
dependent research/boards must be rebuilt and rechecked. Do not run cleanup concurrently with another
active research owner. Unknown files and valid references remain untouched.

`omd ref research-set` is the sole publisher of both files and writes `.omd/reference-research.json`
last as their consistency receipt. `research-check` and downstream gates require all three current
records. New research uses v7. Historical v5 remains readable with its search-only requirements;
historical v6 remains parseable, but current publication rechecks any direct roots with signed v4
evidence after the current route; migrate older roots through a fresh native visit. Each lane can use `searches` from `omd ref search --input <json>` with
`{lane, query, url, queryParam}`. The URL submits the exact query; a fresh browser records observed
links, a 1280×900 screenshot and HTTP/error outcome, without reusing login state or clicking controls.
Current signed search v3 records bind each retained visible result label to its observed link and
exclude browser-observed header, navigation, footer, and consent chrome from actionable links.
Older signed v2 records remain readable as history but require recapture for current research.
Visible search chrome (help, navigation tabs, settings, pagination) is not a task result: follow
only task-related service links or concrete gallery items. An observed search page with no such
lead advances to another public search or direct entry, not to a header/footer link.
For explicit-market coverage, execute `ref discover-plan`'s exact target-market domain and design
queries before global searches. Other unscoped query seeds are adaptable; do not rewrite the exact
market inputs. A local result's link-associated text normally names the market and relevant
service/product scope. A generic domain-service link label such as `바로가기` qualifies only when
the separately retained, current site capture records visibly Korean text and a current signed
native direct-entry v4 for that exact service URL observes Korean-language service content.
Neither a market term in the query nor a generic label alone establishes local provenance.
Current v7 market provenance and its retained source observation must both be no more than seven days old.
Inspect the page: HTTP 200 alone does not prove useful results or free access. All queries require
execution receipts; every non-user retained domain source/design entry must occur in observed links
and have its own native visit capture. Failed attempts may accompany a usable free alternative;
they cannot satisfy retained-source coverage. Arbitrary imported logs are not native execution proof.

Alternatively, v6/v7 accept direct browsing of free public lists without a search engine. Use
`omd ref navigate <public-list-url> --lane domain --entry public-directory --json` for comparable
services, or `--lane design --entry free-gallery` for a supported gallery's visible item list.
`ref discover-plan` exposes design `nativeEntryInputs` and a domain entry command; these are leads,
not approved references. Put the native returned `method: direct-public`, `entry`, `url`, PNG
`evidence`, JSON `capture`, and your authored `reason` in the lane's optional `discoveryRoots`.
Queries/searches remain required arrays and may both be empty only with valid nonempty roots.
Every declared query still needs an exact execution, including failed attempts alongside direct roots.
The native entry publisher uses a DNS-pinned fresh GET/HEAD-only context, blocks service workers/downloads,
performs no click/hover probes, and captures stable visible links with the matching viewport PNG.
An exact current signed v4 root URL may itself be a retained comparable-service source when its
captured page has a useful task surface and at least one content or task-contextual primary-navigation link;
generic global navigation, notices and footer links are excluded. Page-content links take priority over
task-contextual primary-navigation links; its observed links
also seed descendants. Intermediate edges in direct v6/v7 chains require strict navigation-v4 captures. Hidden all-DOM links
from retained captures and historical navigation-v1 cannot shortcut a missing observed transition.
Design roots must remain supported public lists after redirects, exposing visible same-gallery item
links; login walls, blocked pages, selected items and arbitrary service pages are refused.
New signed entry-v4 records stay under `.omd/discovery/<lane>/entries/`, never retained `.omd/refs/`.
Historical entry-v1/v2/v3 records remain readable, but only entry-v4 content-link evidence can satisfy
current explicit-market provenance.
Do not hand-author roots, promote old captures, infer official authority from a directory, or present
this provenance check as a quality judgment. Follow observed items and qualify/capture each retained
reference separately. Source/redirect hosts and image bytes must remain independent across lanes.

The executor accepts Google/Bing `/search`, DuckDuckGo root/HTML/lite `q` endpoints, and Daum
`/search?w=tot&q=` for free Korean web search,
plus design-only Pinterest `/search/pins/?q=`, Dribbble `/search/<query-slug>` (`queryParam: path`),
and Siteinspire `/search?query=` (`queryParam: query`). `ref discover-plan` supplies ready-to-run
`designSourcePolicy.nativeSearchInputs`; adapt unscoped short task/pattern terms and their matching
URLs together, while preserving the exact explicit-market inputs above.
Use native gallery search when general search is blocked. HTTP 200 and actual same-provider item links
are required; login walls, empty results and challenge responses remain failed attempts. Retain only
an item actually observed in those results, never guessed shot IDs. Siteinspire now uses numeric
`/website/<id-slug>` item URLs; category/selected directories are navigation, not gallery items.
Every gallery item page is provenance rather than retained wrapper chrome: follow an observed
original when present, or capture the actual loaded UI image element for screenshot-only evidence.
Cropping is optional. Mobbin
`/explore/screens/<uuid>` and Page Flows `/screens/<uuid>` are concrete product-screen entries;
their list pages remain discovery only and their surrounding gallery UI is not the product screen.
Search gallery names with task/pattern terms (for example `site:pinterest.com/pin/ ...`), then inspect the actual entry. Known search
redirect links may be decoded as discovery targets; decoding never counts as visiting them.
The catalogue uses public browser pages, not Google's paid/custom XML API. Query parameter references:
[Google](https://developers.google.com/custom-search/docs/xml_results) and
[DuckDuckGo](https://duckduckgo.com/duckduckgo-help-pages/settings/params).
Each source binds PNG evidence and native capture-JSON hashes. Design `discovery` binds
an inspected gallery-item navigation receipt under `.omd/discovery/design/navigation/`, not just
a homepage or free-access assertion. For a different
original source, the gallery capture must contain its exact URL in observed outbound links. When
the original is unavailable, retain the gallery image as image-only; never use unrelated component
docs as its evidence. No rewriting of native metadata is authorized to repair a failed check.
The quality reason explains task/viewport fit, hierarchy, typography or density;
provider prestige is insufficient. This is inspectable provenance, not authenticated proof of taste
or browsing. Missing native provenance must be collected, never backfilled from memory. Older
records retain their original version's requirements; new direct provenance must be acquired through
the native entry publisher before v6/v7 republication. Valid retained captures need not be reacquired.
The same evidence path OR identical bytes under another filename cannot satisfy both lanes.

Discovery-plan v2 carries `marketReferencePolicy`. When its mode is `target-market-first`, execute the
provided domain search input before unqualified global searches and use its market-qualified design
search inputs. Both lanes owe current target-market evidence: comparable task services in domain, and
independent local visual-direction/design sources in design. Record a concrete coverage gap before
using the policy's global-equivalent fallback. This is acquisition scope, not a country-style preset;
for Korean welfare work, the exact domain inputs name 복지로, 정부24 혜택알리미, 서울복지포털 and 웰로,
and the current observed result link determines the destination URL. If a site is blocked, inspect
another Korean-language operator before foreign fallback. A retained Korean-language service page
can be local evidence on a `.com` host; a foreign government's English page cannot fill that slot.
The local-first admission examines the full visible page's language balance; a small Korean label on
an otherwise English service does not qualify. Foreign domain capture waits for validated published
local-domain research, not three editable capture records or a `--from-user` flag. The later locale
profile and locale binding still decide which measured mechanisms may transfer.
Research v7 is the executable refusal layer for this policy. Its `marketCoverage` classifies every
source in each lane exactly once as evidence-bound target-market material or documented global
fallback, retains at least one local source per lane, and binds the explicit market. Search-based research must execute the
plan's exact market domain inputs and market-plus-domain design searches before global queries. A
direct-public root may replace search transport, but never the per-lane local evidence or fallback gap.
Each local classification binds `sourceId`, the exact retained `evidenceSha256`, a lane-valid `scope`,
a closed `basis`, and the exact native `provenanceReceiptSha256`. `market-search-result` binds a signed
market-search execution whose visible result text for that link normally names the explicit market and relevant
service/product scope. A generic Korean domain-service label requires a current signed direct-public
entry for that exact service with visible Korean service text, plus its current retained Korean-language
capture; design and foreign-service sources do not get this exception. `market-direct-result` binds a signed direct-public root whose visible label for
that retained link names the explicit market and relevant scope. URL tokens, localized queries,
country-code hostnames, page-wide headings, and freeform reasons are never source-specific market proof.
Search and direct bases may coexist in a lane. Every declared search and direct attempt must be current.
Every global fallback binds each chosen source to a current signed visible link through
`provenance=[{sourceId,provenanceReceiptSha256}]`; its gap records that same `marketRegion`, a closed
availability/access/coverage `kind`, and every exact query and direct root attempted by that lane.
Every chosen retained capture must be current. Generic quality prose and invented attempts do not
qualify. Root reasons remain bounded, visible, well-formed scope notes; they are not provenance.

The two lanes use independent service hosts, including after redirects. A second path or crop of a
domain service is not a visual direction. Non-user discovery must match a supported public gallery
item (Pinterest, Dribbble, Behance, Siteinspire, Land-book, Godly, UI Bowl, Mobbin, or Page Flows); never label domain
documentation as a gallery. Add new providers deliberately to design-discovery-sources.ts.
For product UI, retain the concrete screen/pattern image rather than gallery UI. For website/marketing,
the retained visual source is the captured original site when available. Otherwise use the exact
native image-import path and declare its screenshot-only limits. `inspectDesignReferenceAdmission`
refuses every gallery wrapper as a retained component/page while allowing its exact image parent.
Each design source declares visualRole=visual-direction|component-support and visualAssessment
(composition, typography, density, imagery, transfer, avoid). Each board candidate must actually
use visual-direction evidence, and every visual piece must bind a validated source identity and
capture, not just alias a qualified PNG. Imported visual fragments must bind their actual native
design capture or gallery-item discovery image. An exact crop is supported but optional; search/domain images
and transparency/colour-profile changes cannot be laundered by a source label.
Current v7 research compares at least two visual-direction sources from independent original service
families and distinct inspected gallery items. Their retained PNG bytes differ, and both directions
appear in the board. Repeated pages, crops, aliases or capture names from one product remain one
source. This is a minimum comparison set, not a requirement to collage both sources into every
candidate or copy either source literally.
Usability/component documentation alone is insufficient. The generated
refs/design/README.md displays retained previews and judgments for the user; rejected candidates
and coverage gaps stay in scout.md. These checks enforce evidence roles, not aesthetic quality.
New marketing still does not
impersonate a product workflow: it gathers a domain adoption/page journey and design direction,
while the task-flow benchmark remains selected only for applicable product work.

### User-shared posts and component directories

Inspect the supplied link first and distinguish an actual interface from a post recommending
resources. Read its visible caption and destinations; a short extracted body does not override a
readable capture. A login pane alone does not make the visible public material unavailable. Apply
the existing blocked-source rules to the actual page state and do not infer hidden content.

For a resource post, retain the acquisition chain from post to directory entry to original site.
Supahero (`https://supahero.io/`) can seed hero research, Navbar Gallery
(`https://navbar.gallery/`) navigation, and Footer Design (`https://footer.design/`) footers.
These are optional component leads: select one only for an unresolved decision in the current
surface. A hero or footer gallery adds no hero or footer requirement to a mobile task screen.
Inspect the original component at the relevant viewport and state when it is accessible. If only
a thumbnail, screenshot or video preview is available, record that evidence kind and limit transfer
to visible appearance or recorded motion. It proves neither internal DOM measurements nor live
product behavior. An accessible interactive embedded component can supply live evidence for the
states actually inspected; embedding alone does not make it static.

Use the user's explicitly selected available search transport, including Aside CLI when requested;
otherwise use the host's native search. Preserve its actual output and chosen/rejected leads. Missing
transport is a capability gap, not permission to claim an unexecuted search. This does not change
Scout's browser-rs capture ownership or downstream source-free transfer.

Scout records actual queries, inspected/rejected leads and native capture identities in its existing
synthesis. Host search output alone is disclosed provenance, not project-signed native acquisition
evidence or a substitute for native capture. No extra reference quota or discovery artifact is introduced. Selected `motion-one` cannot
pass `omd ref granularity` with only still captures merely because domain analysis was skipped.
The settled source-free assembly carries measured relationships and motion parameters into
composition and production; existing usage, fidelity and browser checks prove their actual use.

### Host-executed authenticated discovery

If the selected search CLI fails inside a role because host credentials are unavailable there,
Scout returns the exact read-only request and actual error in its existing synthesis. The coordinator
may execute that same user-authorized discovery request through the installed CLI in its own host
environment. Use structured arguments, preserve the user's account/model settings, and retain the
actual argv, stdout, stderr and exit status. Converting shell quoting to an argv array must preserve
the executable, subcommand, flags and prompt; never execute supplied shell syntax. Do not forward arbitrary role shell commands, copy
credentials into the role, weaken its sandbox or create a new authentication flow.

A successful host execution supplies raw search material to Scout; it does not make the failed
role execution successful. Scout still inspects the leads with browser-rs, evaluates their evidence,
and owns capture, synthesis and publication. A partial or failed host search remains incomplete.
The coordinator never converts its transport output into a reference board or approved selection
on Scout's behalf. This recovery changes execution location only, not the selected provider,
publication ownership, evidence requirements or source-free boundary.

## Capture granularity

A board is assembled from parts. Every measured reference is captured at the specific component it
studies (`omd ref add <url> --as <component> --selector "<css>" --blueprint --shot`); a capture
scoped to a page root — `main`, `body`, `html`, `:root` — measures the whole document and yields a
page average with no component anatomy, so section-granular composition has nothing to take from it.
For a compact component demo, an unscoped `omd ir` failure with `near-empty body` does not establish
that the site is blocked. Inspect the visible page and retry the known component through
`omd ref add … --selector "<visible-component>" --blueprint --shot --no-energy`.
The existing scoped check still rejects document roots, hidden/empty content, HTTP errors and
challenge pages. A successful scoped capture proves only that component and its visible state;
it does not satisfy a different acquisition state or waive missing product evidence.
Captures of the same source at the same measured selector form one reference family. Distinct explicit
viewports are complementary observations, not duplicates or independent sources. Same or unknown
viewports still trigger duplicate findings. Part counts, concentration, and signal votes count each
family once. Any low-signal variant retains a conservative low-signal family vote. Cross-family kinship
checks all variants; zone, anatomy, naming, and desktop checks retain each individual capture.

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

### Complementary states and evidence kinds

Each zone has one inspectable `requiredState`, and every bound piece must truthfully match it.
If a decision needs both an error example and a separate initial product form, Framer gives those
mandatory companions separate required zones and unique decision IDs. Preserve a mapping to the
original task, relationships and falsifier; these evidence zones do not add product screens. A broad
state that hides the difference, or relabelling a source observation, does not repair the plan.

A zone normally requires measured component anatomy. Framer may explicitly declare
`evidenceRequirement: {kind: "visible-appearance", reason: "<source-free reason>"}` when the
question concerns static visible structure, proportion, density or rhythm. The current resolved
board must then contain a matching component capture or provenance-bound image for that zone in
every candidate. Images remain unable to satisfy measured zones or supply internal DOM, font,
motion, interaction or responsive measurements. Their exact state, observed capture viewport,
provenance and current PNG bytes remain required. Keep independently needed measurements and
later typography, behavior and production proofs as separate mandatory obligations. Missing source
access alone does not justify changing a measured question to appearance.
Framer checks the question and falsifier, not just the axis label: an exact source ratio, gap,
font metric or responsive comparison still needs measurement evidence. The reason names what
appearance can establish and what remains for a separate proof. Scout independently inspects
every retained capture against the declared state and records visibility and limits; a matching
state string, PNG hash or viewport field is not semantic verification. Source-free projections keep
the image evidence kind. Reports distinguish appearance coverage from anatomical coverage, and
reusing an image across candidates never increases independent evidence. A successful reference
check establishes these declared coverage and integrity constraints only; it is not visual approval
or completion of the route's typography, behavior, production and independent review gates.

`omd ref granularity` audits granularity and zone coverage and reports `REF-WHOLE-PAGE`,
`REF-DUPLICATE-CAPTURE`, `REF-NO-PARTS`, `REF-PART-CONCENTRATION`, `REF-ZONE-UNCOVERED`, and
`REF-NAME-MISMATCH`. A capture is named for what it holds: a reference called `*-hero-*` captured at
`header` tells downstream readers that the hero is covered when what exists is another nav. Any
finding means the board must be recaptured at component scope across the zones that still have
nothing; a board of whole-page captures can only be traced, and tracing a whole page is the
derivative failure the transfer boundary forbids.

## Capturing an existing state or open disclosure

Retained reference captures and native flow steps first allow a brief bounded settle for late
notices, then visually suppress only visible informational announcement dialogs with an unambiguous
`닫기`/`Close` control. The browser does **not** click the page-owned control, run its handlers,
or remove DOM nodes: a browser-owned DevTools stylesheet visually hides the notice and a named
covering backdrop for research pixels only, in a fresh browser context. An unnamed covering layer
refuses capture. Network requests during the bounded style change are aborted, and any attempted
request or cookie/storage change refuses the capture; requests from that suppressed document remain
blocked, while a safe new document may load ordinary feature resources after navigation. Retained
reference navigation also blocks non-GET/HEAD requests, service workers,
and WebSockets. This is not proof that a real user dismissal or service-side transition succeeded.
The URL must remain unchanged and no dim backdrop may remain; the title, control, visual-only method,
and backdrop count are retained in the private capture/flow receipt.
Page scripts remain suspended for that document after suppression. CSS/DOM and pixels remain
inspectable, but interaction, motion, and second-pass energy measurements are marked unmeasured;
a full-document safe link navigation may reload the new document to resume scripts. Subsequent
requests from the suppressed document are aborted and attempted requests refuse its evidence,
including CSS resources activated by a fragment target. A browser-native same-document fragment
link may be inspected only when it remains request-free with scripts still suspended; a JavaScript-only state
that cannot be reached safely is an explicit coverage gap, not a captured feature claim.
Roleless popup containers and visible modal-like overlays also require clearance or refusal. An
unknown, consent, login, payment, or unclosable notice is a visual-obstruction
refusal, never a screenshot to publish. Inspect that
refusal and reacquire from a safe public state or record a bounded gap. An explicitly prepared
modal state remains an intentional capture and is not auto-dismissed, but other overlays on that
prepared state are still refused. After capturing, recheck for
a late notice and recapture the clean state if it appeared. Do not use `--no-shot`, a renamed PNG,
or a source URL alone as a substitute for the clean state-specific image.
An ambiguous fixed full-viewport app container is not accepted from its shape, navigation links,
or recovery controls alone. Select a specific visible feature inside it (or assert that feature in
a native flow) before capturing; without that scoped evidence, record a bounded gap rather than
retain a possible error screen. A sole semantic main remains inspectable unless an error or other
covering state is detected.

When a required source state is an open menu or disclosure, print `omd schema reference-capture-preparation`.
Pass its closed JSON object through `omd ref add … --preparation <json> --no-energy`, or embed it as
`preparation` with explicit `energy:false` in each `ref add-batch` entry. Both use the same page for
preparation, DOM measurements, blueprint, and scoped PNG. The preparation lists only caller-authored
clicks on `button[type=button]` controls with `aria-expanded` and `aria-controls`; every controlled
element must have an explicit `visible` or `hidden` assertion. Arbitrary scripts, form submission,
typing, navigation, and inferred actions are unsupported. Use this only for a known local disclosure
interaction, never a purchase, message, or remote mutation disguised as a control.

For an already-present state, use `actions: []` with one to eight assertions. For example,
`{"selector":"#search:focus","state":"visible"}` checks actual existing focus without moving it.
This grants no focus, typing, or script action. A missing initial state fails instead of being restored.

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

Keep explicit brand/user invariants distinct from an observed example treatment. A first-party
example page is not, by ownership alone, an immutable palette, type or motif requirement. State the
basis and uncertainty in the existing subject-anchor record. Without an established invariant, its
tokens are evidence for synthesis, not a lock against current-user visual rejection. Established
identity still cannot be outvoted by category defaults.

## Chat-first presentation and selection

### Acquisition, transfer and similarity verification

Before accepting reference-backed art direction, run `omd ref verify --json` after `omd ref check`.
Inspect the actual source component captures, not merely their filenames or the Scout's principles:
does each visible part contain the declared source state and the typography/composition relationship
the destination needs? The report exposes candidate/slot, original source, scoped capture, viewport,
promise, falsifier and missing geometry. `semanticState: requires-visible-inspection` is deliberately
not a machine pass. A reachable URL, a valid hash or a matching declared state string cannot establish
semantic suitability. Record the visible finding and its exact capture in the existing decision record;
repair only the missing or misframed evidence. Content-only evidence never pads visual coverage.
Distinguish task anatomy from the desired craft: a documentation article can explain a sequence
without establishing the destination's visual ambition. Do not label a supporting component a
high-visual-system source merely because it is reachable, first-party, or covers a required zone.
Inspect the reference relationship implicated by the current brief and human feedback before
accepting it as craft evidence; record what it does and does not establish.

Measured blueprints retain component-relative positions. A source-free visual packet preserves those
positions with one uniform scale; missing legacy positions require recapture, never a guessed flex/grid
layout. Select that packet when a spatial reference relationship needs visual transfer. Raw pixels,
source names and copy still remain outside Composer/Hand and the blind final beauty review.

For a runnable study or production page, run `omd ref verify <page> --candidate <id> --json`.
It measures the actual assigned destination selectors at the captured source viewports, and reports
source/target geometry, per-axis scores and unmatched anchors. Run before claiming that a reference
was visibly used, not only after a finished page. Anchor matching is a role/area-rank heuristic, not
semantic matching. Inspect the paired captures for the declared feature and falsifier; geometry alone
does not prove them. Check each additional required responsive viewport separately. A bitmap draft
has no DOM geometry: mark that comparison unmeasured, inspect visible relationships and resolve it in
real-font/runnable proof before freeze. Never present draft taste, a matching file hash, or the author's
`featureObserved` flag as an independent transfer verification.

Whole-component correspondence can compare unlike units: one heading with nested spans against
one text node, a five-line body against a one-line body, or terminal descendants against an explanatory
diagram. In that case a low aggregate does not establish loss of a named type ratio, column ratio or
block gap. Do not force source line counts, add filler, split text or discard useful content to improve it.

The whole-component density diagnostic compares union occupied area on the same normalized grid.
It does not penalize different HTML roles or item counts a second time. Role correspondence remains
separately reported and affects the structural axes; equal density alone establishes neither matching
content nor semantic transfer.

For a specific measured relationship, Scout may declare `binding.measurements` through the existing
board publisher before production. Read `omd schema reference-feature-measurements`. Select the exact
source node indices from the current measured blueprint and name the meaningful destination groups;
Composer/Hand retain those names as `data-omd-reference-anchor` markers inside the existing complete
target scope. `@root` names that complete scope. Markers identify the counterpart; they do not assert
that its geometry or meaning is correct. Preserve the full promised relationship and falsifier, not a
convenient isolated element. A wrong source/target scope returns to its owner; it is not repaired by
changing the axis or moving the marker onto unrelated content.

The native verifier reads the actual rendered boxes and computed font sizes for every declared
counterpart. It records both witnesses and values, recomputes each quantity, rejects absent, duplicate,
hidden or unmeasurable counterparts, and binds the same definitions/source witnesses into the current
selected-distance receipt. A source recapture, definition change or production change needs fresh
evidence. A schema example's indices are not defaults. Source nodes/target groups must be visibly the
semantic roles claimed in the promise; the machine cannot establish that interpretation. Every other
required viewport still needs its own measurements and visible responsive consequence.

The numeric diagnostics are not perceptual percentages, authorship judgments or beauty scores.
For v2 geometry promises with declared features, the selected-distance gate uses the weakest declared
quantity; whole-component geometry and style-invariant similarity remain separately labelled diagnostics.
Without declared features it retains the weakest promised whole-component axis. The existing `0.6`
threshold is unchanged, and a feature declaration is not a waiver of an acquisition or quality obligation.
Missing positions or an unmeasured promised axis
cannot pass. Content/voice/rejection keep their own proof obligations and are not layout-distance slots.
Motion remains a measured sequence comparison. Final blind Eye quality judgments stay separate from
this source-aware fidelity check, so matching an unsuitable reference cannot prove a good design.

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

`omd ref handoff <art-direction|composer|hand> --json` exports the actual current selected
source-free feature content. This read-only command validates the persisted role receipt,
selection, capture, assembly, and projection before returning measured transfers and their evidence
axes. `art-direction` also includes available lawful motion marked `pending-motion-review` for
the evaluator to decide. Composer and Hand receive only settled `used` pieces after genuine art
direction publication. Unselected candidates and rejected or unlawful pieces are omitted. The
export's `sha256` binds its content; `referenceHandoffSha256` binds the existing lineage receipt.
The receipt's older `payloadSha256` is a receipt digest, not a feature payload. Supply the complete
export unchanged with the permitted owner inputs. `omd brief` remains coordinator intake; its raw
reference inventory is not an owner packet. An unavailable export is a blocker, not permission to
reconstruct content from the private board. A route that skipped canonical art direction retains
its existing selected-input contract and does not acquire a receipt obligation from this command.

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

Composer has no outgoing edge to either route. When image-first drafting is selected, it starts only after the coordinator has chosen a draft
and hands it over, or has taken the CSS/SVG fallback. This permits real brief, copy, register, palette,
type, and other project-owned material in coordinator prompts without granting composer an upstream role.

## Browser boundary

For interactive visual research and user-directed region capture, use `browser-rs` first.
After the supported browser doctor, use the deterministic Playwright paths `omd render`, `omd ir`,
and `omd probe` for ordinary component inspection when the provider is not callable on the current
host/connection, has no platform build, or the user declines to install/use browser-rs. Record the
actual limitation in the stage handback; an installed healthy binary does not prove an exposed tool.
Never switch as a convenience second provider or on an unexplained transient failure. User-directed
image-region capture still requires the actual supporting browser tool; never invent a manual
region-capture CLI or a user-declined receipt.
The fallback remains headless and reduced-motion. Preserve measured motion only when it is
relevant, honor the existing motion and WebGL/3D gates, and do not add a provider, API-key
flow, or runtime.

The scout's internal raw evidence record stays scout-side. When image-first exploration is selected,
Composer starts after the coordinator has chosen its image-first draft: on
the capable route it receives the canonical v2 selection, current motion-resolution projection,
decision-bound composer receipt, selected assembly, and coordinator-chosen draft; on the unavailable
route it receives those same bound artifacts plus the CSS/SVG fallback. Only an explicit art-direction
skip in the authoritative adaptive route with its typed skip receipt removes the direction-owned
motion-resolution projection and decision-bound handoff obligations. Missing is not skipped. That
branch receives the current selected source-free reference projection and typed skip receipt, with no
fabricated register, motion decision, metaphor contract, draft, handoff, or art-direction/motion/settled-selection
hashes; all other selected prerequisites, evaluator lineage, and quality criteria remain binding.
Independently selected image-first drafting still requires its chosen draft or authorized CSS/SVG
fallback, without inferring a motion decision from that method.
Reference assembly alone does not select image-first exploration; an explicitly skipped method
retains its recorded skip reason and creates no draft obligation. Board-v3 makes each influence
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
