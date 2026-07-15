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
