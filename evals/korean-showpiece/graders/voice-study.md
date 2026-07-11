# Grader: Voice Study on Board

Check that a voice study was captured and committed to the reference board before copy was written.

## Pass criteria

- `.omd/theory/voice.md` (or a voice-study file under `.omd/`) exists in the run's working directory AND contains at least one cited source sentence — a direct quote or paraphrase attributed to a real product, person, or document.
- The `.omd/board.md` or `.omd/refs/` directory references at least one entry tagged as a voice or copy reference (look for `voice`, `copy`, or `register` in the ref metadata or filename).

## Fail criteria

- No `.omd/` voice/copy study file exists.
- Copy was written without any attributed register example (the agent invented a "warm trustworthy" tone from scratch rather than measuring it from references).
- The voice study file exists but contains only the agent's own description of the desired tone, with no cited external evidence.

## Severity

FAIL on any single criterion above — the voice study is a prerequisite gate, not a polish step.
