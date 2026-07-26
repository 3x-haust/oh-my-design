# Design deliberation protocol

OMD does not request, store, or grade hidden chain-of-thought. It externalizes only bounded design
decisions another role can verify: the question, real alternatives, selected answer, cited evidence,
constraints, rejected options, downstream effects, tested trade-offs, and rendered outcome.

## Adaptive depth

Before artifact-producing work, the coordinator writes `.omd/depth.json` as a closed
`design-depth-input-v1` and runs `omd depth classify --input .omd/depth.json`. Classification is by
design risk, never convenience or desired speed:

- **L1** — an existing component change: frame check → hand → render observation → eye.
- **L2** — one section: frame → targeted scout → composition → hand → render observation → eye.
- **L3** — a new page/surface, three or more composition zones, a new primary CTA, new information
  architecture, or multi-screen state: the full owner-separated loop.
- **L4** — a costly-error flow, brand-direction creation/change, showpiece motion, WebGL, or a
  multi-surface system: L3 plus independent design deliberation.

Depth may omit inapplicable stages but never transfers their artifacts to the coordinator. A small
route still spawns the owner of every stage it retains. A landing page with a new art direction is
L4 even if it is one route; "single page" is scope, not low risk.

## Reference acquisition plan

Domain-brief `surfaces` are pages/screens. They cannot represent the hero, process explanation,
proof, installation path, CTA, navigation, work region, error state, or recovery state inside one
surface. After framing, `omd-framer` persists `.omd/acquisition-plan.json` through:

```text
omd acquisition set --zones '<JSON array of {id,kind,job,required}>'
```

The closed `reference-acquisition-plan-v1` uses `owner: "omd-framer"`; `kind` is `section`, `region`,
or `state`. The scout binds a component-scoped capture to every required zone with `--slot <zone>`.
The final assembly coverage must contain exactly those required IDs. A zone may be revised, but it
is revised explicitly in the acquisition plan before composition, never silently dropped because no
reference was found.

## Decision graph

`.omd/decision-graph.json` is `decision-graph-v1`. It is a shared, mechanically merged ledger of
owner-authored entries. The coordinator may preserve and merge returned JSON entries byte-for-byte;
it must not invent a question, alternative, selection, evidence item, rejection, or trade-off.
Ownership is enforced by stage:

| Stage | Entry owner |
|---|---|
| frame | `omd-framer` |
| copy | `omd-writer` |
| type | `omd-typesetter` |
| composition | `omd-composer` |
| structure | selecting `omd-eye` |
| production / refinement | `omd-hand` |

Every consequential decision has at least two genuine alternatives. `selected` names one;
`rejected` covers every other alternative with a bounded reason. Evidence uses durable artifact,
reference, check, probe, or render paths — "looks better", "modern", and internal instructions are
not evidence. High/critical decisions record at least one complete constraint trade-off:

```text
goal → constraint → attempted form → observed failure evidence → compromise → result evidence
```

## L4 independent deliberation

For each high-impact fork, spawn three fresh `omd-eye` agents concurrently with identical sanitized
input bytes and no candidate authorship or other perspective output:

1. **UX perspective** — first action, task reach, comprehension, mobile and recovery cost.
2. **Art-direction perspective** — hierarchy, specificity, synthesis, signature departure.
3. **Production perspective** — feasibility, accessibility, performance, no-JS, reduced motion,
   responsive and state risk.

Then spawn a fourth fresh `omd-eye` as moderator. It receives only the three completed perspective
records, the decision alternatives, and the same sanitized input digest. It does not vote by
majority: it resolves objections against evidence and constraints, returns one selection plus
conditions, and authors the `design-deliberation-v1` record. All three perspective `inputSha256`
values must match. The eye is intentionally read-only. The coordinator copies only its returned JSON,
without a Markdown fence or semantic edit, to a cache input and runs
`omd deliberate preserve --input <cache-moderator.json>`. That command validates the moderator owner,
rejects conflicting reuse of an ID, and persists the exact bytes under
`.omd/deliberations/<id>.json`; clerical preservation does not transfer authorship to the coordinator.

The moderator receives and returns this exact closed key shape; replace angle-bracket strings with
the bounded values from its prompt, add no keys, and return JSON only:

```json
{
  "schema": "design-deliberation-v1",
  "id": "<kebab-case-deliberation-id>",
  "decisionId": "<existing-kebab-case-decision-id>",
  "trigger": "<specific high-impact fork>",
  "moderator": "omd-eye",
  "perspectives": {
    "ux": {
      "inputSha256": "<same-64-lowercase-hex>",
      "position": "<plain-string-position>",
      "evidence": ["<bounded-evidence-reference>"],
      "objections": [],
      "conditions": []
    },
    "artDirection": {
      "inputSha256": "<same-64-lowercase-hex>",
      "position": "<plain-string-position>",
      "evidence": ["<bounded-evidence-reference>"],
      "objections": [],
      "conditions": []
    },
    "production": {
      "inputSha256": "<same-64-lowercase-hex>",
      "position": "<plain-string-position>",
      "evidence": ["<bounded-evidence-reference>"],
      "objections": [],
      "conditions": []
    }
  },
  "resolution": {
    "selected": "<alternative-id>",
    "rationale": "<evidence-and-constraint-based-resolution>",
    "conditions": ["<binding-condition>"]
  }
}
```

`position` is one non-empty string, not an object. Each perspective uses the key `evidence`, not
`evidenceReferences`. There is no top-level `inputSha256`, perspective `lens`, or other metadata.
The coordinator must paste this literal contract into every moderator task rather than asking the
eye to infer it from prose.
For the pre-composition art-direction decision, a host-issued invocation remains the publication
lane. In an ordinary Codex or Claude session without that launcher receipt, the same three
perspectives plus moderator bind the exact three register alternatives and selected register.
`omd art-direction local-check` accepts only that moderator-owned receipt, derives write authority
inside the running CLI, and persists the immutable direction and downstream handoffs. It grants no
v2 publication authority. Missing host publication authority therefore limits the final evidence
marker; it does not make the design/build loop unusable or authorize a handwritten direction.

## Visual observation

`omd-hand` owns `.omd/observations/*.json`. Each `visual-observation-v1` is one measured loop:

```text
before render → observable fact → judgment → exact change → distinct after render → measured result
```

An observation names one metric: position, size, line count, contrast, visibility, motion, or flow.
Generic prose such as "hierarchy improved" is invalid. Before and after evidence paths must differ.
RED means the observed failure remains; GREEN means the after-render observation demonstrates the
condition now holds. Source inspection alone is not visual observation.

## Assembly coverage

`omd-hand` owns `.omd/assembly-coverage.json` (`assembly-coverage-v1`). Every required acquisition
zone binds this complete chain:

```text
zone job → captured reference identity → extracted principle → composition decision ID
→ production selector → final fidelity evidence
```

A reference without a production destination is unused research. A production zone without a
reference is invention from training priors. A selector without final fidelity evidence is an
unverified claim. `omd deliberate check` joins the acquisition plan, decision graph, deliberations,
observations, and assembly coverage; isolated files passing separately do not complete the run.

## Comparative evaluation

OMD effectiveness is measured with `design-comparison-v1`, exactly four anonymous variants:
baseline coding agent, strong single design prompt, OMD adaptive, and OMD L4 deliberation. All use
the same concrete model and identical prompt bytes; every score is blind. `omd compare score`
reports quality and quality per cost from hierarchy, originality, composition, typography,
interaction, production, task success, accessibility, mobile, and no-JS evidence. A model change or
non-blind score invalidates the comparison rather than manufacturing an uplift claim.
