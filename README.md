# Oh My Design

Make the model earn its design decisions: question the brief, gather evidence, write real copy, compare structures, build once, inspect the render, and reframe.

[한국어](README.ko.md)

## What “design like a human” means

Here, “human” means accountable judgment. The goal is a design process, not a signature visual style.

Oh My Design (OMD) keeps the model from jumping straight from a request to polished UI. It asks what problem is being solved, records evidence, separates writing from layout, compares anonymous structures, and critiques rendered output without exposing the reviewer to the builder’s rationale. The result can be quiet, expressive, conventional, or strange. What stays consistent is the chain of decisions behind it.

The durable loop is:

```text
brief → evidence → copy → typography proof → composition contract → isolated structure → one production build
      → rendered critique and interaction evidence → reframe
```

OMD is built for Codex and Claude Code. It provides six user-facing skills, nine internal pipeline agents, a local CLI, design theory and recipe packs, and a project record under `.omd/`.

## Quick start

Requirements:

- Node.js 22.18 or newer
- Codex, Claude Code, or both, with its config directory already present

```bash
npm install -g oh-my-design
oh-my-design install
oh-my-design doctor
omd doctor
```

`oh-my-design doctor` verifies the host installation. `omd doctor` checks the runtime, Chromium availability, project write access, and the bundled theory pack.

The installer does not install Chromium. If `omd doctor` reports that Playwright is unavailable or its Chromium executable is missing, install what the report names, then run the check again. A typical global setup is:

```bash
npm install -g playwright
npx playwright install chromium
omd doctor
```

