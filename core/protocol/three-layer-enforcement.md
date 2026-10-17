# Three-layer enforcement

OMD applies mandatory rules through three connected layers:

1. **Declaration** - the request, route, scope, permissions, and evidence requirements say what
   must remain true.
2. **Procedure** - the model-led workflow names the command and evidence-producing action that
   establishes the rule.
3. **Executable refusal** - a validator rejects missing, stale, malformed, or contradictory
   evidence before source mutation or completion.

Advisory visual findings and unselected methods do not become universal hard errors. Selected
contracts, user scope, source ownership, consent, behavior, access, safety, and independent review
remain binding.

## Layer 1 - declaration

Ordinary native Pi work uses the signed `model-led-design-process-v1`. The model chooses useful
methods and bounded delegation. It does not need to publish a role relay, candidate tournament,
written skip, or intermediate design document for an unselected method.

The durable authority chain is:

```text
original request
  -> validated and classified route
  -> current model-led work pointer
  -> production readiness
  -> real browser evidence
  -> isolated review
  -> source seal and final evidence
```

Important declarations:

- Preserve the complete request and user-selected model.
- Use `route-input` for existing/bounded work and `product-route-input` for a new product.
- Keep all production writes inside the route's allowed paths.
- Require one request-scoped consulted primary original for model-led visual work, except a typed
  copy-only route or a structurally valid Figma target.
- Bind referenced hover, focus, pressed, and open states to matching product `captureState` evidence.
- Treat browser assertion execution as execution evidence, not semantic outcome acceptance.
- Treat isolated model review as a proxy judgment, not human approval or human ratings.
- Keep account, payment, destructive, download, and other external-action permission separate.

## Layer 2 - procedure

### Route and current action

1. Inspect the actual project and request.
2. Run `omd route validate --input <route-input.json> --json`.
3. Publish the same repaired input with `omd route classify`.
4. Run `omd stage next --json` after classification and after owned output changes.

`stage next` reports the current model-led action. It does not itself prove production readiness or
completion.

### Production entry

Run `omd guard production --json` before source work. The guard checks current route authority,
scope, required visual context, and any selected hard prerequisite. A failed guard must not mutate
application source.

### First-render review

After the first usable build, run:

```text
omd first-render check --page <actual-build-entry> --json
```

This captures fixed desktop/mobile evidence and launches the isolated early reviewer. Repair
`revise` findings in the same scope. A `reframe` finding changes the governing design relationship,
not merely a token or icon.

### Browser and terminal completion

Author one `trusted-lifecycle-manifest` from the real controls. Every required outcome appears
exactly once. Actions may include click, fill, bounded key press, hover, focus, final press-start,
and reload. State comparisons use `captureState`.

Finish through:

```text
omd lifecycle finish --json
```

It owns package verification, first-render currentness, browser evaluation, source sealing,
independent visual/fidelity/outcome review, final publication, and terminal acceptance. Changed
inputs may be repaired and rerun; an unchanged failed attempt is not progress.

## Layer 3 - automatic refusal

The implementation refuses:

- an unclassified or stale route;
- production paths outside declared scope;
- missing consulted-primary context when no exemption applies;
- missing or stale Figma snapshot/diff proof for a linked Figma target;
- unsafe reference preparation actions;
- incomplete lifecycle outcome coverage;
- browser evidence that no longer matches source, plan, state, or capture bytes;
- missing desktop/mobile product state for a primary consulted interaction state;
- incomplete or non-passing consulted-reference comparison rows;
- missing package verification, source seal, independent review, or final evidence;
- a success claim while `omd guard completion --json` reports a blocker.

Regression tests for a mandatory rule cover both a refused violation with no source mutation and an
authorized success. Transport repair never authorizes reconstructed judgments or weaker evidence.
