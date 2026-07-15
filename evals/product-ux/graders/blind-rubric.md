# Product-UX blind rubric (100 points)

The grader receives: the scenario prompt (with its Core user tasks), the running build,
desktop/mobile renders, state renders, check/probe outputs — never the builder's
rationale, decisions, or authorship. Every deduction cites an observation ("필터 적용
여부를 확인할 수 없어 시스템 피드백 감점"), never a taste adjective. Walk the Core user
tasks in order in a real browser before scoring anything.

## UX quality — 60

- **Core task completion (15)** — every Core user task completes end-to-end; count the
  steps; a blocked task caps this at 5; unnecessary screens/clicks deduct.
- **Information architecture & navigation (10)** — grouping matches the user's nouns;
  current location visible; related info and actions adjacent.
- **Discoverability & visual hierarchy (10)** — the frequent action is visually singular
  and reachable in the first viewport; screen purpose readable in 3 seconds; decorative
  elements never outrank task elements.
- **Interaction & system feedback (10)** — every action acknowledges within 400ms;
  loading distinguishable; success/failure explicit; saved/unsaved state visible.
- **Error prevention & recovery (5)** — costliest error guarded AND undoable; validation
  errors name the fix; entered values survive failure.
- **Mobile & responsive (5)** — Core tasks complete at 390px; thumb-reach primary action;
  no keyboard-covered CTA; 320px reflow without horizontal scroll.
- **Baseline accessibility (5)** — keyboard path through the primary task; visible focus;
  labeled fields; 44px touch targets; contrast at working sizes.

## Reference synthesis — 25 (only when the scenario supplies user references)

- **Concrete trait extraction (5)** — the contract's Reference synthesis section names
  per-reference traits at the unit level (IA, nav, density, interactions, states, type,
  spacing) — not colours and mood.
- **Multiple references actually reflected (10)** — at least two references have traits
  visibly present in the build where the plan said they land; one-reference cloning or
  name-dropping scores 0-3; `omd ref distance` above 0.6 to any single reference caps
  this at 3.
- **Coherent integration (10)** — the traits read as one product: one token system, no
  colliding grammars between screens (`omd check --site` drift clean), conflicts resolved
  per the plan rather than screen-by-screen patchwork.

## Visual craft — 15

- **Typography, spacing, consistency (5)** — one scale, one spacing system, aligned
  edges; working-density type on work surfaces.
- **Purpose-fit aesthetic (5)** — the register matches the surface: quiet chrome and loud
  data on tools; persuasion scale only on marketing surfaces.
- **Non-template finish (5)** — the surface reads as designed for this product: no hero
  band on a work surface, no equal-weight card mosaic where data has structure, no stock
  gradient decoration; slop scan clean or overruled with reasons.

## Automatic floors

- A hero band / display-scale marketing headline claiming the first viewport of a work
  surface: Discoverability scores at most 3 and Purpose-fit at most 2.
- Any Core user task that cannot be completed: total UX section at most 30.
- A reachable state (loading, empty, filtered-to-zero, error, success) that the scenario
  exercises but the build leaves undesigned: Interaction & feedback at most 5.
