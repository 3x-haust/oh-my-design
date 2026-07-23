# Slop pattern intake routine

The slop taxonomy is a snapshot of the machine-default aesthetic at the time each rule was written.
That aesthetic is not static: it drifts on a roughly 6–12 month cycle as models, tools, and imitation
move the average. A rule that sharply caught a 2024 tell can, by 2026, catch a deliberate choice
instead — and a new default (yesterday's departure become this year's cliché) can appear that no rule
sees. `slop.yaml`'s discipline is "widen only with a case"; this routine is how a case is gathered,
turned into a rule, and — just as importantly — how a stale rule is retired. Aesthetics move both ways,
so the taxonomy must too.

This is a maintenance routine, not a shipped feature. It runs on the repository, not on a user's run.

## Cadence

Quarterly. A drift cycle is months, not weeks, so a scan more often than quarterly mostly re-reads the
same field; less often than yearly lets the taxonomy fall behind the current default.

## Sources to scan

Each source is read for *the current common pattern*, not for a rule to copy verbatim:

- **Slop/AI-aesthetic critique** — Maggie Appleton and design-writing on "AI slop", the "AI-SaaS landing"
  critiques, and running community catalogues of the generated look.
- **Model-vendor cookbooks and system cards** — the Anthropic cookbook, OpenAI/others' design-adjacent
  guidance — because the patterns they encourage become the next common default.
- **Vibe-coding / no-design communities** — r/vibecoding and similar, where the unaugmented model default
  ships unedited and the current tells are most visible.
- **Award commentary** — Awwwards / FWA / GDWEB jury notes and design-Twitter on "this now reads as
  templated" — the leading edge of what has become average.
- The repository's own `theory/expressive.md` § "The AI-SaaS landing tells" and the
  `# the machine-default aesthetic, measured` section of `slop.yaml`, updated as the field moves.

## The evidence bar — a "case"

A candidate rule (new or a widening) ships only with a documented case:

1. **The pattern** — one sentence naming the convergence, and which family it belongs to (visual
   convergence-to-the-mean, or prose no native owner would write).
2. **A real positive** — at least one concrete generated example that exhibits it, with a note on why a
   fluent reader/designer clocks it as machine-made.
3. **A false-positive analysis** — the deliberate, legitimate uses that look similar and must NOT fire,
   written as negative test cases. A rule with no defensible negatives is too broad to ship.
4. **The lever** — whether it is machine-detectable from the IR/source (a `slop.yaml`/`core/slop` rule)
   or a judgment call (eye/theory guidance). Not every tell is a machine rule.

No case, no rule. A hand-picked threshold with no positive it was written to catch is exactly the
brittleness `slop.yaml`'s header warns against.

## Retirement

A rule is retired with the same rigor. A pattern that has diffused so far it is now unremarkable, or one
whose false-positive rate on deliberate work now exceeds its catch rate, is a stale rule. Record the
case for retirement — the drift that made it noise — and remove it with its tests, rather than leaving a
rule that punishes a choice that is no longer a tell.

## Flow

Scan (quarterly) → for each candidate, write the case above → draft the rule with positive **and**
negative prompt-contract/rules tests (repo convention) → open a PR that carries the case in its
description → review and merge. A candidate without tests, or without the false-positive analysis, is
sent back, not merged.

## Candidate template

```md
### Candidate: <SLOP-ID or eye-guidance name>
- Family: visual convergence | prose (no native owner)
- Pattern: <one sentence>
- Positive: <a real generated example + why it reads as machine-made>
- Must-not-fire (negatives): <deliberate legitimate uses that look similar>
- Lever: machine rule (IR/source) | eye/theory guidance
- Source(s): <where the current pattern was observed>
```
