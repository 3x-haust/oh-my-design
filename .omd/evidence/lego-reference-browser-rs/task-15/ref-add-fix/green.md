# GREEN — packed installed reference capture

The same command shape as RED was rerun after the wrapper change: an offline `npm pack` tarball was installed into a new consumer, and the installed `omd ref add` ran on `fixture.html` with `--selector .card --no-energy`.

Observed terminal result:

```text
slop findings: 0
status=0
referenceSaved=true
```

The command created the expected scoped record `fixture.card.json`. No `ReferenceError`, helper error, or zero-exit stderr exception appeared.

Focused verification also passed:

```text
3 deterministic serialization cases passed
1 offline packed-install CLI regression passed, including real Chromium selector capture
```

The final Task 15 installed workflow added one fresh scoped capture: the `.card` record
contained its expected radius and four padding values, while all five deliberately distinct
off-selector geometry values were absent from both captured evidence and assembly transfer.
