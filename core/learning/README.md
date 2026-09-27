# Validated learning storage

Predictions and observations stay in the project under `.omd/learning/`. Promotion reuses the
validated-learning evidence boundary; an evidence receipt must name a stable project-relative JSON
artifact and its SHA-256, and that artifact must contain (or adapt to) authenticated browser
observations.

The promoted/contradicted rule index is written to the private user state directory so advisory
learning can cross projects:

- `$XDG_STATE_HOME/oh-my-design/learning-v1/rules.json`, when `XDG_STATE_HOME` is set.
- `~/.local/state/oh-my-design/learning-v1/rules.json` otherwise.

If that store cannot be created or safely updated, promotion falls back to
`.omd/learning/rules-index.json` through the guarded project writer. `omd learn promote` reports
which location it used. Route consumers must treat `applicableLearnedRules(scope)` as advisory;
learned rules cannot override safety constraints, model/system instructions, or user facts.

Additional authenticated evidence packet formats can be joined by supplying a
`LearningEvidenceAdapter`. An adapter only projects a packet to browser evidence; the existing
validated-learning validator still verifies decision binding, scope, captures, and distinct runs.
