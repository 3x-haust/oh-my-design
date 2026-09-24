# AGENTS.md — working on oh-my-design with Codex (GPT-5.6)

This file governs how the Codex / GPT-5.6 path contributes to this repository. `CLAUDE.md`
covers the Claude Code path; both share the repository conventions at the bottom.

## Model ownership: the user chooses the model and any invocation override

The concrete model selected for the host session is user-owned configuration. OMD never replaces
it for a child agent unless the user supplies an explicit role override on that Codex host
invocation. This applies equally to Codex and Claude Code, to every pipeline role, and to ad-hoc
workers spawned during the run.

- **Codex:** omit `model` from every `spawn_agent` call. Official brokered roles also omit a model
  unless the user supplied that role's host-only `--omd-role-model` option on this invocation.
- **Claude Code:** agent metadata declares `model: inherit`; never request Opus, Sonnet, Haiku, or
  any concrete model in a spawn.
- **Both hosts:** source-owned defaults set only the role's reasoning/effort tier. Judgment-heavy
  roles use `high`; the production hand uses `medium`. A user may override a Codex role's effort
  for one host invocation with `--omd-role-effort`.
- A recommendation, benchmark, role name, or belief that another model would perform better is
  never authority to override the user's selection. Without an explicit host override, a Luna
  session keeps Luna for every OMD child and a Sol session keeps Sol.

The pipeline's agent source files carry only the effort tier. The Codex adapter normally emits
`model_reasoning_effort` and no `model`; the Claude adapter emits `model: inherit` plus `effort`.
Codex role overrides are valid only when the user places `--omd-role-model role=model` or
`--omd-role-effort role=low|medium|high` on the outer `omd-codex exec` command. The host strips
those options before coordinator launch, binds them to that invocation, and applies them inside
the broker. A coordinator, role task, or installed agent profile must not invent an override.

## Adaptive design and evidence ownership

- Host wrappers preserve each role's declared publication method. Direct writes apply only to
  explicitly owned, directly editable paths and never replace a required CLI publisher. Complete
  current evaluator lineage belongs in the public input skeleton and the source-free judgment
  packet; transport repairs do not authorize reconstructed judgments or weaker evidence checks.
- Acquisition `requiredState` describes an inspectable reference component state, not the
  destination's promised behavior. Keep destination outcomes in requirements and falsifiers.
  Framer repairs a misframed plan; Scout never relabels an observation to pass exact state binding.
- Sparse reference pages are not automatically blocked pages. A successful HTTP response with a
  measured, visible, nonempty scoped component may resolve the short-body heuristic; document-root
  selectors, empty/hidden content, HTTP 403/server errors, and challenge titles do not gain an exemption.
- Reference viewport families and state-preserving capture follow `core/protocol/reference-assembly.md`.
  Retain complementary observations without inflating independent evidence; a probe metric never
  substitutes for the state visible in the saved capture.
- The outcome, risk, uncertainty, and available evidence select the route. Optional stages and
  methods require either selection or a written skip; the full capability catalog is not a
  universal sequence.
- Concept exploration records its candidate count and evidence-based reason before generation.
  Distinct concepts need different content-to-form relationships and macro composition, not different
  brand colours. Anchor and background counts follow content. An unshipped image draft can still be
  useful decision material; asset shipping restrictions do not by themselves justify skipping it.
  Select feasible concepts for rendered task fit and craft; use cost only for an explicit budget
  constraint or a tie between equivalent candidates. `core/theory/imagegen.md` owns the procedure.
- Native Codex provisional HTML studies use the optional `omd-study` helper, not a replacement
  production owner or approval stage. `core/theory/imagegen.md#provisional-source-studies` owns
  its input, directory grant, pre-generation decision, render, and downstream-use contract.
- `new-product` and `new-marketing` are distinct reference-discovery needs. Greenfield product work
  can require a task-flow benchmark; a marketing launch does not impersonate a product workflow.
- A prompt-only greenfield marketing brief that demands a product difference but supplies no
  verified capability or mechanism stops before art direction and production. Category references
  identify missing facts; they do not become destination capabilities.
