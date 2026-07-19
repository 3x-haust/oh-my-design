# Voice — decision material

Copy reveals whether its language fits the speaker, listener, surface, and task before visual
polish can rescue it. A forced line break, repeated cadence, or empty hedge can prompt a
contextual review, but no individual signal establishes authorship. This file records the
jobs those patterns can obstruct and the repairs that preserve evidence.

---

## Statistical observations are not writing instructions

Generated-text studies have measured aggregate differences in predictability, sentence
length, and paragraph complexity within particular datasets. Those distributions can
describe a corpus; they cannot establish who wrote an individual passage or whether it does
its job. Genre, language, accessibility needs, short UI labels, and technical constraints can
all produce the same measurements.

Do not manufacture sentence-length variance, surprise, typos, asides, or roughness to imitate
a distribution. Rhythm follows the speaker's thought and the surface's job. When prose feels
mechanical, inspect the discourse: repeated propositions, abstract agency, prompt mirroring,
misplaced caveats, or a register that does not fit the relationship. Repair that cause and
let sentence shape follow. Detector scores and stylometric thresholds never gate shipping.

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

Korean product copy requires decisions that English-language guidance does not settle.
Literal transfer can produce translation-shaped prose, so judge the result against its Korean
speaker, listener, situation, and register rather than inferring its origin.

### Speech-level commitment: choose one and hold it

Two common written registers in Korean product copy are 해요체 (하다 → 해요, 됩니다 → 돼요)
and 합니다체 (하다 → 합니다, 됩니다 → 됩니다). They can imply different relationships:
합니다체 often supports institutional precision, while 해요체 often supports conversational
warmth. Neither is a universal product default; choose from the voice contract, audience,
situation, and required authority.

Toss committed to 해요체 across every string in its product and published the rule
explicitly: all copy uses 해요체, without exception, regardless of context or screen.
Their stated reason is consistency of experience — 합니다체 anywhere breaks the register
the rest of the product has established. The rule also extends to avoiding over-polite forms
(~시겠어요?, ~께) that amplify formality past what the relationship calls for.

Cite Toss (and 당근, Kakao) as documented examples of register discipline, never as a voice to copy. The
register rules are already stated above — do not web-search a product's copy strings to imitate "토스식
해요체" reflexively, which reproduces one company's register across every Korean product. This product's
voice is chosen from its own audience, situation, and authority, not from a famous app's strings.

What the `SLOP-KO-REGISTER-MIX` rule detects — 해요체 and 합니다체 alternating within one
text node — is a review candidate. It may expose unplanned register drift, or it may be
required by quoted speech or a deliberate change of speaker. Context decides.

Condition → choice → reason: before writing Korean surface copy, record its speech level in
the voice contract. Hold it across strings that share one speaker and relationship, including
applicable error, empty, and action states. When the register changes, identify the changed
speaker or situation rather than treating inconsistency as personality.

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

### One sentence, one useful job

Toss's principle 4 — Focus on key message — is a useful test for compact product surfaces:
one short UI string usually carries one primary job that can be read in a breath. Korean's
agglutinative structure tempts long sentences because each extension costs only a morpheme,
and the grammatical seams are invisible in a way that English subordination is not. The
more jobs a compact string carries, the harder it becomes to scan.

Use breath as contextual evidence, not a universal sentence rule. A legal notice, tutorial,
or technical explanation may need a longer sentence. When a compact surface combines
unrelated jobs, split at the change; retain a connective when it carries a real logical
relationship that juxtaposition would lose.

### What Korean products actually sound like

Successful Korean consumer products such as Toss, 당근, and Kakao show that consistency is
not the same as informality. Their compact action and state copy is precise within its chosen
register. Heroes often lead with the user's change; documentation, comparisons, and feature
details may explain mechanism when mechanism is the useful fact.

배민 (Baemin) operates in a distinct creative register — warm, witty, deliberately playful —
but the underlying commitment is the same: a consistent voice that was designed and held,
not allowed to drift. Their UX writing interview at bcut.baemin.com describes the first
UX writer's mandate as "ensuring the text inside the app communicates clearly with users
and protecting consistency." The register is brand-specific; the structural commitment is
universal.

