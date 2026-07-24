# Domain analysis

The first step of a run, before framing. A raw request — "make me an ERP", "a landing page for
this tool", "a booking app" — under-specifies the work: it names a goal but not the domain the goal
lives in. Designing straight from the words produces a generic shape, because the harness is filling
in an unexamined domain with the statistical mean of "a web page". This step examines the domain
first, so every downstream step (framing, reference acquisition, composition) is grounded in what the
thing actually is.

## What it produces

A single validated artifact, `.omd/domain-brief.json` (`domain-brief-v1`, `omd domain check`):

- **domain** — the identified domain in a few words (`ERP`, `developer-tool marketing landing`).
- **summary** — one plain line: what this domain/product is and does.
- **surfaces** — the canonical pages / screens / reachable states this domain needs, each with the
  task it serves. An ERP is not one page: it is an inventory dashboard, a purchase-order detail, an
  approvals queue, a supplier list. A tool landing is a hero, a proof section, a pricing block. Name
  them from the domain, not from a template.
- **coreObjects** — the real objects the domain manipulates: its nouns, not UI widgets. An ERP's
  purchase order, invoice, stock item, supplier. These are what the surfaces are *about*.
- **audience** — who the work is for, whose task the design serves.
- **referenceQueries** — the concrete search queries the scout will run, split by the two reference
  roles (see `protocol/reference-assembly.md`):
  - **component** — role ①: detailed section / component / button design to source from good
    products ("dense data table with inline actions", "approval status pill").
  - **craft** — role ②: motion, scroll animation, and sculptural/visual craft to source from
    top-tier galleries ("awwwards dashboard scroll reveal", "fwa data-viz motion").
- **researched** — true when the brief is backed by an external lookup of what the domain is and
  needs, false when it is honest inference from prior knowledge alone. An unfamiliar domain
  (a niche vertical, an acronym, a named product) must be researched, not guessed; a familiar one
  may be inferred, but the flag records which so a guessed brief is treated with due caution.

## How it is done

Gather concurrently, never one lookup at a time (per the run's parallel-gathering rule). For an
unfamiliar domain or a named product, actually look it up — what it is, what a competent instance of
it contains, who uses it — before writing the brief. The brief is data only: it carries the domain
facts and the acquisition queries, never rationale, authorship, or source bytes.

## What it feeds

- **frame** builds on the domain brief instead of on the raw words: the frame's subject, primary
  task, and costliest error are chosen knowing the domain's surfaces and objects.
- **the scout** runs `referenceQueries.component` and `referenceQueries.craft` as its two-role
  acquisition list, so references are gathered for *this* domain's parts and *this* domain's craft,
  not a generic crawl.

The step never designs, scaffolds, or writes production code. It is understanding, recorded.
