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
4. **Stop before you over-edit.** Two thresholds, not one: if more than 30% of the text
   needs rewriting, warn and present only the worst offenders — do not proceed silently.
   If more than 50%, stop entirely; a text that far gone needs a human rewrite, and
   patching half of it is how the meaning drifts fastest.

## Severity hierarchy

Not all tells are equal. Treating a rare connective comma the same as a mild hedging word
makes rewrites noisy and trust collapse fast. Three tiers:

- **S1 — always remove.** One instance is the tell. C-11 connective commas, A-16
  pronoun substitutions: a single 그녀 in Korean prose reads machine-written to any fluent
  reader. Remove on first occurrence, no exceptions.
- **S2 — 1–2 instances allowed, flag at 3+.** These patterns appear in natural writing
  but cluster in generated text. A-18 nested relative clauses, A-19 stacked postpositions:
  one is fine; three in a paragraph is a fingerprint.
- **S3 — flag only when clustered.** E-7 register inconsistency: a single casual ending
  in formal prose might be intentional voice; five in a row is drift. Name the cluster
  and let the writer decide.

## The tells (Korean — from the im-not-ai taxonomy)

- **Translation-ese**: ~를 통해, ~에 대해 살펴보다, 이중 피동(-되어지다)
- **A-16** (S1): 그/그녀/그것 기계적 대명사 매핑 — 한국어는 주어를 생략하거나 명사를
  반복한다. 그/그녀가 나오면 삭제하거나 지시 대상 명사로 대체.
- **A-18** (S2): 왼쪽 분기 관형절 3중첩 이상 — "~에 의해 결정된 결과로 도출된 방향성"처럼
  명사 앞에 관형절이 3개 이상 쌓이면 분리.
- **A-19** (S2): 겹조사 — -에서의/-에로의/-으로의 같은 조사 중첩. 문장을 쪼개거나 조사를
  단순화.
- **C-11** (S1): 접속어 직후 쉼표 — 그러나, / 하지만, / 또한, / 따라서, 형태. 가장 강한
  단일 판별자. 한국어 자연문에서 접속어 뒤 쉼표는 거의 없다. 쉼표를 삭제하거나 접속어를
  제거하고 문장을 이어라.
- **Mechanical structure**: 첫째/둘째/셋째 나열, 불릿·이모지 남발
- **AI stock phrases**: 결론적으로, 시사하는 바가 크다, 주목할 만하다, ~할 필요가 있다,
  중요한 것은 ~라는 점이다
- **Uniform rhythm**: 문장 길이 분산이 없음, 같은 어미 연속(-다/-다/-다, -입니다 3연속)
- **E-7** (S3): 경어법 레벨 흔들림 — 합쇼체와 해체가 단락 안에서 섞임. 대화문 안의 흔들림은
  예외. 군집(5회+)일 때만 제거.
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
