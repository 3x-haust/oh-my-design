# Native Pi implementation completion

## Model-led default

Ordinary native Pi implementation uses the host-authenticated model-led process. The model chooses
research, methods, candidate count, and bounded delegation. It writes scoped source only after
production readiness. Unselected methods require no document or written skip.

Use `omd_cli` in the actual Pi session. The host binds the original request, selected provider/model,
process identity, route, and project root. Never replace this with another host's activation or an
invented local authority.

## Preparation

1. Inspect the actual project scripts, source root, build output, and browser entry.
2. Use `route-input` for existing/bounded work or `product-route-input` for a new product.
3. Validate and classify the route without changing its request or scope.
4. Run `omd stage next --json`.
5. Record one consulted primary original with `omd ref context` when visual reference work applies.
   A copy-only route or valid Figma target is exempt.
6. Run `omd guard production --json` before source mutation.

The guard never guesses a build path or expands write authority. A late route correction invalidates
dependent evidence and must be replayed honestly.

## First usable build

Build the requested product within the declared paths. Preserve the existing stack unless the user
explicitly authorizes a replacement. Inspect the complete desktop/mobile result, long content, and
requested states.

Run:

```text
omd first-render check --page <built file, e.g. dist/index.html — not the preview URL> --json
```

The host captures fixed desktop/mobile pixels and launches one isolated early Eye. `revise` returns
localized repair criteria. `reframe` means the content-to-form relationship is wrong and requires a
new governing composition, not a cosmetic patch. The early review is not final evidence or human
approval.

## Trusted browser proposal

Author one `trusted-lifecycle-manifest` from the real controls and actual visible consequences.
Cover every current `mustHave`, `mustNotHave`, and `completionEvidence` outcome exactly once.

Supported actions:

- `click(selector)`
- `fill(selector, value)`
- `press(selector, key)` using the schema's closed key set
- `hover(selector)`
- `focus(selector)`
- final `press-start(selector)`, released after capture
- `reload`

Use `captureState` for a stable component identity and one of `default`, `hover`, `focus`,
`pressed`, or `open`. Use element-state assertions for hovered, focused, focus-visible, pressed, or
expanded. A state label without actual action and captured pixels is not evidence.

## Figma targets

A `figma.com/file/...` or `figma.com/design/...` URL in the request makes that file the target.
Completion requires:

1. a current `.omd/figma/snapshot.json` for the linked file;
2. current authorized export and render PNGs;
3. a persisted diff record for every compared frame;
4. passing current scores.

Use `omd figma pull`, `omd figma system`, and `omd figma diff`. Figma-targeted work is exempt from
the consulted-primary requirement, but not from browser, package, review, or final publication gates.

## Finish

Run:

```text
omd lifecycle finish --json
```

The command:

1. verifies applicable package actions;
2. checks first-render currentness;
3. executes the trusted browser plan at desktop and mobile;
4. preserves actual execution receipts and observation lineage;
5. seals current source;
6. launches isolated blind, fidelity, and protocol review as required by policy;
7. publishes measured final evidence;
8. checks terminal completion.

`executionStatus: pass` means the authored assertions executed. It does not by itself mean the
original requirement is semantically accepted. Protocol review compares each requirement with its
actual actions, assertions, and captures.

Failed evidence is repair input. Preserve it, change the cause, then rerun. Do not weaken the
request, replace a failed result with prose, or repeatedly submit unchanged inputs.

## Verification helper

For package verification inside the bound project, use:

```text
omd lifecycle verify install|ci|build|typecheck|test|lint --json
```

This runs only the closed action names and reports actual output and exit status. It is not a
generic shell or completion approval.
