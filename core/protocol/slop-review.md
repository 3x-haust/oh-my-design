# Source-candidate review protocol

`omd slop scan` is a read-only attention aid for production source. It reports narrow source
compounds that deserve a person looking at the rendered result. A candidate is not a defect,
warning, severity, score, authorship judgment, or `omd check` violation. It never enters check
history or coach data.

## Provenance and use

This protocol was informed conceptually by the public
[`yetone/kill-ai-slop`](https://github.com/yetone/kill-ai-slop) repository, accessed
2026-07-13. The upstream repository exposed no explicit licence at the time of access. OMD
therefore uses it only as research direction: no upstream code, wording, example copy,
assets, catalogue, identifiers, or catalogue ordering is reproduced here. OMD's scanner,
candidate families, language, data contract, and review flow are independently authored.

## Fixed source boundary

The MVP reads `.html`, `.css`, `.scss`, `.js`, `.jsx`, `.ts`, and `.tsx`. It does not parse
Markdown, Vue, or Svelte and does not interpret `.gitignore`. It skips symlinks; hidden
directories; files over 512 KiB; NUL/binary or invalid UTF-8 files; lockfiles and minified
files; dependencies, build output, coverage, framework output, vendor content, Git and OMD
state; generated root `agents/` and `skills/`; and test, fixture, and snapshot trees. This is
a fixed safety and ownership policy, not a claim that skipped files are clean.

JSON contains only the schema version, resolved root, number of files read, and sorted
candidates. Each candidate supplies a controlled id and signal tokens, relative path, line,
review question, reason, and owner. It never includes the source line or an excerpt. Finding
candidates exits successfully; unreadable or invalid roots are operational failures.

## Triage loop

### Executable closure

The read-only scan below remains useful for early attention. Completion now requires a native loop:

1. `omd schema slop-scope` supplies the local production/build entries and viewport inventory.
   Use a built SPA HTML entry, not an unrelated localhost port. Cover the final entry/viewports.
   Replay each final SPA/modal/error state with `state: {name,startRoute,route,actions,assertions}`;
   the schema command describes bounded click/fill/select/press actions and visible/hidden assertions.
   Reproduce keyboard modality too: the native final evaluator begins with a Tab focus check;
   `{kind:press,selector:body,value:Tab}` before its actions reproduces that focus-visible state.
   Never remove focus styling to make two screenshots match. Native final captures preserve the actual
   post-action path, query and hash rather than relabeling every state as the entry URL.
   Every local view uses a fresh read-only context: external networking and non-GET/HEAD requests
   are refused. Use bundled local fixtures; this is not a transaction test against production APIs.
2. `omd slop checkpoint --input .omd/.cache/slop-scope.json --json` captures those entries, runs the
   source scanner and existing rendered slop linter, and returns `reviewInput` and the checkpoint path.
   Open the checkpoint's `views[].image` files. Source candidates and render warnings remain distinct.
3. Fill the returned reviewInput: summary and every finding's `confirmed|dismissed`, individual
   rendered reason and actual viewIds. `omd slop review-set --input <review.json>` preserves it.
   The initial template is deliberately incomplete, never an approval to bulk-confirm or dismiss.
4. Confirmed findings require owner repair, rebuild, another same-scope checkpoint, then explicit
   after-render resolutions for the previous confirmed IDs. Judge every new finding as well.
   A disappeared pattern is not automatically a successful repair; the reviewer checks the new image.
5. `omd slop review-check --json` must pass. CLI final-v2 finalization (including lifecycle finalize)
   and terminal completion preflight require this loop against the trusted final entry/viewports.
   Final state coverage also compares the actual viewport pixels with the authenticated final
   capture, not just an authored state label. Use the same deterministic data/state for both captures;
   time-dependent or animated differences require a settled recapture, not a label or pixel waiver.
   Source/build/scanner changes, unreviewed findings, missing captures, no-change repairs or unresolved
   confirmed issues fail closure. An initial clean render needs no fabricated repair round.
   Current adaptive graphs bind the trusted final entry/viewports. Legacy graphs without that identity
   still require the closed loop, whole-source fingerprint and desktop/mobile views, but report only
   `whole-source-and-declared-views`; they cannot claim exact-final-entry scope binding.

The immutable native-signed loop is stored in `.omd/slop/`, not inferred from `history.jsonl`.
Rehashing an edited scope or image cannot replace the signed capture. Old unsigned checkpoints
need recapture; signatures establish native publication, not independent review or an OS sandbox.
Dismissed candidates
remain visible with reasons; warnings never become universal errors. Review authorship is not
attested and structural closure is not proof of beauty. Design-only handoff does not require an app
loop and must not claim application/slop validation. Do not run production checkpoint for that route.

Once production source exists, the coordinator runs:

```bash
omd slop scan <root> --json > .omd/.cache/slop-source.json
```

The raw report is disposable evidence under `.omd/.cache/`. The coordinator assigns each
candidate exactly one status:

- `confirmed`: the rendered result shows a contextual problem;
- `dismissed`: the treatment is deliberate and evidence explains why it serves this work;
- `needs-render`: the candidate cannot yet be judged from the available sharp render.

`needs-render` is transitional: obtain the relevant sharp render and resolve it to confirmed
or dismissed before ship. Candidate presence is still non-gating, but the final gate requires
both `untriaged = 0` and `needs-render = 0`, not `candidates = 0`. Confirmed current
candidates are repaired and rescanned; dismissals require concise evidence. Durable accepted
or dismissed reasoning belongs in `.omd/decisions.md`; do not promote raw JSON into durable
state.

The order is: source scan, coordinator triage, blind sharp judgment, owner repair, then
rerender, `omd check`, and source rescan. The rescan must happen after the repair. Source
candidates and rendered IR warnings remain separate records and are never added together or
double-counted. Where the two overlap, rendered IR is authoritative because it describes the
result a user can actually see.

## Blind review and ownership

The general eye receives only a sanitized candidate id, controlled signals, and review
question beside the relevant sharp render. It does not receive source path, source excerpt,
authorship, implementation rationale, or prior decision. The eye judges the visible outcome;
it does not classify who or what wrote it.

Visual and source repairs belong to `omd-hand`. Copy diagnosis may use `omd-humanize` and a
fresh copy eye, but only `omd-writer` may modify `.omd/copy-deck.md`. After a copy finding,
the writer repairs the deck, `omd copy --check` passes, and the hand synchronizes production
source before rerender/check/rescan. A changed claim, action, or shipped copy invalidates the
affected blind copy review and typography proof under the existing copy and type contracts;
rerun those gates instead of carrying an obsolete approval.