- Benchmark product evaluation begins from the current task outcome, evidence claims, frame-owned
  selector-free entry contract, and sanitized task-flow projection. `omd lifecycle plan` derives
  fixed evaluator selectors and exact assertions; callers cannot substitute a different manifest.
- Entry contracts support both prerequisite → gated-action flows and prerequisite → observable-
  consequence flows. A next action is required only when the task actually has one. The work object
  must begin at the entry viewport with its purpose and representative anchor visible; a legitimate
  long mobile work object may continue below the fold.
- Real browser actions and fixed desktop/mobile captures prove behavior and entry fitness. Visual
  quality remains an isolated proxy review unless the human-calibration protocol has real blind
  designer and target-user ratings.
- Locale-grounded design keeps conversation language, surface locale, explicit market region,
  audience/task, domain, surface, desired fit, and brand invariants separate in the sole writable
  `.omd/locale-design-context.json`. A locale or likely script may select mechanics; it never infers
  cultural fit, register, or country aesthetic. Missing market/audience authority yields one question.
  A Korean-language user brief may default reference discovery to Korean services in both lanes;
  that research preference does not populate locale-design authority or dictate visual style.
- `mechanics-only` proves real target-language type without a cultural-fit claim. `research` binds
  current standard, global-equivalent or unavailable, native first-party, and counterexample source
  receipts into a content-addressed profile. Composer, Hand, and Eye receive only the source-free
  projection. `omd locale profile-check` re-hashes current type/source records and re-fetches remote
  sources; a changed context, proof, receipt, source, or projection fails closed.
- A global equivalent must serve the same named task/category; a same-owner homepage is insufficient.
  Recorded unavailability limits confidence and never contributes to `supported`/`shared` convergence.
- `supported` and `shared` profile mechanisms may transfer. `contested` needs a downstream decision;
  `unknown` adds no design rule. Profile compliance is evidence-grounded adaptation, not native
  cultural correctness; only blind ratings from the named target audience may support that claim.

## Three-layer enforcement

Mandatory design workflow rules use `core/protocol/three-layer-enforcement.md`: declaration,
stage/owner procedure, and an executable refusal boundary. Keep all three connected when changing
a rule. `brief` is inspection; `brief --check` is stage entry, and `guard completion` is terminal
acceptance. Regression tests must cover both a refused violation (with no source mutation) and
an authorized success. Do not turn advisory visual warnings or explicitly skipped stages into
universal hard errors. `CLAUDE.md` links to this same contributor contract.

## Repository conventions

- **Source of truth is `src/`.** `src/agents/*.agent.yaml` and `src/skills/omd-*/SKILL.md`
  are the prompt originals. Root `agents/`, `skills/`, and `dist/` are generated by
  `npm run build` — never edit them directly.
- **Edited directly:** `core/`, `bin/`, `adapters/`, `test/`, `evals/`, `scripts/`,
  `README.md`, `README.ko.md`, `.github/`, and the theory/recipe packs under `core/`.
- **`.omd/` is the design record**, committed with the repo. `.omc/` is local session state
  and is gitignored.
- **New linter rules stay narrow.** Every pattern gets a positive AND a negative test; a
  tell that cannot be made safe goes to the prompt layer with the reason recorded in-file.
  Rules warn, never error — a deliberate choice can overrule one with a written reason.
- **Commits use conventional prefixes** (`feat:`, `fix:`, `docs:`, `chore:`). Do not add
  AI attribution footers to commit messages.
- **Branch → PR → squash-merge.** Every change lands on a feature branch and merges through
  a PR; `main` is protected (one approval; the admin, 3x-haust, may bypass).
- **Merge continuously, release on request only.** Feature branches merge to `main` as
  they finish — do not cut a version for every feature. A release happens **only when the
  user explicitly asks** for one. Work accumulates on `main` between releases.
- **Releasing (when asked):** bump all three manifests with `scripts/bump.ts`, merge the
  bump to `main`, and the release workflow tags and publishes structured notes
  automatically.
- **Definition of done for any change:** `npm test` 0 fail, `npx tsc --noEmit` clean,
  `npm run build` succeeds.
