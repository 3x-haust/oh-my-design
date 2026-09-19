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

Search the PART, in English, across many sites — the way a designer builds a board by hand:

- Search part keywords (`task management`, `side panel`, `contextual sidebar`), never a product name.
  No real screen is named "AI desktop assistant", so that query returns nothing usable.
- Collect several candidates first and narrow later. Pre-filtering to the correct category is how a
  board becomes a single competitor's screenshot set.
- Explore by similarity rather than by rewriting the query: the next good capture usually comes from
  looking at one you kept, not from a better phrase.
- Keep the whole page when the felt direction is the point, and a scoped part when anatomy is. A
  moodboard is whole-page and visual-only by construction (`protocol/moodboard.md`).
- A capture carries its own evidence: palette, type, spacing, and the page it came from. A pin that is
  only a crop loses all of it, which is why this step captures the live page rather than a thumbnail.

Existing products are for how a task is solved, not for how a page feels; a run that gathers only
those produces a product survey instead of a direction.

### Exploring a domain reference

The domain-reference lane and the design-reference lane are independent deliverables. A polished
competitor may contribute to both only through separate observations: its product flow never counts
as visual-direction evidence automatically, and its appearance never proves how its task works.

For an applicable product task-flow benchmark, do not stop at the landing page or first useful
screen. Declare the safe inspection scope, open each same-domain service at its real entry point, and
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
stale, reused, unreachable, or unorganized observation blocks completion.

After the domain and design lanes both have current evidence, print `omd schema reference-research
--json`, publish the exact record with `omd ref research-set`, and run `omd ref research-check
--json`. The record binds the domain lane to the current benchmark when applicable and the design
lane to the current reference board. It also refuses one capture/hash pair reused across the two
lanes. Do not hand-write a completion claim when this gate is missing or stale.

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
omd ref add <user-url> --as <name> --from-user
omd ref add <url> --as <name>
omd ref add <url> --as <name> --selector ".component"
omd ref add <url> --as <name> --selector ".component" --blueprint
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
