# Grader: .omd/ Artifacts in English

Check that all engineering artifacts written under `.omd/` are in English, regardless of the brief's language.

## Pass criteria

- `.omd/frame.md`, `.omd/decisions.md`, `.omd/attribution.md`, and any files under `.omd/refs/` are written in English.
- The voice study / register notes may contain Korean quoted examples (e.g., example copy), but the analytical commentary and field labels surrounding them must be in English.
- `.omd/motion-spec.md` (if it exists) is in English.

## Fail criteria

- Any `.omd/` file (other than the user-supplied brief) is primarily written in Korean — prose sections, headings, or structured data fields.
- The frame problem/reframe statement is in Korean.
- Attribution rows or decision rationale are in Korean.

## Why this matters

`.omd/` artifacts are engineering records that survive the design run and are read by future agents, reviewers, and CI pipelines. They must be in the same language as the codebase (English) regardless of what language the end-user page targets.
