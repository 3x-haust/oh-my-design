# Grader: Typography proof

Pass only when `.omd/type-proof.md` and both target-view specimens use actual Korean copy
and record role map, source/licence, Korean/Latin/numeral coverage, requested and computed
family/weight evidence, loading/fallback, wraps/clips/orphans, rejected alternatives, and an
invalidation fingerprint.

A quiet moderate heading passes when it preserves clear hierarchy and clean target-language
behavior. Huge Hangul also passes when the short line, face, and weight carry the concept
and secondary hierarchy plus CTA remain usable at 1280x900 and 390x844.

Fail on visible fallback or tofu, faux/unavailable weight, clipped or accidental wrapping,
generic scale doing all conceptual work, missing loading evidence, or a stale proof after
copy/font/weight/container changes. Do not infer physical glyph identity from computed CSS.
