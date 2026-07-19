---
name: omd-scout
description: >-
  Build a measured LEGO reference inventory without designing anything: whole pages for feel,
  tight selectors for component anatomy, typography studies, motion studies, image refs
  for the unrenderable. Use when the user asks for references, inspiration, benchmarks,
  or "how do good sites do X" — standalone, before or without a build.
  Triggers: 레퍼런스 찾아줘, 레퍼런스 수집, 참고 사이트, 벤치마킹, find references,
  inspiration board, how do other sites do.
---

# omd-scout

A LEGO reference assembly, measured instead of pinned. Read
`protocol/reference-assembly.md` under `omd pack dir`; it owns the exact eight stages,
their single owners, and their artifact/stop boundaries. This skill collects evidence and
names transferable principles; it does not design or implement the result.

Spawn `omd-scout` with the concept (ask one short question only when neither the request nor
`.omd/frame.md` supplies one), the component inventory, working directory, and user URLs.
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

- domain conventions and user expectations;
- direct competitors and meaningful alternatives;
- first-party or user/community language;
- typography and voice;
- motion when the concept or interaction actually needs it;
- every required component or state whose anatomy is uncertain.

There is no minimum query count, capture quota, famous-site quota, or mandatory award
gallery. A small inventory with complete, independent evidence is better than a large gallery of
near-duplicates. If a category is irrelevant, record why. If evidence remains weak or
contradictory, report the gap and uncertainty instead of filling a slot with decoration.

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

Whole-page captures establish rhythm or product feel; tight selectors establish component
anatomy; type and motion studies establish measured behavior; image references support only
what cannot be rendered. A blueprint is allowed only for an explicitly requested exact
component transplant or a structurally equivalent component problem. Structure may
transfer; skin and pixels do not.

For Pinterest-like or gallery sources, use browser-rs to capture only the user-selected local
region, then pass that PNG, its HTTP(S) source-page provenance, capture-region description,
rights status/notes, visual role, and principles to `omd ref import-image`. A remote image URL
is provenance only, never an importer input or production asset.

After analysis, write the internal candidate record, run `omd ref check`, then paste the exact
`omd ref candidates` Markdown table directly into Codex/Claude chat. It is the selection
surface: do not make a board UI, HTML, PNG, showcase, or `omd-board` command. The coordinator
records the user's exact candidate id with `omd ref select`; if interaction is unavailable,
the coordinator records a clearly disclosed agent selection instead. Downstream receives only
the resulting hash-bound sanitized selected assembly and checked clean-room lineage.
Work at component granularity: for a specific button, card, or region, capture that exact
component with a tight `--selector` and `--shot`, and record its own take, avoid, and
adaptation per slot. The candidate table's local-capture column carries each part-image's
local path, so attach the precise per-component capture in chat while the user selects and
builds. For a user-directed selected reference, the hand then opens that slot's local part-image
capture under `.omd/refs/` and builds against it with image-to-code fidelity. Component-level and
whole-surface fidelity are both allowed; `omd ref distance` is advisory — it reports closeness and
never blocks shipping. Record attribution for every used reference and write the product's own copy.

## Evidence quality and contamination

Prefer first-party product sources and direct user/community evidence over SEO summaries.
Label source trust, uncertainty, and whether evidence is independent or derivative. Reject
a non-user source only when it is derivative or convergent — an SEO/content-farm summary, a
near-duplicate, or a page whose repeated patterns are unauthored defaults. A premium,
first-party, intentional design is not slop for using a common pattern (a gradient, a card
grid, a common sans) with a point of view; measure it. Slop is convergence without an
author, not any use of a familiar pattern. Keep a user-provided contaminated source only as
a named anti-reference. Drop kin at similarity `>= .85`; a cluster of related pages
is one evidence family, not independent corroboration. A blocked page is not retried; use an
honest image/discourse fallback or discard it.

Every retained capture records:

- the decision or coverage gap it answers;
- measured invariants and the reason they matter;
- what contradicts the concept;
- source trust and uncertainty;
- the token, component, motion, voice, or composition question it may inform.

Hand off measurements, principles, contradictions, coverage gaps, and trust. The hand may open a
user-directed selected reference's local part-image under `.omd/refs/` and build against it with
image-to-code fidelity; component-level and whole-surface fidelity are both intended, and `omd ref
distance` is advisory (it reports closeness, never blocks shipping). Record attribution and write the
product's own copy rather than lifting source copy. Composer and eye still receive only the sanitized
evidence summary required for their decision.
