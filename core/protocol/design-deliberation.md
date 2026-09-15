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
omd schema acquisition-plan
omd acquisition set --input .omd/.cache/acquisition-plan.json
```

Legacy `reference-acquisition-plan-v1` remains readable. New work uses the closed
`reference-acquisition-plan-v2` with `owner: "omd-framer"`, a current locale-context hash or explicit
no-market null, and decision/axis/state/viewport/falsifier fields per zone; `kind` is `section`, `region`,
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
`rejected` covers every other alternative with a bounded reason. An explicit current-user register lock
is binding input, not a new fork requiring invented alternatives. Evidence uses durable artifact,
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
lane. The three perspectives plus moderator bind the complete supplied register comparison and selected register:
two or three distinct supported registers, or one matching a current explicit user register lock.
This is separate from upstream concept-study count; same-register concepts are compared visibly before
choosing their canonical representative. A motion-only lock does not authorize a singleton.
Before a fresh evaluator judges, run `omd art-direction check-input --input <alternatives.json> --json`.
This read-only preparation validates the selected board and handoff, then fills the current route,
sorted unique task IDs, board/pre-selection/handoff/intent hashes and canonical alternatives digest
in both evaluator skeletons. The derived metadata contains no source identity; supplied alternatives
must already be sanitized and are copied unchanged, not certified as a valid comparison. Without an intent pointer it previews
the publisher's canonical empty no-lock ledger; it neither records a user instruction nor writes
an intent. A stale existing ledger or handoff fails instead of falling back. Pass this exact lineage,
the complete alternatives and source-free rendered comparison to the evaluator. Scores, rationales,
winner and motion dispositions remain unfilled evaluator-owned judgments, not a prepared verdict.
Preserve the evaluator's returned assessment and result without semantic changes. The current
host-issued invocation authorizes their canonical JSON payload bytes during `omd art-direction check`;
`check-input` does not issue a receipt, and the evaluator does not need to invent a separate receipt
or append a user-intent event before it can judge. A generic role result is not publication authority.
The moderator-authored deliberation record and evaluator payloads are separate from host authority.
Use the explicit `--activation` or inherited host activation path for publication; that path is
authoritative when present and does not fall back to an inline invocation on failure. Legacy inline
invocation input applies only when no activation path is provided.
Before publication, the coordinator assigns a non-empty set of stable `B-<number>` IDs to the
actual evidenced content regions. These IDs identify content, not a prescribed layout or invented
facts; use the smallest set that covers the selected design. An empty set cannot support the
downstream copy and rendered-Beat contracts. Deliver the selected IDs and exception receipt using
the exact copy-safe field syntax in `protocol/copy-deck.md`; Writer never authors missing direction IDs.
`omd art-direction check` publishes through the current host-issued invocation and persists the
immutable direction and downstream handoffs. The command does not issue
its own authority. Missing host publication authority blocks this publication path; a session without
the launcher receipt must not substitute a handwritten direction or claim a local authority fallback.

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
