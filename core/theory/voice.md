# Voice — decision material

Copy gives away its origin before a pixel does. A line break mid-sentence, three consecutive
sentences of the same length, a hedge that adds no information — any one of these signals
that a model wrote this faster than a person could have. The tells are measurable. The
repairs are learnable. This file records both.

---

## The statistical signature of generated prose

Research into detecting AI-generated text consistently identifies two statistical
properties that separate human writing from model output: perplexity and burstiness.
Perplexity measures how predictable each word choice is — models select high-probability
tokens by construction, producing text that is smoother than any human writer's. Burstiness
measures how much sentence length and complexity vary across a document — humans interrupt
long sequences with short ones, shift register unexpectedly, and write sentences that range
widely in structure; models produce text at a more uniform cadence because they optimise the
same way at every position.

A 2025 feature-based detection study in *AI and Ethics* (Springer) confirmed that human
writers demonstrate greater variability in sentence length — wider distribution, higher
standard deviation — while model-generated text concentrates around a narrower range. A PMC
study on academic writing achieved over 99% detection accuracy using four feature categories,
with sentence-level diversity in length and paragraph complexity as primary signals.
An arXiv analysis (2408.04647) found that GPT-generated sentences are typically longer on
average while human-written sentences have a wider range — meaning human writing is not
consistently shorter, just consistently more varied.

The practical instruction is not "write shorter sentences." It is: vary deliberately. After
two long sentences, write a short one. After a clause-heavy paragraph, write a paragraph of
one sentence. The variation is the signal of a person.

Condition → choice → reason: when copy reads flat or rhythmically identical across
paragraphs, it is not a style problem — it is a burstiness deficit. Introduce one
dramatically short sentence in every three to four long ones. Not as ornament, but as a
factual break: the claim that deserves the white space gets it.

---

## How people actually read on the web

The finding that shaped modern web writing came from Jakob Nielsen and John Morkes in 1997.
In their study of how users approached web pages, 79 percent of test users always scanned
any new page — only 16 percent read word by word. Twenty-three years later, Nielsen's 2020
follow-up confirmed the proportion had not moved. Scanning is not a failure mode; it is the
default mode of a reader whose attention is distributed across millions of competing pages.

The same pair published the implications in "Concise, SCANNABLE, and Objective: How to Write
for the Web" (Morkes and Nielsen, 1997). Testing five writing styles against a control, they
found the concise version scored 58% higher in measured usability, the scannable version 47%
higher, and the objective version (no promotional language) 27% higher. A site that was all
three simultaneously scored 124% higher. A follow-up rewriting Sun.com pages produced 159%
improvement. These are not marginal effects; they are the largest usability gains in the
literature for a single intervention class.

Nielsen's 2006 eye-tracking study of 232 users across thousands of pages documented the
F-pattern: a full sweep of the first line, a shorter sweep of a second line, then a vertical
scan down the left edge. The pattern is a failure state — it emerges when content lacks
visual hierarchy and the reader falls back to a heuristic. The design response is not to
format text to fit the F; it is to give the reader entry points that break the fallback.

What these studies mean for sentence construction:

**Front-load information.** The first sentence of a paragraph and the first clause of a
sentence carry disproportionate weight. If the important claim is buried after a preamble,
the scanner never sees it. The inverted pyramid — conclusion first, support after — is not
a newspaper convention; it is the writing shape that matches how web users extract value.

**One idea per paragraph.** A paragraph that opens with claim A and closes with claim B is
two paragraphs. Splitting them is not padding; it is giving each claim the surface area to
be scanned and absorbed independently.

**Concrete nouns over abstract nominalizations.** "The facilitation of user onboarding" and
"helping people get started" convey the same claim. The second is scannable; the first
requires parsing. Abstract nouns — facilitation, optimisation, utilisation — slow processing
and carry no additional precision. Every nominalization is a candidate for replacement with
a verb or a specific noun.

---

## Plain language is not dumbing down

