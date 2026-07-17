# Synthesis-map grader

Blind inputs: the prompt, `.omd/composition.md`'s Reference synthesis section, the
running build, desktop/mobile renders, `omd ref distance` output, `omd check --site`
output. Never the builder's rationale or decisions. Every non-absent verdict must cite a
visible screen observation (and interaction observation where the trait is interactive);
plan text, a claim, or a command result alone is never visible evidence.

## Frozen 25-point mapping

The synthesis score is exactly **25 integer points**: **5 extraction**, **10
multi-reference reflection**, and **10 integration**. Score every supplied user reference;
do not drop a difficult reference or renormalize for an absent one. With no supplied user
references, extraction and multi-reference reflection are both `0`.

For each reference and each applicable question below, record exactly one verdict:
`found = 2`, `partial = 1`, or `absent = 0` units. `found` requires the stated visible
evidence; `partial` has only some of it; `absent` has none. These are integer half-point
units, not subjective labels.

1. **Trait named at unit level?** The plan entry names a structural unit (navigation
   model, density rule, reading typography, filter interaction…) with a concrete
   observation — not "깔끔한 느낌" or a colour.
2. **Trait visibly present where planned?** Open the planned screen and verify the trait
   by looking and interacting. A trait present on a different screen is `partial`; a trait
   only in the plan text is `absent`.
3. **Adaptation real?** The trait is reshaped for this product's content (labels, nouns,
   data) rather than transplanted with the reference's proportions and silhouette.

Let `R` be the number of supplied references. For reference `r`, let `q1r`, `q2r`, and
`q3r` be its 0/1/2 verdict units. Use only integer/rational arithmetic:

- `extraction = floor(5 × Σr(q1r + q2r) / (4 × R))` when `R > 0`, otherwise `0`.
- `multi-reference reflection = floor(10 × Σr(q3r) / (2 × R))` when `R > 0`, otherwise
  `0`.

This exact aggregation gives every reference equal weight: `found/found` contributes four
extraction units, mixed evidence contributes its exact 0–3 units, and an absent reference
contributes zero. Do not average decimal scores, round fractions, or award unobserved
credit.

## Integration (10 points)

Score each integration question as `found = 2`, `partial = 1`, or `absent = 0` units:

4. **No clone**: `omd ref distance` must be **strictly `< 0.6`** for every reference, and
   no screen may read as a restyled screenshot of one reference. This matches CLI failure
   at `>= 0.6`; exactly `0.6` is `absent`, never a pass.
5. **One system**: tokens, type scale, and spacing agree across screens
   (`omd check --site` ladder/token drift clean); two references' grammars never collide
   unresolved on one screen.
6. **Declines are explicit**: any supplied reference not used carries a written decline
   reason in the plan; a silently ignored user reference is `absent`.

Let `i4`, `i5`, and `i6` be their 0/1/2 units. Compute
`integration = floor(10 × (i4 + i5 + i6) / 6)`. Floor each of extraction,
multi-reference reflection, and integration independently, then add them. Never round a
component, carry fractional remainders between components, or use floating-point arithmetic.
The final score is `extraction + multi-reference reflection + integration`, an integer in
`0..25`.

## Failure taxonomy (report which one when failing)

- colour-only mimicry — palette moved, structure default
- single-source clone — one reference dominates all units
- patchwork — references applied per-screen without conflict resolution
- name-drop — plan mentions references without visible correspondence
- surface-copy — decorative details moved, the referenced product's actual strength
  (interaction, IA) left behind
