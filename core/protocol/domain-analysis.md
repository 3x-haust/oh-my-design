# Domain analysis

The first step of a run, before framing. A raw request — "make me an ERP", "a landing page for
this tool", "a booking app" — under-specifies the work: it names a goal but not the domain the goal
lives in. Designing straight from the words produces a generic shape, because the harness is filling
in an unexamined domain with the statistical mean of "a web page". This step examines the domain
first, so every downstream step (framing, reference acquisition, composition) is grounded in what the
thing actually is.

This step is **mandatory**: `domain` is a declared mandatory stage, so a route cannot select it
away or excuse it with a one-line skip reason (`DOMAIN_ANALYSIS_REQUIRED`).

## What it produces

A single validated artifact, `.omd/domain-brief.json` (`domain-brief-v1`, `omd domain check`):

- **domain** — the identified domain in a few words (`ERP`, `developer-tool marketing landing`).
- **summary** — one plain line: what this domain/product is and does.
- **surfaces** — the canonical pages / screens / reachable states this domain needs, each with the
  task it serves and its own `evidence`. An ERP is not one page: it is an inventory dashboard, a
  purchase-order detail, an approvals queue, a supplier list. A tool landing is a hero, a proof
  section, a pricing block. Name them from the domain, not from a template.
- **coreObjects** — the real objects the domain manipulates: its nouns, not UI widgets. An ERP's
  purchase order, invoice, stock item, supplier. Each carries its own `evidence`.
- **audience** — who the work is for, whose task the design serves, as `{ description, evidence }`.
- **referenceQueries** — the concrete search queries the scout will run, split by the two reference
  roles (see `protocol/reference-assembly.md`):
  - **component** — role ①: one query per PART, in English
    ("data table inline actions", "approval status pill", "contextual sidebar").
  - **craft** — role ②: motion, scroll animation, and sculptural/visual craft to source from
    top-tier galleries ("dashboard scroll reveal", "data viz motion").
  - **mood** — role ③: felt direction for the whole-page lane ("printed ledger quiet").

### Query construction

Rules learned from how these sites and working designers actually behave:

1. **English, always.** The material is indexed in English even when the product is not. A Korean
   query returns Korean-language results about the topic rather than the interface patterns, which
   is a different and much smaller pool.
2. **One part per query, never a whole concept.** A phrase like "AI desktop assistant" retrieves
   almost nothing, because no real screen is named that. The screens that DO exist are the parts:
   `task management`, `side panel`, `contextual sidebar`, `command palette`, `empty state`. Search
   the parts, and let composition assemble them. This is also why the domain brief names surfaces —
   those names are the query seeds.
3. **A mood query names qualities, not a part**, so it is allowed to be longer:
   "analog warmth, patched panel, low glow". The product-noun rule still applies to it — no screen is
   named after a product in either lane.

### How a direction is gathered

A designer builds a board by collecting many candidates first and narrowing later, searching parts
across many sites rather than hunting the one correct competitor. Three consequences for this step:

- Gathering a **visual direction** is the default path for every route except one that declares
  restrained expression. A route that gathers only similar services produces a product survey rather
  than a direction; that is the failure this default exists to prevent.
- **Similar services answer a different question** — how the task works, not how it looks — and are
  gathered only when the work needs structural transfer.
- Explore by **similarity**, not by rewriting the query: the next good capture usually comes from a
  capture already kept.
- **planning** — `{ businessGoal, successSignal, nonGoals[] }`, why this work exists and what would
  make it succeed. Each statement is `{ text }` alone, or `{ text, userEvidence[] }` when the user
  actually said it.

### Planning is asked, not researched

Search cannot tell you the user's business goal, so planning is either stated by them or explicitly
left open:

- A statement carrying `userEvidence` (the same `ExplicitUserEvidence` shape as
  `protocol/evidence-claims.md`: `kind`, `source`, `reference`, `excerpt`) is confirmed.
- A statement with no `userEvidence` is a **hypothesis**. It is lawful to record, and it is not a
  basis for production: while any hypothesis remains, `requireConfirmedPlanning` fails the gate with
  `UNSOURCED_PLANNING_CLAIM`, so the run asks the user instead of inventing a business goal.

Domain facts come from observation; planning comes from the user. Conflating the two is how a run
produces a confident answer to a question nobody asked.

### Every claim carries its source

Each `surfaces[]`, `coreObjects[]`, and `audience` entry carries `evidence: [{ status, reference }]`,
where `status` is one of:

- **observed** — you opened the real thing (a product page, a shipped app, a capture of one) and saw
  this. `reference` is a URL, or a project-relative capture path such as
  `.omd/captures/purchase-order.png`.
- **user-provided** — the user said it. `reference` is the message or provided artifact.
- **inferred** — prior knowledge alone, with no source behind it.

A claim whose evidence is **entirely `inferred`** fails the brief with `UNSOURCED_DOMAIN_CLAIM`.
Inference is allowed only alongside at least one `observed` or `user-provided` entry, which is what
separates a grounded brief from the statistical mean of the domain. There is deliberately no
self-reported `researched` boolean: a flag nobody verifies is not evidence.

### Domain observation is not a design reference

This is the step's most misread boundary. Opening a real product tells you **what exists in the
domain** — which screens it has, which objects it manipulates, what its users are called. It does not
tell you **how this design should look**, and the two are routinely confused because both produce a
screenshot.

| | domain observation | design reference |
| --- | --- | --- |
| the question | what is in this domain | how should this look |
| where it lives | `.omd/captures/`, cited by the brief | `.omd/refs/`, gathered by the scout |
| what it may support | a domain fact: this screen exists, this object is real | a visual decision |
| what it may NEVER support | a visual decision | — |

A capture taken to understand the domain is **not** a reference. Citing one as the visual basis of a
section is the failure this boundary exists to prevent: a run that did it produced a survey of existing
welfare portals instead of a design, and the user's own verdict on the primary one was that it looks
bad. Observing a screen is not endorsing it.

When an observation makes you think *this is the wrong way to do it*, record that as an explicit
anti-reference rather than silently keeping the capture. A named anti-reference is a constraint the
next step inherits; an unstated dislike is lost.

```bash
omd ref principles <url> --as <name> --add "anti-reference: <what not to do, and why>"
```

## How it is done

Open the domain's real products and observe them — for **domain facts**, not for visual direction.
Search tells you *which* products to open; it is not itself the evidence. Summarizing search results
reproduces the same statistical average this step exists to escape, so surface and object claims come
from a page you actually loaded, recorded as an `observed` entry with its URL or capture, or from the
user. What you learn here is that a benefit screener asks one question at a time, or that a portal
leads with search: structure and vocabulary. How those screens *look* is a separate question the scout
answers, and a capture taken here must not be cited as the visual basis of a section.

Gather concurrently, never one lookup at a time (per the run's parallel-gathering rule). For an
unfamiliar domain or a named product, look it up — what it is, what a competent instance of it
contains, who uses it — before writing the brief. The brief is data only: it carries the domain
facts, their sources, and the acquisition queries, never rationale, authorship, or source bytes.

## What it feeds

- **frame** builds on the domain brief instead of on the raw words: the frame's subject, primary
  task, and costliest error are chosen knowing the domain's surfaces and objects.
- **the scout** runs `referenceQueries.component` and `referenceQueries.craft` as its two-role
  acquisition list, so references are gathered for *this* domain's parts and *this* domain's craft,
  not a generic crawl.

The step never designs, scaffolds, or writes production code. It is understanding, recorded.
