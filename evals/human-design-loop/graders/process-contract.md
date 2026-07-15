# Process contract grader

Pass only when all are true:

- `.omd/copy-deck.md` exists before structural candidate output and includes real labels,
  errors/empty states, and representative density.
- `.omd/.cache/copy-eye.md` preserves the blind editor's copy-editor mode, review time,
  verdict/findings, and SHA-256 of the exact deck reviewed. Writer revision and the final
  copy check remain separate evidence; the reviewed hash is not replaced with the final hash.
- After the second clean copy check and before any sketch, `omd-typesetter` creates
  `.omd/type-proof.md` plus layout-neutral 1280x900 and 390x844 actual-copy specimens; a
  fresh eye reviews only specimens and sanitized typography requirements, then the revised
  proof passes.
- After typography approval and before any sketch, a fresh composer writes
  `.omd/composition.md`; `omd composition --check` passes with fresh frame, copy, type, and
  scout fingerprints (or an explicit scout `N/A — reason`).
- Three isolated anonymous sketches exist for showpiece/high-uncertainty work and selection
  is performed in a fresh context without candidate rationale. Every candidate receives the
  same sanitized composition contract and a distinct approved Candidate axis.
- Every sketch supplies fixed 1280x900 and 390x844 proofs plus full-page desktop/mobile
  continuity captures. Fixed renders govern acceptance; full-page captures inform only
  dependency and rhythm.
- The selector reports eight 0–4 integers, eight visible-evidence rationales, and the mean;
  contract violations and any dimension below 2 are rejected. It does not reward a terminal
  form merely for being above fold or a motif without a functional domain relationship.
- Desktop and mobile squint renders are reviewed before the sharp renders are exposed to
  the general eye.
- Current explicit user feedback outranks older taste; agent and legacy choices are excluded.
- Exactly one extra fresh eye uses one dominant technique lens.
- No concept/structure approval wait occurs because absent config defaults to `none`.
- Semantic and visual craft records each name a render, observation, and concrete change.
- The hand checks contract freshness before its first write and before ship, and records any
  composition deviation with visible evidence. This includes focal hierarchy, the
  value/proof/CTA relationship, and lawful media or an explicit alternate mental-model
  carrier; neither a photo nor a full form above fold is mandatory.
- After structure is selected and before the visual craft checkpoint, the hand re-proves
  typography in the real production container at desktop/mobile after fonts are ready.
  Copy, font family/file, requested weight/axis, or container-width changes invalidate the
  earlier proof and trigger a rerun.
- After final approved inputs and production source stop changing, `.omd/source-seal.json`
  records copy-deck/type-proof/composition SHA-256 values and sorted production source file
  hashes. `omd source --check` passes immediately before ship. This is freshness evidence,
  not a semantic copy-fidelity claim.
