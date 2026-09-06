# Content Grain Protocol

Content Grain makes the shape of authorized first-party material a binding input to
composition. It does not invent asymmetry, infer user taste, or copy raw source content
into OMD state.

## Owner and artifact

- Owner: `omd-framer`
- Artifact: `.omd/content-grain.json`
- Schema: `content-grain-v1`
- Check: `omd grain check --json`

The owner may inspect only sources authorized by the current brief. The artifact stores
project-relative paths, hashes, IDs, bounded measurements, consequences, and falsifiers.
It never stores source payloads.

## Active Grain

Publish `status: active` only when the material has a stable contour that should affect
visible form:

- one to three consequential traits;
- exactly one typical fixture and at least one minimum, maximum, or protected outlier;
- at most one protected outlier;
- a concrete anti-template consequence and responsive consequence for every trait;
- a falsifier that browser evidence can test.

Content length, item count, aspect ratio, and semantic priority are allowed metrics.
Decorative adjectives and aesthetic scores are not.

## No stable Grain

Publish `status: no-stable-grain` when representative content is absent, genuinely
uniform, or fully constrained by explicit user/Figma authority. Give one bounded reason.
Do not manufacture irregularity to make the output appear bespoke.

## Downstream use

- Composer consumes the current Grain digest and expresses consequences through the
  existing composition contract and decision graph.
- Every Grain-backed decision includes
  `content-grain:<grain-sha256>:<trait-id>` as an evidence reference.
- Hand renders every declared trait/fixture pair at desktop `1280x900` and mobile
  `390x844`, then publishes normal browser observations before Content Fit.
- Eye receives trait falsifiers and current observation bindings, but not hidden
  rationale or raw first-party material.

Content Grain never chooses art-direction register, metaphor, references, motion, or
copy. It cannot replace final-v2, browser observations, or validated learning.

## Completion

An active Grain route cannot finalize until `.omd/content-fit.json` proves complete
desktop/mobile observation coverage and exact decision-token binding for every declared
trait/fixture pair. A skipped Grain route must not invent a Fit receipt.