Daniel Oppenheimer's 2006 study "Consequences of Erudite Vernacular Utilized Irrespective
of Necessity" (*Applied Cognitive Psychology*, 20(2), 139–156) ran five experiments with
Stanford students, manipulating the vocabulary complexity of texts and measuring the authors'
perceived intelligence. The result reversed the folk assumption: as complexity increased,
estimated author intelligence decreased. The mechanism is processing fluency — difficult
text feels effortful to read, and the reader attributes that effort to the writer's
unclear thinking rather than to the word choice. The effect held regardless of essay quality
and regardless of readers' prior expectations.

Plain language is the confident register. It is the register of a person who understands
the subject well enough to explain it without armour. Mailchimp's public content style guide
(styleguide.mailchimp.com) names this "plainspoken" and defines it as stripping away the
hyperbolic language, upsells, and over-promises that the reader has learned to distrust —
not because simplicity is good in itself, but because clarity is what trust is built on.

37signals states the same principle in their communication guide: "If your words can be
perceived in different ways, they'll be understood in the way which does the most harm."
Plain writing reduces the number of ways a sentence can be understood. That reduction is a
quality, not a constraint.

Condition → choice → reason: when a sentence contains a long Latinate noun where a
shorter verb would serve — "provide an indication of" → "indicate", "make a determination"
→ "decide", "in the event that" → "if" — replace it. The test is not whether the long form
is correct but whether the short form loses any precision. In the overwhelming majority of
cases, it does not.

---

## The voice chart: writing from product principles

Torrey Podmajersky's *Strategic Writing for UX* (O'Reilly, 2019) introduces the voice chart
as the instrument that connects product principles to copy decisions. The chart holds rows
for vocabulary, verbosity, grammar, and concepts — filled in for each dimension by asking
what the product principle demands of the words, not what sounds nice. A financial product
whose principle is "trustworthy" chooses precise vocabulary over colloquial; a product whose
principle is "approachable" accepts shorter sentences and native vocabulary over formal
constructions. Podmajersky's formulation: "These principles define what the experience is
trying to be to the people who use it. Then, the voice can do its job of conveying those
product principles with every word."

The voice chart makes copy decisions auditable. Without it, every copy choice is a taste
decision — and taste decisions are re-litigated on every page, by every person who touches
the product. With it, the question becomes: does this sentence match the registered
voice dimensions? That is a question with a testable answer.

Condition → choice → reason: before writing a word of copy, name the product principle
each section is serving. When no principle can be named, the copy is decoration; decoration
is the first thing the scanner skips.

---

## The review-mining move

Joanna Wiebe at Copyhackers documented what she calls the voice-of-customer method: instead
of writing copy on a blank page, mine the language that real users have already written —
in reviews, support tickets, forum threads, comment sections — and use their phrasing
directly. The argument is that the customer names the value of the product more precisely
than the copywriter can, because the customer experienced the problem before the solution
existed and reaches for the words that match that experience.

The method is a search operation. Identify the exact problem your product solves. Find
online communities — reviews, subreddits, Help forum threads — where people describe that
problem in their own words. The phrases that appear repeatedly, with emotional precision,
are the phrases the copy should use or echo. The user who writes "I used to spend three
hours a week reconciling this manually" has handed you a sentence. The copy that quotes
their situation back to them is the copy that converts.

This connects directly to the scout's community captures. A Reddit thread where users argue
about exactly this product category, a Hacker News comment naming why a redesign failed —
these are not sentiment data. They are voice data. The scout captures them; the hand uses
them. A voice study that records how a site writes is the positive model; the community
captures record the phrases the audience already uses for the problem.

---

## Korean copy: 한국어 카피의 목소리

Korean product copy has a distinct set of decisions that have no equivalent in English
writing advice. Applying English-language principles to Korean prose — even translated ones
— produces copy that reads as translated, which is among the loudest tells.

### Speech-level commitment: choose one and hold it

The two dominant written registers in Korean product copy are 해요체 (하다 → 해요, 됩니다
→ 돼요) and 합니다체 (하다 → 합니다, 됩니다 → 됩니다). These are not style choices on a
spectrum; they make categorically different claims about the relationship between the
product and the user. 합니다체 signals institutional formality — the bank teller, the
government notice, the press release. 해요체 signals a person speaking to a person —
warmer, more accessible, without the distance formal endings create.

