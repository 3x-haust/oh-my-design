---
name: omd-humanize
description: >-
  Rewrite chat, assistant replies, UI copy, pages, essays, and documentation into natural,
  situation-aware discourse without changing facts. Repairs mechanical prose locally or
  reconstructs a misshapen message from verified facts and its voice contract.
  Triggers: humanize, 사람같이, 사람처럼 써, AI티 빼줘, 자연스럽게 바꿔, 글 다듬어,
  make it sound human, de-AI, rewrite naturally.
---

# OMD-humanize

Natural writing is not text with detector bait removed. It is a person, in a specific
situation, trying to change what a specific listener knows, feels able to do, or does next.
Edit that discourse. Do not optimize for detector evasion, add mistakes, imitate a person,
or manufacture quirky rhythm.

## Hard laws

1. **Freeze the evidence.** Preserve facts, numbers, names, verified claims, uncertainty,
   and verbatim quotations. Never invent a promise, comparison, emotion, motive, personal
   experience, customer, result, or degree of certainty. If an exact quote cannot stay
   verbatim, remove it; never paraphrase it as a quote.
2. **Preserve the job and register.** Chat remains dialogue, a support reply remains
   support, an essay remains an essay, and documentation remains documentation. Formality,
   language, accessibility needs, and the requested genre do not drift toward generic
   marketing voice.
3. **Edit the smallest coherent discourse unit.** Repair a sentence, exchange, paragraph,
   or section that has one communicative job. Do not perform token-by-token synonym swaps;
   they preserve the broken logic while making factual drift harder to see.
4. **Do the requested work.** The first useful sentence carries the answer, decision, or
   next action. Do not announce an answer before giving it, substitute an offer of help for
   the help, or continue after the communicative job is complete.

## Required input contract

Identify these before rewriting:

- **Speaker** — who is speaking and what authority they have;
- **Listener** — who needs this and what context they already share;
- **Situation** — what just happened or prompted the message;
- **Intended change / next move** — what should become clearer or possible;
- **Genre and register** — chat reply, UI state, landing page, essay, tutorial, policy,
  support response, or another named form, including language and formality;
- **Facts and quotes** — the allowed factual ledger, uncertainty, and exact quotations.