### Document-structure narration: write the content, not that content is coming

Korean product copy can lose its job when it narrates the document before presenting it.
"아래는 그 기록이에요" (below is the record), "다음은 기능 목록입니다"
(the following is the feature list) — these sentences announce the organisation of what
follows rather than delivering it. A tutorial or long document may need signposting; a small
product surface usually benefits from starting with the fact or action itself.

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

**Lesson 1 — Register context comes before a speech-level default**

The sampled human essay uses the informal narrative register (-다 style) throughout: 해였다,
것 같다, 생각이었다, 모르겠다. None of these are 해요체 or 합니다체. Korean personal essays,
회고글, and reflective blog posts are written in this register — it is the written voice of a
person narrating their own experience, not the addressed voice of a product speaking to a user.

Applying 해요체 to every Korean genre can produce a newsletter register: warm,
present-tense, and second-person-inflected, which may fit one UI voice but not a formal
service, first-person retrospective, or developer note.

Condition → choice → reason: identify speaker, listener, situation, genre, and authority,
then choose 해요체, 합니다체, -다 style, or another evidenced register in the voice contract.
Product copy has no universal speech-level exception to that decision.

**Lesson 2 — Connective overcorrection: the tell is the comma, not the connective**

The sampled human essay uses connectives at a rate of 0.42 per sentence — 15 connectives
across 36 sentences, including 하지만, 그래서, 그런데, 물론, 또한, 사실, 결국. Not one
is followed by a comma (C-11 count: 1, a naturally-occurring case). The human connective
rate is high because connectives carry logical structure; they are not AI tells by themselves.

The pipeline version, shaped by the SKILL.md rule against "connector abuse," produced zero
connectives across 26 sentences. That is not more human — it is a different kind of abnormal.
Abrupt juxtaposition without connectives reads as choppy, clipped, produced by a sentence-by-
sentence generator rather than a mind that knows where the paragraph is going.

What the C-11 rule identifies is the narrow pattern of a connective immediately followed by
a comma — 하지만, / 그러나, / 또한, / 따라서, — for contextual review. The rule does not
say that the author is known or that all connectives should be removed.

Condition → choice → reason: clustering and punctuation can make connective use feel
mechanical, while one connective may mark a necessary logical turn. Ask whether each opening
expresses a real relationship. Repair redundant structure, not the words as a class.

**Lesson 3 — Parenthetical asides: a positive model our rules never named**

The sampled essay contains six parenthetical asides across 16,000 characters — roughly one per
1,000 characters, or once every three to four paragraphs: "(살면서 노래방을 이렇게 안 가본 게
처음…)", "(결국 이러다가 번아웃이 왔었지만, 습관은 잘 안 고쳐지더라…)", "(그리고 스스로 뭔가
꼰대 같다는 생각이 들어서 이걸 깨닫고 한동안 우울했었다)". These are self-interruptions —
second thoughts, humor, and corrections that carry information the main sentence cannot.

The pipeline produces zero. The tells list names what to remove; it has no positive model for
this form. An essay with no parenthetical asides in 3,000+ characters is measurably flatter
than the human baseline.

Condition → choice → reason: in essayistic Korean prose, preserve a supplied second thought
when it changes the meaning or carries honest uncertainty. Do not add an aside merely because
the passage lacks one; a manufactured interruption is no more natural than a manufactured
cadence.

**Lesson 4 — σ and unresolved uncertainty: preserve what remains unresolved**

The human essay's sentence-length σ was 26.1; the pipeline's was 9.8. The maximum sentence
length in the human essay was 114 characters (no spaces); the pipeline capped at 48. The old
burstiness instruction was the wrong abstraction. The human passage follows thought instead
of managing a sentence-length pattern; its measurements describe one sample and are not a
recipe to reproduce.

The sampled human essay closed its mentoring section with: "하지만 아직도 잘 모르겠다." Thirteen
characters. The pipeline produced: "이게 올해가 남긴 가장 큰 질문이에요." That is a packaged
takeaway. It names the lesson; it does not live in the uncertainty. The human's 13-character
sentence is more trustworthy precisely because it refuses to resolve what has not been resolved.