Toss committed to 해요체 across every string in its product and published the rule
explicitly: all copy uses 해요체, without exception, regardless of context or screen.
Their stated reason is consistency of experience — 합니다체 anywhere breaks the register
the rest of the product has established. The rule also extends to avoiding over-polite forms
(~시겠어요?, ~께) that amplify formality past what the relationship calls for.

What the `SLOP-KO-REGISTER-MIX` rule detects — 해요체 and 합니다체 alternating within the
same text node — is not stylistic inconsistency. It is an absence of commitment. The product
has not decided what its relationship with the user is, and the mixed endings make that
indecision visible.

Condition → choice → reason: before writing a single string in Korean, record the speech
level in the voice study. Then hold it for every string, including error messages, empty
states, and button labels. A button that reads "확인합니다" on a screen where the hero reads
"지금 시작해요" is two products, not one.

### Vocabulary temperature: 고유어 over 한자어 where precision allows

Korean has two vocabulary strata available for almost any concept: native Korean (고유어)
and Sino-Korean (한자어). Most product copy defaults to Sino-Korean because it feels
professional and precise. This instinct produces text that is correct, stiff, and forgettable.

Toss's 8 writing principles include "Easy to speak" — their test is whether the sentence
sounds wrong when said aloud, not whether it looks wrong in print. They cite 한자어 and
literary 문어체 constructions as the primary cause of copy that passes a proofreading
read but sounds like documentation. Examples from their practice: 송금이 완료되었습니다
becomes 5000원을 보냈어요 — "송금" (Sino-Korean for remittance) replaced by "보내다" (native
verb for send), "완료되었습니다" (formal Sino-Korean completion) replaced by "보냈어요"
(native past tense in 해요체). The semantic content is identical; the temperature is
completely different.

The working vocabulary test: say the sentence aloud. Does it sound like something a person
would say to a friend explaining what just happened? If not, identify the Sino-Korean
construction and replace it with the native equivalent. "결제 진행" → "결제 중". "이용
가능합니다" → "쓸 수 있어요". "확인 후 진행하세요" → "확인하고 다음으로 가세요". Each
substitution costs no precision and removes the institutional chill that Sino-Korean carries.

### One sentence, one idea

Toss's principle 4 — Focus on key message — is a sentence construction rule as much as an
editing rule: one sentence carries one message, read in a single breath. Korean's
agglutinative structure tempts long sentences because each extension costs only a morpheme,
and the grammatical seams are invisible in a way that English subordination is not. The
sentence that says three things when read carefully says nothing when scanned.

The test is breath, not grammar: if the sentence runs past one breath when read aloud at
normal pace, it carries more than one idea. Split at the clause boundary where the idea
changes. The two shorter sentences will not need connectives (또한, 따라서, 그리고) to join
them — the natural juxtaposition carries the relationship without naming it.

### What Korean products actually sound like

The native register of successful Korean consumer products — Toss, 당근, Kakao — is not
informal. It is committed to one register and precise within it. The sentences are short.
The verbs are native. The formality level is consistent from hero to error message. The copy
never explains the product's own mechanism; it describes what changes for the user.

배민 (Baemin) operates in a distinct creative register — warm, witty, deliberately playful —
but the underlying commitment is the same: a consistent voice that was designed and held,
not allowed to drift. Their UX writing interview at bcut.baemin.com describes the first
UX writer's mandate as "ensuring the text inside the app communicates clearly with users
and protecting consistency." The register is brand-specific; the structural commitment is
universal.

### Document-structure narration: write the content, not that content is coming

AI-generated Korean product copy has a structural tell: it narrates the document before
presenting the document. "아래는 그 기록이에요" (below is the record), "다음은 기능 목록입니다"
(the following is the feature list) — these sentences announce the organisation of what
follows rather than delivering it. The cadence comes from the essay or README skeleton the
model was trained on. A human copywriter does not introduce their own bullet list; they write
the bullet list.

