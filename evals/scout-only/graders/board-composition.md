# Grader: Board Composition Contract

Check that the scout's reference board meets the minimum composition contract defined in the omd:scout agent spec.

## Pass criteria

- At least 18 captures are recorded in `.omd/refs/` (the scout's stated minimum; target is 25).
- Captures span at least three granularities:
  1. **Whole-page** feel captures (full-page IR or screenshot of the entire page)
  2. **Component-level** captures (a pricing card, a feature table, a CTA row — one component isolated)
  3. **Typography or motion** captures (a type specimen, a heading treatment, or a motion invariant reading)
- The board includes at least one capture from a curated/juried source (Awwwards Site of the Day, Godly, SiteInspire, GDWEB — look for these domain names or explicit attribution in the ref metadata).
- `.omd/board.md` (or equivalent board summary) exists and lists the captures with their signal scores.

## Fail criteria

- Fewer than 18 captures in `.omd/refs/`.
- All captures are the same granularity (all whole-page, or all component snippets).
- No capture from a curated source — the entire board came from undifferentiated search results.
- `.omd/board.md` is missing or empty.

## Why this matters

The board composition contract exists because a 5-reference board teaches the same lessons as a 1-reference board: the mean of a small sample. 18+ captures at mixed granularity is what turns "inspiration" into measurement.
