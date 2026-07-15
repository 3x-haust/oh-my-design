# Synthesis-map grader

Blind inputs: the prompt, `.omd/composition.md`'s Reference synthesis section, the
running build, desktop/mobile renders, `omd ref distance` output, `omd check --site`
output. Never the builder's rationale or decisions.

Walk one question per user reference, then three integration questions. Every verdict
cites a visible observation.

## Per reference (each reference scored found / partial / absent)

1. **Trait named at unit level?** The plan entry names a structural unit (navigation
   model, density rule, reading typography, filter interaction…) with a concrete
   observation — not "깔끔한 느낌" or a colour.
2. **Trait visibly present where planned?** Open the screen the plan names and verify
   the trait by looking and interacting. A trait present on a different screen than
   planned is `partial`; a trait only in the plan text is `absent`.
3. **Adaptation real?** The trait is reshaped for this product's content (labels, nouns,
   data) rather than transplanted with the reference's proportions and silhouette.

## Integration

4. **No clone**: `omd ref distance` to every reference ≤ 0.6, and no screen reads as a
   restyled screenshot of one reference.
5. **One system**: tokens, type scale, and spacing agree across screens
   (`omd check --site` ladder/token drift clean); two references' grammars never collide
   unresolved on one screen.
6. **Declines are explicit**: any supplied reference not used carries a written decline
   reason in the plan; a silently ignored user reference fails this grader.

## Failure taxonomy (report which one when failing)

- colour-only mimicry — palette moved, structure default
- single-source clone — one reference dominates all units
- patchwork — references applied per-screen without conflict resolution
- name-drop — plan mentions references without visible correspondence
- surface-copy — decorative details moved, the referenced product's actual strength
  (interaction, IA) left behind
