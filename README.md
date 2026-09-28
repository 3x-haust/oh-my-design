<div align="center">

# Oh My Design

**AI that designs like a human: research the real world, choose a direction, build it, then look at what the browser actually shows.**

[![CI](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml/badge.svg)](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%403xhaust%2Foh-my-design)](https://www.npmjs.com/package/@3xhaust/oh-my-design)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Get started](#get-started-in-30-seconds) · [How it works](#how-it-works) · [한국어](README.ko.md)

</div>

## See it in action

<!-- OWNER TODO: Replace this slot with a real, approved OMD demo GIF or before/after screenshots. Do not use eval fixture images as product demos. -->
> **Demo visual coming soon.** Until then, [view a landing page made with OMD from a one-shot prompt](https://3x-haust.github.io/oh-my-design/). The visual output was not hand-tuned.

## Get started in 30 seconds

**Pi** (or a host implementing the public Pi extension/package API):

```bash
pi install npm:@3xhaust/oh-my-design
```

Open a project in Pi and run `/omd` to check the setup; ask the agent to use `omd-ultradesign` for a design task. Compatible forks use their own package-install command with the same npm package.

**Codex or Claude Code** (Node.js 22.19+ and npm):

```bash
npm install -g @3xhaust/oh-my-design
oh-my-design install --host codex   # use --host claude for Claude Code
oh-my-design doctor --host codex    # use --host claude for Claude Code
```

Open a session in the chosen host and run `/ultradesign`. For Claude Code, the [plugin marketplace](.claude-plugin/marketplace.json) is another option: `/plugin marketplace add 3x-haust/oh-my-design`, then `/plugin install oh-my-design@omd`. Install the **scoped** npm package; the unscoped `oh-my-design` is unrelated. Browser checks need Chromium; if `omd doctor` reports it missing, run `npx playwright install chromium` and check again.

## Why it's different

Most agents can generate a screen. OMD makes the *decisions behind the screen* inspectable:

- **Real reference research, not a mood-board prompt.** Domain and visual references have separate evidence trails. Selected ideas become transferable principles, not copied screenshots or source pixels. [Reference protocol](core/protocol/reference-assembly.md)
- **Direction before production.** OMD frames the task, explores concepts and representative renders, then builds the selected direction. The route is adaptive: work that does not apply is skipped with a reason. [Design practice](core/protocol/design-practice.md)
- **Browser-verified output.** Desktop/mobile renders, local interaction probes, and independent review surface problems that source code alone cannot reveal. Checks measure behavior and evidence; they do **not** certify human-level design quality. [Visual measurement](core/protocol/visual-measurement.md)
- **An anti-AI-slop loop.** Copy, typography, hierarchy, and generic patterns receive separate scrutiny; confirmed issues are repaired and inspected again on the rendered result. Warnings are candidates for judgment, not an AI-authorship detector. [Slop review](core/protocol/slop-review.md)

<!-- TODO after fix/reference-research merges: update reference-research claims only after checking the merged implementation. -->

## How it works

```text
Your brief → frame the task → research & explore directions → choose
           → build → render & probe in a browser → critique → repair or reframe
```

This is a decision loop, **not** a promise that every project runs every step. The project keeps reviewable decisions and evidence in `.omd/`; temporary renders live in `.omd/.cache/`. [Full workflow](core/protocol/human-design-loop.md)

## What you get

| Capability | What it does |
| --- | --- |
| `omd-ultradesign` | Coordinates a design-and-implementation task from framing to rendered review. |
| `omd-figma` | Implements against a Figma source and measures fidelity. |
| `omd-scout` | Collects reference evidence and proposes component-level directions without building. |
| `omd-critique` | Reviews an existing design without editing it. |
| `omd-humanize` | Repairs copy while preserving verified facts. |
| `omd-coach` | Uses check history to suggest what to practise next. |
| `omd` CLI | Runs local doctor, reference, render, probe, and design checks. |

The skill sources live in [`src/skills/`](src/skills/); the design contracts and implementation details live in [`core/protocol/`](core/protocol/).

## Supported hosts

| Host | Installation | Entry point |
| --- | --- | --- |
| Pi | `pi install npm:@3xhaust/oh-my-design` | `/omd` for setup; `omd-ultradesign` skill for work |
| Pi-compatible hosts | Host's package installer, same npm package | Public Pi extension API; host-specific APIs are not required |
| Codex | Global npm package + `oh-my-design install --host codex` | `/ultradesign` |
| Claude Code | Global npm package + `oh-my-design install --host claude`, or plugin marketplace | `/ultradesign` |

## FAQ

**Do I need a browser?** Yes, for rendered checks. OMD uses Playwright + Chromium for deterministic rendering and probes; on supported platforms a healthy browser-rs provider is preferred for interactive browser work. Run `omd doctor` if a browser check fails.

**Does it copy reference sites?** No. It records what was observed and what to transfer or avoid; production receives a source-isolated design direction. A public reference is not permission to reuse its pixels. [Reference protocol](core/protocol/reference-assembly.md)

**Will it guarantee a great design?** No. Checks and browser evidence make decisions reviewable, but visual quality still needs contextual human judgment.

**Can I use it on an existing project?** Yes. OMD inspects the current stack and existing design rather than replacing them with a fixed scaffold. [Workflow](core/protocol/human-design-loop.md)

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, test tiers, and the PR workflow. Issues and focused pull requests are welcome. Licensed under [MIT](LICENSE).