The full article closed with: "2020년에는 결국 이렇게 답을 찾지 못한 질문으로 회고를 마무리하지만,
내년 2021년 회고에는 이 질문과 고민에 대한 답을 찾아서 회고에 적는 것을 목표로 잡아야겠다." The
human commits to finding the answer next year rather than having found it this year.

Condition → choice → reason: when an essay section ends, ask whether a tidy conclusion is
honest or performed. A genuine takeaway — something the writer actually learned and can state
— earns the closure. A resolution that smoothes over ongoing uncertainty changes the claim.
If the answer does not exist yet, retain that uncertainty instead of packaging a lesson.

### Uniform sentence endings and not-X-but-Y: pre-handoff checks, not linter rules

Two Korean patterns require contextual pre-handoff review and cannot become safe
deterministic rules:

**Three or more consecutive identical sentence-final endings** (이에요./이에요./이에요. or
합니다./합니다./합니다.) may make prose feel mechanically parallel in context. However,
product benefit lists deliberately use parallel endings: "빠릅니다.
정확합니다. 쉽습니다." is valid copy that would false-positive on every legitimate feature
section. A linter rule would fire on too much legitimate writing to be trusted.

Pre-handoff check: if adjacent sentences share an ending, ask whether the ideas are truly
parallel. Keep the form when it supports comparison or recall. If sameness hides a change in
communicative job, repair that sentence's job rather than forcing a different ending.

**The not-X-but-Y construction** (`~게 아니라 ~했어요` / `~이 아니라 ~입니다`) can become
performed contrast when no real distinction supports it. It also appears in legitimate copy:
a brand that deliberately contrasts itself with a
category norm ("빠른 게 아니라 정확합니다") uses this construction with intent. No narrow
regex distinguishes the cases reliably.

Pre-handoff check: when this construction appears in the hero or opening paragraph, ask
whether the contrast is a designed claim (cite it in decisions.md with the brand reason)
or a hedge that weakens the useful claim. Delete empty hedges; keep designed contrasts. "AI가 만든
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

## Register: diagnose fit, not origin

Web, product, and assistant copy can drift into a medium-formal register that sounds like a
support FAQ edited by a committee. The useful question is not who wrote it, but whether that
register fits this speaker, listener, situation, and surface.

A 2025 study that fine-tuned Llama, Qwen, and Mistral-Nemo models toward natural
responses (arxiv 2501.05032v1, "Enhancing Human-Like Responses in Large Language Models")
identified the primary register failures: self-referential disclaimers, impersonal
deflection, over-structured formatting, and "formal and impersonal" phrasing that is
"structured, clear, and precise, but lacks the warmth and spontaneity of natural human
conversation." The fine-tuned models won blind human ratings at 79–90% preference rates;
general benchmark accuracy was unchanged. The lesson: formality should be chosen, not
defaulted into.

