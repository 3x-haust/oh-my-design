# Task 14 protocol review

Reviewed the source-of-truth protocol and prompt surfaces only. No generated `agents/`,
`skills/`, `dist/`, or browser/runtime product files were edited by this task.

## Canonical route

`core/protocol/reference-assembly.md` is the single reference-work authority. Its ordered,
single-owner stages are:

1. `brief blocks` — `omd-framer`
2. `fragment inventory` — `omd-scout`
3. `brick analysis` — `omd-scout`
4. `candidate assemblies` — `omd-scout`
5. `selected assembly` — coordinator
6. `clean-room composite` — coordinator
7. `production usage ledger` — `omd-hand`
8. `final provenance report` — finalizer

The review checked that the protocol requires browser-rs before the only permitted fallback
(`omd render`/`omd probe` after an observed initialization or capability failure), keeps
candidate selection in chat via exact `omd ref candidates` Markdown, forbids board UI/HTML/PNG
and `omd-board`, and records a user choice or disclosed agent choice through `omd ref select`.

It also checked that raw records, URLs, provenance, screenshots, capture paths, pixels, and visual
likeness remain outside downstream inputs. The production gate requires a complete validated usage
ledger and `generateReferenceReport(root)`'s exact Korean-first bilingual Markdown.

## Acyclic composite review

The capable-host order is now explicitly executable and acyclic:

`selected assembly -> coordinator derives permitted-input prompts -> 2–3 concurrent clean-room drafts -> coordinator chooses one -> record/check generated lineage -> composer -> sketches/eye -> hand`

The coordinator/host derives prompts from only the hash-bound selected sanitized assembly, its
sanitized principles/blueprints, and permitted project-owned brief/frame/concept, copy, type,
register, palette/material, and local-decision inputs. It does not read `.omd/composition.md` or
request composer prompt/art-direction output. It records the chosen draft decision, then calls
`recordReferenceCompositeLineage(root, input)` and `checkReferenceCompositeLineage(root)` before
composer starts.

The unavailable route also closes before composition:

`selected assembly -> coordinator records/checks unavailable lineage -> composer CSS/SVG path -> sketches/eye -> hand`

Composer has no edge back into either route. On a generated route it consumes the selected sanitized
assembly plus the coordinator-chosen, lineage-attested draft; on an unavailable route it consumes the
checked unavailable lineage and CSS/SVG path. Eye and hand are downstream of that same checked state.

## Prompt-surface review

The source prompts `src/agents/{framer,scout,composer,eye,hand}.agent.yaml` and
`src/skills/{omd-scout,omd-ultradesign,omd-figma}/SKILL.md` reference the canonical protocol
instead of defining competing flows. The Figma bypass is explicitly not treated as a substitute
external reference assembly.

`core/theory/imagegen.md`, the human-design loop, the coordinator skill, and downstream prompts
now agree on Generate (coordinator) -> Analyze/Feed (composer after checked lineage); no prompt
surface makes composer supply directions required to create the draft it consumes.
