# Grader: Voice Study on Board, Korean Copy Follows It

Check that a voice study was captured before copy was written, and that the Korean copy on both pages follows the measured register rather than translated marketing.

## Pass criteria

- `.omd/theory/voice.md` (or a voice-study file under `.omd/`) exists and contains at least one cited source sentence — a direct quote or paraphrase attributed to a real product, person, or publication.
- The `.omd/board.md` or `.omd/refs/` directory includes at least one entry tagged as a voice, copy, or register reference.
- The Korean copy on both the landing and article page reads like a Korean writer wrote it first — not like an English template translated into Korean.
- No connective-comma openers appear in the body copy: "그러나, " / "하지만, " / "또한, " / "따라서, " at the start of a sentence.
- The hero or post-title subheadline does not stack ≥ 2 abstract value nouns ("편리한", "혁신적인", "스마트한") without a concrete subject attached.
- `omd check --category slop` returns no SLOP-COPY-KO findings, or any finding is overruled with a written reason.

## Fail criteria

- No voice study file exists under `.omd/` — the copy register was invented rather than measured.
- The voice study exists but contains only the agent's own description of the desired tone with no cited external evidence.
- The article body copy contains connective-comma patterns that `SLOP-COPY-KO` is designed to catch.
- The landing hero headline reads as a translated marketing brief: "매일의 생각을 기록하고 성장하세요" (enumerated imperative) rather than a direct personal statement.

## Why this matters

A Korean blog by a product designer should read the way that designer writes — not the way an international SaaS platform translated its tagline. The voice study is the measurement that makes this possible. Without it, the register defaults to the mean of all Korean web copy, which is translated marketing copy.

## Severity

FAIL if no voice study exists. WARN if it exists but Korean copy contains SLOP-COPY-KO patterns.
