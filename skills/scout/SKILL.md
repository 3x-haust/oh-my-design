---
name: scout
description: >-
  Build a measured reference board without designing anything: whole pages for feel,
  tight selectors for component anatomy, typography studies, motion studies, image refs
  for the unrenderable. Use when the user asks for references, inspiration, benchmarks,
  or "how do good sites do X" — standalone, before or without a build.
  Minimum 18 captures, target 25.
  Triggers: 레퍼런스 찾아줘, 레퍼런스 수집, 참고 사이트, 벤치마킹, find references,
  inspiration board, how do other sites do.
---

# omd:scout

A reference board, measured instead of pinned. This skill only collects and reasons — it
designs nothing.

Spawn the `omd:scout` subagent with the concept (ask one short question if none exists and
no `.omd/frame.md` provides one) and the thing being studied. The subagent starts with a
component inventory — every nav, card, form field, and footer the build will need, listed
before the first capture — then works to a floor of **eighteen captures, targeting
twenty-five**:

```bash
omd ref add <url> --as <name>                      # whole page — rhythm and feel (3–4)
omd ref add <url> --as <name> --selector ".nav"    # one component's anatomy (one per inventory item)
omd ref add <url> --as type-study-1                # chosen for its typography — minimum 2
omd ref add <url> --as type-study-2                # different register, different pairing
omd ref add <url> --as motion-study-1              # chosen for its motion — minimum 2, minimum 4 if brief mentions animation or register is showpiece
omd ref add <url> --as motion-study-2              # different domain, different vocabulary
omd ref add <pin-url> --as mood --image            # unrenderable — reasoning only
omd ref add <reddit-url> --as list-debate --image  # community: what people felt and why (minimum 2)
omd ref add <url> --as voice-study --image           # how a real product writes
omd ref principles <url> --as <name> --add "..."   # why it works, one sentence
omd ref list
```

Before the first capture the scout runs at least six WebSearch queries — problem domain,
craft, community, typography, motion, and competitor — and logs them all on the board.
Famous sites (Linear, Stripe, Vercel, Notion, Raycast) may not exceed one third of the
total captures; they earn their place or they stay off the board.

When the register is **showpiece**, the board must also draw from award galleries — these
are "who solved a problem of this intensity and won doing it" sources, not just "who built
this well" sources. Mandatory showpiece sources: **awwwards.com** (SOTD archive),
**godly.website**, **thefwa.com**, **siteinspire.com**, **minimal.gallery**. For Korean
briefs, add **gdweb.co.kr**. Each award-gallery capture must include a one-sentence
answer to "what made this site win" — stated as the effect on the viewer, not the name of
the technique used. Award gallery captures count toward the floor only when they carry
this sentence plus the full principle set.

Every capture gets a one-line justification, principles that answer **why**, a note on
what contradicts the concept, and **one line naming what specific measurements from this
capture are candidates for the build** — which token group they would feed (type scale,
motion durations, spacing ladder, radius ladder) and why. This line is the upstream source
for `.omd/attribution.md`: the hand traces each token decision back to a named capture;
without this line, the attribution table has no origin to cite. `omd ref add` prints a
design-signal score; a page under 0.4 does not count toward the floor.

**Never describe how a reference looks** (Jansson & Smith: shown an example, designers
reproduce its features even after the flaws are flagged; a model is worse). Numbers and
reasons only. The board lands in `.omd/refs/` and any later `omd:ultradesign` run picks it
up automatically.
