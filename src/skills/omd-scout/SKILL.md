---
name: omd-scout
description: >-
  Build a measured reference board without designing anything: whole pages for feel,
  tight selectors for component anatomy, typography studies, motion studies, image refs
  for the unrenderable. Use when the user asks for references, inspiration, benchmarks,
  or "how do good sites do X" — standalone, before or without a build.
  Triggers: 레퍼런스 찾아줘, 레퍼런스 수집, 참고 사이트, 벤치마킹, find references,
  inspiration board, how do other sites do.
---

# omd-scout

A reference board, measured instead of pinned. This skill only collects and reasons — it
designs nothing.

Spawn the `omd-scout` subagent with the concept (ask one short question if none exists and
no `.omd/frame.md` provides one) and the thing being studied. It works to a floor of
**eight captures**:

```bash
omd ref add <url> --as <name>                      # whole page — rhythm and feel
omd ref add <url> --as <name> --selector ".nav"    # one component's anatomy
omd ref add <url> --as type-study                  # chosen for its typography
omd ref add <url> --as motion-study                # chosen for its motion
omd ref add <pin-url> --as mood --image            # unrenderable — reasoning only
omd ref add <reddit-url> --as list-debate --image  # community: what people felt and why
omd ref principles <url> --as <name> --add "..."   # why it works, one sentence
omd ref list
```

The scout searches for who actually solved this problem in this register — famous sites
must earn their place, not headline the board. Every capture gets a one-line
justification, principles that answer **why**, and a note on what contradicts the concept.

`omd ref add` prints a design-signal score; a page under 0.4 makes almost no visual
decisions (danluu.com scores 0) and does not count toward the floor — keep it only as a
content or anti-reference, stated in its principles.

**Never describe how a reference looks** (Jansson & Smith: shown an example, designers
reproduce its features even after the flaws are flagged; a model is worse). Numbers and
reasons only. The board lands in `.omd/refs/` and any later `omd-ultradesign` run picks it
up automatically.