In an OMD run, derive this contract from `.omd/copy-deck.md`: Voice contract `Audience`,
`Language`, and `Register`, then each surface's `Main message`, `Supporting fact`, `Next
action`, and `Claim refs`. Only `verified` facts may support shipped claims. `open` and
`fixture` facts cannot ship. When speaker, listener, situation, intent, genre, register,
fact status, or quote status is missing, return the gap to `omd-writer`; do not guess.

## Choose one mode

### Mode A — local repair

Use local repair when the message already has a sound order: it answers the right question,
each section has a distinct job, and the next move is clear. Rewrite only the smallest unit
whose wording blocks that job. Typical repairs make the actor and action concrete, move a
caveat next to its claim, remove a redundant restatement, or replace translation-shaped
nominalization with a direct verb while preserving register.

### Mode B — reconstruct from facts

Use reconstruction only when the prompt has shaped the discourse itself: the response
mirrors the request instead of answering it, explains its own plan before acting, repeats
the same proposition under symmetrical headings, or buries a simple next move under
exhaustive framing. Patching sentences cannot repair that order.

Discard the generated outline, not the evidence. Rebuild from the verified fact ledger,
voice contract, and the surface's real action/state. For non-OMD conversation, rebuild only
from the supplied facts and established conversational context. Preserve every honest
unknown. Never import a new claim merely to make the reconstruction sound complete.

## Diagnose the discourse, not isolated tokens

These are contextual root causes. A word or structure is not a verdict by itself.

- **Ceremonial acknowledgement** delays the payload with thanks, praise, or agreement that
  changes nothing. Keep acknowledgement when relationship repair, support, or a sensitive
  event genuinely requires it; make it specific and brief.
- **Request echo** repeats what the listener just said. Restatement is useful when confirming
  a dangerous, ambiguous, legal, or multi-step instruction; otherwise answer directly.
- **Answer narration** describes what the reply will cover before covering it. Tutorials and
  long reference documents may need a map; a simple question does not.
- **Deferred service** offers to investigate, draft, or help when the speaker can perform
  that work now. Ask a question only for a real gap that changes the result.
- **Scale mismatch** gives a taxonomy, lecture, or caveat wall to a small practical request.
  Legal, medical, security, and safety-critical material may need explicit limits; place
  each limit beside the claim it qualifies.
- **Redundant recap** repeats a proposition in the title, opening, bullets, conclusion, or
  CTA without adding a decision. Recap is legitimate in long tutorials, handoffs, and
  accessibility-oriented instructions when it supports recall or safe completion.
- **Performed empathy** names an emotion the speaker cannot know or uses a stock sympathy
  line. Support writing may acknowledge an observed consequence; do not invent the person's
  feelings.
- **Template geometry** forces equal headings, matching paragraph sizes, repeated triads,
  or balanced contrast clauses onto ideas that do not have equal weight. Keep lists and
  parallel structure when the content is genuinely enumerable or comparable.
- **Abstract agency** hides the actor and action inside nouns, passive layers, or
  translation-shaped phrasing. Restore a concrete subject and verb unless the genre needs
  the actor omitted for legal, scientific, or procedural precision.
- **Automatic closing** adds a generic invitation after the answer is already complete.
  Keep a closing action only when the listener needs a real escalation route or next step.

## Language and surface judgment

For Korean, choose the speech level from the genre and voice contract, then hold it. Product
copy often uses 해요체 or 합니다체; essays, developer notes, dialogue, legal text, and quoted
speech may require different registers. Treat repeated literal subjects, stacked particles,
translation-shaped passive forms, connective punctuation, and nominal padding as symptoms
only when they make this speaker sound unnatural in this situation. Korean connectives can
carry real logic; do not delete them mechanically.

For English, inspect hedging stacks, abstract nouns, formulaic openings, symmetrical contrast,
and reflexive politeness in context. A policy caveat, support acknowledgement, or tutorial
signpost may be doing necessary work. Keep it when removing it would reduce truth, safety,
orientation, or care.

UI copy is action/state language: say what happened, what remains true, and what the person
can do next. Assistant dialogue uses established context and answers at the listener's
altitude. Essays may retain unresolved thought and a personal cadence only when the supplied
speaker genuinely owns that experience. Documentation favors stable terminology,
prerequisites, and scan paths over conversational warmth.

## Rewrite procedure

1. Write the six input-contract fields. Mark unknowns; do not fill them creatively.
2. Extract a factual ledger before editing. Include exact numbers, proper nouns, claim
   status, uncertainty, and quotes.
3. State the message's single job and the next move. Choose local repair or reconstruction.
4. Rewrite in the chosen genre. Put the payload first, keep each proposition once, and place
   evidence or caveats beside the claim they support.
5. Compare the result against the factual ledger. Any added, removed, strengthened, or
   weakened proposition is a failure. Quotes are byte-for-byte unchanged or absent.
6. Read aloud for speaker/listener fit. Repair only genuine friction; do not add artificial
   sentence-length variation or deliberate roughness.
7. Stop when the job is done.

## OMD ownership and invalidation

`omd-humanize` diagnoses and proposes a rewrite; it does not bypass the copy owner. Only
`omd-writer` changes `.omd/copy-deck.md`. After the writer's revision, run `omd copy --check`,
then `omd-hand` synchronizes production source and rerenders. A changed shipped line, claim,
or action invalidates the affected blind copy review and typography proof. Rerun the relevant
proof instead of carrying an earlier approval forward.

## Acceptance

- The first useful sentence carries the payload.
- Title, body, and CTA do not repeat the same proposition.
- A concrete actor performs a concrete action where the genre permits it.
- Caveats and uncertainty remain honest and sit beside the claims they qualify.
- The next move is explicit when one exists; there is no empty closing offer.
- The text sounds natural when read aloud without manufactured rhythm or fake quirks.
- The factual-ledger diff is clean, and every shipped OMD claim still cites `verified` facts.

Return the rewritten result by default. Do not lead with a violation inventory. Provide a
brief audit only when the user requests one or when filling the durable Humanize audit in
the copy deck.