A register-aware linguistic evaluation (arxiv 2605.23651, "How Human-Like Are Large
Language Models? A Register-Aware Linguistic Evaluation Framework") measured the
statistical gap between LLM output and human writing across five registers, including
instructive online text — the closest analogue to product and help copy. Consistent
findings: models over-produce nominalisations, favor longer words, inflate attributive
adjectives, and stack present-participle clause constructions ("helping teams manage",
"allowing users to see"). Human instructive copy scores higher on Biber's Overt Expression
of Persuasion dimension and is more lexically variable. The model's version is less varied
and less authoritative, not more.

### The self-introduction cadence

In product hero copy, "X is a platform that helps teams Y and Z" can merely restate the
brief instead of giving the reader a useful change or distinction. The construction is not
an authorship signal and remains appropriate when a comparison, documentation page, tooltip,
or feature detail genuinely needs category and mechanism.

Condition → choice → reason: when a hero opens with "[Product] is a [category noun] that
[verb]s you", ask whether category or mechanism is the useful fact. If not, lead with the
verified user change or distinction. Keep the mechanism where it answers the reader's real
question.

The same cadence appears in Korean as "X는 Y를 도와주는 플랫폼이에요" or "X는 Z를 관리할 수
있는 도구예요". The pattern is identical: the product introduces itself by naming its own
mechanism. Rewrite from the user's change: "월요일 빌드는 제때 나가요" rather than "X는
빌드 관리를 도와드리는 플랫폼이에요".

### Reflexive over-politeness

Reflexive politeness such as "Please feel free to", "We'd be happy to help", and "Don't
hesitate to reach out" can import a helpdesk register into a surface that needs direct
action. Support contexts may need care and an escalation route; decorative politeness does
not replace either.

Condition → choice → reason: when the polite clause adds no relationship or safety value,
write the action directly. Keep specific care or escalation language when the situation
requires it.

### Uniform formality regardless of product voice

A NAACL 2024 benchmark study (DialogBench, aclanthology.org/2024.naacl-long.341) found
that assistant-AI instruction tuning can actively weaken emotional naturalness — the
positioning trains the model toward uniform helpfulness, which erases the register
variation a specific product voice requires. A fintech product designed to feel like a
knowledgeable friend and a legal SaaS that wants institutional precision both receive the
same medium-formal output if the writer does not actively set the dial.

Condition → choice → reason: read the product's voice study before writing a word. Then
choose a register that is measurably lower or higher than the default formal medium.
"Lower" is not "chatty" — it means committing to vocabulary the product's actual users
use, at the warmth level the product's principles demand. The voice chart (Podmajersky)
is the tool that makes this concrete and auditable.

### Over-nominalization and present-participle clause stacking

The register-aware study (arxiv 2605.23651) identified two structural tells in LLM
instructive text that appear below the level of word choice: over-nominalization
(converting verbs to abstract nouns — "the facilitation of onboarding", "the
optimisation of workflows") and present-participle clause stacking ("a platform for
managing, tracking, and reviewing your pipeline"). Both are addressed individually in the
plain-language section of this document. They are named here as register signals too: in
isolation each is acceptable; clustered in a hero or feature section they can obscure actor,
action, and consequence. Test whether a direct verb or concrete noun carries the same fact
more clearly in the chosen register.

### Deterministic rule: declined

The self-introduction pattern is regex-describable:
`\b\w+ is an? (platform|tool|system|solution|app|service) that (helps?|allows?|enables?|lets?)\b`.
It is not a safe linter rule. Product comparison tables, developer documentation, feature
detail sections, and UI tooltip copy all use constructions that match this pattern
legitimately. Without reliable hero-node detection, the rule would false-positive on too
much legitimate writing to be trusted. It belongs on the hand's pre-handoff review pass,
in the same category as the not-X-but-Y construction documented above under Korean copy.

---

## Static copy and live dialogue have different situations

OMD's voice system covers static product writing and conversational replies without
collapsing them into one register. A page has no shared turn history: its headline, body,
state, and action must stand on their own. A live reply has a speaker, listener, prior turn,
and immediate purpose; it should use established context instead of repeating the request or
narrating the answer before answering. Acknowledgement belongs in dialogue when it repairs a
relationship, confirms a consequential instruction, or responds to an observed event. It is
not a generic opening.

The dialogue-system research below concerns timing, overlap, and assistant evaluation. Those
mechanisms do not transfer to static page copy. The broader requirement that register fit the
speaker, listener, and situation applies to both surfaces.

**Text Overlap / OverlapBot** (aclanthology.org/2025.sicon-1.10): studies backchannels,
overlapping responses, and turn-taking timing in real-time text chatbots. The paper
reports that OverlapBot produces 130% more chatbot turns than a standard system through
behaviors like backchannel signals and proactive interruption. Backchannels, overlap
timing, and turn interruption are properties of live dialogue — a landing page does not
respond, does not take turns, and has no equivalent to "음" or "I see" in a hero section.
Applying these findings to static copy would be a category error, not humanisation.

**DialogBench** (aclanthology.org/2024.naacl-long.341): a benchmark for evaluating LLMs
as conversational dialogue systems across 12 tasks. Its findings about emotional
perception and everyday-life knowledge quality apply to chatbot response evaluation, not
to page copy. The study's principle — that the assistant-AI positioning degrades register
naturalness — does transfer as a writing decision (documented above), but the benchmark
tasks and metrics themselves do not.

**Are Human Conversations Special?** (arxiv 2403.05045): an architectural study of how
transformer attention mechanisms differ across domains — conversation, web content, code,
mathematics. It identifies no surface-text patterns and transfers nothing to writing
decisions. It is cited here to prevent a future reader from importing it: the paper's
conclusion is about domain specialisation in attention heads, not about copy register.

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
- Qian et al. (2025). "Enhancing Human-Like Responses in Large Language Models."
  arxiv.org/abs/2501.05032 — DPO fine-tuning removes robotic formal register; self-intro
  disclaimers, impersonal deflection, and encyclopedic structure identified as primary tells;
  79–90% preference for natural responses with no benchmark degradation
- Jiang et al. (2025). "How Human-Like Are Large Language Models? A Register-Aware
  Linguistic Evaluation Framework." arxiv.org/abs/2605.23651 — LLMs over-produce
  nominalisations, longer words, attributive adjectives, and present-participle constructions
  across all registers; human instructive text is more persuasive and more lexically variable
- Ou et al. (2024). "DialogBench: Evaluating LLMs as Human-Like Dialogue Systems."
  aclanthology.org/2024.naacl-long.341 — DIALOGUE-ONLY: benchmark for conversational
  agents; finding that assistant-AI positioning weakens emotional naturalness transfers as
  a writing principle (choose register deliberately); evaluation tasks do not transfer
- Liu et al. (2024). "Are Human Conversations Special? A Large Language Model Perspective."
  arxiv.org/abs/2403.05045 — EXCLUDED: architectural study of attention mechanisms by
  domain; no surface-text patterns; does not apply to copy writing decisions
- Lala et al. (2025). "Text Overlap: An LLM with Human-like Conversational Behaviors."
  aclanthology.org/2025.sicon-1.10 — EXCLUDED: backchannels, overlap, and turn-taking in
  real-time text chatbots; findings are dialogue-system-specific and do not apply to static
  page copy

---

## Official evidence map and layer ownership

- **Toss writing principles** — https://toss.tech/article/21022 — writer: one key message,
  remove repeated/empty lines, make the next screen predictable, use one spoken breath,
  preserve user choice. Eye: read aloud and test CTA prediction.
- **Toss marketing writing** — https://toss.tech/article/Marketing_Writing — writer: connect
  the audience's present concern to a concrete next action; do not turn a click-rate tactic
  into an unsupported product claim.
- **Apple Writing HIG** — https://developer.apple.com/design/human-interface-guidelines/writing
  — writer: clear, concise, useful labels in the platform's voice. Hand: place text where it
  explains the affected control or state.
- **Microsoft UI text guide** — https://learn.microsoft.com/en-us/windows-server/manage/windows-admin-center/extend/guides/ui-text-style-guide
  — writer: consistent terminology, direct action labels, sentence-style capitalization.
- **W3C Writing for Web Accessibility** — https://www.w3.org/WAI/tips/writing/ — writer:
  descriptive headings/link text and plain language. Hand: expose the same meaning to
  assistive technology.

Ownership is deliberate. `omd-writer` establishes facts, audience language, voice, and
surface copy in `.omd/copy-deck.md`. Copy-editor eye judges fact fidelity, scan, repetition,
CTA prediction, register, emotion, and recovery in context. `omd copy --check` verifies only
explicit structure, state applicability, exact unresolved sentinels, and fact-ID links.

Screenshot phrases and common connectives are prompt/eval observations, never global lint:
legitimate brands and sentences use them. AI detectors, perplexity thresholds, and sentence-
length distributions are forbidden as shipping gates: domain, language, accessibility copy,
and short UI labels create false positives, and a statistical signal cannot establish
authorship or copy quality. Use those ideas only to prompt a contextual human/eye review;
never reject a deck because a detector score or distribution looks machine-like.