Run the main design skill from your host after both doctor commands pass. Host UIs expose skills differently; see [Skills and invocation](#skills-and-invocation).

## The human design loop

`omd-ultradesign` coordinates this order:

1. **Preflight** — pin the project directory, run `omd doctor`, inspect the repository, and route Figma briefs to `omd-figma`.
2. **Frame** — interrogate the brief and record the problem, reframe hypothesis, primary task, frequent action, and costliest error with cited evidence.
3. **Concept** — choose a generator, visual register, typography direction, and the intended memorable moment.
4. **Research** — collect measured references across the domain, competitors, audience language, components, typography, and relevant motion.
5. **Write copy** — a dedicated writer creates a fact-traceable copy deck before layout begins.
6. **Review copy blind** — a fresh reviewer sees the brief, copy, fact ledger, and voice evidence, but no render, code, layout, rationale, or authorship.
7. **Prove typography blind** — a typesetter renders layout-neutral actual-copy specimens at 1280x900 and 390x844; a fresh eye reviews them without page structure or rationale, then the typesetter revises and rerenders.
8. **Compose deliberately** — a fresh composer defines the experience spine, one dominant focal anchor, mass/rhythm, a lawful mechanism carrier or explicit alternate, responsive recomposition, and candidate axes. `omd composition --check` verifies input freshness.
9. **Diverge structurally** — isolated agents receive the same composition contract and render fixed desktop/mobile plus supplemental full-page continuity proofs for each candidate.
10. **Choose blind** — a fresh selector scores eight frozen 0–4 dimensions, rejects contract violations or any dimension below 2, and never equates a form above fold with CTA reach.
11. **Build once** — one selected structure becomes the production implementation. The builder does not generate another candidate set.
12. **Reflect while building** — the builder records a semantic checkpoint, re-proves type in the selected desktop/mobile containers, then records the visual checkpoint before optional motion.
13. **See the result** — desktop and mobile renders, squint views, applicable filmstrips, deterministic checks, and declared local probes supply the review evidence.
14. **Triage source candidates** — after production source exists, a read-only scan proposes narrow candidates. The coordinator resolves each through rendered context; candidate presence alone is not a failure.
15. **Critique, repair, and reframe** — a squint-only glance reports hierarchy first; a separate sharp reviewer judges craft and sanitized candidates, then repairs are rendered, checked, and rescanned.
16. **Ship** — project tests, build checks, applicable design gates, and unresolved findings are reported with their evidence.

Figma and explicit visual targets already supply structural decisions. The loop may skip structural divergence in those routes, but it records why.

## Evidence boundaries and artifacts

| Stage | Durable output | Boundary |
| --- | --- | --- |
| Frame | `.omd/frame.md` | Claims need a user sentence, research line, datum, or named observation. Internal OMD instructions are not evidence. |
| Research | `.omd/refs/*.json` | Builders receive measurements and principles, not screenshots to imitate. Scouting stops on decision/component coverage, independence, and source trust—not a universal capture count or gallery quota. |
| Copy | `.omd/copy-deck.md` | Each shipped factual claim points to a `verified` fact ID. `fixture` facts test density only; `open` facts cannot support shipped claims. |
| Blind copy review | review handoff | The reviewer cannot inspect renders, source, layout, frame, decisions, or authorship and does not edit the deck. The writer applies the review, then `omd copy --check` runs again. |
| Typography proof | `.omd/type-proof.md`; specimens in `.omd/.cache/type-proof/` | Actual target-language copy proves roles, source/licence, glyph coverage, requested/computed family and weight, axes, fallback/loading, wraps/clips, and rejected alternatives at both viewports. Browser evidence does not identify the physical font used for each glyph. |
| Composition contract | `.omd/composition.md` | A clean-room composer receives sanitized evidence and defines a focal anchor, CTA path, mechanism carrier/alternate, and responsive relationships without requiring a photo or form above fold. Exact hashes make stale inputs fail. |
| Structural sketches | `.omd/.cache/sketches/<id>/` | Each candidate supplies fixed 1280x900 and 390x844 acceptance renders plus full-page desktop/mobile continuity evidence. Full-page captures inform dependency/rhythm only. |
| Blind choice | `.omd/taste/preferences.jsonl` | The selector sees anonymous renders and sanitized task context, not candidate rationale or authorship. `omd choose` stores the selected candidate and its reason as an agent choice. |
| Production build | repository source | One builder implements one selected structure and preserves the copy deck. Separate `omd decision` entries record implementation reasons in `.omd/decisions.md`; they are not candidate-choice records. |
| Production evidence | `.omd/attribution.md` | The builder records the sources behind shipped tokens, motion, composition, and graphics. |
| Craft checkpoints | `.omd/craft.jsonl` | One semantic and one visual checkpoint each record an observation and the concrete change it caused. |
| Source-candidate triage | raw JSON in `.omd/.cache/`; reasoning in `.omd/decisions.md` | `omd slop scan` exposes controlled signals without source excerpts. `needs-render` is transitional; final untriaged and needs-render counts are both zero. Confirmed current candidates are repaired/rescanned, dismissals have evidence, and rendered IR wins on overlap. |
| Rendered review | cache renders, filmstrip, probe output | The squint reviewer sees only squint renders. The sharp reviewer receives sanitized task context plus measured outputs, never the builder’s rationale. |
| Reframe | `.omd/frame.md` revision | `omd frame reframe` appends what the render revealed instead of erasing the original framing. |
| Final source seal | `.omd/source-seal.json` | `omd source --seal` records final copy/type/composition and sorted production-source hashes; `--check` proves byte freshness only, not semantic fidelity. |

Human approval checkpoints are separate from craft checkpoints. Projects default to `checkpoint: none`; concept, structure, or both can be enabled in `.omd/config.json`.

## Stack routing

Every builder follows the same precedence:

```text
explicit user request
  > existing repository stack and toolchain
  > React + Vite + TypeScript for a truly blank greenfield
```

Existing vanilla HTML is an existing stack. An unrecognized package or toolchain is investigated and preserved. It is not treated as an empty repository. Plain HTML for a new greenfield project is used only when the user explicitly asks for it.

Greenfield scaffold dependencies are allowed. Existing projects should not receive unnecessary dependencies.

`omd design` discovers repository evidence and creates `.omd/design.md` only when the file is absent. If the file already exists, it preserves the file and prints an evidence and validation summary.

## Skills and invocation

These are the six user-facing skills:

| Canonical name | Use it for |
| --- | --- |
| `omd-ultradesign` | Run the complete human design loop for a page, app, dashboard, blog, landing page, or redesign. |
| `omd-figma` | Pull a Figma file, synthesize its system, implement frames, compare responsive pairs, and report measured fidelity. |
| `omd-scout` | Build a standalone measured reference board without designing or implementing. It closes consequential coverage gaps and reports uncertainty instead of filling quotas. |
| `omd-critique` | Review an existing design without changing it; group deterministic findings by root cause and judge rendered craft. |
| `omd-humanize` | Preserve facts while locally repairing sound discourse or reconstructing a misshapen message from verified facts, voice, and surface action. |
| `omd-coach` | Read accumulated check history, identify recurring problems and trends, and suggest what to practise next. It does not read taste records. |

Canonical source and direct-install names use the `omd-*` prefix. Codex displays these skills as `(omd) <skill>` in its UI, for example `(omd) ultradesign`.

The verified installer copies the canonical skills directly into each detected host. Select them by the name shown by that host; slash-command presentation is host-dependent. Marketplace manifests also ship. In the Claude marketplace flavor, plugin references use the `oh-my-design:<skill>` namespace. Marketplace end-to-end behavior is not claimed to be identical to the verified direct-install path.

## Internal pipeline agents

These nine agents are implementation details of the design loop, not public commands:

| Agent | Responsibility | Write boundary |
| --- | --- | --- |
| `omd-framer` | Questions the brief and records an evidence-backed frame. | Read-only; records through the frame CLI. |
| `omd-scout` | Researches measured evidence for pipeline coverage. | Read-only; records through reference CLI commands. |
| `omd-writer` | Writes or repairs the copy deck and fact ledger. | Only `.omd/copy-deck.md`. |
| `omd-typesetter` | Builds and revises the pre-structure actual-copy typography proof. | `.omd/type-proof.md` and `.omd/.cache/type-proof/`. |
| `omd-composer` | Converts sanitized evidence into the fresh composition contract before divergence. | Only `.omd/composition.md`. |
| `omd-sketch` | Produces one isolated grayscale structural candidate with real copy. | Only its cache candidate directory. |
| `omd-hand` | Builds the selected structure and records two craft checkpoints. | Production repository and declared OMD records. |
| `omd-glance` | Reports hierarchy from squint renders only. | No writes. |
| `omd-eye` | Selects anonymous structures, reviews copy or typography proof blind, or critiques sharp renders. | No writes. |

Agents do not pin a concrete model; they inherit the model selected for the session. Their `high` and `medium` reasoning fields communicate intent.

Claude Code can enforce declared denied tools in agent metadata. Codex agent files do not have an equivalent tool-restriction field, so read-only limits are prompt contracts there rather than a hard sandbox. OMD does not describe those contracts as filesystem isolation.

## Verification stack

OMD combines deterministic checks with rendered review:

| Layer | Commands and evidence |
| --- | --- |
| Copy, composition, source, and design contracts | `omd copy --check` validates deck structure and fact references. `omd composition --check` validates composition sections and input freshness. `omd source --seal/--check` validates final approved-input/source bytes without claiming semantic fidelity. `omd design --check` validates design-contract coverage. |
| Typography proof | Layout-neutral desktop/mobile specimens run before sketches; selected-container reproof runs after semantic structure and before the visual checkpoint. Copy, font/file, weight/axis, or container-width changes invalidate the proof. |
| Render evidence | `omd render` captures the exact viewport by default; `--full-page` is supplementary continuity evidence. `--squint` isolates hierarchy with grayscale and blur, and `--filmstrip` captures load-time frames. Squint is not a timed first-impression simulator. |
| Interaction | `omd probe` executes only a declared, safe local plan and reports expectation or tab-order failures. |
| Source candidates | `omd slop scan [root] [--json]` reads supported production source without writing it. Candidates require contextual triage; they are not `omd check` warnings, scores, or authorship claims. |
| Design lint | `omd check` evaluates `system`, `a11y`, `slop`, `motion`, and `ux` conditions. Contrast and hit-area rules are errors; slop and the other quality-floor rules are warnings where authored that way. |
| Site consistency | `omd check --site <dir>` or multi-page positional checks report cross-page ladder and token drift. |
| Reference distance | `omd ref distance <page>` compares measured invariants against saved references and helps catch overly close results. |
| Figma fidelity | `omd figma pull`, `system`, and `diff` connect a Figma snapshot to a measured implementation report. |
| Visual target | `omd target set <image-path-or-url> --as <name>` and `omd target diff` run a bounded image comparison against a registered PNG target. A URL must be a direct HTTP(S) image URL, not an arbitrary web page. |

`omd figma pull` requires a Figma personal access token:

```bash
export FIGMA_TOKEN=...
```

`omd doctor` reports a missing `FIGMA_TOKEN` as optional and still passes that check. Figma pull remains unavailable until the token is set.

Slop findings are warnings and a quality floor. They do not prove that a design was generated by AI. A written overrule records workflow intent, but it does not suppress a finding or change the command status. Any `omd check` findings cause the command to exit with status 1, which makes it usable in CI.

Source candidates are a separate evidence stream. Their presence exits successfully; only an operational scan failure is nonzero. Before ship, however, neither untriaged nor needs-render items may remain. Raw candidate JSON stays ephemeral, while confirmed repairs and evidence-backed dismissals are recorded durably. The protocol was conceptually informed by [`yetone/kill-ai-slop`](https://github.com/yetone/kill-ai-slop), accessed 2026-07-13; because no explicit upstream licence was present, OMD independently authors its implementation, language, examples, identifiers, and review flow rather than copying upstream material.

Rendered critique remains necessary: a rule engine cannot safely judge optical balance, composition rhythm, typography craft, or whether the memorable moment belongs to the concept.

## Interaction applicability

The copy deck declares exactly one interaction scope:

| Scope | Required evidence |
| --- | --- |
| `stateful` | Primary and recovery copy, `.omd/probes/primary.json`, and `.omd/probes/recovery.json`. Both probes run. |
| `navigation-only` | Primary copy and the primary probe. Recovery copy and recovery probe are `N/A` with concrete reasons. |
| `static` | Primary copy. Recovery copy and both probes are `N/A` with concrete reasons. |

Loading, empty, error, success, disabled, offline, and recovery states are designed only when the surface can reach them. The harness does not add fake states to satisfy a checklist. Reviewers make interaction claims only from supplied probe evidence.

Probe plans can use declared click, fill, and keypress steps with explicit expectations. They are limited to local files and localhost or loopback URLs, reject authenticated or credentialed flows, and reject remote, destructive, or undeclared actions. OMD never discovers controls and clicks them automatically.

## Project state

Durable, reviewable records live directly under `.omd/`:

- `frame.md`, `copy-deck.md`, `type-proof.md`, `composition.md`, `source-seal.json`, `design.md`, `decisions.md`
- `attribution.md`, `motion-spec.md`, `craft.jsonl`, `config.json`
- `refs/*.json`, declared `probes/*.json`, `taste/preferences.jsonl`, and `history.jsonl`

Generated IR, renders, filmstrips, sketch candidates, probe results, and scratch output live under `.omd/.cache/`. Deleting the cache should not erase design intent.

A completed single-page `omd check` appends a record to `.omd/history.jsonl` only when `--no-log` is absent. Site and multi-page checks do not append history.

`oh-my-design uninstall` removes installed OMD files and config changes while preserving the project’s `.omd/` directory.

## Installation modes

The direct installer is the supported, regression-tested path:

| Host | Direct installation |
| --- | --- |
| Claude Code | Copies skills to `~/.claude/skills` and agents to `~/.claude/agents`, patches `settings.json` permissions, and removes the legacy OMD `PreToolUse` hook. |
| Codex | Copies the versioned plugin cache, direct skills, and agent TOML files under `~/.codex`, then patches `config.toml`. Doctor reports Codex hook trust as unverified rather than claiming it was confirmed. |

Use `--host claude` or `--host codex` to limit install, doctor, or uninstall to one detected host:

```bash
oh-my-design install --host codex
oh-my-design doctor --host codex
oh-my-design uninstall --host codex
```

Repository manifests are emitted for Claude and Codex marketplace packaging. They are shipped artifacts, but this README does not claim marketplace parity with the direct installer.

## CLI reference

This is a compact map of `node bin/omd.ts --help`:

```text
omd ir <page> [-o file]
omd render <page> -o shot.png [--viewport WxH]
omd render <page> --full-page -o long.png [--viewport WxH]
omd render <page> --squint -o shot.png
omd render <page> --filmstrip -o filmstrip.html [--viewport WxH]
omd probe <page> [--plan path] [--json] [--out path]
omd check [<page>|--ir file] [--json] [--category slop] [--no-log]
omd check --site <dir>
omd check <page1> <page2> ...
omd slop scan [root] [--json]
omd coach
omd composition --check [--json]
omd source --seal [root]
omd source --check [root] [--json]

omd frame show
omd frame set --problem P --reframe R --why EVIDENCE [--task T --frequent-action A --costliest-error E]
omd frame reframe --to "..." --because "..."
omd frame generator --set "metaphor"
omd choose c1 c2 --chose c2 --why "..."
omd decision "what" --why "why"
omd taste record "subject" --kind selection|praise|rejection|overrule --evidence "verbatim" --from-user
omd taste profile [--all]
omd config set checkpoint none|concept|structure|both
omd config show
omd craft checkpoint semantic|visual --render path --observed "..." --changed "..."
omd craft status [--json]

omd ref add <url|file> --as <component> [--selector "css"] [--image] [--blueprint]
omd ref list
omd ref distance <page>
omd ref principles <source> --as <component> --add "..."
omd ref show <source> --as <component>

omd design
omd design --check
omd copy --check [--json]
omd pack dir
omd pack list
omd pack <relpath>
omd doctor

omd figma pull <file-url>
omd figma system
omd figma diff <frame-id> <page-or-url>
omd target set <image-path-or-url> --as <name>
omd target list
omd target diff <page> [--target <name>] [--viewport WxH] [--threshold N] [--json]
```

## Architecture and contributing

Prompt source of truth:

- `src/agents/*.agent.yaml`
- `src/skills/omd-*/SKILL.md`

Generated outputs:

- `agents/`
- `skills/`
- `dist/`

Do not edit generated outputs directly. The build regenerates them for direct hosts and plugin packaging.

These paths are edited directly: `core/`, `bin/`, `adapters/`, `test/`, `evals/`, `scripts/`, `README.md`, `README.ko.md`, and the theory and recipe packs under `core/`.

Before submitting a change:

```bash
npm test
npx tsc --noEmit
npm run build
```

New linter rules must remain narrow, include positive and negative tests, and always use warning severity.

## Limits and trust

- The prompts define a disciplined workflow; they do not guarantee strong design without real project evidence, usable copy, rendered inspection, and project-specific validation.
- Probes are for local, non-authenticated, non-destructive paths. They are not a general browser automation layer.
- The copy validator checks required structure, interaction applicability, unresolved sentinels, and explicit fact references. Human review owns prose quality and factual verification.
- Reference distance, lint, and image diff are measurements. They inform judgment rather than replace it.
- Marketplace manifests are available, while the direct installer is the path covered by install-to-doctor regression tests.

Licensed under the [MIT License](LICENSE).
