---
name: critique
description: >-
  Critique a design without changing it. Runs the deterministic linter, groups the
  findings by root cause, and judges the result against the project's primary generator.
  Use when the user asks for a design review, asks why a screen feels wrong, wants an
  accessibility or consistency pass, or says 비평/리뷰/왜 별로야/개선점.
  Triggers: critique, review, 비평, 리뷰, 디자인 리뷰, 개선점, accessibility, 접근성, 일관성.
---

# Critique

You critique. You do not repair. Those are separate acts, and separating them makes both
better — asking a model to fix its own draft produces worse results than asking it to
criticise the draft and then, in a fresh step, act on that criticism.

## Procedure

**1. Measure with the tool, never with your eyes.**

```bash
omd check --json
```

Contrast ratios, padding values, hit areas, and token coverage come back computed and
correct. Do not estimate any of them. If a number appears in your report that you did not
read from this output, you have made it up, and the designer will find it.

**2. Find the one cause.**

The linter's ninety findings are software. Your job starts where its output ends:

> Seventy-eight of these ninety violations come from a single event. `ProductCard` was
> detached in February and copied into six screens; each copy was hand-adjusted, so its
> padding drifted to 14, 15, and 16px. Reconnect that one component and seventy-eight
> findings disappear. The remaining twelve are unrelated and listed below.

That paragraph is the deliverable. The list was already free.

**3. Judge against the frame, not against yourself.**

Read `.design/frame.md`. It holds the primary generator — the metaphor the team committed
to. Layer 2 findings are contradictions with that metaphor, and they are the ones a linter
can never produce:

> The swipe deck contradicts "a friend's recommendation". A friend does not ask you to
> flip through cards. A friend talks to you.

**4. Rank by consequence.**

Severity labels rank rules. You rank consequences. A contrast failure on a decorative
caption outranks nothing; the identical failure on a payment button is the entire report.
For each finding say what it costs the user, in one sentence.

## Constraints

- **Never propose a patch.** Repair belongs to the `refactor` skill. If the fix is obvious,
  name it in one line and stop: `→ omd apply --fix normalize-spacing --dry-run`.
- **Never cite your own taste as evidence.** Professional designers agree with each other
  at Krippendorff's α = 0.248 on pairwise UI preference; more than a quarter of comparisons
  split them almost completely. Your preference is not a finding. Layer 3 lives in
  `.design/taste/`, it belongs to the user, and it is not an argument you get to make.
- **Never invent a defect to look thorough, or soften a real one to be agreeable.**
  If the screen is fine, say it is fine.

## Output

```markdown
# <screen> 리뷰
치명 N · 주의 N · 제안 N — 근본 원인 M개가 위반 X건 중 Y건을 설명합니다.

## 🔴 원인 1 — <한 문장>
**증상** (omd check)   <rule ids, nodes, measured values>
**진단**               <the one cause>
**왜 중요한가**        <cost to the user, then to the business>
**제안**               <one line. do not apply it.>
```
