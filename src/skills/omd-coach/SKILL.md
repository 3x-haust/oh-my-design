---
name: omd-coach
description: >-
  Read the project's check history and tell the user what they keep getting wrong, what
  is improving, and what to study next. Skill, not taste — it never reads preferences.
  Use when the user asks how their design is trending, what mistakes repeat, or wants a
  review of accumulated findings.
  Triggers: 코치, 내가 뭘 반복해서 틀리지, 디자인 실력, 추세, coach, what do I keep
  getting wrong, design habits.
---

# omd-coach

```bash
omd coach
```

The CLI computes; you interpret. It reads `.omd/history.jsonl` (every `omd check` run) and
`decisions.md`, and reports recurring rules, trends, and overruled slop findings.

## How to read it to the user

- **Lead with the pattern, not the list.** "대비비 지적이 4런에 걸쳐 26건, -70% 개선 중"
  is data; "대비는 잡히기 시작했는데, 이제 위계 지적이 늘고 있다 — 다음 병목은 정보
  구조다"가 코칭이다.
- **Honesty is enforced, honor it.** Under four runs the tool refuses to claim a trend —
  do not invent one on top. A rule with no baseline prints "appeared", never a percentage;
  keep it that way in your prose.
- **Overrules are choices, not sins.** SLOP-GRADIENT overruled twice with a brand reason
  is a decision holding steady. The same overrule with "it looked fine" is a habit worth
  naming.
- **End with one thing to observe, not ten.** Pick the costliest recurring rule and give
  one concrete study: a reference to look at (`omd-scout` can fetch it measured) and what
  to notice there.

## The boundary

Never mix skill with taste. "You keep missing contrast" has a right answer; "you prefer
dense layouts" does not (professional designers agree at α = 0.248). Coach speaks only
about the first kind, and never reads `.omd/taste/`.