`SLOP-KO-SIGNPOST` fires on the deterministic patterns: `아래는 … 기록/내용/목록/정리` and
`다음은 … 입니다/이에요`. The fix is deletion: remove the announcing sentence and start with
the content it was announcing. "아래는 그 기록이에요." → delete it; begin with the first item.

The negative to hold in mind: "아래 버튼을 누르세요" does not fire. 아래 used as a spatial
adverb (without the topic marker 는) is navigation copy, not structural narration.

### Calibration evidence: what the measured gap between human and pipeline prose reveals

The following lessons come from a direct calibration: a 16,000-character Korean personal tech
essay by Evan Moon (evan-moon.github.io/2020/12/29/2020-retrospective/, published December 2020,
fully human-authored) was used as the baseline. A parallel version covering the same facts was
written by following voice.md and the humanize skill rules faithfully. The two versions were
measured against the same metrics. The gaps name what our rules actively get wrong.

**Measured diff table (N=26–36 sentences per version, character lengths exclude spaces):**

| Metric | Human essay | Our version |
|---|---|---|
| Sentence length min | 8 chars | 8 chars |
| Sentence length max | 114 chars | 48 chars |
| Sentence length mean | 50.4 chars | 19.9 chars |
| Sentence length σ | 26.1 | 9.8 |
| Ending diversity (unique/total) | 0.86 | 0.96 |
| Connective rate (per sentence) | 0.42 | 0.00 |
| C-11 violations (connective+comma) | 1 | 0 |
| Parenthetical asides | 6 in full article | 0 |
| Unresolved uncertainty markers | 5 | 0 |

**Lesson 1 — Register context: 해요체 is for product copy, not essays**

The sampled human essay uses the informal narrative register (-다 style) throughout: 해였다,
것 같다, 생각이었다, 모르겠다. None of these are 해요체 or 합니다체. Korean personal essays,
회고글, and reflective blog posts are written in this register — it is the written voice of a
person narrating their own experience, not the addressed voice of a product speaking to a user.

Our rules prescribe 해요체 for Korean copy. Applied to an essay, that produces a newsletter
register: warm, present-tense, second-person-inflected — correct for UI strings and product
stories but wrong for first-person retrospective prose. A 회고글 in 해요체 sounds like a
product announcement; a 회고글 in -다 register sounds like someone who was actually there.

Condition → choice → reason: before applying the 해요체 standard, identify the genre. Product
copy (UI strings, error messages, landing pages, marketing copy): 해요체, without exception.
Personal essays, 회고글, developer blog posts: match the register the genre demands. The rule
from voice.md applies at the product layer; it was never a claim about all Korean writing.

**Lesson 2 — Connective overcorrection: the tell is the comma, not the connective**

The sampled human essay uses connectives at a rate of 0.42 per sentence — 15 connectives
across 36 sentences, including 하지만, 그래서, 그런데, 물론, 또한, 사실, 결국. Not one
is followed by a comma (C-11 count: 1, a naturally-occurring case). The human connective
rate is high because connectives carry logical structure; they are not AI tells by themselves.

The pipeline version, shaped by the SKILL.md rule against "connector abuse," produced zero
connectives across 26 sentences. That is not more human — it is a different kind of abnormal.
Abrupt juxtaposition without connectives reads as choppy, clipped, produced by a sentence-by-
sentence generator rather than a mind that knows where the paragraph is going.

What the C-11 rule identifies is the specific pattern of a connective immediately followed by
a comma — 하지만, / 그러나, / 또한, / 따라서, — which appears in Korean generated text but
almost never in natural writing. The rule does not say: remove all connectives.

Condition → choice → reason: the connective-abuse tell is clustering (3+ consecutive sentences
opening with connectives) and the comma after the connective. A paragraph that uses 하지만 or
그런데 once to mark a logical turn is natural. A paragraph that opens five consecutive sentences
with 또한/따라서/즉/그리고 is the fingerprint. Eliminate the pattern, not the words.

**Lesson 3 — Parenthetical asides: a positive model our rules never named**

