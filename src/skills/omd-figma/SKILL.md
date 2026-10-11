---
name: omd-figma
description: Implement an already chosen Figma target faithfully while verifying unrepresented behavior, states and responsive gaps.
---

# Figma

The supplied frames already choose their represented visual properties. Do not invent another concept tournament or silently correct the user's design. Frame the full requested surfaces, behavior/accessibility and missing responsive/state coverage; absence in Figma is a gap, not approval.

Run omd doctor. Check only whether FIGMA_TOKEN is configured, never print it or read a secret into output. If missing, request private local configuration of a read-only File content token; do not invent a workaround. Use `omd figma pull <figma-url>` and `omd figma system`, inspect the actual snapshot, component variants and responsive pairing. Reuse only needed components, not a speculative library.

Hand implements within the current route. For each supplied frame/view run `omd figma diff <frame-id> <rendered-page> --json`; repair observed mismatch and re-diff. Missing paired viewports require truthful interpolation and real render checks, not a claimed Figma match. Finite attempts or a fidelity exception do not turn a failed diff into PASS. The same unresolved defect after three failed repairs needs escalation.

Keep snapshot/attribution separate from external reference assembly. If independent research was requested, use its own current browse/analysis contract. Report original-design advisories without silently changing target properties; implementation defects remain repairs. Task/access/safety obligations still apply.

Finish with current native measured/rendered evidence, independent review and guard completion under the applicable host contract. Report per-frame/view fidelity, responsive gaps, attribution and exact limitations. Design-only requests end at their handoff and make no implemented-behavior claim.
