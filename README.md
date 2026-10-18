# Oh My Design

[![CI](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml/badge.svg)](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%403xhaust%2Foh-my-design)](https://www.npmjs.com/package/@3xhaust/oh-my-design)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**AI that designs like a human.** Give OMD one complete request. The selected model inspects the
project, researches useful references, chooses a direction, builds, renders, repairs, and verifies
the result through one model-led workflow.

[한국어](README.ko.md)

## One entry

Use `/ultradesign` for every design task. It preserves the original request, the user's selected
model, the existing stack, and the authorized write scope.

| Entry | Use it for |
| --- | --- |
| `/ultradesign` (`omd-ultradesign`) | A new product; an existing-project feature, redesign, or fix; a Figma target; user-supplied images or URLs; reference research; implementation; critique; and verified completion. |

OMD ships one internal reviewer:

| Agent | Purpose | Access |
| --- | --- | --- |
| `omd-eye` | Independent packet-bound visual, fidelity, outcome, or text review | Read-only |

## Model-led default

The ordinary path is direct and evidence-led:

1. Inspect the request, repository, stack, routes, components, content, and current renders.
2. Validate and classify `route-input` for existing/bounded work or `product-route-input` for a new product.
3. Use `omd stage next --json` to obtain the current model-led action.
4. Research task-fit references when they can change a consequential decision.
5. Run `omd guard production --json`, then implement within the declared scope.
6. Render and inspect desktop, mobile, long content, and requested interaction states.
7. Run `omd first-render check --page <entry> --json`; repair observed defects.
8. Author one outcome-bound trusted lifecycle manifest from the real controls.
9. Finish with `omd lifecycle finish --json`, which runs package checks, browser evaluation,
   independent review, source sealing, and final publication.

Unselected methods require no role relay, candidate tournament, skip document, or intermediate
design artifact. Behavior, access, safety, source ownership, evidence honesty, and independent
review remain mandatory.

## References and Figma

External originals are comparison material, not product assets or approval. Preserve whole images,
record exactly one request-scoped primary original with `omd ref context`, and compare the actual
desktop/mobile result against its composition, hierarchy, density, typography, and control craft.
For hover, focus, pressed, or open references, use safe prepared capture and bind the matching
product state with `captureState`. Submission, authentication, payment, download, destructive, and
navigation actions are refused.

A Figma `/file/` or `/design/` URL in the request is the implementation target. Use:

```bash
omd figma pull <file-url>
omd figma system
omd figma diff <frame-id> <page-or-url> --json
omd figma review <frame-id> --json
```

Completion requires a current snapshot, a dimension-matched frame diff at or above the 90% safety
floor, and a current isolated fidelity review with verdict `match`. Apply the reviewer's concrete
region fixes instead of optimizing the similarity percentage blindly. Figma-targeted work does not
also require a consulted-primary record.

## Install

### npm

```bash
npm install -g @3xhaust/oh-my-design
oh-my-design install
oh-my-design doctor
omd doctor
```

The unscoped `oh-my-design` package on npm is unrelated. `oh-my-design uninstall` reverses host
installation without deleting a project's `.omd/` records.

### Pi-compatible hosts

```bash
pi install npm:@3xhaust/oh-my-design
```

Pi and compatible forks load the same extension and canonical skill through the public extension
API. The extension registers `/omd` for project health and `omd_cli` for structured CLI calls.

### Claude Code marketplace

```text
/plugin marketplace add 3x-haust/oh-my-design
/plugin install oh-my-design@omd
```

Then run `/ultradesign`.

### From source

```bash
git clone https://github.com/3x-haust/oh-my-design
cd oh-my-design
npm install
node bin/omd-install.ts install
node bin/omd.ts doctor
```

## Browser support

OMD prefers its verified `browser-rs` provider on supported Darwin arm64 and Linux x64 hosts.
Playwright + Chromium is the deterministic fallback used by rendering, measurement, probing, and
browser evaluation. If `omd doctor` reports Chromium missing:

```bash
npx playwright install chromium
omd doctor
```

## Public CLI

The CLI surface is intentionally smaller than the historical structured workflow.

| Group | Public commands |
| --- | --- |
| Entry and health | `--version`, `help`, `doctor`, `usage` |
| Workflow and validation | `lifecycle`, `route`, `schema`, `stage`, `guard`, `first-render`, `check` |
| References and design input | `ref`, `language`, `feedback`, `locale`, `ai-judgment`, `figma`, `target`, `pack` |
| Rendering and evidence | `render`, `probe`, `measure`, `lighthouse`, `browser` |
| Quality and learning | `slop`, `coach`, `learn` |
| Utilities | `hash` |

Retained workflow subcommands:

```text
omd lifecycle help|verify|finish
omd route starter|validate|classify|show|check
omd schema list | omd schema <allowlisted-name>
omd stage next
omd guard production|completion
omd first-render check|review
```

Reference subcommands:

```text
browse, tidy, context, navigate, control-observe, cookie-control,
discover-plan, discover-batch, work-next, advance, exclude,
research-set, research-check, search, leads,
direction-review, add, add-batch, list, show, principles, audit, import-image
```

Run `omd help` for the complete dispatcher-backed grammar.

## Evidence boundaries

- Browser actions prove only what they execute and capture.
- Deterministic checks cover their named rules; they do not certify visual quality.
- `omd-eye` supplies isolated model judgment, not human approval or human ratings.
- Figma diffs and reference comparisons prove current pixel relationships, not usability.
- External action, account, payment, and destructive permissions remain separate.
- Completion is valid only when current source, browser evidence, independent review, and terminal
  publication agree on the same request and build.

The `.omd/` directory stores the durable route, reference context, Figma records, browser receipts,
observations, review lineage, source seal, and final evidence. Reproducible scratch stays under
`.omd/.cache/`.

## Architecture

Prompt source of truth:

- `src/skills/omd-ultradesign/SKILL.md`
- `src/agents/eye.agent.yaml`

Generated outputs - do not edit directly:

- `skills/`
- `agents/`
- `dist/`

`npm run build` regenerates them and copies the internal `core/guides/*.md` pack used by
`omd pack`.

## Development

Definition of done for a repository change:

```bash
npx tsc --noEmit
npm run build
npm test
```

Commits use conventional prefixes. Releases and version bumps happen only on explicit request.
