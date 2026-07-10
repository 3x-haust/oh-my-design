---
name: omd-humanize
description: >-
  Rewrite text so it reads as if a person wrote it — strip AI prose tics (Korean and
  English), translation-ese, uniform rhythm, hedging stacks, and self-negating meta-copy —
  without changing a single fact. Works on any text: page copy, blog posts, READMEs,
  marketing lines. Also used by omd-ultradesign for every word that ships.
  Triggers: humanize, 사람같이, 사람처럼 써, AI티 빼줘, 자연스럽게 바꿔, 글 다듬어,
  make it sound human, de-AI, rewrite naturally.
---

# omd-humanize

Generated prose confesses before generated pixels do. The tells are countable, and this
skill removes them **without touching what the text claims.**

## The four laws

1. **Meaning is frozen.** Facts, claims, numbers, names, quotes survive verbatim. You are
   changing rhythm and diction, never content. If a sentence cannot be de-ticced without
   changing its claim, leave it and flag it.
2. **Only rewrite what a rule tagged.** Read the text once, list the violations you found
   (pattern → span), then rewrite exactly those spans. No freestyle "improvements".
3. **Genre survives.** An essay stays an essay; a spec stays a spec. Do not make formal
   text chatty or chatty text formal.
4. **Stop before you over-edit.** If more than ~30% of the text needs rewriting, say so
   and show the worst offenders instead of silently rewriting everything — wholesale
   rewriting is how meaning drifts.

## The tells (Korean — from the im-not-ai taxonomy)

- **Translation-ese**: ~를 통해, ~에 대해 살펴보다, 이중 피동(-되어지다), 그/그녀 남발,
  왼쪽으로 긴 관형절, -에서의/-에로의 겹조사
- **Mechanical structure**: 첫째/둘째/셋째 나열, 불릿·이모지 남발, 접속어 뒤 쉼표 기계 배치
- **AI stock phrases**: 결론적으로, 시사하는 바가 크다, 주목할 만하다, ~할 필요가 있다,
  중요한 것은 ~라는 점이다
- **Uniform rhythm**: 문장 길이 분산이 없음, 같은 어미 연속(-다/-다/-다, -입니다 3연속),
  경어 레벨 흔들림
- **Redundant modification**: 매우/정말/아주 습관적 사용, 유의어 쌍(명확하고 분명한),
  -적/-성/-화 접미사 남발
- **Hedging stacks**: ~할 수 있을 것으로 보인다, ~일 수도 있다고 생각된다
- **Connector abuse**: 또한/따라서/즉/그리고 로 연속 문장 시작
- **Formal-noun padding**: ~것이다, ~점이다, ~수 있다 로만 끝나는 문단

## The tells (English)

- Stock openers/closers: "In conclusion", "It's worth noting", "Moreover", "delve into",
  "In today's fast-paced world"
- Rule-of-three everywhere; balanced "not only X but also Y"; em-dash chains
- Every paragraph the same length; every sentence 15–25 words
- Hedging: "can potentially", "may possibly", "it could be argued"
- Bold **key phrases** sprinkled as decoration

## The pink elephant (absolute, both languages)

Copy must never state what the thing is NOT. Told "no clutter", a model writes "No
clutter here." — that is the model quoting its own instructions. Delete the negation and
write the positive fact it was hiding:

- ❌ "이 사이트에는 광고나 불필요한 내용이 없습니다" → ✅ 실제로 있는 것을 말한다
- ❌ "No fluff, no jargon, just value" → ✅ name the value concretely
- ❌ "We don't waste your time" → ✅ "Setup takes four minutes."

And **design rationale never appears in shipped copy.** If the text is page copy inside an
omd project, run `omd check <page>` — SLOP-LEAKED-RATIONALE fires when five consecutive
words match `.omd/frame.md` or `decisions.md`. The frame explains the work; the page must
never quote it.

## Procedure

1. Read the whole text. Build the violation list: `[pattern-id] "span"` — one line each.
2. Rewrite tagged spans only. Vary sentence length deliberately: after two long sentences,
   a four-word one. Restore the writer's register, not yours.
3. Show the result, then the violation list so the change is auditable.
4. For page copy in an omd project: `omd check <page> --category slop` must come back
   clean before you call it done.
