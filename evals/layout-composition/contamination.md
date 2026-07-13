# Contamination control

- Prompts contain no benchmark site, product identity, screenshot, asset, layout recipe, or
  answer-bearing reference.
- Runs may research the domain, but blind judges never receive source identities or rationale.
- Reject an evaluation run if output filenames, UI copy, metadata, or judge context expose the
  model, harness, candidate, recipe, or condition label.
- Do not tune the frozen rubric, prompts, or thresholds from held-out scores.
- Near-duplicate prompts, copied layouts, and recognizable benchmark replicas are excluded.