The sampled essay contains six parenthetical asides across 16,000 characters — roughly one per
1,000 characters, or once every three to four paragraphs: "(살면서 노래방을 이렇게 안 가본 게
처음…)", "(결국 이러다가 번아웃이 왔었지만, 습관은 잘 안 고쳐지더라…)", "(그리고 스스로 뭔가
꼰대 같다는 생각이 들어서 이걸 깨닫고 한동안 우울했었다)". These are self-interruptions —
second thoughts, humor, corrections — that signal a mind present on the page, not a generator
completing a paragraph.

The pipeline produces zero. The tells list names what to remove; it has no positive model for
this form. An essay with no parenthetical asides in 3,000+ characters is measurably flatter
than the human baseline.

Condition → choice → reason: in essayistic Korean prose (blog posts, 회고글, product stories),
if no parenthetical aside has appeared in 1,000+ characters, look for a place where a second
thought belongs. Not as decoration — as the actual second thought being suppressed to keep the
paragraph clean. The aside earns its position when the main sentence structure has nowhere to
put what needs to be said.

**Lesson 4 — σ and unresolved uncertainty: the most human signal is incompleteness**

The human essay's sentence-length σ was 26.1; the pipeline's was 9.8. The maximum sentence
length in the human essay was 114 characters (no spaces); the pipeline capped at 48. The
burstiness rule in voice.md is correct in direction, but execution under the rules remains too
controlled. "After two long sentences, write a short one" is necessary but not sufficient —
the human also writes two long sentences after the short one, and then another 114-character
one. The human doesn't manage rhythm; the human follows thought wherever it goes.

The sampled human essay closed its mentoring section with: "하지만 아직도 잘 모르겠다." Thirteen
characters. The pipeline produced: "이게 올해가 남긴 가장 큰 질문이에요." That is a packaged
takeaway. It names the lesson; it does not live in the uncertainty. The human's 13-character
sentence is more trustworthy precisely because it refuses to resolve what has not been resolved.

The full article closed with: "2020년에는 결국 이렇게 답을 찾지 못한 질문으로 회고를 마무리하지만,
내년 2021년 회고에는 이 질문과 고민에 대한 답을 찾아서 회고에 적는 것을 목표로 잡아야겠다." The
human commits to finding the answer next year rather than having found it this year.

Condition → choice → reason: when an essay section ends, ask whether a tidy conclusion is
honest or performed. A genuine takeaway — something the writer actually learned and can state
— earns the closure. A resolution that smoothes over ongoing uncertainty is a model completing
its pattern. "아직도 잘 모르겠다" is human; "이게 핵심 교훈이에요" for a lesson still in progress
is a tell. If the answer does not exist yet, state that instead.

### Uniform sentence endings and not-X-but-Y: pre-handoff checks, not linter rules

Two Korean AI tells are real but cannot be made into safe deterministic rules:

**Three or more consecutive identical sentence-final endings** (이에요./이에요./이에요. or
합니다./합니다./합니다.) are a statistical signal of AI generation — a human writer varies
structure. However, product benefit lists deliberately use parallel endings: "빠릅니다.
정확합니다. 쉽습니다." is valid copy that would false-positive on every legitimate feature
section. A linter rule would fire on too much legitimate writing to be trusted.

Pre-handoff check: if three or more adjacent sentences share the same final ending, vary
at least one — rewrite to a shorter sentence, a question, or a clause that ends differently.
The goal is not to eliminate parallel endings but to break a uniform rhythm that reads as
output from a loop rather than from a writer.

**The not-X-but-Y construction** (`~게 아니라 ~했어요` / `~이 아니라 ~입니다`) appears in
AI output as performed contrast in response to a brief that said "be honest" or "be direct."
It also appears in legitimate copy: a brand that deliberately contrasts itself with a
category norm ("빠른 게 아니라 정확합니다") uses this construction with intent. No narrow
regex distinguishes the cases reliably.

