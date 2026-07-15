---
name: scout
description: >-
  Build a measured reference board without designing anything: whole pages for feel,
  tight selectors for component anatomy, typography studies, motion studies, image refs
  for the unrenderable. Use when the user asks for references, inspiration, benchmarks,
  or "how do good sites do X" — standalone, before or without a build.
  Triggers: 레퍼런스 찾아줘, 레퍼런스 수집, 참고 사이트, 벤치마킹, find references,
  inspiration board, how do other sites do.
---

# oh-my-design:scout

A reference board, measured instead of pinned. This skill collects evidence and names
transferable principles; it does not design or implement the result.

Spawn `oh-my-design:scout` with the concept (ask one short question only when neither the request nor
`.omd/frame.md` supplies one), the component inventory, working directory, and user URLs.
User URLs are captured first and marked `--from-user`.

## Coverage contract

Build for decision coverage, not capture counts. Before searching, list the decisions the
later design must make and the components it must support. The board is complete only when
it contains useful, non-duplicate evidence for every applicable category:

- domain conventions and user expectations;
- direct competitors and meaningful alternatives;
- first-party or user/community language;
- typography and voice;
- motion when the concept or interaction actually needs it;
- every required component or state whose anatomy is uncertain.

There is no minimum query count, capture quota, famous-site quota, or mandatory award
gallery. A small board with complete, independent evidence is better than a large gallery of
near-duplicates. If a category is irrelevant, record why. If evidence remains weak or
contradictory, report the gap and uncertainty instead of filling a slot with decoration.

Use the narrowest useful capture:

```bash
omd ref add <user-url> --as <name> --from-user
omd ref add <url> --as <name>
omd ref add <url> --as <name> --selector ".component"
omd ref add <url> --as <name> --selector ".component" --blueprint
omd ref add <image-url> --as <name> --image
omd ref principles <url> --as <name> --add "..."
omd ref list
```

Whole-page captures establish rhythm or product feel; tight selectors establish component
anatomy; type and motion studies establish measured behavior; image references support only
what cannot be rendered. A blueprint is allowed only for an explicitly requested exact
component transplant or a structurally equivalent component problem. Structure may
transfer; skin and pixels do not.

## Evidence quality and contamination

Prefer first-party product sources and direct user/community evidence over SEO summaries.
Label source trust, uncertainty, and whether evidence is independent or derivative. Reject
a non-user source with two or more slop signals. Keep a user-provided contaminated source
only as a named anti-reference. Drop kin at similarity `>= .85`; a cluster of related pages
is one evidence family, not independent corroboration. A blocked page is not retried; use an
honest image/discourse fallback or discard it.

Every retained capture records:

- the decision or coverage gap it answers;
- measured invariants and the reason they matter;
- what contradicts the concept;
- source trust and uncertainty;
- the token, component, motion, voice, or composition question it may inform.

Never describe a page for imitation, show reference screenshots to the builder, copy visual
skin, or turn award status into evidence. Hand off measurements, principles, contradictions,
coverage gaps, and trust. Raw captures remain under `.omd/refs/`; downstream agents receive
only the sanitized evidence summary required for their decision.
