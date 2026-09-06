# Selected-reference fidelity manual QA

## CLI pass

Command:

```text
node /Users/lyu/01_Project/01_Projects/OhMyDesign/bin/omd.ts ref distance /Users/lyu/01_Project/01_Projects/OhMyDesign/test/fixtures/reference-fidelity/pass.html --selected --gate --json --viewport 1440x900
```

Result: exit `0`, `verdict:"pass"`, selected slot `hero-card`, target selector
`[data-omd="shop-hero"]`, similarity `1`.

Captured output: `pass.json`.

## CLI fail

Command:

```text
node /Users/lyu/01_Project/01_Projects/OhMyDesign/bin/omd.ts ref distance /Users/lyu/01_Project/01_Projects/OhMyDesign/test/fixtures/reference-fidelity/fail.html --selected --gate --json --viewport 1440x900
```

Result: exit `1`, `verdict:"fail"`, selected slot `hero-card`, target selector
`[data-omd="shop-hero"]`, similarity `0.04565324760684078`.

Captured output: `fail.json`.

## Persisted receipt

The pass scenario was rerun after the failing scenario. The canonical persisted receipt is
captured as `current-receipt.json`; it has `verdict:"pass"` and remains bound to the current
selection, usage, build, candidate, route, viewport, source selector, and target selector.

## Finalization enforcement

Command:

```text
node --test --import tsx --test-name-pattern='selected reference distance gates new art-selected publication' test/final-evidence-v2.test.ts
```

Result: exit `0`; the scenario proves that passing current evidence finalizes, while missing,
failed, stale-selection, wrong-target, and wrong-slot receipts are rejected before the final
pointer is written.