Pre-handoff check: when this construction appears in the hero or opening paragraph, ask
whether the contrast was a designed claim (cite it in decisions.md with the brand reason)
or a model hedging its own confidence. Delete hedges; keep designed contrasts. "AI가 만든
게 아니라, 사람이 썼어요" as a self-description of the tool is a hedge; "비싼 게 아니라
오래 씁니다" as a product claim is a designed contrast.

Neither pattern has an `omd check` rule. Both belong on the hand's pre-handoff review pass.

Translated English marketing is the loudest failure mode. The sentence structure of
English product copy — subject, action verb, object, benefit clause — does not map cleanly
onto Korean's SOV order or its topic-comment preference. Copy that was conceived in English
and translated reads as translated: the particle choices are safe rather than native, the
nominalisations are abundant, and the rhythm is wrong in a way that fluent readers feel
before they can name it. The correct direction is to write the Korean sentence a Korean
product would have written first, not to translate the English sentence that would have
appeared on an English-language version of the same screen.

---

## Sources

- Nielsen, J. (1997). "How Users Read on the Web." Nielsen Norman Group.
  nngroup.com/articles/how-users-read-on-the-web/ — 79% scan finding; scanning as default
  web reading behavior, not an aberration
- Morkes, J. & Nielsen, J. (1997). "Concise, SCANNABLE, and Objective: How to Write for
  the Web." Nielsen Norman Group. nngroup.com/articles/concise-scannable-and-objective —
  58% usability gain for concise writing, 47% for scannable, 124% combined
- Nielsen, J. (2006). "F-Shaped Pattern For Reading Web Content."
  nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/ — F-pattern as a
  fallback behavior, not a design target
- Oppenheimer, D.M. (2006). "Consequences of Erudite Vernacular Utilized Irrespective of
  Necessity: Problems with using long words needlessly." *Applied Cognitive Psychology*,
  20(2), 139–156. doi:10.1002/acp.1178 — plain language increases perceived intelligence
  via processing fluency; complexity reduces it
- Feature-based detection of AI-generated text (Springer, *AI and Ethics*, 2025) — human
  writing has greater sentence-length variance and standard deviation than model-generated
  text; confirmed across academic, journalistic, and creative domains
- PMC study on academic science writing (pmc.ncbi.nlm.nih.gov/articles/PMC10328544/) —
  sentence-level diversity in length and paragraph complexity as primary detection signals;
  over 99% accuracy using stylometric features alone
- arXiv 2408.04647, "Distinguishing Chatbot from Human" — GPT sentences longer on average;
  human writing has wider range and higher variance across sentence lengths
- Podmajersky, T. (2019). *Strategic Writing for UX.* O'Reilly Media. — voice chart as
  instrument connecting product principles to copy decisions; voice applied like a spice:
  too little is flavorless, too much inedible
- Mailchimp Content Style Guide (styleguide.mailchimp.com) — "plainspoken" as the core
  voice dimension: strip hyperbolic language, upsells, and over-promises; clarity above
  entertainment; active voice, positive language, plain English
- 37signals, "The 37signals Guide to Internal Communication" (37signals.com/how-we-
  communicate) — "If your words can be perceived in different ways, they'll be understood
  in the way which does the most harm"; plain writing reduces interpretive surface
- Wiebe, J. / Copyhackers, "How to do rapid-fire review mining"
  (copyhackers.com/how-to-do-rapid-fire-review-mining/) — voice-of-customer method:
  mine real user language from reviews and forums; the customer names the value better
  than the copywriter
- Toss Tech. (2022). "토스의 8가지 라이팅 원칙들."
  toss.tech/article/8-writing-principles-of-toss — eight principles built from A/B test
  data: Predictable hint, Weed cutting, Remove empty sentences, Focus on key message, Easy
  to speak (avoid 한자어 and 문어체), Suggest over force, Universal words, Find hidden emotion
- Toss Developer Center, UX Writing Guide
  (developers-apps-in-toss.toss.im/design/ux-writing.html) — 해요체 as the product-wide
  standard; active voice preference; one message per sentence; native Korean over Sino-Korean
- 배민 UX Writing interview (bcut.baemin.com/6287/) — first UX writer mandate: clear
  communication and consistency of voice; register as a designed commitment, not a default
