# Reference assembly protocol

Reference work is an optional method inside the single `/ultradesign` workflow. It is not a separate
Scout/board/candidate pipeline. The implementing model owns research and capture decisions; `omd-eye`
receives only the isolated comparison packet used by first-render or final review.

## Choose references for the actual surface

- Product UI: use populated task screens and the states needed for the requested workflow.
- Marketing: use finished service websites whose composition and visual register match the task.
- Content: use populated reading, browsing, and editorial surfaces.
- Gallery thumbnails, pattern libraries, and documentation are discovery leads, not complete visual
  references.

Preserve whole originals. A detail may be described on a whole image, but a crop never replaces the
source screen and its task context. Domain similarity does not establish aesthetic fit.

## Discovery and research

Use only retained public commands:

```text
omd ref discover-plan
omd ref search
omd ref leads add|search
omd ref navigate
omd ref discover-batch
omd ref work-next
omd ref advance
omd ref exclude
omd ref research-set
omd ref research-check
```

Search output and leads are discovery input. A retained non-user reference needs a separate current
observation of its destination. A blocked, paid, authenticated, or unusable source remains a
recorded limitation; do not fabricate availability or install a paid integration.

Domain research records functions, content, and safe public flows. Design research records visible
composition, hierarchy, density, typography, material, component anatomy, and state craft. Keep
those purposes distinct.

## Capturing complete originals

Use:

```text
omd ref add
omd ref add-batch
omd ref import-image
omd ref list
omd ref show
omd ref principles
omd ref audit
omd ref direction-review
```

Browser viewport captures retain complete DPR-2 pixels. Loaded source images retain their native
dimensions and bytes; never enlarge a one-times image merely to label it two-times evidence.
`import-image` accepts a contained local PNG plus explicit source-page, capture-region, rights, and
transfer metadata. It does not grant permission to ship the source pixels.

### Capturing an existing state or open disclosure

Reference preparation may use only:

- a safe disclosure `click`;
- `hover`;
- direct `focus`;
- final `press-start`, released during cleanup after capture.

Every target must be exactly one visible element. Links, navigation, downloads, authentication,
pricing, payment, submit/reset controls, and destructive actions are refused. Assertions may observe
visible, hidden, hovered, focused, focus-visible, pressed, or expanded.

Each default, hover, focus, pressed, or open state is its own whole capture. The preparation receipt
binds the actions, selectors, assertions, viewport, and capture digest. An aggregate interaction
metric never substitutes for those state pixels.

## Request-scoped consulted originals

Before first-render review, publish the exact originals actually used for visual direction through:

```text
omd ref context --input <consulted-references-input-v2.json> --json
```

The record contains exactly one primary image and up to seven supplemental images. Each image names
the destination component and optional state (`default`, `hover`, `focus`, `pressed`, or `open`).
The publisher checks contained PNG bytes, dimensions, digest, and request scope, then stores a
project-signed comparison-only record.

This record is:

- reported consultation, not acquisition authentication;
- comparison-only, not approval or selection;
- not evidence of human satisfaction;
- never permission to ship source pixels, branding, copy, or product capabilities.

A request with a valid Figma target uses signed frame-diff proof instead of a consulted-primary
record.

`omd ref direction-review --json` independently classifies the current whole-screen design captures
as direction, support, or reject evidence. It publishes only Eye-bound admission records; it does
not select a candidate, invoke a maker, or introduce a structured stage relay. Use
`--input <reference-zone-review-input.json>` only for one explicit acquisition-plan zone.

## Applying a reference

First describe the primary original's visible identity independently:

- macro proportions and dominant image/type relationship;
- hierarchy and grouping;
- density and spacing rhythm;
- typography character and weight;
- surface tones, borders, radii, shadows, and control anatomy;
- relevant responsive or interaction state.

Then compare the actual destination pixels. Transfer the visible relationship deliberately while
preserving destination content, functions, accessibility, viewport constraints, and brand
invariants. A generic hierarchy, one shared motif, or matching task order does not prove visual
fidelity.

Supplemental references receive narrow named jobs. Do not average incompatible palettes, density,
shapes, and control systems into an ungrounded style.

## Completion evidence

For every primary interaction state, the trusted lifecycle manifest must perform the matching
product action and provide `captureState` with the same component/state identity. Final fidelity
requires current desktop and mobile product captures for each compared state and complete
digest-bound comparison rows.

Missing, insufficient, or failed comparisons remain review findings and cannot coexist with a GREEN
reference-fidelity verdict. Browser execution proves captured behavior; isolated review judges the
visible comparison. Neither is human approval.

## Rights and reporting

Record the source URL, exact captured original, rights/visibility status, transferable qualities,
explicit exclusions, and honest gaps. Unknown or restricted rights keep pixels comparison-only.
Never scrape, hotlink, or ship source media without permission.

The final report names:

- which originals were consulted;
- which one was primary;
- what visible relationships transferred;
- which destination constraints required departures;
- which states and viewports were actually compared;
- any unresolved limitation.
